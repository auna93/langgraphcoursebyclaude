import { describe, expect, it } from "vitest";

import { getModule } from "@/content/registry";
import type { CourseModule, ModuleId } from "@/content/types";

/**
 * CA-28 (mod01–02) — SLICES.md §S1: "revisión CA-28 sobre mod01–02".
 *
 * mod01–02 cubren ÚNICAMENTE la superficie de
 * `docs/reference/langgraph-grounding.md` §1 (state/nodes/edges/conditional)
 * y §2 (esquemas input/output/private). Ningún bloque de código de estos dos
 * módulos debe usar superficie avanzada (checkpointer, interrupt/Command,
 * store, tools/ReAct, streaming, subgraphs — tabla C-RUNNER, ARCHITECTURE §4)
 * ni símbolos deprecados/inventados de LangGraph.
 *
 * Es una auditoría textual determinista (no ejecuta Python ni Pyodide: eso es
 * S6/S14). Independiente de la implementación de `content/`: solo usa el
 * contrato público (`getModule`) y busca patrones de texto en el código
 * embebido en el contenido.
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

// Superficie permitida para mod01–02 (grounding §1–2, ARCHITECTURE C-RUNNER: filas
// StateGraph/START/END y add_messages). Cualquier import de `langgraph` fuera de
// estos paths es superficie avanzada aún no cubierta por el grounding en estos
// dos módulos.
const ALLOWED_LANGGRAPH_IMPORT_PATHS = ["langgraph.graph", "langgraph.graph.message"];

// Superficie avanzada (tabla C-RUNNER, ARCHITECTURE §4) que llega en S12/M3:
// checkpointer, interrupt/Command, stream_writer, Store, tools/ReAct, SDK.
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
];

// APIs deprecadas/inventadas que nunca deben aparecer (CA-28: "cero usos de
// APIs deprecadas o inventadas").
const DEPRECATED_OR_INVENTED_SYMBOLS = [
  "set_entry_point",
  "set_finish_point",
  "MessageGraph",
  "ToolExecutor",
  "langgraph.prebuilt.ToolExecutor",
];

describe.each(["mod01", "mod02"] as ModuleId[])("CA-28 — auditoría de símbolos en %s", (id) => {
  it("tiene al menos un bloque de código Python en su contenido", () => {
    const mod = getModule(id);
    expect(mod, `${id} debe existir en el registry`).toBeDefined();
    const sources = allPythonSources(mod!);
    expect(sources.length, `${id} debería incluir código de ejemplo/reto`).toBeGreaterThan(0);
  });

  it("ningún bloque de código usa superficie avanzada no cubierta por grounding §1–2", () => {
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

  it("los imports de 'langgraph' solo provienen de paths documentados en el grounding", () => {
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
        expect(isAllowed, `${id} importa de "${importPath}", fuera de grounding §1–2`).toBe(true);
        m = re.exec(src);
      }
    }
  });
});
