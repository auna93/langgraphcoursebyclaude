/**
 * Tests de `src/progress/selectors.ts` (contrato C-PROGRESS, ARCHITECTURE.md §4).
 * Slice S3 — SLICES.md §S3. Cubre CA-15 (tabla de verdad de `moduleStatus`).
 *
 * Firmas usadas (ya resueltas en `src/progress/selectors.ts`, no inventadas
 * aquí): `moduleStatus(courseModule, progress)`, `isExplanationDone(progress)`
 * — ambas leen los umbrales desde `CONFIG` (200 chars / 80%, ver
 * `src/config.ts`), por eso los fixtures usan esos valores literales en vez
 * de recibir el umbral como parámetro.
 */
import { describe, expect, it } from "vitest";

import type { ModuleProgress } from "@/progress/types";
import { isExplanationDone, moduleStatus } from "@/progress/selectors";

import {
  EXPLICACION_CORTA,
  EXPLICACION_VALIDA,
  buildFixtureModule,
  buildFixtureModuleWithQuizSynthesis,
} from "@/progress/test-fixtures";

const MOD_ID = "mod01";
const modulo = buildFixtureModule(MOD_ID);

// El fixture exige: explicación + 1 quiz (`mod01-quiz1`) + 3 retos
// (`mod01-reto1`, `mod01-reto2`, `mod01-reto-sintesis`).
const QUIZ_ID = "mod01-quiz1";
const RETO_1 = "mod01-reto1";
const RETO_2 = "mod01-reto2";
const RETO_SINTESIS = "mod01-reto-sintesis";

function empty(): ModuleProgress {
  return { explicacion: null, quizzes: {}, retos: {} };
}

function fullProgress(): ModuleProgress {
  return {
    explicacion: { texto: EXPLICACION_VALIDA, actualizadoEn: 1 },
    quizzes: { [QUIZ_ID]: { mejorPct: 100, intentos: 1 } },
    retos: {
      [RETO_1]: { ultimoPass: true, intentos: 1, solucionVista: false },
      [RETO_2]: { ultimoPass: true, intentos: 1, solucionVista: false },
      [RETO_SINTESIS]: { ultimoPass: true, intentos: 1, solucionVista: false },
    },
  };
}

describe("isExplanationDone — CA-13/CA-15 (umbral de caracteres, CONFIG.curso.umbralExplicacionChars=200)", () => {
  it("false con < 200 caracteres", () => {
    expect(isExplanationDone({ explicacion: { texto: EXPLICACION_CORTA, actualizadoEn: 1 }, quizzes: {}, retos: {} })).toBe(false);
  });

  it("true con exactamente 200 caracteres", () => {
    expect(isExplanationDone({ explicacion: { texto: EXPLICACION_VALIDA, actualizadoEn: 1 }, quizzes: {}, retos: {} })).toBe(true);
  });

  it("false si no hay explicación guardada (progress undefined o explicacion null)", () => {
    expect(isExplanationDone(undefined)).toBe(false);
    expect(isExplanationDone(empty())).toBe(false);
  });
});

