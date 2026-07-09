import { describe, expect, it } from "vitest";

import { getModule } from "@/content/registry";
import type { CourseModule, ModuleId } from "@/content/types";

/**
 * CA-28 (mod12–16) — SLICES.md §S15: "revisión CA-28 sobre mod12–16" ampliando
 * el patrón de `grounding-audit-mod07-11.test.ts` (S14, en PASS).
 *
 * mod12–16 cubren tool calling, ReAct, multi-agente, subgraphs y deployment
 * (PRD §6, filas 12–16) y por tanto SÍ pueden usar la superficie de
 * tool-calling/ReAct/multi-agente del shim (`@tool`, `bind_tools`, `ToolNode`,
 * `create_react_agent`, `.tool_calls`, `Command(goto=, update=)`,
 * `langgraph.prebuilt`, `langchain.tools`/`langchain_core.tools`) — a
 * diferencia de mod01–11 (solo core/avanzado sin tools). El instructivo de
 * S15 agrupa mod12–14 sin partición estricta entre ellos: "mod12–14 pueden
 * usar tools/ReAct/multi-agente" en conjunto.
 *
 * Restricciones que SÍ se mantienen estrictas (ADR-11, C-RUNNER §superstep):
 * - `Send(` (map-reduce dinámico) prohibido en TODA la superficie, TODOS los
 *   módulos.
 * - `subgraphs=True` (stream namespaced) fuera de la superficie EJECUTABLE:
 *   prohibido en `starterCode`/`solutionCode`/`validationCode` de TODOS los
 *   módulos, incluido mod15 (regla 6 de C-CONTENT / ADR-11) — solo puede
 *   aparecer en bloques `contenidoMd` (ilustrativos, con "copiar") de mod15.
 * - `langgraph_sdk` fuera de la superficie ejecutable: prohibido en
 *   `starterCode`/`solutionCode`/`validationCode` de TODOS los módulos,
 *   incluido mod16 (NG-06) — solo puede aparecer en bloques `contenidoMd`
 *   ilustrativos de mod16.
 * - Símbolos deprecados/inventados (`set_entry_point`, `MessageGraph`,
 *   `ToolExecutor`, `run_graph`, …) prohibidos en cualquier módulo.
 * - Imports de `langgraph`/`langchain` solo desde paths documentados.
 *
 * Auditoría textual determinista (no ejecuta Python/Pyodide: eso es el humo
 * de `e2e/runner/mod12-16-solutions.spec.ts`). Independiente de la
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

interface TaggedSource {
  text: string;
  /** "markdown": bloque ilustrativo (contenidoMd o código mostrado en un quiz
   *  "output"), no se ejecuta contra el shim. "executable": starter/solution/
   *  validationCode de un CodeChallenge — SÍ se ejecuta en el runner real. */
  origin: "markdown" | "executable";
}

function collectSources(mod: CourseModule): TaggedSource[] {
  const sources: TaggedSource[] = [];

  const mdBlocks = [
    ...extractCodeBlocks(mod.secciones.explicaSimple.contenidoMd),
    ...extractCodeBlocks(mod.secciones.detectaGaps.contenidoMd ?? ""),
    ...extractCodeBlocks(mod.secciones.llenaGaps.contenidoMd),
  ];
  for (const text of mdBlocks) sources.push({ text, origin: "markdown" });

  for (const q of mod.secciones.detectaGaps.quiz.preguntas) {
    if (q.kind === "output") sources.push({ text: q.codigo, origin: "markdown" });
  }

  for (const reto of mod.secciones.llenaGaps.retos) {
    sources.push(
      { text: reto.starterCode, origin: "executable" },
      { text: reto.solutionCode, origin: "executable" },
      { text: reto.validationCode, origin: "executable" },
    );
  }

  const sintesis = mod.secciones.refinaSimplifica.sintesis;
  if (sintesis.kind === "code") {
    sources.push(
      { text: sintesis.reto.starterCode, origin: "executable" },
      { text: sintesis.reto.solutionCode, origin: "executable" },
      { text: sintesis.reto.validationCode, origin: "executable" },
    );
  } else {
    for (const q of sintesis.quiz.preguntas) {
      if (q.kind === "output") sources.push({ text: q.codigo, origin: "markdown" });
    }
  }

  return sources.filter((s) => s.text.length > 0);
}

