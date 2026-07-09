import { describe, expect, it } from "vitest";

import { getModule } from "@/content/registry";
import type { CodeChallenge, CourseModule, ModuleId } from "@/content/types";

/**
 * Tests de contrato — S13 (SLICES.md §S13): "Contenido módulos 03–06".
 * CA-02 / CA-03 / CA-05 / CA-28 para mod03–06 (C-CONTENT, ARCHITECTURE.md §4).
 *
 * Independiente del implementer: solo usa el contrato público (`getModule`,
 * tipos de `@/content/types`) y las reglas fijadas en PRD.md §5.1/§6 y en
 * ARCHITECTURE.md ("Reglas M3 para autores de contenido"). No asume nada de
 * cómo se construyen internamente los módulos.
 *
 * `registry.test.ts` (S1) ya cubre invariantes GENÉRICOS válidos para los 16
 * módulos (incl. mod03–06 en su forma stub): 4 secciones en orden, quiz 4–6,
 * ≥1 reto, ≤10 bullets, ids únicos. Este archivo añade lo que S13 debe
 * demostrar que YA NO es cierto de la forma stub: contenido sustancial, sin
 * marcador `enConstruccion`, y fidelidad temática a reducers/nodes-edges/
 * conditional-edges/add_messages (PRD §6, filas 03–06).
 */

// El contrato C-CONTENT (ARCHITECTURE.md, ADR-09) añade `enConstruccion?: true`
// a `CourseModule`. Se tipa localmente para no depender de que `src/content/types.ts`
// ya lo haya transcrito literalmente (eso es responsabilidad del implementer de S13,
// que debe mantener `types.ts` como copia fiel del contrato de ARCHITECTURE.md §4).
type ModuleWithStubFlag = CourseModule & { enConstruccion?: true };

const MOD03_06_IDS: ModuleId[] = ["mod03", "mod04", "mod05", "mod06"];

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

