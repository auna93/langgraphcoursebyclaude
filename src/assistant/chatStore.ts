/**
 * `chatStore` (C-ASSIST, ARCHITECTURE.md §4): zustand + persist en
 * `sessionStorage`, clave `lgcourse.chat.v1` (US-16).
 *
 * Slice S9: `send`/`stop`/`clear` completos contra el cliente Ollama
 * (C-OLLAMA, S8). Slice S10: `send` cablea el contexto real — ruta actual →
 * módulo actual (vía `getCurrentModuleId`, que lee `window.location.pathname`;
 * no hay otro mecanismo de "módulo activo" en la app fuera del router,
 * ARCHITECTURE.md §2) → `retrieve(query, {boostModuleId})` (C-RAG) →
 * `buildPrompt` (C-ASSIST) con `currentModule`/`ragHits` reales (CA-23/24).
 * `sendFeynmanFeedback` (CA-27, A-10, slice S11): compone el mensaje con
 * `buildFeynmanFeedbackMessage` (título del módulo + explicación guardada en
 * `progress/`, C-PROGRESS) y lo envía reusando `send` — mismo pipeline de
 * streaming, mismas garantías CA-21, sin duplicar lógica de red/parsing.
 *
 * Slice SF3 (delta C-ASSIST, `docs/arch/ARCHITECTURE-M5-WEBLLM.md` §9.5):
 * selección de motor POR MENSAJE en `send()` (ADR-19) leyendo
 * `useEngineStore.getState().engine.active`; el cliente WebLLM "warm" se
 * obtiene vía `getWebLlmClient()` de `@/assistant/engineStore` (§9.5.1) —
 * NUNCA se construye una instancia propia con `createWebLlmClient`. Avisos
 * de conmutación (`appendEngineNotice`) se disparan desde una suscripción a
 * `useEngineStore` (regla normativa de avisos, §9.5).
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { getWebLlmClient, useEngineStore } from "@/assistant/engineStore";
import { createOllamaClient } from "@/assistant/ollamaClient";
import { buildFeynmanFeedbackMessage, buildPrompt } from "@/assistant/promptBuilder";
import type {
  ChatMessage,
  ChatState,
  ChatStreamEngine,
  ChatUiMessage,
  EngineKind,
  OllamaClient,
} from "@/assistant/types";
import { STRINGS } from "@/app/strings";
import { CONFIG } from "@/config";
import { COURSE_MODULES, getModule } from "@/content/registry";
import type { ModuleId } from "@/content/types";
import { useProgressStore } from "@/progress/store";
import { buildRagIndex } from "@/rag";
import type { RagIndex } from "@/rag/types";

/**
 * Índice RAG construido una vez desde el contenido bundleado (ADR-05: sin
 * paso de red ni de build, <100 ms para 16 módulos).
 */
const ragIndex: RagIndex = buildRagIndex(COURSE_MODULES);

/** Único punto de "módulo actual" de la app: la ruta `/modulo/:id` (router). */
const MODULE_PATH_RE = /^\/modulo\/([^/]+)/;

function getCurrentModuleId(): ModuleId | null {
  if (typeof window === "undefined") return null;
  const match = MODULE_PATH_RE.exec(window.location.pathname);
  return match ? (match[1] as ModuleId) : null;
}

export const CHAT_STORAGE_KEY = "lgcourse.chat.v1";

/**
 * `AbortController` de la petición en curso. Vive fuera del estado
 * persistido (no serializable) — un único stream activo a la vez, igual que
 * `PyRunner.cancel()` (cola de 1) en `runner/`.
 */
let currentController: AbortController | null = null;

/** §9.5 regla 4: el historial enviado al motor excluye los mensajes con
 *  `aviso` (un aviso de conmutación NUNCA entra en el prompt del modelo). */
