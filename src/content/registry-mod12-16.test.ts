import { describe, expect, it } from "vitest";

import { getModule } from "@/content/registry";
import type { CodeChallenge, CourseModule, ModuleId } from "@/content/types";

/**
 * Tests de contrato — S15 (SLICES.md §S15): "Contenido módulos 12–16".
 * CA-02 / CA-03 / CA-05 / CA-28 para mod12–16 (C-CONTENT, ARCHITECTURE.md §4).
 *
 * Independiente del implementer: solo usa el contrato público (`getModule`,
 * tipos de `@/content/types`) y las reglas fijadas en PRD.md §6 (filas 12–16),
 * en ARCHITECTURE.md ("Reglas M3 para autores de contenido", regla 6 / ADR-11)
 * y en `docs/reference/langgraph-grounding-advanced.md` §3–5 +
 * `langgraph-grounding.md` §6–7. Replica el patrón de
 * `registry-mod07-11.test.ts` (S14, en PASS), con las particularidades de
 * S15: mod15 (subgraphs=True/ns solo ilustrativo, ADR-11) y mod16
 * (conceptual, síntesis-quiz, CA-03).
 *
 * `registry.test.ts` (S1) ya cubre invariantes GENÉRICOS válidos para los 16
 * módulos (incl. mod12–16 en su forma stub, incluyendo la aceptación de
 * síntesis-quiz para mod16). Este archivo añade lo que S15 debe demostrar que
 * YA NO es cierto de la forma stub: contenido sustancial, sin marcador
 * `enConstruccion`, y fidelidad temática a tool calling / ReAct / multi-agente
 * / subgraphs / deployment (PRD §6, filas 12–16).
 */

type ModuleWithStubFlag = CourseModule & { enConstruccion?: true };

const MOD12_16_IDS: ModuleId[] = ["mod12", "mod13", "mod14", "mod15", "mod16"];
const MOD12_15_IDS: ModuleId[] = ["mod12", "mod13", "mod14", "mod15"];

const STUB_MARKERS_RE =
  /en\s+construcci[oó]n|\btodo:|lorem ipsum|\bstub\b|\bplaceholder\b|pendiente|🚧/i;

function requireModule(id: ModuleId): ModuleWithStubFlag {
  const mod = getModule(id) as ModuleWithStubFlag | undefined;
  expect(mod, `${id} debe existir en el registry`).toBeDefined();
  return mod!;
}

function allChallenges(mod: CourseModule): CodeChallenge[] {
  const challenges = [...mod.secciones.llenaGaps.retos];
  const sintesis = mod.secciones.refinaSimplifica.sintesis;
  if (sintesis.kind === "code") challenges.push(sintesis.reto);
  return challenges;
}

function allMarkdownSources(mod: CourseModule): string[] {
  return [
    mod.secciones.explicaSimple.contenidoMd,
    mod.secciones.detectaGaps.contenidoMd ?? "",
    mod.secciones.llenaGaps.contenidoMd,
  ];
}

