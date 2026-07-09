import { describe, expect, it } from "vitest";

import { COURSE_MODULES, getModule } from "@/content/registry";
import type { CodeChallenge, CourseModule, ModuleId } from "@/content/types";

/**
 * Tests de contrato de `src/content/registry.ts` (C-CONTENT, ARCHITECTURE.md §4).
 * Slice S1 — SLICES.md §S1. Cubre: CA-01, CA-02, CA-03, CA-05 (contenido).
 *
 * Independiente de la implementación: solo se apoya en los tipos/nombres
 * exportados por el contrato (`COURSE_MODULES`, `getModule`) y en el temario
 * fijado en PRD.md §6. No asume detalles de UI ni de cómo se construyen los
 * módulos internamente.
 */

// PRD.md §6 — temario de 16 módulos. Se usan palabras clave distintivas (no
// igualdad literal) para no acoplarse a decisiones de formato (puntuación,
// backticks) que no forman parte del contrato C-CONTENT.
const PRD_MODULES: {
  numero: number;
  id: ModuleId;
  tituloKeywords: string[];
  objetivoKeywords: string[];
}[] = [
  { numero: 1, id: "mod01", tituloKeywords: ["LangGraph"], objetivoKeywords: ["grafo"] },
  { numero: 2, id: "mod02", tituloKeywords: ["TypedDict"], objetivoKeywords: ["estado"] },
  { numero: 3, id: "mod03", tituloKeywords: ["Reducers"], objetivoKeywords: ["reducer"] },
  { numero: 4, id: "mod04", tituloKeywords: ["Nodes", "edges"], objetivoKeywords: ["StateGraph"] },
  { numero: 5, id: "mod05", tituloKeywords: ["Conditional edges"], objetivoKeywords: ["add_conditional_edges"] },
  { numero: 6, id: "mod06", tituloKeywords: ["conversacional"], objetivoKeywords: ["add_messages"] },
  { numero: 7, id: "mod07", tituloKeywords: ["Checkpointing"], objetivoKeywords: ["InMemorySaver"] },
  { numero: 8, id: "mod08", tituloKeywords: ["Memoria"], objetivoKeywords: ["Store"] },
  { numero: 9, id: "mod09", tituloKeywords: ["Human-in-the-loop"], objetivoKeywords: ["interrupt"] },
  { numero: 10, id: "mod10", tituloKeywords: ["Streaming I"], objetivoKeywords: ["stream"] },
  { numero: 11, id: "mod11", tituloKeywords: ["Streaming II"], objetivoKeywords: ["stream"] },
  { numero: 12, id: "mod12", tituloKeywords: ["Tool calling"], objetivoKeywords: ["ToolNode"] },
  { numero: 13, id: "mod13", tituloKeywords: ["ReAct"], objetivoKeywords: ["create_react_agent"] },
  { numero: 14, id: "mod14", tituloKeywords: ["Multi-agente"], objetivoKeywords: ["supervisor"] },
  { numero: 15, id: "mod15", tituloKeywords: ["Subgraphs"], objetivoKeywords: ["subgraph"] },
  { numero: 16, id: "mod16", tituloKeywords: ["Deployment"], objetivoKeywords: ["langgraph.json"] },
];

