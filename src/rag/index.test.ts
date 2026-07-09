/**
 * Tests unitarios de `buildRagIndex`/`retrieve` (contrato C-RAG,
 * ARCHITECTURE.md §4, `src/rag/types.ts`). Slice S10 — SLICES.md §S10.
 *
 * Cubre:
 *  - retrieve determinista para una misma query + contenido.
 *  - una query con un término de API concreto devuelve chunks del módulo
 *    correcto (usando el contenido REAL de mod01/mod02, `COURSE_MODULES`).
 *  - boost del módulo actual (`boostModuleId`, A-06): sube el ranking de sus
 *    chunks aunque partan con menor score léxico.
 *  - `topK` por defecto (4) y explícito.
 *  - chunking por headings: una sección con 2 `##` produce 2 chunks
 *    distintos, cada uno con su propio `titulo`/`sectionKey`/`id`.
 *
 * Se opera SOLO contra la API pública de C-RAG: `buildRagIndex(modules)` y
 * `index.retrieve(query, opts)`. Nombres EXACTOS del contrato: `buildRagIndex`,
 * `retrieve`, tipo `RagHit`. Sin red: MiniSearch es 100% local/léxico.
 */
import { describe, expect, it } from "vitest";

import { COURSE_MODULES } from "@/content/registry";
import { buildRagIndex } from "@/rag/index";
import type { RagHit } from "@/rag/types";
import { FIXTURE_ALPHA, FIXTURE_BETA, FIXTURE_MODULES } from "@/rag/test-fixtures";

function assertValidHit(hit: RagHit): void {
  expect(typeof hit.id).toBe("string");
  expect(typeof hit.moduleId).toBe("string");
  expect(typeof hit.moduleTitulo).toBe("string");
  expect(["explicaSimple", "detectaGaps", "llenaGaps", "refinaSimplifica"]).toContain(
    hit.sectionKey,
  );
  expect(typeof hit.titulo).toBe("string");
  expect(typeof hit.texto).toBe("string");
  expect(typeof hit.score).toBe("number");
}

describe("buildRagIndex/retrieve — determinismo", () => {
  it("la misma query sobre el mismo contenido devuelve siempre el mismo resultado", () => {
    const index = buildRagIndex(COURSE_MODULES);

    const first = index.retrieve("add_conditional_edges");
    const second = index.retrieve("add_conditional_edges");

    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
  });

  it("es determinista también con opciones (topK y boostModuleId)", () => {
    const index = buildRagIndex(COURSE_MODULES);
    const opts = { topK: 3, boostModuleId: "mod01" as const };

    const first = index.retrieve("grafo", opts);
    const second = index.retrieve("grafo", opts);

    expect(first).toEqual(second);
  });
});

describe("buildRagIndex/retrieve — término de API ⇒ módulo correcto", () => {
  it('query "add_conditional_edges" devuelve entre sus resultados chunks de mod05 (fuente canónica real de conditional edges/ciclos, S13)', () => {
    // Nota de cierre M3 (integrator): con el contenido completo de S13, mod05
    // ("Conditional edges y ciclos") es la fuente canónica de este término y
    // BM25/MiniSearch lo prioriza por densidad léxica sobre la mención breve
    // de mod01 (introducción). El ranking es correcto: se corrige la
    // aserción para reflejar el contenido real del curso, no el fixture
    // parcial de M1 (solo mod01/mod02).
    const index = buildRagIndex(COURSE_MODULES);

    const hits = index.retrieve("add_conditional_edges");

    expect(hits.length).toBeGreaterThan(0);
    hits.forEach(assertValidHit);
    expect(hits.some((h) => h.moduleId === "mod05")).toBe(true);
  });

  it('query con un fragmento exclusivo de la analogía de mod01 ("tablero") devuelve ese módulo como mejor resultado', () => {
    const index = buildRagIndex(COURSE_MODULES);

    const hits = index.retrieve("tablero");

    expect(hits.length).toBeGreaterThan(0);
    hits.forEach(assertValidHit);
    expect(hits[0].moduleId).toBe("mod01");
  });

  it('query "TypedDict" devuelve como mejor resultado un chunk de mod02', () => {
    const index = buildRagIndex(COURSE_MODULES);

    const hits = index.retrieve("TypedDict");

    expect(hits.length).toBeGreaterThan(0);
    hits.forEach(assertValidHit);
    expect(hits[0].moduleId).toBe("mod02");
  });
});

describe("buildRagIndex/retrieve — boost del módulo actual (A-06)", () => {
  it("sin boost, el módulo con mayor densidad léxica del término gana (ALPHA)", () => {
    const index = buildRagIndex(FIXTURE_MODULES);

    const hits = index.retrieve("widget");

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].moduleId).toBe(FIXTURE_ALPHA.id);
  });

  it("con boostModuleId apuntando al módulo actual, ese módulo adelanta al ranking natural", () => {
    const index = buildRagIndex(FIXTURE_MODULES);

    const boosted = index.retrieve("widget", { boostModuleId: FIXTURE_BETA.id });

    expect(boosted.length).toBeGreaterThan(0);
    expect(boosted[0].moduleId).toBe(FIXTURE_BETA.id);
  });

  it("el boost no inventa chunks: solo reordena/reescala los que ya matchean la query", () => {
    const index = buildRagIndex(FIXTURE_MODULES);

    const withoutBoost = index.retrieve("widget");
    const withBoost = index.retrieve("widget", { boostModuleId: FIXTURE_BETA.id });

    const idsWithout = new Set(withoutBoost.map((h) => h.id));
    const idsWith = new Set(withBoost.map((h) => h.id));
    expect(idsWith).toEqual(idsWithout);
  });
});

describe("buildRagIndex/retrieve — topK", () => {
  it("por defecto (sin opts) no devuelve más de 4 resultados (default del contrato)", () => {
    const index = buildRagIndex(COURSE_MODULES);

    const hits = index.retrieve("grafo estado nodo");

    expect(hits.length).toBeLessThanOrEqual(4);
  });

  it("respeta un topK explícito menor que el default", () => {
    const index = buildRagIndex(COURSE_MODULES);

    const hits = index.retrieve("grafo estado nodo", { topK: 1 });

    expect(hits.length).toBeLessThanOrEqual(1);
  });
});

describe("buildRagIndex — chunking por headings", () => {
  it("una sección con 2 headings `##` produce 2 chunks distintos y localizables", () => {
    const index = buildRagIndex(FIXTURE_MODULES);

    const hitsAlfa = index.retrieve("zetatermino");
    const hitsBeta = index.retrieve("yotatermino");

    expect(hitsAlfa.length).toBeGreaterThan(0);
    expect(hitsBeta.length).toBeGreaterThan(0);
    expect(hitsAlfa[0].id).not.toBe(hitsBeta[0].id);
    expect(hitsAlfa[0].titulo.toLowerCase()).toContain("primer encabezado alfa");
    expect(hitsBeta[0].titulo.toLowerCase()).toContain("segundo encabezado beta");
    expect(hitsAlfa[0].sectionKey).toBe("explicaSimple");
    expect(hitsBeta[0].sectionKey).toBe("explicaSimple");
  });
});