describe("S15 — mod12–16 dejan de ser stub (ADR-09)", () => {
  it.each(MOD12_16_IDS)("%s: NO define enConstruccion (o es false)", (id) => {
    const mod = requireModule(id);
    expect(mod.enConstruccion, `${id}.enConstruccion debería ser undefined/false`).not.toBe(true);
  });

  it.each(MOD12_16_IDS)(
    "%s: ningún contenidoMd contiene el literal/marcador 'EN CONSTRUCCIÓN' u otro placeholder",
    (id) => {
      const mod = requireModule(id);
      for (const bloque of allMarkdownSources(mod)) {
        expect(bloque, `${id}`).not.toMatch(STUB_MARKERS_RE);
      }
    },
  );

  it.each(MOD12_16_IDS)("%s: explicaSimple y llenaGaps tienen contenido sustancial (≥200 chars)", (id) => {
    const mod = requireModule(id);
    expect(mod.secciones.explicaSimple.contenidoMd.length, `${id} explicaSimple`).toBeGreaterThanOrEqual(200);
    expect(mod.secciones.llenaGaps.contenidoMd.length, `${id} llenaGaps`).toBeGreaterThanOrEqual(200);
  });

  it.each(MOD12_16_IDS)("%s: quiz paso 2 tiene 4–6 preguntas no placeholder", (id) => {
    const mod = requireModule(id);
    const preguntas = mod.secciones.detectaGaps.quiz.preguntas;
    expect(preguntas.length, `${id} quiz`).toBeGreaterThanOrEqual(4);
    expect(preguntas.length, `${id} quiz`).toBeLessThanOrEqual(6);
    for (const q of preguntas) {
      expect(q.enunciadoMd, `${id}/${q.id}`).not.toMatch(STUB_MARKERS_RE);
      expect(q.explicacionMd, `${id}/${q.id}`).not.toMatch(STUB_MARKERS_RE);
    }
  });

  it.each(MOD12_15_IDS)("%s: ≥1 reto de código real (paso 3 y/o síntesis)", (id) => {
    const mod = requireModule(id);
    const challenges = allChallenges(mod);
    expect(challenges.length, `${id} debería tener ≥1 reto real`).toBeGreaterThanOrEqual(1);
    for (const c of challenges) {
      expect(c.starterCode, `${id}/${c.id} starterCode`).not.toMatch(STUB_MARKERS_RE);
      expect(c.solutionCode, `${id}/${c.id} solutionCode`).not.toMatch(STUB_MARKERS_RE);
      expect(c.validationCode, `${id}/${c.id} validationCode`).not.toMatch(STUB_MARKERS_RE);
      const checkCount = (c.validationCode.match(/\bcheck(_eq|_raises)?\s*\(/g) ?? []).length;
      expect(checkCount, `${id}/${c.id} validationCode debería tener ≥1 aserción real`).toBeGreaterThanOrEqual(1);
      expect(c.validationCode, `${id}/${c.id}`).not.toMatch(/^\s*check\(\s*"stub"/m);
    }
  });

  it.each(MOD12_16_IDS)("%s: resumen de síntesis (paso 4) no vacío y ≤10 bullets", (id) => {
    const mod = requireModule(id);
    const bullets = mod.secciones.refinaSimplifica.resumenBullets;
    expect(bullets.length, id).toBeGreaterThan(0);
    expect(bullets.length, id).toBeLessThanOrEqual(10);
  });

  it("cualquier módulo de 12–16 cuya síntesis (paso 4) sea 'quiz' tiene 3–6 preguntas reales (no placeholder)", () => {
    for (const id of MOD12_16_IDS) {
      const mod = requireModule(id);
      const sintesis = mod.secciones.refinaSimplifica.sintesis;
      if (sintesis.kind !== "quiz") continue;
      expect(sintesis.quiz.preguntas.length, `${id} síntesis-quiz`).toBeGreaterThanOrEqual(3);
      expect(sintesis.quiz.preguntas.length, `${id} síntesis-quiz`).toBeLessThanOrEqual(6);
      for (const q of sintesis.quiz.preguntas) {
        expect(q.enunciadoMd, `${id}/${q.id}`).not.toMatch(STUB_MARKERS_RE);
        expect(q.explicacionMd, `${id}/${q.id}`).not.toMatch(STUB_MARKERS_RE);
      }
    }
  });
});

describe("S15 — CA-03: mod16 puede sustituir el reto de código por un quiz de integración", () => {
  it("mod16: tiene ≥1 reto real en llenaGaps O su síntesis es un quiz de integración real (3–6 preguntas no placeholder)", () => {
    const mod = requireModule("mod16");
    const retosReales = mod.secciones.llenaGaps.retos.filter(
      (r) => !STUB_MARKERS_RE.test(r.starterCode) && !STUB_MARKERS_RE.test(r.solutionCode),
    );
    const sintesis = mod.secciones.refinaSimplifica.sintesis;
    const sintesisQuizReal =
      sintesis.kind === "quiz" &&
      sintesis.quiz.preguntas.length >= 3 &&
      sintesis.quiz.preguntas.length <= 6 &&
      sintesis.quiz.preguntas.every((q) => !STUB_MARKERS_RE.test(q.enunciadoMd));

    expect(
      retosReales.length >= 1 || sintesisQuizReal,
      "mod16 debe tener ≥1 reto de código real O una síntesis-quiz real (CA-03)",
    ).toBe(true);
  });

  it("mod16 (conceptual, ARCHITECTURE.md §S15): la síntesis es un quiz de integración (sin shim de langgraph_sdk)", () => {
    const mod = requireModule("mod16");
    expect(mod.secciones.refinaSimplifica.sintesis.kind, "mod16 síntesis debería ser 'quiz' (decisión de arquitectura S15)").toBe(
      "quiz",
    );
  });
});

describe("S15 — Reglas M3 del harness (ARCHITECTURE.md C-CONTENT, 'Reglas M3 para autores de contenido')", () => {
  it.each(MOD12_16_IDS)(
    "%s: validationCode importa SOLO de course_harness y solo check/check_eq/check_raises/get_llm_calls",
    (id) => {
      const mod = requireModule(id);
      const allowed = ["check", "check_eq", "check_raises", "get_llm_calls"];
      for (const c of allChallenges(mod)) {
        const importLines = c.validationCode
          .split("\n")
          .filter((line) => line.trim().startsWith("from course_harness import"));
        expect(importLines.length, `${id}/${c.id} debe importar del harness`).toBeGreaterThanOrEqual(1);
        for (const line of importLines) {
          const names = line
            .replace("from course_harness import", "")
            .split(",")
            .map((n) => n.trim())
            .filter(Boolean);
          for (const name of names) {
            expect(allowed, `${id}/${c.id} importa "${name}" — no permitido en M3`).toContain(name);
          }
        }
        expect(c.validationCode, `${id}/${c.id} usa run_graph (no existe, corregido M3)`).not.toContain("run_graph");
      }
    },
  );

  it.each(MOD12_16_IDS)("%s: ningún bloque de código (markdown o reto) usa Send (map-reduce dinámico, prohibido en toda la superficie)", (id) => {
    const mod = requireModule(id);
    const sources = [...allMarkdownSources(mod), ...allChallenges(mod).flatMap((c) => [c.starterCode, c.solutionCode, c.validationCode])];
    for (const src of sources) {
      expect(src, `${id}`).not.toMatch(/\bSend\s*\(/);
    }
  });

  it.each(["mod12", "mod13", "mod14", "mod16"] as ModuleId[])(
    "%s: ningún bloque de código (markdown ni reto) usa subgraphs=True (fuera de su alcance temático, ADR-11)",
    (id) => {
      const mod = requireModule(id);
      const sources = [
        ...allMarkdownSources(mod),
        ...allChallenges(mod).flatMap((c) => [c.starterCode, c.solutionCode, c.validationCode]),
      ];
      for (const src of sources) {
        expect(src, `${id}`).not.toMatch(/subgraphs\s*=\s*True/);
      }
    },
  );

  it("mod15 (ADR-11 / regla 6 C-CONTENT): NINGÚN starterCode/solutionCode/validationCode contiene subgraphs=True", () => {
    const mod = requireModule("mod15");
    for (const c of allChallenges(mod)) {
      expect(c.starterCode, `mod15/${c.id} starterCode`).not.toMatch(/subgraphs\s*=\s*True/);
      expect(c.solutionCode, `mod15/${c.id} solutionCode`).not.toMatch(/subgraphs\s*=\s*True/);
      expect(c.validationCode, `mod15/${c.id} validationCode`).not.toMatch(/subgraphs\s*=\s*True/);
    }
  });

  it("mod15 (ADR-11): subgraphs=True/ns SÍ puede aparecer en contenidoMd, ilustrando el streaming namespaced (grounding base §6)", () => {
    const mod = requireModule("mod15");
    const md = allMarkdownSources(mod).join("\n");
    expect(md, "mod15 debería ilustrar stream(subgraphs=True) en su contenido").toMatch(/subgraphs\s*=\s*True/);
  });

  it("mod16 (ADR-11 / NG-06): NINGÚN starterCode/solutionCode/validationCode ejecuta langgraph_sdk", () => {
    const mod = requireModule("mod16");
    for (const c of allChallenges(mod)) {
      expect(c.starterCode, `mod16/${c.id} starterCode`).not.toContain("langgraph_sdk");
      expect(c.solutionCode, `mod16/${c.id} solutionCode`).not.toContain("langgraph_sdk");
      expect(c.validationCode, `mod16/${c.id} validationCode`).not.toContain("langgraph_sdk");
    }
  });

  it.each(["mod12", "mod13", "mod14", "mod15"] as ModuleId[])(
    "%s: ningún bloque de código (markdown ni reto) usa langgraph_sdk (reservado a mod16, ilustrativo)",
    (id) => {
      const mod = requireModule(id);
      const sources = [
        ...allMarkdownSources(mod),
        ...allChallenges(mod).flatMap((c) => [c.starterCode, c.solutionCode, c.validationCode]),
      ];
      for (const src of sources) {
        expect(src, `${id}`).not.toContain("langgraph_sdk");
      }
    },
  );
});

describe("S15 — fidelidad temática por módulo (PRD §6, grounding avanzado §3–5, grounding base §6–7)", () => {
  it("mod12 (Tool calling): define @tool, bind_tools, cierra el ciclo modelo→tool→modelo (ToolNode o should_continue) y usa .tool_calls", () => {
    const mod = requireModule("mod12");
    const codigos = [mod.secciones.llenaGaps.contenidoMd, ...allChallenges(mod).map((c) => c.solutionCode)].join("\n");
    expect(codigos).toMatch(/@tool\b/);
    expect(codigos).toMatch(/bind_tools\s*\(/);
    expect(codigos).toMatch(/\.tool_calls\b/);
    expect(codigos).toMatch(/ToolNode\s*\(|should_continue/);
    const texto = mod.secciones.llenaGaps.contenidoMd.toLowerCase();
    expect(texto).toMatch(/tool|herramienta/);
  });

  it("mod13 (ReAct): usa create_react_agent y explica el loop de razonamiento/acción que ejecuta por dentro", () => {
    const mod = requireModule("mod13");
    const codigos = [mod.secciones.llenaGaps.contenidoMd, ...allChallenges(mod).map((c) => c.solutionCode)].join("\n");
    expect(codigos).toMatch(/create_react_agent\s*\(/);
    const texto = mod.secciones.llenaGaps.contenidoMd.toLowerCase();
    expect(texto).toMatch(/razonamiento|razona|acci[oó]n|reason/);
  });

  it("mod14 (Multi-agente): usa Command(goto=, update=) para handoffs y compara supervisor vs. swarm", () => {
    const mod = requireModule("mod14");
    const codigos = [mod.secciones.llenaGaps.contenidoMd, ...allChallenges(mod).map((c) => c.solutionCode)].join("\n");
    expect(codigos).toMatch(/Command\s*\(\s*goto\s*=/);
    const texto = mod.secciones.llenaGaps.contenidoMd.toLowerCase();
    expect(texto).toMatch(/supervisor/);
    expect(texto).toMatch(/swarm/);
  });

  it("mod15 (Subgraphs): compone un grafo compilado como nodo de otro (subgraph-como-nodo, grounding base §6)", () => {
    const mod = requireModule("mod15");
    const codigos = [mod.secciones.llenaGaps.contenidoMd, ...allChallenges(mod).map((c) => c.solutionCode)].join("\n");
    // ≥2 StateGraph (padre + hijo) y ≥2 .compile() (subgrafo compilado por separado, luego usado con add_node)
    const stateGraphCount = (codigos.match(/StateGraph\s*\(/g) ?? []).length;
    const compileCount = (codigos.match(/\.compile\s*\(/g) ?? []).length;
    expect(stateGraphCount, "mod15 debería mostrar padre + hijo (≥2 StateGraph)").toBeGreaterThanOrEqual(2);
    expect(compileCount, "mod15 debería compilar el subgrafo por separado (≥2 compile)").toBeGreaterThanOrEqual(2);
    expect(codigos).toMatch(/add_node\s*\(\s*["'][\w-]+["']\s*,\s*\w+\s*\)/);
    const texto = mod.secciones.llenaGaps.contenidoMd.toLowerCase();
    expect(texto).toMatch(/subgraph|subgrafo/);
  });

  it("mod15: el quiz (paso 2 o síntesis) puede evaluar ns/subgraphs=True conceptualmente sin exigir ejecutarlo", () => {
    const mod = requireModule("mod15");
    const preguntas = mod.secciones.detectaGaps.quiz.preguntas;
    for (const q of preguntas) {
      if (q.kind === "output") {
        // Un quiz "output" exige ejecutar el código mostrado para deducir la
        // salida; ADR-11 prohíbe que dependa de subgraphs=True/ns.
        expect(q.codigo, `mod15/${q.id}`).not.toMatch(/subgraphs\s*=\s*True/);
      }
    }
  });

  it("mod16 (Deployment): el contenido menciona langgraph.json, get_sync_client y runs.stream de forma ilustrativa", () => {
    const mod = requireModule("mod16");
    const texto = [mod.secciones.explicaSimple.contenidoMd, mod.secciones.llenaGaps.contenidoMd].join("\n");
    expect(texto).toMatch(/langgraph\.json/);
    expect(texto).toMatch(/get_sync_client/);
    expect(texto).toMatch(/runs\.stream/);
  });
});

describe("S15 — contenido en español (CA-05, muestreo sobre mod12–16)", () => {
  it.each(MOD12_16_IDS)("%s: título/objetivo no traen texto de UI en inglés obvio", (id) => {
    const mod = requireModule(id);
    const textoVisible = `${mod.titulo} ${mod.objetivo}`.toLowerCase();
    expect(textoVisible).not.toMatch(/\b(loading|error occurred|welcome|click here|submit|cancel)\b/);
  });

  it.each(MOD12_16_IDS)("%s: el resumen de síntesis (paso 4) está en español y no vacío", (id) => {
    const mod = requireModule(id);
    for (const bullet of mod.secciones.refinaSimplifica.resumenBullets) {
      expect(bullet.length, `${id} bullet vacío`).toBeGreaterThan(0);
    }
  });
});