function toChatMessages(mensajes: ChatUiMessage[]): ChatMessage[] {
  return mensajes.filter((m) => !m.aviso).map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Fábrica de la implementación real, inyectable para tests (evita mockear
 * `fetch` global en los unitarios del store). Firma EXACTA de §9.5.1: el
 * segundo parámetro (motor WebLLM "warm") es opcional y posterior, así que
 * las llamadas `createChatStore()`/`createChatStore(fake)` de S9–S11 siguen
 * compilando y comportándose igual.
 */
export function createChatStore(
  client: OllamaClient = createOllamaClient(CONFIG.ollama),
  webllm: ChatStreamEngine = getWebLlmClient(),
) {
  /** Memoria de sesión de página (NO persistida) del último motor anunciado
   *  en el hilo — regla normativa de avisos, §9.5. */
  let lastAnnounced: EngineKind | null = null;

  const store = create<ChatState>()(
    persist(
      (set, get) => ({
        mensajes: [],
        generando: false,

        send(pregunta: string) {
          const texto = pregunta.trim();
          if (texto.length === 0) return;
          if (get().generando) return;

          // §9.5 regla 1: motor leído EN EL MOMENTO del envío (ADR-19).
          // active === null ⇒ no-op (el input ya está deshabilitado por
          // isChatEnabled).
          const k = useEngineStore.getState().engine.active;
          if (k === null) return;

          // §9.5 regla 2: enrutado al cliente correcto según el motor.
          const engineClient: ChatStreamEngine = k === "ollama" ? client : webllm;

          const historial = toChatMessages(get().mensajes);

          const currentModuleId = getCurrentModuleId();
          const currentModuleData = currentModuleId ? getModule(currentModuleId) : undefined;
          const currentModule = currentModuleData
            ? {
                id: currentModuleData.id,
                titulo: currentModuleData.titulo,
                objetivo: currentModuleData.objetivo,
              }
            : null;

          const ragHits = ragIndex.retrieve(texto, {
            topK: CONFIG.rag.topK,
            boostModuleId: currentModule?.id,
          });

          const prompt = buildPrompt({
            pregunta: texto,
            historial,
            currentModule,
            ragHits,
          });

          // §9.5 regla 5: el mensaje assistant creado lleva engine:k. Se
          // localiza por IDENTIDAD de objeto (no por índice fijo): un aviso
          // de conmutación puede insertarse A MITAD de este stream (CA-46) y
          // `appendEngineNotice` lo hace SIEMPRE antes del mensaje en curso
          // (ver más abajo) para no desplazar el "último mensaje" visible,
          // pero localizar por referencia es robusto ante cualquier
          // reordenamiento futuro.
          let currentAssistantMsg: ChatUiMessage = { role: "assistant", content: "", engine: k };

          set((state) => ({
            mensajes: [...state.mensajes, { role: "user", content: texto }, currentAssistantMsg],
            generando: true,
          }));

          const controller = new AbortController();
          currentController = controller;

          function updateAssistantMessage(fn: (msg: ChatUiMessage) => ChatUiMessage) {
            set((state) => {
              const idx = state.mensajes.indexOf(currentAssistantMsg);
              if (idx === -1) return {};
              const mensajes = [...state.mensajes];
              currentAssistantMsg = fn(mensajes[idx]);
              mensajes[idx] = currentAssistantMsg;
              return { mensajes };
            });
          }

          void engineClient.chatStream(
            prompt,
            {
              onToken(t) {
                updateAssistantMessage((msg) => ({ ...msg, content: msg.content + t }));
              },
              onDone() {
                set({ generando: false });
                currentController = null;
              },
              onError() {
                // §9.5 regla 6: error string por motor.
                updateAssistantMessage((msg) => ({
                  ...msg,
                  error:
                    k === "ollama"
                      ? STRINGS.asistente.chatPanel.errorStream
                      : STRINGS.asistente.chatPanel.errorStreamWebGpu,
                }));
                set({ generando: false });
                currentController = null;
              },
            },
            controller.signal,
          );
        },

        stop() {
          currentController?.abort();
          currentController = null;
          set({ generando: false });
        },

        clear() {
          currentController?.abort();
          currentController = null;
          set({ mensajes: [], generando: false });
        },

        appendEngineNotice(engine: EngineKind) {
          const modelo =
            engine === "webllm"
              ? useEngineStore.getState().engine.webllm.model
              : CONFIG.ollama.model;
          const content =
            engine === "webllm"
              ? STRINGS.avisoCambioMotor.aWebGpu(modelo)
              : STRINGS.avisoCambioMotor.aOllama(modelo);
          const notice: ChatUiMessage = { role: "assistant", content, aviso: "cambio_motor" };
          set((state) => {
            // CA-46: una generación en curso nunca se corta ni se "tapa" por
            // un aviso — el mensaje assistant que se está streameando debe
            // seguir siendo el ÚLTIMO del hilo (p.ej. para un lector de
            // "última respuesta"), así que el aviso se inserta justo ANTES
            // en vez de al final mientras `generando === true`.
            if (state.generando && state.mensajes.length > 0) {
              const mensajes = [...state.mensajes];
              mensajes.splice(mensajes.length - 1, 0, notice);
              return { mensajes };
            }
            return { mensajes: [...state.mensajes, notice] };
          });
        },

        // NOTA (implementer, S11): C-ASSIST fija `sendFeynmanFeedback(moduleId)`
        // sin parámetro de explicación; sólo `progress/` guarda ese texto
        // (C-PROGRESS). La regla general de límites de módulo
        // (ARCHITECTURE.md §2: "runner/, assistant/, rag/, progress/ no
        // importan entre sí") solo documenta explícitamente la excepción
        // assistant→rag, no assistant→progress. Sin embargo SLICES.md §S11
        // fija literalmente "Contratos: consume C-ASSIST, C-PROGRESS
        // (cerrados)" para este slice, y la firma cerrada de
        // `sendFeynmanFeedback` no deja otro punto de entrada para leer la
        // explicación guardada (el emisor, `FeynmanEditor`, sólo puede pasar
        // el `moduleId`). Se resuelve leyendo `useProgressStore.getState()`
        // aquí, en modo SOLO LECTURA, sin duplicar lógica de persistencia.
        // Si el reviewer considera que esto rompe el límite de módulos, la
        // corrección correcta es que el architect añada la excepción
        // explícita en ARCHITECTURE.md §2 (igual que ya existe para
        // assistant→rag), no cambiar la firma de C-ASSIST aquí.
        sendFeynmanFeedback(moduleId: ModuleId) {
          if (get().generando) return;

          const courseModule = getModule(moduleId);
          if (!courseModule) return;

          const explicacion =
            useProgressStore.getState().modules[moduleId]?.explicacion?.texto ?? "";
          if (explicacion.trim().length === 0) return;

          const mensaje = buildFeynmanFeedbackMessage(courseModule.titulo, explicacion);
          get().send(mensaje);
        },
      }),
      {
        name: CHAT_STORAGE_KEY,
        storage: createJSONStorage(() => sessionStorage),
        // Solo la conversación sobrevive a un reload de la sesión (US-16);
        // `generando` es transitorio y se recalcula al montar.
        partialize: (state) => ({ mensajes: state.mensajes }),
      },
    ),
  );

  // Regla NORMATIVA de avisos (§9.5): se suscribe a los cambios de
  // `engine.active` del engineStore. Solo TRANSICIONES reales disparan el
  // aviso (el valor inicial de `active`, presente cuando se registra esta
  // suscripción, nunca lo hace). El primer "ollama" de la sesión (desde
  // `lastAnnounced === null`) es silencioso (arranque normal); los cambios a
  // `null` tampoco anuncian (el estado terminal ya es visible en el badge).
  useEngineStore.subscribe((state, prevState) => {
    const k = state.engine.active;
    if (k === prevState.engine.active) return;
    if (k === null) return;
    if (k === lastAnnounced) return;
    if (lastAnnounced === null && k === "ollama") {
      lastAnnounced = k;
      return;
    }
    store.getState().appendEngineNotice(k);
    lastAnnounced = k;
  });

  return store;
}

export const useChatStore = createChatStore();
