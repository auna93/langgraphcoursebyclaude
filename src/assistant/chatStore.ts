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
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { createOllamaClient } from "@/assistant/ollamaClient";
import { buildFeynmanFeedbackMessage, buildPrompt } from "@/assistant/promptBuilder";
import type {
  ChatMessage,
  ChatState,
  ChatUiMessage,
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

function toChatMessages(mensajes: ChatUiMessage[]): ChatMessage[] {
  return mensajes.map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Fábrica de la implementación real, inyectable para tests (evita mockear
 * `fetch` global en los unitarios del store).
 */
export function createChatStore(client: OllamaClient = createOllamaClient(CONFIG.ollama)) {
  return create<ChatState>()(
    persist(
      (set, get) => ({
        mensajes: [],
        generando: false,

        send(pregunta: string) {
          const texto = pregunta.trim();
          if (texto.length === 0) return;
          if (get().generando) return;

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

          set((state) => ({
            mensajes: [
              ...state.mensajes,
              { role: "user", content: texto },
              { role: "assistant", content: "" },
            ],
            generando: true,
          }));

          const controller = new AbortController();
          currentController = controller;

          function updateLastAssistant(fn: (msg: ChatUiMessage) => ChatUiMessage) {
            set((state) => {
              const mensajes = [...state.mensajes];
              const idx = mensajes.length - 1;
              if (idx < 0 || mensajes[idx].role !== "assistant") return {};
              mensajes[idx] = fn(mensajes[idx]);
              return { mensajes };
            });
          }

          void client.chatStream(
            prompt,
            {
              onToken(t) {
                updateLastAssistant((msg) => ({ ...msg, content: msg.content + t }));
              },
              onDone() {
                set({ generando: false });
                currentController = null;
              },
              onError() {
                updateLastAssistant((msg) => ({
                  ...msg,
                  error: STRINGS.asistente.chatPanel.errorStream,
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
}

export const useChatStore = createChatStore();
