import { describe, expect, it } from "vitest";

import { getModule } from "@/content/registry";
import type { CourseModule, ModuleId } from "@/content/types";

/**
 * CA-28 (mod03–06) — SLICES.md §S13: "revisión CA-28 sobre mod03–06" ampliando
 * el patrón de `grounding-audit.test.ts` (S1, mod01–02).
 *
 * mod03–06 cubren ÚNICAMENTE la superficie CORE del grounding
 * (`docs/reference/langgraph-grounding.md` §1–3: state/nodes/edges/conditional,
 * reducers `operator.add`, y `add_messages`). SLICES.md §S13 es explícito:
 * "Solo requiere shim core" y prohíbe fan-out real (Send/superstep avanzado)
 * hasta que S12 esté en PASS. Ningún bloque de código de estos 4 módulos debe
 * usar superficie avanzada (checkpointer, interrupt/Command, store,
 * tools/ReAct, streaming, subgraphs, SDK — tabla C-RUNNER "Avanzado",
 * ARCHITECTURE §4) ni símbolos deprecados/inventados.
 *
 * Auditoría textual determinista (no ejecuta Python/Pyodide: eso es el humo de
 * `e2e/runner/mod03-06-solutions.spec.ts`). Independiente de la implementación
 * de `content/`: solo usa el contrato público (`getModule`).
 */

const CODE_FENCE_RE = /```(?:python|py)\n([\s\S]*?)```/g;

function extractCodeBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const re = new RegExp(CODE_FENCE_RE);
  let match: RegExpExecArray | null = re.exec(markdown);
  while (match !== null) {
    blocks.push(match[1]);
    match = re.exec(markdown);
  }
  return blocks;
}

function allPythonSources(mod: CourseModule): string[] {
  const sources: string[] = [];
  sources.push(...extractCodeBlocks(mod.secciones.explicaSimple.contenidoMd));
  sources.push(...extractCodeBlocks(mod.secciones.detectaGaps.contenidoMd ?? ""));
  sources.push(...extractCodeBlocks(mod.secciones.llenaGaps.contenidoMd));

  for (const reto of mod.secciones.llenaGaps.retos) {
    sources.push(reto.starterCode, reto.solutionCode, reto.validationCode);
  }

  const sintesis = mod.secciones.refinaSimplifica.sintesis;
  if (sintesis.kind === "code") {
    sources.push(sintesis.reto.starterCode, sintesis.reto.solutionCode, sintesis.reto.validationCode);
  }

  for (const q of mod.secciones.detectaGaps.quiz.preguntas) {
    if (q.kind === "output") sources.push(q.codigo);
  }
  if (sintesis.kind === "quiz") {
    for (const q of sintesis.quiz.preguntas) {
      if (q.kind === "output") sources.push(q.codigo);
    }
  }

  return sources.filter((s) => s.length > 0);
}

// Superficie permitida para mod03–06 (grounding §1–3; C-RUNNER tabla "Core"):
// StateGraph/START/END, add_node/add_edge/add_conditional_edges, MessagesState,
// add_messages, get_stream_writer NO (custom streaming no es tema de mod03–06,
// se enseña en mod10/11) — se excluye deliberadamente de lo permitido aquí.
const ALLOWED_LANGGRAPH_IMPORT_PATHS = ["langgraph.graph", "langgraph.graph.message"];

// Superficie avanzada (tabla C-RUNNER "Avanzado", S12) que mod03–06 NO puede usar
// (solo requieren shim core, SLICES.md §S13) + Send (map-reduce dinámico, prohibido
// en toda la superficie, C-RUNNER §superstep).
const FORBIDDEN_ADVANCED_SYMBOLS = [
  "InMemorySaver",
  "interrupt(",
  "Command(",
  "get_stream_writer",
  "InMemoryStore",
  "ToolNode",
  "create_react_agent",
  "langgraph_sdk",
  "@tool",
  ".stream(",
  "checkpointer=",
  "thread_id",
  "Send(",
];

// APIs deprecadas/inventadas que nunca deben aparecer (CA-28).
const DEPRECATED_OR_INVENTED_SYMBOLS = [
  "set_entry_point",
  "set_finish_point",
  "MessageGraph",
  "ToolExecutor",
  "langgraph.prebuilt.ToolExecutor",
  "run_graph",
];

describe.each(["mod03", "mod04", "mod05", "mod06"] as ModuleId[])("CA-28 — auditoría de símbolos en %s (SLICES.md §S13)", (id) => {
  it("tiene al menos un bloque de código Python en su contenido", () => {
    const mod = getModule(id);
    expect(mod, `${id} debe existir en el registry`).toBeDefined();
    const sources = allPythonSources(mod!);
    expect(sources.length, `${id} debería incluir código de ejemplo/reto`).toBeGreaterThan(0);
  });

  it("ningún bloque de código usa superficie avanzada (mod03–06 solo requieren shim core)", () => {
    const mod = getModule(id)!;
    const sources = allPythonSources(mod);
    for (const src of sources) {
      for (const forbidden of FORBIDDEN_ADVANCED_SYMBOLS) {
        expect(src, `${id} usa símbolo de superficie avanzada: "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it("ningún bloque de código usa APIs deprecadas o inventadas", () => {
    const mod = getModule(id)!;
    const sources = allPythonSources(mod);
    for (const src of sources) {
      for (const banned of DEPRECATED_OR_INVENTED_SYMBOLS) {
        expect(src, `${id} usa API deprecada/inventada: "${banned}"`).not.toContain(banned);
      }
    }
  });

  it("los imports de 'langgraph' solo provienen de paths documentados en el grounding core (§1–3)", () => {
    const mod = getModule(id)!;
    const sources = allPythonSources(mod);
    const importRe = /from\s+(langgraph(?:\.[a-zA-Z_.]+)?)\s+import/g;
    for (const src of sources) {
      const re = new RegExp(importRe);
      let m: RegExpExecArray | null = re.exec(src);
      while (m !== null) {
        const importPath = m[1];
        const isAllowed = ALLOWED_LANGGRAPH_IMPORT_PATHS.some(
          (allowed) => importPath === allowed || importPath.startsWith(`${allowed}.`),
        );
        expect(isAllowed, `${id} importa de "${importPath}", fuera de grounding core §1–3`).toBe(true);
        m = re.exec(src);
      }
    }
  });
});
