/**
 * Selectores derivados de C-PROGRESS (ARCHITECTURE.md §4).
 *
 * Funciones PURAS: nunca leen el store directamente ni el registry de
 * contenido. `moduleStatus` recibe el `CourseModule` correspondiente porque
 * `progress/` solo consume TIPOS de C-CONTENT (no el registry en runtime,
 * ARCHITECTURE §4/SLICES.md §S3) — quien ya tiene el módulo cargado
 * (Temario, ModuloPage) se lo pasa. Los umbrales (200 chars / 80%) se leen
 * de `CONFIG` (contrato Configuración, `src/config.ts`), igual que el resto
 * de la app (ver `selectors.test.ts`).
 *
 * `moduleStatus` es la ÚNICA fuente de estado calculado (CA-15): nunca se
 * persiste, se recalcula siempre a partir de los hechos primitivos.
 */

import { CONFIG } from "@/config";
import { getModuleChallenges, getModuleQuizzes } from "@/content/traversal";
import type { CourseModule } from "@/content/types";

import type { ModuleProgress, ModuleStatus } from "./types";

/** CA-13: paso 1 completado ⇔ texto guardado con ≥ umbral configurado (200). */
export function isExplanationDone(progress: ModuleProgress | undefined): boolean {
  const texto = progress?.explicacion?.texto ?? "";
  return texto.length >= CONFIG.curso.umbralExplicacionChars;
}

/** CA-12: un quiz está hecho ⇔ el mejor resultado histórico ≥ umbral (80%). */
export function isQuizDone(progress: ModuleProgress | undefined, quizId: string): boolean {
  const mejorPct = progress?.quizzes[quizId]?.mejorPct ?? 0;
  return mejorPct >= CONFIG.curso.umbralQuizPct;
}

/** CA-08: un reto está hecho ⇔ el ÚLTIMO intento registrado fue pass. */
export function isChallengePassed(progress: ModuleProgress | undefined, retoId: string): boolean {
  return progress?.retos[retoId]?.ultimoPass ?? false;
}

/** CA-09: "ver solución" disponible ⇔ ≥1 intento registrado (pass o fail). */
export function isSolutionAvailable(progress: ModuleProgress | undefined, retoId: string): boolean {
  return (progress?.retos[retoId]?.intentos ?? 0) >= 1;
}

/**
 * Todos los quizzes/retos que declara el módulo, DELEGADO en la enumeración
 * canónica de `content/traversal.ts` (ADR-13): incluye `pasos[].accion` de
 * §12.2 además de las secciones ya existentes. Para módulos sin `pasos` el
 * resultado es idéntico al de la enumeración inline previa (invariante de
 * retrocompat protegido por el test de equivalencia de SE0, CA-39).
 */
function quizIdsOf(courseModule: CourseModule): string[] {
  return getModuleQuizzes(courseModule).map((quiz) => quiz.id);
}

function challengeIdsOf(courseModule: CourseModule): string[] {
  return getModuleChallenges(courseModule).map((reto) => reto.id);
}

function hasAnyProgress(progress: ModuleProgress | undefined): boolean {
  if (!progress) return false;
  return (
    progress.explicacion !== null ||
    Object.keys(progress.quizzes).length > 0 ||
    Object.keys(progress.retos).length > 0
  );
}

/**
 * CA-15 (selector puro): "completado" ⇔ paso 1 completado ∧ TODOS los
 * quizzes del módulo hechos ∧ TODOS los retos con último intento en pass.
 * Si el contenido define un quiz/reto sin entrada en progreso, cuenta como
 * no hecho (no se asume éxito por ausencia). "en_curso" ⇔ existe cualquier
 * progreso parcial; si no hay nada, "no_iniciado".
 */
export function moduleStatus(
  courseModule: CourseModule,
  progress: ModuleProgress | undefined,
): ModuleStatus {
  const explicacionOk = isExplanationDone(progress);
  const quizzesOk = quizIdsOf(courseModule).every((id) => isQuizDone(progress, id));
  const retosOk = challengeIdsOf(courseModule).every((id) => isChallengePassed(progress, id));

  if (explicacionOk && quizzesOk && retosOk) return "completado";
  return hasAnyProgress(progress) ? "en_curso" : "no_iniciado";
}
