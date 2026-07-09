import { expect, test } from "@playwright/test";

import type { ModuleId } from "../../src/content/types";
import { collectChallengesFor, describeFailure, runChallenge, setupRunner } from "./helpers";

/**
 * S13 — Contenido módulos 03–06 (SLICES.md §S13): "humo: cada `solutionCode`
 * pasa su `validationCode` en el runner real (suite automática por módulo)".
 *
 * Es el test CRÍTICO de R7/ARCHITECTURE.md §C-CONTENT: garantiza que el
 * contenido de reducers/nodes-edges/conditional-edges/add_messages no solo
 * "parece" correcto por lectura sino que su solución de referencia EJECUTA y
 * pasa la validación en el runner Pyodide real (mismo `PyRunner` que usará el
 * alumno — ver `pyRunner.spec.ts`, S6).
 *
 * Independiente del implementer de S13: solo consume el contrato público
 * `getModule` (C-CONTENT) y `createPyRunner`/`runChallenge` (C-RUNNER, vía
 * `./helpers.ts`, ya validado por S6). Corre en el proyecto Playwright
 * "runner-pyodide" (servidor dev de Vite, ver playwright.config.ts) porque
 * necesita importar `/src/runner/pyRunner.ts` directamente.
 *
 * Antes de que exista el contenido real de S13 estos tests son ROJOS: hoy
 * mod03–06 son el esqueleto stub de S1 (`createStubModule`), cuyo único reto
 * por módulo valida con un check trivial (`check("stub", ..., True)`) — la
 * aserción de "≥1 aserción real por check" y la ausencia de literal "stub" en
 * el id del check hacen que este archivo falle por la razón correcta (falta
 * contenido real), no por un error de entorno/infra.
 */

const MOD03_06_IDS: ModuleId[] = ["mod03", "mod04", "mod05", "mod06"];

const CHALLENGES = collectChallengesFor(MOD03_06_IDS);

test.describe("S13 — humo: registry expone retos de código para mod03–06", () => {
  for (const moduleId of MOD03_06_IDS) {
    test(`${moduleId}: tiene ≥1 reto de código (llenaGaps y/o síntesis)`, () => {
      const count = CHALLENGES.filter((c) => c.moduleId === moduleId).length;
      expect(count, `${moduleId} debería tener ≥1 CodeChallenge`).toBeGreaterThanOrEqual(1);
    });
  }
});

test.describe("S13 — humo: solutionCode pasa validationCode en el runner Pyodide real (C-RUNNER)", () => {
  for (const { moduleId, challenge } of CHALLENGES) {
    test(`${moduleId}/${challenge.id}: solutionCode => status pass, todos los checks passed`, async ({ page }) => {
      await setupRunner(page);

      const result = await runChallenge(page, {
        challengeId: challenge.id,
        studentCode: challenge.solutionCode,
        validationCode: challenge.validationCode,
        llmDoubles: challenge.llmDoubles,
        timeoutMs: challenge.timeoutMs ?? 8000,
      });

      expect(result.status, describeFailure(result)).toBe("pass");
      if (result.status !== "pass") return;

      // El check trivial del stub de S1 (`check("stub", ..., True)`) es
      // insuficiente: un reto real valida ≥1 aserción CON nombre propio del
      // reto (no el id genérico "stub").
      expect(result.checks.length, describeFailure(result)).toBeGreaterThanOrEqual(1);
      expect(
        result.checks.some((c) => c.id === "stub"),
        `${moduleId}/${challenge.id} sigue usando el check placeholder "stub" (${describeFailure(result)})`,
      ).toBe(false);
      expect(result.checks.every((c) => c.passed), describeFailure(result)).toBe(true);
    });
  }
});
