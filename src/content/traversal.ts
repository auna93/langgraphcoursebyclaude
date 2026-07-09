/**
 * Enumeración canónica de pasos/retos/quizzes de un `CourseModule` (ADR-13,
 * ARCHITECTURE.md §8.2(d)).
 *
 * Funciones PURAS sobre dato puro: sin dependencias de React ni de otros
 * módulos de la app. Recorren TODAS las secciones INCLUYENDO `pasos`
 * (§12.2). Sustituyen a las enumeraciones inline privadas que existían en
 * `progress/selectors.ts` (`quizIdsOf`/`challengeIdsOf`) — ÚNICA fuente de
 * verdad reusada por `progress/`, `pages/` y los tests.
 *
 * Invariante de retrocompat (obligatorio, CA-39): para todo módulo SIN
 * `pasos`, `getModuleChallenges`/`getModuleQuizzes` devuelven exactamente el
 * mismo conjunto de ids que la enumeración previa de S3.
 */

import type { CodeChallenge, CourseModule, PasoGuiado, Quiz } from "./types";

/** Orden de secciones Feynman (mismo orden que `ModuloPage`, CA-02). */
function seccionesConPasos(m: CourseModule): { pasos?: PasoGuiado[] }[] {
  return [
    m.secciones.explicaSimple,
    m.secciones.detectaGaps,
    m.secciones.llenaGaps,
    m.secciones.refinaSimplifica,
  ];
}

/**
 * Todos los pasos del módulo, en orden de sección (explica→gaps→llena→refina)
 * y de array.
 */
export function getModulePasos(m: CourseModule): PasoGuiado[] {
  return seccionesConPasos(m).flatMap((seccion) => seccion.pasos ?? []);
}

/**
 * Todos los `CodeChallenge` del módulo: retos de `llenaGaps`, `sintesis`
 * (kind "code") Y `pasos[].accion` (kind "ejercicio"). Base del smoke CA-32 y
 * del selector CA-15.
 */
export function getModuleChallenges(m: CourseModule): CodeChallenge[] {
  const retos = [...m.secciones.llenaGaps.retos];
  const sintesis = m.secciones.refinaSimplifica.sintesis;
  if (sintesis.kind === "code") retos.push(sintesis.reto);
  for (const paso of getModulePasos(m)) {
    if (paso.accion.kind === "ejercicio") retos.push(paso.accion.reto);
  }
  return retos;
}

/**
 * Todos los `Quiz` del módulo: `detectaGaps`, `sintesis` (kind "quiz") Y
 * `pasos[].accion` (kind "quiz"). Base del selector CA-15 (micro-quizzes de
 * pasos CUENTAN como quizzes).
 */
export function getModuleQuizzes(m: CourseModule): Quiz[] {
  const quizzes = [m.secciones.detectaGaps.quiz];
  const sintesis = m.secciones.refinaSimplifica.sintesis;
  if (sintesis.kind === "quiz") quizzes.push(sintesis.quiz);
  for (const paso of getModulePasos(m)) {
    if (paso.accion.kind === "quiz") quizzes.push(paso.accion.quiz);
  }
  return quizzes;
}
