/**
 * `engineStore` (contrato C-ENGINE, `docs/arch/ARCHITECTURE-M5-WEBLLM.md`
 * §9.4/§9.4.1). Slice SF2 — `docs/arch/SLICES.md` §SF2.
 *
 * Implementa LITERALMENTE la máquina de estados normativa de §9.4.1 (tabla de
 * eventos E1–E8) que compone el estado crudo de Ollama (C-OLLAMA, sin
 * cambios) con la fase del fallback WebLLM (C-WEBLLM) y expone `active`
 * (motor que atenderá el PRÓXIMO mensaje) mediante `selectActiveEngine`, una
 * función PURA y testeable sin store.
 *
 * `zustand`, SIN `persist`: el ciclo de vida del fallback es por sesión de
 * página (§9.4) — coherente con "cancelado en esta sesión" (CA-43).
 *
 * NOTA DE DISEÑO (decisión explícita del implementer, no trivial): este
 * módulo programa ÚNICAMENTE contra el TIPO `WebLlmClient` (`@/assistant/
 * types`), nunca contra la implementación concreta `src/assistant/
 * webllmClient.ts` (SF1) — instrucción explícita del orquestador para
 * mantener SF1/SF2 en archivos disjuntos sin dependencia dura de orden de
 * ejecución. En consecuencia, el singleton `useEngineStore` (store por
 * defecto de la app) se crea SIN cliente inyectado; el store se comporta de
 * forma segura en ese caso (fase `"unsupported"`, sin llamadas de red/GPU,
 * igual que una feature-detection negativa real) en vez de fallar. El cableado
 * del `WebLlmClient` REAL para `useEngineStore` queda fuera del alcance de
 * SF2 tal como está descrito en el contrato (§9.4 solo fija
 * `createEngineStore(client?: WebLlmClient)`, sin un factory por defecto) —
 * lo señala este comentario para que el reviewer/integrator confirme el punto
 * de cableado final (candidato natural: donde se instancie la app).
 */

import { create } from "zustand";

import type {
  AssistantEngine,
  EngineKind,
  EngineState,
  OllamaStatus,
  WebLlmClient,
  WebLlmInitError,
  WebLlmPhase,
} from "@/assistant/types";
import { CONFIG } from "@/config";

/**
 * Regla PURA de selección del motor activo (tabla de verdad, §9.4):
 *  - ollama === "connected" ⇒ "ollama" (SIEMPRE gana: jerarquía inmutable).
 *  - ollama === "checking" ⇒ prev (transitorio: mantiene el motor previo).
 *  - degradado (disconnected | model_missing) ⇒ phase === "ready" ? "webllm" : null.
 */
export function selectActiveEngine(
  ollama: OllamaStatus,
  phase: WebLlmPhase,
  prev: EngineKind | null,
): EngineKind | null {
  if (ollama === "connected") return "ollama";
  if (ollama === "checking") return prev;
  return phase === "ready" ? "webllm" : null;
}

/** Habilitación del chat: `engine.active !== null`. */
export function isChatEnabled(engine: AssistantEngine): boolean {
  return engine.active !== null;
}

/** `degradado(s) := s ∈ {"disconnected", "model_missing"}` (§9.4.1): ambos
 *  disparan el fallback. `checking` NUNCA dispara nada (transitorio). */
function degradado(s: OllamaStatus): boolean {
  return s === "disconnected" || s === "model_missing";
}

/**
 * Fábrica del store, con `WebLlmClient` inyectable (tests) — el store real de
 * la app (`useEngineStore`, más abajo) se crea sin cliente (ver nota de
 * diseño en la cabecera del archivo).
 */