describe("C-CONTENT registry — invariantes globales (CA-01)", () => {
  it("expone exactamente 16 módulos", () => {
    expect(COURSE_MODULES).toHaveLength(16);
  });

  it("ids únicos 'mod01'..'mod16' en orden 1..16", () => {
    COURSE_MODULES.forEach((m: CourseModule, idx: number) => {
      expect(m.numero, `posición ${idx}`).toBe(idx + 1);
      expect(m.id).toBe(`mod${String(idx + 1).padStart(2, "0")}`);
    });
    const ids = COURSE_MODULES.map((m: CourseModule) => m.id);
    expect(new Set(ids).size).toBe(16);
  });

  it("getModule(id) devuelve el módulo correcto", () => {
    for (const { id, numero } of PRD_MODULES) {
      const mod = getModule(id);
      expect(mod, `getModule(${id})`).toBeDefined();
      expect(mod?.numero).toBe(numero);
      expect(mod?.id).toBe(id);
    }
  });

  it("getModule devuelve undefined para un id inexistente", () => {
    expect(getModule("mod99" as ModuleId)).toBeUndefined();
  });

  it.each(PRD_MODULES)(
    "$id: título y objetivo fieles a PRD §6",
    ({ id, tituloKeywords, objetivoKeywords }) => {
      const mod = getModule(id)!;
      for (const kw of tituloKeywords) {
        expect(
          mod.titulo.toLowerCase(),
          `${id}.titulo="${mod.titulo}" debería mencionar "${kw}"`,
        ).toContain(kw.toLowerCase());
      }
      for (const kw of objetivoKeywords) {
        expect(
          mod.objetivo.toLowerCase(),
          `${id}.objetivo="${mod.objetivo}" debería mencionar "${kw}"`,
        ).toContain(kw.toLowerCase());
      }
    },
  );
});

describe("C-CONTENT registry — estructura Feynman (CA-02)", () => {
  it("las 4 secciones están presentes y en el orden fijo en todos los módulos", () => {
    for (const m of COURSE_MODULES) {
      expect(Object.keys(m.secciones), m.id).toEqual([
        "explicaSimple",
        "detectaGaps",
        "llenaGaps",
        "refinaSimplifica",
      ]);
    }
  });

  it("cada sección tiene contenido no vacío (contenidoMd / consignaExplicacion)", () => {
    for (const m of COURSE_MODULES) {
      expect(m.secciones.explicaSimple.contenidoMd.length, `${m.id} explicaSimple`).toBeGreaterThan(0);
      expect(
        m.secciones.explicaSimple.consignaExplicacion.length,
        `${m.id} consignaExplicacion`,
      ).toBeGreaterThan(0);
      expect(m.secciones.llenaGaps.contenidoMd.length, `${m.id} llenaGaps`).toBeGreaterThan(0);
    }
  });
});

