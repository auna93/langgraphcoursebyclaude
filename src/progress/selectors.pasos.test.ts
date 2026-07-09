/**
 * Extiende `src/progress/selectors.test.ts` (S3, CA-15) con el caso de un
 * módulo enriquecido (`pasos`, ARCHITECTURE.md §8). Slice SE0 (SLICES.md §SE0):
 * protege el refactor de `selectors.ts` para delegar en `content/traversal.ts`
 * (ADR-13) — los mini-ejercicios/micro-quizzes de `pasos` deben contar para
 * "completado" exactamente igual que cualquier reto/quiz de sección (§8.3).
 * CA-15 NO cambia su FÓRMULA (CA-39): solo se amplía el CONJUNTO que enumera.
 *
 * Este archivo NO modifica ni relaja `src/progress/selectors.test.ts` (S3):
 * ese archivo queda INTACTO y en verde por sí solo, protegiendo la regresión
 * de CA-39 para módulos sin `pasos`.
 *
 * Antes de que `selectors.ts` delegue en `traversal.ts` (y antes de que
 * `traversal.ts` exista), este archivo es ROJO: el módulo con `pasos` no
 * cuenta sus mini-ejercicios/micro-quizzes para "completado" (o el import de
 * `@/content/test-fixtures` falla si `PasoGuiado` aún no existe en
 * `content/types.ts`) — razón correcta, no error de setup.
 */
import { describe, expect, it } from "vitest";

import type { ModuleProgress } from "@/progress/types";
import { moduleStatus } from "@/progress/selectors";
import { EXPLICACION_VALIDA } from "@/progress/test-fixtures";
import {
  PASO_QUIZ_ID,
  PASO_RETO_ID,
  buildFixtureModuleConPasos,
} from "@/content/test-fixtures";

const MOD_ID = "mod01";
const modulo = buildFixtureModuleConPasos(MOD_ID);

const QUIZ_SECCION = `${MOD_ID}-quiz1`;
const RETO_1 = `${MOD_ID}-reto1`;
const RETO_2 = `${MOD_ID}-reto2`;
const RETO_SINTESIS = `${MOD_ID}-reto-sintesis`;
const PASO_QUIZ = `${MOD_ID}-${PASO_QUIZ_ID}-quiz`;
const PASO_RETO = `${MOD_ID}-${PASO_RETO_ID}-reto`;

/** Todo el progreso de SECCIÓN completo (como en S3), SIN las entradas de los pasos. */
function progressSinPasos(): ModuleProgress {
  return {
    explicacion: { texto: EXPLICACION_VALIDA, actualizadoEn: 1 },
    quizzes: { [QUIZ_SECCION]: { mejorPct: 100, intentos: 1 } },
    retos: {
      [RETO_1]: { ultimoPass: true, intentos: 1, solucionVista: false },
      [RETO_2]: { ultimoPass: true, intentos: 1, solucionVista: false },
      [RETO_SINTESIS]: { ultimoPass: true, intentos: 1, solucionVista: false },
    },
  };
}

/** Progreso completo INCLUYENDO el mini-ejercicio y el micro-quiz del paso. */
function progressCompleta(): ModuleProgress {
  const base = progressSinPasos();
  return {
    ...base,
    quizzes: { ...base.quizzes, [PASO_QUIZ]: { mejorPct: 90, intentos: 1 } },
    retos: {
      ...base.retos,
      [PASO_RETO]: { ultimoPass: true, intentos: 1, solucionVista: false },
    },
  };
}

describe('moduleStatus — un módulo con `pasos` exige TAMBIÉN sus mini-ejercicios/micro-quizzes (§8.3, ADR-13)', () => {
  it("NO completado si están todos los quizzes/retos de SECCIÓN pero faltan los del paso", () => {
    expect(moduleStatus(modulo, progressSinPasos())).not.toBe("completado");
  });

  it("completado cuando TAMBIÉN se completan el mini-ejercicio y el micro-quiz del paso", () => {
    expect(moduleStatus(modulo, progressCompleta())).toBe("completado");
  });

  it("NO completado si el micro-quiz del paso está por debajo del umbral (79%)", () => {
    const completa = progressCompleta();
    const progress = {
      ...completa,
      quizzes: { ...completa.quizzes, [PASO_QUIZ]: { mejorPct: 79, intentos: 1 } },
    };
    expect(moduleStatus(modulo, progress)).not.toBe("completado");
  });

  it("completado con el micro-quiz del paso justo en el umbral (80%)", () => {
    const completa = progressCompleta();
    const progress = {
      ...completa,
      quizzes: { ...completa.quizzes, [PASO_QUIZ]: { mejorPct: 80, intentos: 1 } },
    };
    expect(moduleStatus(modulo, progress)).toBe("completado");
  });

  it("NO completado si el mini-ejercicio del paso tiene ultimoPass=false, aunque el resto pase", () => {
    const completa = progressCompleta();
    const progress = {
      ...completa,
      retos: {
        ...completa.retos,
        [PASO_RETO]: { ultimoPass: false, intentos: 2, solucionVista: false },
      },
    };
    expect(moduleStatus(modulo, progress)).not.toBe("completado");
  });

  it('el paso kind="lectura" NUNCA se exige para "completado" (no tiene entrada de progreso posible, §8.3)', () => {
    // progressCompleta() ya es "completado" sin ninguna entrada para el paso de
    // lectura (`${MOD_ID}-paso-explica-lectura`): si el selector lo exigiera
    // por error, este caso pasaría a "en_curso" y el test de arriba fallaría.
    // Este test lo deja explícito como documentación ejecutable del contrato.
    expect(moduleStatus(modulo, progressCompleta())).toBe("completado");
  });
});