export function createEngineStore(client?: WebLlmClient) {
  return create<EngineState>()((set, get) => {
    /** Aplica una nueva fase WebLLM y recalcula `active` (§9.4: `active` se
     *  recomputa en CADA transición de fase, no solo en `setOllamaStatus`). */
    function setPhase(phase: WebLlmPhase, extra?: Partial<AssistantEngine["webllm"]>): void {
      set((state) => {
        const webllm = { ...state.engine.webllm, ...extra, phase };
        const active = selectActiveEngine(state.engine.ollama, phase, state.engine.active);
        return { engine: { ...state.engine, active, webllm } };
      });
    }

    /** Recalcula `active` sin tocar la fase (usado por los eventos que no
     *  cambian `webllm.phase`: E1 en fases "sin cambios", E2, E4). */
    function recomputeActive(ollama: OllamaStatus): void {
      set((state) => ({
        engine: {
          ...state.engine,
          active: selectActiveEngine(ollama, state.engine.webllm.phase, state.engine.active),
        },
      }));
    }

    /** E5/E3(auto) — dispara `client.load()` y cablea la resolución (E6):
     *  éxito ⇒ "ready" · "gpu" ⇒ "unsupported" (SU-11) · "red" ⇒ "error" (con
     *  `lastError`) · "cancelado" ⇒ "cancelled" (misma vía que E7, ver la nota
     *  del test-author en `engineStore.test.ts`). */
    function beginLoad(): void {
      if (!client) {
        setPhase("unsupported", { progress: null });
        return;
      }
      setPhase("fetching", { progress: null, lastError: null });

      client
        .load((p) => {
          set((state) => ({
            engine: { ...state.engine, webllm: { ...state.engine.webllm, progress: p } },
          }));
        })
        .then(
          () => setPhase("ready", { progress: null }),
          (err: WebLlmInitError) => {
            if (err.kind === "gpu") {
              setPhase("unsupported", { progress: null });
            } else if (err.kind === "red") {
              setPhase("error", { progress: null, lastError: err.message });
            } else {
              setPhase("cancelled", { progress: null });
            }
          },
        );
    }

    /** E3 — desde "inactive" con `CONFIG.webllm.enabled`: feature-detection y
     *  caché, 100% local (0 requests hasta aceptar, CA-40/41). */
    async function evaluateDegraded(): Promise<void> {
      if (!client) {
        setPhase("unsupported");
        return;
      }
      const supported = await client.detectSupport();
      if (!supported) {
        setPhase("unsupported");
        return;
      }
      const cached = await client.isModelCached();
      if (cached) {
        beginLoad();
      } else {
        setPhase("offer");
      }
    }

    return {
      engine: {
        active: null,
        ollama: "checking",
        webllm: {
          phase: "inactive",
          progress: null,
          model: CONFIG.webllm.model,
          lastError: null,
        },
      },

      setOllamaStatus(s: OllamaStatus): void {
        const prevPhase = get().engine.webllm.phase;
        set((state) => ({ engine: { ...state.engine, ollama: s } }));

        if (s === "checking") {
          // E2: transitorio, no dispara nada; `active` mantiene `prev`.
          recomputeActive(s);
          return;
        }

        if (s === "connected") {
          // E1: la oferta/error se retira; fetching/ready/cancelled/unsupported/
          // inactive quedan "sin cambios" de fase (CA-46: no se aborta una
          // descarga en curso).
          if (prevPhase === "offer" || prevPhase === "error") {
            setPhase("inactive", { progress: null, lastError: null });
          } else {
            recomputeActive(s);
          }
          return;
        }

        // degradado(s): "disconnected" | "model_missing" (único caso restante
        // de `OllamaStatus` tras descartar "checking"/"connected" arriba).
        if (!degradado(s)) return;

        if (prevPhase === "inactive" && CONFIG.webllm.enabled) {
          // E3.
          void evaluateDegraded();
        } else {
          // E4 (o E8: enabled=false ⇒ prevPhase siempre "inactive" y nunca
          // entra aquí) — sin cambios de fase, solo recompute de `active`.
          recomputeActive(s);
        }
      },

      acceptDownload(): void {
        // E5: offer | cancelled | error → fetching.
        const phase = get().engine.webllm.phase;
        if (phase === "offer" || phase === "cancelled" || phase === "error") {
          beginLoad();
        }
      },

      cancelFetch(): void {
        // E7: fetching → cancelled (vía `client.cancelLoad()`, que hace
        // rechazar el `load()` pendiente con kind "cancelado" — mismo camino
        // que la rama "cancelado" de E6).
        if (get().engine.webllm.phase !== "fetching") return;
        client?.cancelLoad();
      },
    };
  });
}

/** Store por defecto de la app (ÚNICA instancia; consumido por
 *  `useAssistantEngine` en `Layout` y, desde SF3, por `chatStore`). */
export const useEngineStore = createEngineStore();