describe("C-CONTENT registry — quiz y retos (CA-03)", () => {
  it("el quiz de 'detecta tus gaps' tiene entre 4 y 6 preguntas en todos los módulos", () => {
    for (const m of COURSE_MODULES) {
      const n = m.secciones.detectaGaps.quiz.preguntas.length;
      expect(n, `${m.id} tiene ${n} preguntas`).toBeGreaterThanOrEqual(4);
      expect(n, `${m.id} tiene ${n} preguntas`).toBeLessThanOrEqual(6);
    }
  });

  it("mod01–mod15 tienen ≥1 reto de código en 'llena los gaps'", () => {
    for (const m of COURSE_MODULES.filter((mod: CourseModule) => mod.numero <= 15)) {
      expect(m.secciones.llenaGaps.retos.length, m.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("mod16 tiene ≥1 reto de código o compensa con síntesis de quiz de integración", () => {
    const mod16 = getModule("mod16")!;
    const tieneReto = mod16.secciones.llenaGaps.retos.length >= 1;
    const compensaConQuiz = mod16.secciones.refinaSimplifica.sintesis.kind === "quiz";
    expect(tieneReto || compensaConQuiz).toBe(true);
  });

  it("resumenBullets tiene como máximo 10 elementos en todos los módulos", () => {
    for (const m of COURSE_MODULES) {
      expect(m.secciones.refinaSimplifica.resumenBullets.length, m.id).toBeLessThanOrEqual(10);
    }
  });

  it("ids de quiz y de retos son no vacíos y únicos dentro de cada módulo", () => {
    for (const m of COURSE_MODULES) {
      const quizIds = [m.secciones.detectaGaps.quiz.id];
      const sintesis = m.secciones.refinaSimplifica.sintesis;
      if (sintesis.kind === "quiz") quizIds.push(sintesis.quiz.id);
      quizIds.forEach((id: string) => expect(id.length, m.id).toBeGreaterThan(0));
      expect(new Set(quizIds).size, `${m.id} quiz ids duplicados`).toBe(quizIds.length);

      const retoIds = m.secciones.llenaGaps.retos.map((r: CodeChallenge) => r.id);
      if (sintesis.kind === "code") retoIds.push(sintesis.reto.id);
      retoIds.forEach((id: string) => expect(id.length, m.id).toBeGreaterThan(0));
      expect(new Set(retoIds).size, `${m.id} reto ids duplicados`).toBe(retoIds.length);
    }
  });

  it("cada pregunta referencia índices de respuesta correcta dentro de rango y trae explicación", () => {
    for (const m of COURSE_MODULES) {
      for (const q of m.secciones.detectaGaps.quiz.preguntas) {
        if (q.kind === "single" || q.kind === "output") {
          expect(q.correcta, `${m.id}/${q.id}`).toBeGreaterThanOrEqual(0);
          expect(q.correcta, `${m.id}/${q.id}`).toBeLessThan(q.opciones.length);
        }
        if (q.kind === "multi") {
          expect(q.correctas.length, `${m.id}/${q.id}`).toBeGreaterThan(0);
          for (const c of q.correctas) {
            expect(c, `${m.id}/${q.id}`).toBeGreaterThanOrEqual(0);
            expect(c, `${m.id}/${q.id}`).toBeLessThan(q.opciones.length);
          }
        }
        expect(q.explicacionMd.length, `${m.id}/${q.id} sin explicación`).toBeGreaterThan(0);
      }
    }
  });
});

describe("mod01 y mod02 — contenido COMPLETO, no stub (SLICES.md §S1)", () => {
  it.each(["mod01", "mod02"] as ModuleId[])(
    "%s: las secciones tienen contenido sustancial (no placeholder)",
    (id) => {
      const m = getModule(id)!;
      expect(m).toBeDefined();

      const bloquesObligatorios = [
        m.secciones.explicaSimple.contenidoMd,
        m.secciones.llenaGaps.contenidoMd,
      ];
      for (const contenido of bloquesObligatorios) {
        expect(contenido.length).toBeGreaterThanOrEqual(200);
        expect(contenido.toLowerCase()).not.toMatch(
          /en\s+construcci[oó]n|\btodo:|lorem ipsum|\bstub\b|\bplaceholder\b/,
        );
      }
      expect(m.secciones.llenaGaps.retos.length).toBeGreaterThanOrEqual(1);
    },
  );

  it("mod01: explica cuándo se necesita un grafo (PRD §5.1 paso 1 / §6)", () => {
    const m = getModule("mod01")!;
    expect(m.secciones.explicaSimple.contenidoMd.toLowerCase()).toMatch(/grafo|ciclo|estado/);
  });

  it("mod02: cubre TypedDict y esquemas input/output/private (PRD §6)", () => {
    const m = getModule("mod02")!;
    const texto = m.secciones.llenaGaps.contenidoMd;
    expect(texto).toMatch(/TypedDict/);
    expect(texto.toLowerCase()).toMatch(/input|output/);
  });
});

describe("Contenido en español (CA-05, muestreo sobre mod01–02)", () => {
  it.each(["mod01", "mod02"] as ModuleId[])(
    "%s: título y objetivo no contienen texto de UI en inglés obvio",
    (id) => {
      const m = getModule(id)!;
      const textoVisible = `${m.titulo} ${m.objetivo}`.toLowerCase();
      // Heurística ligera: palabras de UI en inglés que no deberían colarse en
      // texto de producto en español (nombres de API en inglés sí son válidos).
      expect(textoVisible).not.toMatch(
        /\b(loading|error occurred|welcome|click here|submit|cancel)\b/,
      );
    },
  );
});