describe("moduleStatus — CA-15 (tabla de verdad: completado sii los 3 requisitos)", () => {
  it("no_iniciado: sin ningún progreso", () => {
    expect(moduleStatus(modulo, undefined)).toBe("no_iniciado");
    expect(moduleStatus(modulo, empty())).toBe("no_iniciado");
  });

  it("completado: explicación + todos los quizzes hechos + todos los retos en pass", () => {
    expect(moduleStatus(modulo, fullProgress())).toBe("completado");
  });

  it("NO completado si falta solo la explicación (quizzes y retos completos)", () => {
    const progress = { ...fullProgress(), explicacion: null };
    const status = moduleStatus(modulo, progress);
    expect(status).not.toBe("completado");
    expect(status).toBe("en_curso");
  });

  it("NO completado si la explicación no alcanza el umbral (199 chars)", () => {
    const progress = {
      ...fullProgress(),
      explicacion: { texto: EXPLICACION_CORTA, actualizadoEn: 1 },
    };
    expect(moduleStatus(modulo, progress)).not.toBe("completado");
  });

  it("NO completado si falta solo un quiz (explicación y retos completos)", () => {
    const progress = { ...fullProgress(), quizzes: {} };
    const status = moduleStatus(modulo, progress);
    expect(status).not.toBe("completado");
    expect(status).toBe("en_curso");
  });

  it("NO completado si un quiz está por debajo del umbral (79%)", () => {
    const progress = {
      ...fullProgress(),
      quizzes: { [QUIZ_ID]: { mejorPct: 79, intentos: 1 } },
    };
    expect(moduleStatus(modulo, progress)).not.toBe("completado");
  });

  it("completado con un quiz justo en el umbral (80%)", () => {
    const progress = {
      ...fullProgress(),
      quizzes: { [QUIZ_ID]: { mejorPct: 80, intentos: 1 } },
    };
    expect(moduleStatus(modulo, progress)).toBe("completado");
  });

  it("NO completado si falta solo un reto (explicación y quizzes completos)", () => {
    const progress = { ...fullProgress(), retos: { [RETO_1]: fullProgress().retos[RETO_1] } };
    const status = moduleStatus(modulo, progress);
    expect(status).not.toBe("completado");
    expect(status).toBe("en_curso");
  });

  it("NO completado si algún reto tiene ultimoPass=false, aunque los demás pasen", () => {
    const progress = {
      ...fullProgress(),
      retos: {
        ...fullProgress().retos,
        [RETO_2]: { ultimoPass: false, intentos: 2, solucionVista: false },
      },
    };
    expect(moduleStatus(modulo, progress)).not.toBe("completado");
  });

  it("NO hecho (no completado) si el contenido define un quiz/reto sin entrada en progreso", () => {
    // El módulo define 1 quiz y 3 retos; aquí falta la entrada del reto de síntesis.
    const { [RETO_SINTESIS]: _omitido, ...retosSinSintesis } = fullProgress().retos;
    const progress = { ...fullProgress(), retos: retosSinSintesis };
    expect(moduleStatus(modulo, progress)).not.toBe("completado");
  });

  it("en_curso: progreso parcial (solo explicación, nada más)", () => {
    const progress = { ...empty(), explicacion: { texto: EXPLICACION_VALIDA, actualizadoEn: 1 } };
    expect(moduleStatus(modulo, progress)).toBe("en_curso");
  });

  it("en_curso: progreso parcial (solo un intento de reto fallido)", () => {
    const progress = {
      ...empty(),
      retos: { [RETO_1]: { ultimoPass: false, intentos: 1, solucionVista: false } },
    };
    expect(moduleStatus(modulo, progress)).toBe("en_curso");
  });

  it("respeta el quiz de síntesis (paso 4 kind=quiz) como quiz adicional exigido", () => {
    const modConQuizSintesis = buildFixtureModuleWithQuizSynthesis(MOD_ID);
    const progressSinQuizSintesis: ModuleProgress = {
      explicacion: { texto: EXPLICACION_VALIDA, actualizadoEn: 1 },
      quizzes: { [QUIZ_ID]: { mejorPct: 100, intentos: 1 } }, // falta mod01-quiz-sintesis
      retos: {
        [RETO_1]: { ultimoPass: true, intentos: 1, solucionVista: false },
        [RETO_2]: { ultimoPass: true, intentos: 1, solucionVista: false },
      },
    };
    expect(moduleStatus(modConQuizSintesis, progressSinQuizSintesis)).not.toBe("completado");

    const progressCompleto: ModuleProgress = {
      ...progressSinQuizSintesis,
      quizzes: {
        [QUIZ_ID]: { mejorPct: 100, intentos: 1 },
        "mod01-quiz-sintesis": { mejorPct: 90, intentos: 1 },
      },
    };
    expect(moduleStatus(modConQuizSintesis, progressCompleto)).toBe("completado");
  });
});
