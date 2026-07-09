/**
 * Fixtures compartidas para los tests de `src/progress/*` (slice S3).
 *
 * Construye un `CourseModule` mínimo pero completo (satisface C-CONTENT en
 * TS strict) con una forma de contenido conocida y estable para las tablas
 * de verdad de CA-15:
 *   - 1 quiz en el paso 2 (`detectaGaps`), id `${id}-quiz1`.
 *   - 2 retos en el paso 3 (`llenaGaps`), ids `${id}-reto1` y `${id}-reto2`.
 *   - 1 reto de síntesis en el paso 4 (`refinaSimplifica`), id `${id}-reto-sintesis`.
 * Total exigido para "completado": explicación + 1 quiz + 3 retos.
 *
 * No depende de `src/content/registry.ts` (datos reales) a propósito: el
 * store/selectores de progreso solo consumen TIPOS de C-CONTENT (ver
 * ARCHITECTURE.md §4, C-PROGRESS), nunca el registry real.
 */
import type { CodeChallenge, CourseModule, ModuleId, Quiz } from "@/content/types";

function buildQuiz(id: string): Quiz {
  return {
    id,
    titulo: `Quiz ${id}`,
    preguntas: [
      {
        id: `${id}-p1`,
        kind: "boolean",
        enunciadoMd: "¿Verdadero?",
        correcta: true,
        explicacionMd: "Explicación.",
      },
    ],
  };
}

function buildReto(id: string): CodeChallenge {
  return {
    id,
    titulo: `Reto ${id}`,
    enunciadoMd: "Enunciado.",
    starterCode: "# TODO",
    solutionCode: "pass",
    validationCode: "check('c1', 'ok', True)",
  };
}

export function buildFixtureModule(id: ModuleId): CourseModule {
  return {
    id,
    numero: 1,
    titulo: `Módulo ${id}`,
    objetivo: "Objetivo de prueba.",
    secciones: {
      explicaSimple: {
        contenidoMd: "Contenido.",
        consignaExplicacion: "Explícaselo a alguien que no programa.",
      },
      detectaGaps: {
        quiz: buildQuiz(`${id}-quiz1`),
      },
      llenaGaps: {
        contenidoMd: "Contenido.",
        retos: [buildReto(`${id}-reto1`), buildReto(`${id}-reto2`)],
      },
      refinaSimplifica: {
        resumenBullets: ["Bullet 1"],
        sintesis: { kind: "code", reto: buildReto(`${id}-reto-sintesis`) },
      },
    },
  };
}

/** Variante de síntesis en quiz (mod16-like): sin reto de síntesis, con un 2º quiz. */
export function buildFixtureModuleWithQuizSynthesis(id: ModuleId): CourseModule {
  const base = buildFixtureModule(id);
  return {
    ...base,
    secciones: {
      ...base.secciones,
      refinaSimplifica: {
        resumenBullets: ["Bullet 1"],
        sintesis: { kind: "quiz", quiz: buildQuiz(`${id}-quiz-sintesis`) },
      },
    },
  };
}

export const EXPLICACION_VALIDA = "x".repeat(200);
export const EXPLICACION_CORTA = "x".repeat(199);
