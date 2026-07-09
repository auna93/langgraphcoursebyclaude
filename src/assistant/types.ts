/**
 * Contrato C-OLLAMA (ARCHITECTURE.md §4). Transcripción literal — cualquier
 * desvío exige volver al architect (Gate 2).
 */

import type { ModuleId } from "@/content/types";
import type { RagHit } from "@/rag/types";

export type OllamaStatus =
  | "checking"
  | "connected"
  | "model_missing"
  | "disconnected";

export interface OllamaConfig {
  /** default "/ollama" (proxy Vite, ADR-06); override VITE_OLLAMA_BASE_URL */
  baseUrl: string;
  /** default "qwen2.5-coder:14b"; override VITE_OLLAMA_MODEL */
  model: string;
  /** default 15000 (y check inmediato al cargar, CA-18 ≤5 s) */
  healthIntervalMs: number;
  /** default 3000 */
  healthTimeoutMs: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OllamaStreamError {
  kind: "network" | "http" | "parse";
  message: string;
}

export interface OllamaClient {
  /**
   * GET {baseUrl}/api/tags con timeout. connected ⇔ responde 200 y algún tag
   * cuyo nombre === model o empieza por `${model.split(":")[0]}:`.
   * model_missing ⇔ 200 sin match. disconnected ⇔ error de
   * red/timeout/status !== 200.
   */
  checkHealth(): Promise<OllamaStatus>;
  /**
   * POST {baseUrl}/api/chat, body {model, messages, stream:true}. Parsea
   * NDJSON línea a línea (buffer de líneas incompletas). onToken por cada
   * chunk con message.content !== "". done:true ⇒ onDone. signal.abort() ⇒
   * corta el reader en ≤2 s y NO llama onError (el parcial queda, CA-22).
   * Error de red a mitad ⇒ onError(OllamaStreamError) con el parcial ya
   * emitido intacto (CA-26).
   */
  chatStream(
    messages: ChatMessage[],
    handlers: {
      onToken(t: string): void;
      onDone(): void;
      onError(e: OllamaStreamError): void;
    },
    signal: AbortSignal,
  ): Promise<void>;
}

/** Textos de recuperación EXACTOS (CA-19/20, comparados literalmente en tests): */
export const CMD_SERVE = "ollama serve";
export const CMD_PULL = (model: string) => `ollama pull ${model}`;

/**
 * Contrato C-ASSIST (ARCHITECTURE.md §4). Transcripción LITERAL — firma
 * FINAL desde el slice S9 (se invoca con `ragHits: []` y
 * `currentModule: null` hasta que S10 conecte el RAG real).
 */

export interface PromptInput {
  pregunta: string;
  /** Turnos previos de la sesión (sin systems). */
  historial: ChatMessage[];
  currentModule: { id: ModuleId; titulo: string; objetivo: string } | null;
  /** retrieve(pregunta, {boostModuleId: currentModule?.id}) */
  ragHits: RagHit[];
}

/** Mensaje de la conversación tal como se muestra en la UI (`ChatPanel`). */
export interface ChatUiMessage {
  role: "user" | "assistant";
  content: string;
  error?: string;
}

/** chatStore (zustand, persist en sessionStorage clave "lgcourse.chat.v1" — US-16). */
export interface ChatState {
  mensajes: ChatUiMessage[];
  generando: boolean;
  /** Compone el prompt (RAG+módulo) y streamea (CA-21). */
  send(pregunta: string): void;
  /** AbortController (CA-22). */
  stop(): void;
  clear(): void;
  sendFeynmanFeedback(moduleId: ModuleId): void;
}

/**
 * Contrato C-WEBLLM (`docs/arch/ARCHITECTURE-M5-WEBLLM.md` §9.3). Transcripción
 * LITERAL — ADITIVO, no toca C-OLLAMA ni C-ASSIST. Implementación (SF1) en
 * `src/assistant/webllmClient.ts`.
 */

/** Error de streaming común a ambos motores. OllamaStreamError ⊂ EngineStreamError ⇒
 *  OllamaClient satisface ChatStreamEngine SIN cambios (tipado estructural). */
export interface EngineStreamError {
  kind: "network" | "http" | "parse" | "engine";
  message: string;
}

/** Abstracción COMÚN de chat en streaming: la frontera que hace exigibles las mismas
 *  garantías (CA-21/22 ⇒ CA-44) a ambos motores. `chatStore` programa contra ESTA
 *  interfaz, nunca contra un motor concreto. */
export interface ChatStreamEngine {
  chatStream(
    messages: ChatMessage[],
    handlers: {
      onToken(t: string): void;
      onDone(): void;
      onError(e: EngineStreamError): void;
    },
    signal: AbortSignal,
  ): Promise<void>;
}

export interface WebLlmConfig {
  /** VITE_WEBLLM_ENABLED (default true). false ⇒ fallback desactivado (CA-41). */
  enabled: boolean;
  /** VITE_WEBLLM_MODEL (default "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC", CA-48). */
  model: string;
  /** VITE_WEBLLM_MODEL_URL (default "": usar prebuiltAppConfig; ADR-18). */
  modelUrl: string;
  /** VITE_WEBLLM_MODEL_LIB_URL (default "": usar prebuiltAppConfig; ADR-18).
   *  modelUrl y modelLibUrl se definen AMBOS o NINGUNO (invariante; test de config). */
  modelLibUrl: string;
  /** VITE_WEBLLM_MODEL_SIZE_MB (default 950): tamaño ESTIMADO mostrado en la oferta
   *  (CA-40b, ADR-20). Solo informativo; no se consulta a la red. */
  modelSizeMb: number;
}

export interface WebLlmLoadProgress {
  /** 0..100, monótono NO decreciente dentro de una carga (CA-42). Deriva de
   *  initProgressCallback (report.progress 0..1) con clamp monótono. */
  pct: number;
  /** Texto informativo del engine (p. ej. "Fetching param cache [3/24]"). Solo display. */
  texto: string;
}

export interface WebLlmInitError {
  /** "gpu": sin adapter / VRAM insuficiente / fallo de init del engine ⇒ el selector lo
   *  trata como feature-detection negativa (SU-11 ⇒ unsupported).
   *  "red": fallo de descarga de artefactos ⇒ reintento accesible (error).
   *  "cancelado": consecuencia de cancelLoad() (CA-43 ⇒ cancelled). */
  kind: "gpu" | "red" | "cancelado";
  message: string; // español, legible
}

export interface WebLlmClient extends ChatStreamEngine {
  /** Feature-detection PURA (A-12): `navigator.gpu` presente Y requestAdapter() !== null.
   *  NUNCA descarga nada ni contacta el host de artefactos (CA-40/41: 0 requests). */
  detectSupport(): Promise<boolean>;
  /** `hasModelInCache(model)` de web-llm sobre la caché local del navegador.
   *  0 peticiones de red. Decide CA-40a (carga automática) vs CA-40b (oferta). */
  isModelCached(): Promise<boolean>;
  /** Crea el Web Worker (webllm.worker.ts) y el engine vía CreateWebWorkerMLCEngine con
   *  el model id de CONFIG (CA-48) y appConfig = prebuiltAppConfig, o una entrada custom
   *  {model: modelUrl, model_lib: modelLibUrl, model_id: model} si el override está
   *  definido (ADR-18). Emite onProgress con pct monótono durante descarga Y carga
   *  (CA-42). Resuelve cuando el engine está listo para chatear; rechaza con
   *  WebLlmInitError. Idempotente si ya está listo (resuelve inmediato). */
  load(onProgress: (p: WebLlmLoadProgress) => void): Promise<void>;
  /** Cancela la descarga/carga en curso en ≤2 s (CA-43): `worker.terminate()` + worker
   *  NUEVO en el siguiente load() (mismo patrón probado que el timeout de C-RUNNER,
   *  ADR-17). Los shards ya cacheados NO se borran (el reintento no parte de cero).
   *  El load() pendiente rechaza con kind "cancelado". No-op si no hay carga en curso. */
  cancelLoad(): void;
  /** chatStream (heredado de ChatStreamEngine), semántica NORMATIVA (paridad C-OLLAMA):
   *  - stream: true ⇒ onToken por cada chunk con delta.content !== "" del AsyncGenerator;
   *  - signal.abort() ⇒ engine.interruptGenerate() y corta el bucle en ≤2 s SIN llamar
   *    onError (el parcial emitido queda, CA-22/CA-44);
   *  - error del engine a mitad ⇒ onError({kind:"engine", message}) con el parcial
   *    intacto (análogo a CA-26);
   *  - engine no cargado ⇒ onError({kind:"engine", ...}). NUNCA rechaza por errores de
   *    uso; rechaza solo por fallo de infraestructura (igual que PyRunner). */
  /** Libera engine + worker (tests/limpieza). NO borra la caché de artefactos. */
  unload(): void;
}

/**
 * Contrato C-ENGINE (`docs/arch/ARCHITECTURE-M5-WEBLLM.md` §9.4). Transcripción
 * LITERAL — ADITIVO, no toca C-OLLAMA. Implementación (SF2) en
 * `src/assistant/engineStore.ts`.
 */

export type EngineKind = "ollama" | "webllm";

export type WebLlmPhase =
  | "inactive" // sin degradación de Ollama, o fallback deshabilitado (CONFIG)
  | "unsupported" // feature-detection negativa o init GPU fallida (A-12/SU-11); estable en la sesión
  | "offer" // degradado + WebGPU ok + modelo NO cacheado: oferta visible (CA-40b)
  | "fetching" // descarga/carga de artefactos en curso, con progreso (CA-42)
  | "ready" // engine cargado: chat vía WebLLM disponible (CA-44)
  | "cancelled" // cancelado por el alumno EN ESTA SESIÓN (CA-43): sin auto-reintento; oferta accesible
  | "error"; // fallo de red en la descarga: mensaje legible + reintento accesible

export interface AssistantEngine {
  /** Motor que atenderá el PRÓXIMO mensaje (selección POR MENSAJE, ADR-19 ⇒ CA-46).
   *  null ⇒ input del chat deshabilitado (degradación terminal CA-19/20). */
  active: EngineKind | null;
  /** Estado CRUDO de Ollama (C-OLLAMA, sin cambios). */
  ollama: OllamaStatus;
  webllm: {
    phase: WebLlmPhase;
    progress: WebLlmLoadProgress | null; // solo relevante en "fetching"
    model: string; // CONFIG.webllm.model (CA-48)
    lastError: string | null; // mensaje legible en "error"
  };
}

/** `engineStore` (zustand, SIN persist: el ciclo de vida del fallback es por sesión
 *  de página). Vive en `src/assistant/engineStore.ts`; el `WebLlmClient` es
 *  inyectable para tests. */
export interface EngineState {
  engine: AssistantEngine;
  /** La llama `useAssistantEngine` en cada resultado del health-check. Ejecuta la
   *  máquina de estados normativa (§9.4.1) y recalcula `active` con
   *  `selectActiveEngine`. */
  setOllamaStatus(s: OllamaStatus): void;
  /** offer | cancelled | error → fetching: dispara `client.load()` con progreso. */
  acceptDownload(): void;
  /** fetching → cancelled: `client.cancelLoad()` (≤2 s, CA-43). */
  cancelFetch(): void;
}
