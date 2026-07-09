import { describe, expect, it } from "vitest";

import { getModule } from "@/content/registry";
import type { CourseModule, ModuleId } from "@/content/types";

/**
 * CA-28 (mod07–11) — SLICES.md §S14: "revisión CA-28 sobre mod07–11" ampliando
 * el patrón de `grounding-audit-mod03-06.test.ts` (S13, en PASS).
 *
 * mod07–11 cubren checkpointing, Store, HITL, streaming I/II (PRD §6, filas
 * 07–11) y por tanto SÍ pueden usar la superficie AVANZADA del shim
 * (tabla "Avanzado" de C-RUNNER, S12, EN PASS): `InMemorySaver`, `thread_id`,
 * `get_state`/`get_state_history`, `interrupt`/`Command`, `InMemoryStore`,
 * `stream_mode` (values/updates/messages/custom), `get_stream_writer` — a
 * diferencia de mod03–06 (solo core). Lo que mod07–11 NO puede usar es la
 * superficie de tool-calling/ReAct/multi-agente (`@tool`, `bind_tools`,
 * `ToolNode`, `create_react_agent`, `.tool_calls`, `langchain.tools`,
 * `langgraph.prebuilt`) reservada a mod12–14, ni `Send(`/`subgraphs=True`
 * (fuera de toda la superficie ejecutable, C-RUNNER §superstep / ADR-11), ni
 * símbolos deprecados/inventados.
 *
 * Auditoría textual determinista (no ejecuta Python/Pyodide: eso es el humo
 * de `e2e/runner/mod07-11-solutions.spec.ts`). Independiente de la
 * implementación de `content/`: solo usa el contrato público (`getModule`).
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

// Superficie permitida para mod07–11: core (grounding base §1–5) + avanzada de
// checkpointing/Store/HITL/streaming (grounding-advanced §1-2, §5; C-RUNNER
// tabla "Avanzado"). NO incluye langgraph.prebuilt (ToolNode/create_react_agent,
// mod12/13) ni langchain.tools (@tool, mod12).
const ALLOWED_LANGGRAPH_IMPORT_PATHS = [
  "langgraph.graph",
  "langgraph.graph.message",
  "langgraph.config",
  "langgraph.checkpoint.memory",
  "langgraph.types",
  "langgraph.store.memory",
];

// Superficie de tool-calling/ReAct/multi-agente/SDK que mod07–11 NO debe usar
// (reservada a mod12–16), + símbolos prohibidos en TODA la superficie
// ejecutable (Send, subgraphs=True — ADR-11).
const FORBIDDEN_SYMBOLS_FOR_MOD07_11 = [
  "ToolNode",
  "create_react_agent",
  "bind_tools",
  "langchain.tools",
  "langchain_core.tools",
  "langgraph.prebuilt",
  "langgraph_sdk",
  "Send(",
  "subgraphs=True",
  "subgraphs = True",
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

describe.each(["mod07", "mod08", "mod09", "mod10", "mod11"] as ModuleId[])(
  "CA-28 — auditoría de símbolos en %s (SLICES.md §S14)",
  (id) => {
    it("tiene al menos un bloque de código Python en su contenido", () => {
      const mod = getModule(id);
      expect(mod, `${id} debe existir en el registry`).toBeDefined();
      const sources = allPythonSources(mod!);
      expect(sources.length, `${id} debería incluir código de ejemplo/reto`).toBeGreaterThan(0);
    });

    it("ningún bloque de código usa superficie de tool-calling/ReAct/multi-agente/SDK ni Send/subgraphs=True", () => {
      const mod = getModule(id)!;
      const sources = allPythonSources(mod);
      for (const src of sources) {
        for (const forbidden of FORBIDDEN_SYMBOLS_FOR_MOD07_11) {
          expect(src, `${id} usa símbolo fuera de su alcance temático: "${forbidden}"`).not.toContain(forbidden);
        }
      }
    });

    it("ningún bloque de código usa .tool_calls (reservado a mod12–14)", () => {
      const mod = getModule(id)!;
      const sources = allPythonSources(mod);
      for (const src of sources) {
        expect(src, `${id} usa .tool_calls, fuera de su alcance temático`).not.toMatch(/\.tool_calls\b/);
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

    it("los imports de 'langgraph' solo provienen de paths documentados (core + avanzado checkpoint/store/types/config)", () => {
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
          expect(isAllowed, `${id} importa de "${importPath}", fuera de la superficie permitida para mod07–11`).toBe(
            true,
          );
          m = re.exec(src);
        }
      }
    });

    it("validationCode con llmDoubles usa get_llm_calls del harness para verificar invocaciones (si el reto usa FakeChatModel)", () => {
      const mod = getModule(id)!;
      const retosConDoubles = [
        ...mod.secciones.llenaGaps.retos,
        ...(mod.secciones.refinaSimplifica.sintesis.kind === "code"
          ? [mod.secciones.refinaSimplifica.sintesis.reto]
          : []),
      ].filter((c) => (c.llmDoubles?.length ?? 0) > 0);
      for (const c of retosConDoubles) {
        expect(c.validationCode, `${id}/${c.id} declara llmDoubles pero no usa get_llm_calls`).toContain(
          "get_llm_calls",
        );
      }
    });
  },
);
