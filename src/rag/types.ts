/**
 * Contrato C-RAG (ARCHITECTURE.md §4, `src/rag/types.ts`).
 *
 * Transcripción LITERAL del contrato. `rag/` no tiene implementación todavía
 * (llega en S10 — chunker + índice MiniSearch); este archivo sólo fija el
 * TIPO `RagHit` que necesita la firma FINAL de `PromptInput` (C-ASSIST,
 * slice S9). Cualquier cambio de forma exige volver al architect (Gate 2).
 */

import type { CourseModule, ModuleId } from "@/content/types";

export interface RagChunk {
  id: string; // `${moduleId}/${sectionKey}/${n}`
  moduleId: ModuleId;
  moduleTitulo: string;
  sectionKey: "explicaSimple" | "detectaGaps" | "llenaGaps" | "refinaSimplifica";
  titulo: string; // heading del chunk
  texto: string; // markdown plano del fragmento
}

export interface RagHit extends RagChunk {
  score: number;
}

export interface RagIndex {
  /** Determinista para una misma query + contenido. topK default 4.
   *  boostModuleId: multiplica score de chunks de ese módulo (contexto A-06). */
  retrieve(query: string, opts?: { topK?: number; boostModuleId?: ModuleId }): RagHit[];
}

export declare function buildRagIndex(modules: readonly CourseModule[]): RagIndex;