// Superficie permitida para mod12–16: core + avanzada (checkpointing/Store/
// HITL/streaming, S12) + prebuilt (ToolNode/create_react_agent, mod12–13).
const ALLOWED_LANGGRAPH_IMPORT_PATHS = [
  "langgraph.graph",
  "langgraph.graph.message",
  "langgraph.config",
  "langgraph.checkpoint.memory",
  "langgraph.types",
  "langgraph.store.memory",
  "langgraph.prebuilt",
];

const ALLOWED_LANGCHAIN_IMPORT_PATHS = [
  "langchain.messages",
  "langchain_core.messages",
  "langchain.tools",
  "langchain_core.tools",
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

const MOD12_16_IDS: ModuleId[] = ["mod12", "mod13", "mod14", "mod15", "mod16"];

describe.each(MOD12_16_IDS)("CA-28 — auditoría de símbolos en %s (SLICES.md §S15)", (id) => {
  it("tiene al menos un bloque de código Python en su contenido", () => {
    const mod = getModule(id);
    expect(mod, `${id} debe existir en el registry`).toBeDefined();
    const sources = collectSources(mod!);
    expect(sources.length, `${id} debería incluir código de ejemplo/reto`).toBeGreaterThan(0);
  });

  it("ningún bloque de código (markdown o ejecutable) usa Send( (map-reduce dinámico, prohibido en toda la superficie)", () => {
    const mod = getModule(id)!;
    const sources = collectSources(mod);
    for (const { text } of sources) {
      expect(text, `${id} usa Send(, fuera de toda la superficie ejecutable`).not.toMatch(/\bSend\s*\(/);
    }
  });

  it("ningún bloque de código usa APIs deprecadas o inventadas", () => {
    const mod = getModule(id)!;
    const sources = collectSources(mod);
    for (const { text } of sources) {
      for (const banned of DEPRECATED_OR_INVENTED_SYMBOLS) {
        expect(text, `${id} usa API deprecada/inventada: "${banned}"`).not.toContain(banned);
      }
    }
  });

  it("los imports de 'langgraph'/'langchain' solo provienen de paths documentados (core + avanzado + prebuilt + tools)", () => {
    const mod = getModule(id)!;
    const sources = collectSources(mod);
    const langgraphImportRe = /from\s+(langgraph(?:\.[a-zA-Z_.]+)?)\s+import/g;
    const langchainImportRe = /from\s+(langchain(?:_core)?(?:\.[a-zA-Z_.]+)?)\s+import/g;
    for (const { text } of sources) {
      let re = new RegExp(langgraphImportRe);
      let m: RegExpExecArray | null = re.exec(text);
      while (m !== null) {
        const importPath = m[1];
        const isAllowed = ALLOWED_LANGGRAPH_IMPORT_PATHS.some(
          (allowed) => importPath === allowed || importPath.startsWith(`${allowed}.`),
        );
        expect(isAllowed, `${id} importa de "${importPath}", fuera de la superficie permitida`).toBe(true);
        m = re.exec(text);
      }

      re = new RegExp(langchainImportRe);
      m = re.exec(text);
      while (m !== null) {
        const importPath = m[1];
        const isAllowed = ALLOWED_LANGCHAIN_IMPORT_PATHS.some(
          (allowed) => importPath === allowed || importPath.startsWith(`${allowed}.`),
        );
        expect(isAllowed, `${id} importa de "${importPath}", fuera de la superficie permitida`).toBe(true);
        m = re.exec(text);
      }
    }
  });

  it("ningún código EJECUTABLE (starter/solution/validationCode) contiene subgraphs=True (ADR-11, fuera de la superficie ejecutable)", () => {
    const mod = getModule(id)!;
    const sources = collectSources(mod).filter((s) => s.origin === "executable");
    for (const { text } of sources) {
      expect(text, `${id} usa subgraphs=True en código EJECUTABLE — ADR-11 lo prohíbe`).not.toMatch(
        /subgraphs\s*=\s*True/,
      );
    }
  });

  it("ningún código EJECUTABLE (starter/solution/validationCode) contiene langgraph_sdk (NG-06, mod16 es conceptual)", () => {
    const mod = getModule(id)!;
    const sources = collectSources(mod).filter((s) => s.origin === "executable");
    for (const { text } of sources) {
      expect(text, `${id} usa langgraph_sdk en código EJECUTABLE — NG-06 lo prohíbe`).not.toContain("langgraph_sdk");
    }
  });

  it("validationCode con llmDoubles usa get_llm_calls del harness para verificar invocaciones (si el reto usa FakeChatModel)", () => {
    const mod = getModule(id)!;
    const retosConDoubles = [
      ...mod.secciones.llenaGaps.retos,
      ...(mod.secciones.refinaSimplifica.sintesis.kind === "code" ? [mod.secciones.refinaSimplifica.sintesis.reto] : []),
    ].filter((c) => (c.llmDoubles?.length ?? 0) > 0);
    for (const c of retosConDoubles) {
      expect(c.validationCode, `${id}/${c.id} declara llmDoubles pero no usa get_llm_calls`).toContain(
        "get_llm_calls",
      );
    }
  });
});

describe("CA-28 / ADR-11 — mod15: subgraphs=True/ns es SOLO ilustrativo", () => {
  it("mod15 declara ≥1 bloque markdown ilustrativo con subgraphs=True (grounding base §6, mostrado con 'copiar')", () => {
    const mod = getModule("mod15")!;
    const sources = collectSources(mod);
    const ilustrativosConSubgraphsTrue = sources.filter(
      (s) => s.origin === "markdown" && /subgraphs\s*=\s*True/.test(s.text),
    );
    expect(
      ilustrativosConSubgraphsTrue.length,
      "mod15 debería mostrar subgraphs=True en al menos un bloque ilustrativo",
    ).toBeGreaterThanOrEqual(1);
  });

  it("mod15: subgraphs=True NUNCA aparece en un bloque de origen 'executable' (starter/solution/validationCode)", () => {
    const mod = getModule("mod15")!;
    const sources = collectSources(mod).filter((s) => s.origin === "executable");
    for (const { text } of sources) {
      expect(text).not.toMatch(/subgraphs\s*=\s*True/);
    }
  });
});

describe("CA-28 / NG-06 — mod16: langgraph_sdk es SOLO ilustrativo (sin shim)", () => {
  it("mod16 declara ≥1 bloque markdown ilustrativo con langgraph_sdk (grounding base §7, mostrado con 'copiar')", () => {
    const mod = getModule("mod16")!;
    const sources = collectSources(mod);
    const ilustrativosConSdk = sources.filter((s) => s.origin === "markdown" && s.text.includes("langgraph_sdk"));
    expect(ilustrativosConSdk.length, "mod16 debería mostrar langgraph_sdk en al menos un bloque ilustrativo").toBeGreaterThanOrEqual(
      1,
    );
  });

  it("mod16: langgraph_sdk NUNCA aparece en un bloque de origen 'executable' (starter/solution/validationCode)", () => {
    const mod = getModule("mod16")!;
    const sources = collectSources(mod).filter((s) => s.origin === "executable");
    for (const { text } of sources) {
      expect(text).not.toContain("langgraph_sdk");
    }
  });
});
