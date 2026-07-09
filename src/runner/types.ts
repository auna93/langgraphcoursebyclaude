/**
 * Ejecución/validación Python (contrato C-RUNNER, ARCHITECTURE.md §4).
 *
 * Transcripción LITERAL del contrato. Cualquier cambio de forma exige volver
 * al architect (Gate 2) — no se parchea aquí de forma divergente.
 */

import type { LlmDouble } from "@/content/types";

export type RunnerState = "idle" | "loading" | "ready" | "running" | "error";

export interface RunChallengeRequest {
  challengeId: string;
  studentCode: string;
  validationCode: string; // del CodeChallenge
  llmDoubles?: LlmDouble[]; // del CodeChallenge
  timeoutMs: number; // resuelto por el caller (default 8000)
}

export interface CheckResult {
  id: string; // id del check en validationCode
  description: string; // español, legible por el alumno
  passed: boolean;
  message?: string; // detalle del fallo: esperado vs obtenido
}

export type RunChallengeResult =
  | { status: "pass"; checks: CheckResult[]; stdout: string }
  | { status: "fail"; checks: CheckResult[]; stdout: string } // ≥1 check failed
  | { status: "error"; errorKind: "syntax" | "runtime"; message: string; stdout: string }
  | { status: "timeout"; message: string }; // "El código superó el límite de N s"

export interface PyRunner {
  /** Carga Pyodide + shim. Idempotente. Llamar lazy en el primer reto visible. */
  init(): Promise<void>;
  getState(): RunnerState;
  /** Serializa ejecuciones (cola de 1). Nunca rechaza por errores del alumno:
   *  los mapea a RunChallengeResult. Rechaza sólo por fallo de infraestructura. */
  runChallenge(req: RunChallengeRequest): Promise<RunChallengeResult>;
  /** Aborta la ejecución en curso (terminate + re-init lazy). */
  cancel(): void;
}
