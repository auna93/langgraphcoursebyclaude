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
