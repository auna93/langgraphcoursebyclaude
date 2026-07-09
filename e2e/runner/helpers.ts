import type { Page } from "@playwright/test";

import { getModule } from "../../src/content/registry";
import { getModuleChallenges } from "../../src/content/traversal";
import type { CodeChallenge, ModuleId } from "../../src/content/types";

/**
 * Helpers compartidos por los specs del runner (proyecto Playwright
 * "runner-pyodide", ver playwright.config.ts). Extraídos de `pyRunner.spec.ts`
 * (S6) para reutilizarlos en los specs de S12 (shim avanzado) sin duplicar el
 * bootstrap del `PyRunner` en cada archivo.
 *
 * Mismas ASUNCIONES DE CONTRATO que S6: `src/runner/pyRunner.ts` exporta
 * `createPyRunner(): PyRunner` (C-RUNNER, ARCHITECTURE.md §C-RUNNER, punto de
 * instanciación ratificado en M3). Si esto cambia, es un desvío de contrato:
 * el reviewer/architect deben ratificarlo, no se relaja aquí.
 */

export const RUNNER_MODULE_PATH = "/src/runner/pyRunner.ts";

export interface CheckResultLike {
  id: string;
  description: string;
  passed: boolean;
  message?: string;
}

export type RunChallengeResultLike =
  | { status: "pass"; checks: CheckResultLike[]; stdout: string }
  | { status: "fail"; checks: CheckResultLike[]; stdout: string }
  | { status: "error"; errorKind: "syntax" | "runtime"; message: string; stdout: string }
  | { status: "timeout"; message: string };

/** `LlmDouble` de C-CONTENT (`src/content/types.ts`), tal cual lo consume
 *  `RunChallengeRequest.llmDoubles` (C-RUNNER). */
export interface LlmDoubleLike {
  matchSubstring?: string;
  respuesta: string;
  toolCalls?: { name: string; args: Record<string, unknown> }[];
}

export interface RunChallengeRequestLike {
  challengeId: string;
  studentCode: string;
  validationCode: string;
  llmDoubles?: LlmDoubleLike[];
  timeoutMs: number;
}

declare global {
  interface Window {
    __runChallengeInPage?: (
      req: RunChallengeRequestLike,
    ) => Promise<RunChallengeResultLike>;
  }
}

/** Crea un `PyRunner` aislado (vía `createPyRunner()`) para la página actual y
 *  lo cuelga de `window` para invocarlo repetidamente desde `runChallenge`. */
export async function setupRunner(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(async (modulePath) => {
    const mod = await import(/* @vite-ignore */ modulePath);
    if (typeof mod.createPyRunner !== "function") {
      throw new Error(
        `${modulePath} debe exportar createPyRunner(): PyRunner (ver ASUNCIÓN DE CONTRATO en e2e/runner/helpers.ts)`,
      );
    }
    const runner = mod.createPyRunner();
    await runner.init();
    window.__runChallengeInPage = (req: RunChallengeRequestLike) => runner.runChallenge(req);
  }, RUNNER_MODULE_PATH);
}

export async function runChallenge(
  page: Page,
  req: RunChallengeRequestLike,
): Promise<RunChallengeResultLike> {
  return page.evaluate((r) => {
    if (!window.__runChallengeInPage) {
      throw new Error("setupRunner() no se llamó antes de runChallenge()");
    }
    return window.__runChallengeInPage(r);
  }, req);
}

/** Assertion helper: falla con el detalle completo del resultado si el status
 *  no es "pass" (evita depurar a ciegas cuándo un check concreto falla). */
export function describeFailure(result: RunChallengeResultLike): string {
  return JSON.stringify(result, null, 2);
}

export interface ChallengeWithModule {
  moduleId: ModuleId;
  challenge: CodeChallenge;
}

/**
 * Smoke de soluciones (SLICES.md S13/S14/S15/SE0): recorre `getModuleChallenges`
 * (ADR-13, `content/traversal.ts`) — la enumeración CANÓNICA que incluye los
 * retos de `llenaGaps`/síntesis Y los mini-ejercicios de `pasos[].accion`
 * (kind "ejercicio", §12.2). Fuente ÚNICA para los specs "-solutions.spec.ts":
 * cuando SE1+ añada `pasos` con mini-ejercicios a un módulo, este helper los
 * expone automáticamente sin tocar los specs que lo consumen (CA-32).
 */
export function collectChallengesFor(moduleIds: ModuleId[]): ChallengeWithModule[] {
  const result: ChallengeWithModule[] = [];
  for (const moduleId of moduleIds) {
    const mod = getModule(moduleId);
    if (!mod) continue;
    for (const challenge of getModuleChallenges(mod)) {
      result.push({ moduleId, challenge });
    }
  }
  return result;
}
