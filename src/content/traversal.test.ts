/**
 * Tests de `src/content/traversal.ts` (ADR-13, ARCHITECTURE.md §8.2(d)).
 * Slice SE0 (SLICES.md §SE0). Protege CA-30/31/33 (enumeración canónica de
 * `pasos`) y, de forma CRÍTICA, CA-39: la enumeración de retos/quizzes para un
 * módulo SIN `pasos` debe ser IDÉNTICA a la que usaban S1/S3 antes de M4.
 *
 * Independiente del implementer: solo usa los NOMBRES EXACTOS del contrato
 * §8.2(d) — `getModulePasos`, `getModuleChallenges`, `getModuleQuizzes` — y
 * fixtures propias (`./test-fixtures.ts`) que NO dependen de `traversal.ts`.
 *
 * Antes de que exista `src/content/traversal.ts` este archivo es ROJO por
 * "Failed to resolve import" / "Cannot find module" al importar
 * `@/content/traversal` — la razón correcta (infra ausente, SE0 aún no
 * implementado), no un error de setup de los fixtures.
 */
import { describe, expect, it } from "vitest";

import { getModuleChallenges, getModulePasos, getModuleQuizzes } from "@/content/traversal";
import {
  PASO_EXPLICA_LECTURA_ID,
  PASO_QUIZ_ID,
  PASO_RETO_ID,
  buildFixtureModuleConPasos,
  buildFixtureModuleSinPasos,
} from "@/content/test-fixtures";

const MOD_ID = "mod01";

describe("Equivalencia con la enumeración previa de S3 para un módulo SIN `pasos` (CA-39, CRÍTICO)", () => {
  const modulo = buildFixtureModuleSinPasos(MOD_ID);

  it("getModuleChallenges === ids de llenaGaps.retos + síntesis (si es código), ni más ni menos", () => {
    const esperados = [
      ...modulo.secciones.llenaGaps.retos.map((r) => r.id),
      ...(modulo.secciones.refinaSimplifica.sintesis.kind === "code"
        ? [modulo.secciones.refinaSimplifica.sintesis.reto.id]
        : []),
    ];
    const obtenidos = getModuleChallenges(modulo).map((r) => r.id);

    expect(new Set(obtenidos)).toEqual(new Set(esperados));
    expect(obtenidos).toHaveLength(esperados.length);
  });

  it("getModuleQuizzes === id de detectaGaps.quiz + síntesis (si es quiz), ni más ni menos", () => {
    const esperados = [
      modulo.secciones.detectaGaps.quiz.id,
      ...(modulo.secciones.refinaSimplifica.sintesis.kind === "quiz"
        ? [modulo.secciones.refinaSimplifica.sintesis.quiz.id]
        : []),
    ];
    const obtenidos = getModuleQuizzes(modulo).map((q) => q.id);

    expect(new Set(obtenidos)).toEqual(new Set(esperados));
    expect(obtenidos).toHaveLength(esperados.length);
  });

  it("getModulePasos devuelve [] cuando ninguna sección declara `pasos`", () => {
    expect(getModulePasos(modulo)).toEqual([]);
  });
});

describe("getModulePasos — orden canónico de sección (explica→gaps→llena→refina) y de array (§8.2(d))", () => {
  it("recorre los pasos de las secciones que los declaran, en ese orden", () => {
    const modulo = buildFixtureModuleConPasos(MOD_ID);
    const ids = getModulePasos(modulo).map((p) => p.id);

    expect(ids).toEqual([
      `${MOD_ID}-${PASO_EXPLICA_LECTURA_ID}`,
      `${MOD_ID}-${PASO_QUIZ_ID}`,
      `${MOD_ID}-${PASO_RETO_ID}`,
    ]);
  });

  it("cada paso conserva su `explicacionMd` y `accion` tal como se declaró (sin transformar el dato)", () => {
    const modulo = buildFixtureModuleConPasos(MOD_ID);
    const pasos = getModulePasos(modulo);

    expect(pasos.every((p) => p.explicacionMd.length > 0)).toBe(true);
    expect(pasos.map((p) => p.accion.kind)).toEqual(["lectura", "quiz", "ejercicio"]);
  });
});

describe("getModuleChallenges/getModuleQuizzes incluyen los mini-ejercicios/micro-quizzes de `pasos` (§8.3)", () => {
  const modulo = buildFixtureModuleConPasos(MOD_ID);

  it('getModuleChallenges incluye el reto del paso kind="ejercicio" ADEMÁS de los de sección', () => {
    const ids = getModuleChallenges(modulo).map((r) => r.id);

    expect(ids).toContain(`${MOD_ID}-${PASO_RETO_ID}-reto`);
    for (const reto of modulo.secciones.llenaGaps.retos) {
      expect(ids).toContain(reto.id);
    }
    if (modulo.secciones.refinaSimplifica.sintesis.kind === "code") {
      expect(ids).toContain(modulo.secciones.refinaSimplifica.sintesis.reto.id);
    }
  });

  it('getModuleQuizzes incluye el quiz del paso kind="quiz" ADEMÁS del de sección', () => {
    const ids = getModuleQuizzes(modulo).map((q) => q.id);

    expect(ids).toContain(`${MOD_ID}-${PASO_QUIZ_ID}-quiz`);
    expect(ids).toContain(modulo.secciones.detectaGaps.quiz.id);
  });

  it('el paso kind="lectura" NO cuenta ni como reto ni como quiz (§8.3, NG-11 análogo)', () => {
    const challengeIds = getModuleChallenges(modulo).map((r) => r.id);
    const quizIds = getModuleQuizzes(modulo).map((q) => q.id);

    expect(challengeIds.some((id) => id.includes(PASO_EXPLICA_LECTURA_ID))).toBe(false);
    expect(quizIds.some((id) => id.includes(PASO_EXPLICA_LECTURA_ID))).toBe(false);
  });

  it("getModuleChallenges no confunde el quiz de un paso con un reto, ni al revés", () => {
    const challengeIds = getModuleChallenges(modulo).map((r) => r.id);
    const quizIds = getModuleQuizzes(modulo).map((q) => q.id);

    expect(challengeIds).not.toContain(`${MOD_ID}-${PASO_QUIZ_ID}-quiz`);
    expect(quizIds).not.toContain(`${MOD_ID}-${PASO_RETO_ID}-reto`);
  });

  it("un módulo con `pasos` tiene MÁS challenges/quizzes que la misma base sin pasos (R11: no se pierden ni se duplican)", () => {
    const sinPasos = buildFixtureModuleSinPasos(MOD_ID);
    expect(getModuleChallenges(modulo).length).toBe(getModuleChallenges(sinPasos).length + 1);
    expect(getModuleQuizzes(modulo).length).toBe(getModuleQuizzes(sinPasos).length + 1);
  });
});
