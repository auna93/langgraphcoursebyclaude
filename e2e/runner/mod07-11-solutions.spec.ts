import { expect, test } from "@playwright/test";

import type { ModuleId } from "../../src/content/types";
import { collectChallengesFor, describeFailure, runChallenge, setupRunner } from "./helpers";

/**
 * S14 — Contenido módulos 07–11 (SLICES.md §S14): "idem S13 (humo de
 * soluciones + contrato + sin `enConstruccion`)": "cada `solutionCode` pasa su
 * `validationCode` en el runner real (suite automática por módulo)".
 *
 * Es el test CRÍTICO de R7/ARCHITECTURE.md §C-CONTENT para checkpointing/
 * Store/HITL/streaming I/streaming II: garantiza que el contenido no solo
 * "parece" correcto por lectura sino que su solución de referencia EJECUTA y
 * pasa la validación en el runner Pyodide real con el shim AVANZADO de S12
 * (mismo `PyRunner` que usará el alumno — ver `pyRunner.spec.ts` y
 * `pyRunner-advanced.spec.ts`).
 *
 * Independiente del implementer de S14: solo consume el contrato público
 * `getModule` (C-CONTENT) y `createPyRunner`/`runChallenge` (C-RUNNER, vía
 * `./helpers.ts`, ya validado por S6/S12). Corre en el proyecto Playwright
 * "runner-pyodide" (servidor dev de Vite, ver playwright.config.ts) porque
 * necesita importar `/src/runner/pyRunner.ts` directamente.
 *
 * Antes de que exista el contenido real de S14 estos tests son ROJOS: hoy
 * mod07–11 son el esqueleto stub de S1 (`createStubModule`), cuyo único reto
 * por módulo valida con un check trivial (`check("stub", ..., True)`) — la
 * aserción de "≥1 aserción real por check" y la ausencia del id "stub" hacen
 * que este archivo falle por la razón correcta (falta contenido real), no por
 * un error de entorno/infra.
 */

const MOD07_11_IDS: ModuleId[] = ["mod07", "mod08", "mod09", "mod10", "mod11"];

const CHALLENGES = collectChallengesFor(MOD07_11_IDS);

test.describe("S14 — humo: registry expone retos de código para mod07–11", () => {
  for (const moduleId of MOD07_11_IDS) {
    test(`${moduleId}: tiene ≥1 reto de código (llenaGaps y/o síntesis)`, () => {
      const count = CHALLENGES.filter((c) => c.moduleId === moduleId).length;
      expect(count, `${moduleId} debería tener ≥1 CodeChallenge`).toBeGreaterThanOrEqual(1);
    });
  }
});

test.describe("S14 — humo: solutionCode pasa validationCode en el runner Pyodide real (C-RUNNER, shim avanzado S12)", () => {
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

test.describe("S14 — humo: retos que declaran llmDoubles se ejecutan de forma determinista con FakeChatModel", () => {
  const CHALLENGES_WITH_DOUBLES = CHALLENGES.filter((c) => (c.challenge.llmDoubles?.length ?? 0) > 0);

  for (const { moduleId, challenge } of CHALLENGES_WITH_DOUBLES) {
    test(`${moduleId}/${challenge.id}: dos ejecuciones consecutivas producen el mismo resultado (determinismo, SU-02)`, async ({
      page,
    }) => {
      await setupRunner(page);

      const req = {
        challengeId: challenge.id,
        studentCode: challenge.solutionCode,
        validationCode: challenge.validationCode,
        llmDoubles: challenge.llmDoubles,
        timeoutMs: challenge.timeoutMs ?? 8000,
      };

      const first = await runChallenge(page, req);
      const second = await runChallenge(page, req);

      expect(first.status, describeFailure(first)).toBe("pass");
      expect(second.status, describeFailure(second)).toBe("pass");
      if (first.status !== "pass" || second.status !== "pass") return;

      expect(second.checks.map((c) => c.passed)).toEqual(first.checks.map((c) => c.passed));
    });
  }
});