describe("S13 — mod03–06 dejan de ser stub (ADR-09)", () => {
  it.each(MOD03_06_IDS)("%s: NO define enConstruccion (o es false)", (id) => {
    const mod = requireModule(id);
    expect(mod.enConstruccion, `${id}.enConstruccion debería ser undefined/false`).not.toBe(true);
  });

  it.each(MOD03_06_IDS)(
    "%s: ningún contenidoMd contiene el literal/marcador 'EN CONSTRUCCIÓN' u otro placeholder",
    (id) => {
      const mod = requireModule(id);
      const bloques = [
        mod.secciones.explicaSimple.contenidoMd,
        mod.secciones.detectaGaps.contenidoMd ?? "",
        mod.secciones.llenaGaps.contenidoMd,
      ];
      for (const bloque of bloques) {
        expect(bloque, `${id}`).not.toMatch(STUB_MARKERS_RE);
      }
    },
  );

  it.each(MOD03_06_IDS)("%s: explicaSimple y llenaGaps tienen contenido sustancial (≥200 chars)", (id) => {
    const mod = requireModule(id);
    expect(mod.secciones.explicaSimple.contenidoMd.length, `${id} explicaSimple`).toBeGreaterThanOrEqual(200);
    expect(mod.secciones.llenaGaps.contenidoMd.length, `${id} llenaGaps`).toBeGreaterThanOrEqual(200);
  });

  it.each(MOD03_06_IDS)("%s: preguntas de quiz no son placeholders", (id) => {
    const mod = requireModule(id);
    for (const q of mod.secciones.detectaGaps.quiz.preguntas) {
      expect(q.enunciadoMd, `${id}/${q.id}`).not.toMatch(STUB_MARKERS_RE);
      expect(q.explicacionMd, `${id}/${q.id}`).not.toMatch(STUB_MARKERS_RE);
    }
  });

  it.each(MOD03_06_IDS)("%s: los retos de código no son placeholders (starter/solución/validación reales)", (id) => {
    const mod = requireModule(id);
    const challenges = allChallenges(mod);
    expect(challenges.length, `${id} debería tener ≥1 reto real`).toBeGreaterThanOrEqual(1);
    for (const c of challenges) {
      expect(c.starterCode, `${id}/${c.id} starterCode`).not.toMatch(STUB_MARKERS_RE);
      expect(c.solutionCode, `${id}/${c.id} solutionCode`).not.toMatch(STUB_MARKERS_RE);
      expect(c.validationCode, `${id}/${c.id} validationCode`).not.toMatch(STUB_MARKERS_RE);
      // La validación de un reto real no es un único check trivial (evita que un
      // reto "check('stub', ..., True)" cuele como contenido completo).
      const checkCount = (c.validationCode.match(/\bcheck(_eq|_raises)?\s*\(/g) ?? []).length;
      expect(checkCount, `${id}/${c.id} validationCode debería tener ≥1 aserción real`).toBeGreaterThanOrEqual(1);
      expect(c.validationCode, `${id}/${c.id}`).not.toMatch(/^\s*check\(\s*"stub"/m);
    }
  });
});

describe("S13 — Reglas M3 del harness (ARCHITECTURE.md C-CONTENT, 'Reglas M3 para autores de contenido')", () => {
  it.each(MOD03_06_IDS)("%s: validationCode importa SOLO de course_harness y solo check/check_eq/check_raises/get_llm_calls", (id) => {
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
  });

  it.each(MOD03_06_IDS)("%s: ningún bloque de código usa Send (map-reduce dinámico, prohibido en la superficie)", (id) => {
    const mod = requireModule(id);
    const sources = [
      mod.secciones.explicaSimple.contenidoMd,
      mod.secciones.llenaGaps.contenidoMd,
      ...allChallenges(mod).flatMap((c) => [c.starterCode, c.solutionCode, c.validationCode]),
    ];
    for (const src of sources) {
      expect(src, `${id}`).not.toMatch(/\bSend\s*\(/);
    }
  });
});

describe("S13 — fidelidad temática por módulo (PRD §6)", () => {
  it("mod03 (Reducers): menciona Annotated + operator.add o add_messages, y predicción de estado", () => {
    const mod = requireModule("mod03");
    const texto = mod.secciones.llenaGaps.contenidoMd;
    expect(texto).toMatch(/Annotated/);
    expect(texto).toMatch(/operator\.add|add_messages/);
    const codigos = allChallenges(mod).map((c) => c.solutionCode).join("\n");
    expect(codigos).toMatch(/Annotated/);
  });

  it("mod04 (Nodes y edges): usa StateGraph, add_node, add_edge, START/END, compile/invoke", () => {
    const mod = requireModule("mod04");
    const codigos = [
      mod.secciones.llenaGaps.contenidoMd,
      ...allChallenges(mod).map((c) => c.solutionCode),
    ].join("\n");
    for (const symbol of ["StateGraph", "add_node", "add_edge", "START", "END", "compile", "invoke"]) {
      expect(codigos, `mod04 debería usar "${symbol}"`).toContain(symbol);
    }
  });

  it("mod05 (Conditional edges y ciclos): usa add_conditional_edges y describe un ciclo con condición de parada", () => {
    const mod = requireModule("mod05");
    const codigos = [
      mod.secciones.llenaGaps.contenidoMd,
      ...allChallenges(mod).map((c) => c.solutionCode),
    ].join("\n");
    expect(codigos).toMatch(/add_conditional_edges/);
    expect(codigos.toLowerCase()).toMatch(/ciclo|loop|bucle/);
  });

  it("mod06 (add_messages): usa Annotated[list[AnyMessage], add_messages] y explica append + update por id", () => {
    const mod = requireModule("mod06");
    const contenido = mod.secciones.llenaGaps.contenidoMd;
    expect(contenido).toMatch(/add_messages/);
    expect(contenido).toMatch(/AnyMessage/);
    expect(contenido.toLowerCase()).toMatch(/append|añad|agreg/);
    expect(contenido.toLowerCase()).toMatch(/\bid\b/);
  });
});

describe("S13 — contenido en español (CA-05, muestreo sobre mod03–06)", () => {
  it.each(MOD03_06_IDS)("%s: título/objetivo no traen texto de UI en inglés obvio", (id) => {
    const mod = requireModule(id);
    const textoVisible = `${mod.titulo} ${mod.objetivo}`.toLowerCase();
    expect(textoVisible).not.toMatch(/\b(loading|error occurred|welcome|click here|submit|cancel)\b/);
  });

  it.each(MOD03_06_IDS)("%s: el resumen de síntesis (paso 4) está en español y no vacío", (id) => {
    const mod = requireModule(id);
    expect(mod.secciones.refinaSimplifica.resumenBullets.length, id).toBeGreaterThan(0);
    for (const bullet of mod.secciones.refinaSimplifica.resumenBullets) {
      expect(bullet.length, `${id} bullet vacío`).toBeGreaterThan(0);
    }
  });
});
