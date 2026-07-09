/**
 * Índice RAG léxico (C-RAG, ARCHITECTURE.md §4, slice S10, ADR-05).
 *
 * `buildRagIndex` construye en runtime (sin red, sin build step) un índice
 * MiniSearch (BM25-like) sobre los chunks del contenido bundleado.
 * `retrieve` es determinista para una misma query + contenido, y aplica
 * boost al módulo actual (contexto A-06, CA-23/24).
 */

import MiniSearch from "minisearch";

import type { CourseModule, ModuleId } from "@/content/types";
import { chunkModules } from "./chunker";
import type { RagChunk, RagHit, RagIndex } from "./types";

/** topK por defecto del contrato C-RAG si el caller no pasa `opts.topK`. */
const DEFAULT_TOP_K = 4;

/** Multiplicador de score para los chunks del módulo actual (A-06). */
const CURRENT_MODULE_BOOST = 3;

const INDEXED_FIELDS: (keyof Pick<RagChunk, "titulo" | "texto">)[] = ["titulo", "texto"];
const STORED_FIELDS: (keyof RagChunk)[] = [
  "id",
  "moduleId",
  "moduleTitulo",
  "sectionKey",
  "titulo",
  "texto",
];

/** minúsculas + sin tildes; sin stemming (los términos clave son API en inglés). */
const COMBINING_DIACRITICS_RE = /[̀-ͯ]/g;

function normalizeTerm(term: string): string {
  return term.normalize("NFD").replace(COMBINING_DIACRITICS_RE, "").toLowerCase();
}

function tokenize(text: string): string[] {
  return text.split(/[^\p{L}\p{N}_]+/u).filter((t) => t.length > 0);
}

export function buildRagIndex(modules: readonly CourseModule[]): RagIndex {
  const chunks = chunkModules(modules);

  const miniSearch = new MiniSearch<RagChunk>({
    idField: "id",
    fields: INDEXED_FIELDS as string[],
    storeFields: STORED_FIELDS as string[],
    tokenize,
    processTerm: (term) => {
      const normalized = normalizeTerm(term);
      return normalized.length > 0 ? normalized : null;
    },
  });

  miniSearch.addAll(chunks);

  return {
    retrieve(query, opts) {
      const trimmed = query.trim();
      if (trimmed.length === 0) return [];

      const topK = opts?.topK ?? DEFAULT_TOP_K;
      const boostModuleId: ModuleId | undefined = opts?.boostModuleId;

      const results = miniSearch.search(trimmed, {
        fields: INDEXED_FIELDS as string[],
        boost: { titulo: 2 },
        prefix: true,
        fuzzy: 0.2,
        boostDocument: (_id, _term, storedFields) =>
          boostModuleId !== undefined && storedFields?.moduleId === boostModuleId
            ? CURRENT_MODULE_BOOST
            : 1,
      });

      return results.slice(0, topK).map(
        (r): RagHit => ({
          id: r.id as string,
          moduleId: r.moduleId as ModuleId,
          moduleTitulo: r.moduleTitulo as string,
          sectionKey: r.sectionKey as RagChunk["sectionKey"],
          titulo: r.titulo as string,
          texto: r.texto as string,
          score: r.score,
        }),
      );
    },
  };
}
