/**
 * Contrato C-PROGRESS (ARCHITECTURE.md §4, `src/progress/types.ts`).
 *
 * Transcripción LITERAL del contrato. `progress/` persiste únicamente hechos
 * primitivos (CA-16); todo estado derivado (p.ej. `completado`) vive en
 * `selectors.ts` como selector puro, nunca en este estado (ver invariante
 * "moduleStatus es derivado", ARCHITECTURE.md §3).
 */

import type { ModuleId } from "@/content/types";

/** Selectores derivados (src/progress/selectors.ts) — ÚNICA fuente de estado calculado. */
export type ModuleStatus = "no_iniciado" | "en_curso" | "completado";

export interface ProgressState {
  schemaVersion: 1;
  modules: Record<ModuleId, ModuleProgress | undefined>;
}

export interface ModuleProgress {
  /** Paso 1: texto íntegro (CA-14). Completado ⇔ length ≥ 200 (CA-13, umbral en config). */
  explicacion: { texto: string; actualizadoEn: number } | null;
  /** Por quiz: mejor resultado histórico (CA-12). hecho ⇔ mejorPct ≥ 80. */
  quizzes: Record<string, { mejorPct: number; intentos: number }>;
  /** Por reto: cuenta el ÚLTIMO intento (CA-08). */
  retos: Record<string, { ultimoPass: boolean; intentos: number; solucionVista: boolean }>;
}

export interface ProgressActions {
  saveExplanation(moduleId: ModuleId, texto: string): void;
  recordQuizResult(moduleId: ModuleId, quizId: string, pct: number): void; // guarda max(prev, pct)
  recordChallengeResult(moduleId: ModuleId, retoId: string, passed: boolean): void; // sobrescribe ultimoPass
  markSolutionViewed(moduleId: ModuleId, retoId: string): void;
  resetModule(moduleId: ModuleId): void; // CA-17: sólo ese módulo
  resetAll(): void; // US-10
}
