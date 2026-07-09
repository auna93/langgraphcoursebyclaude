import { expect, test } from "@playwright/test";

import type { ModuleId } from "../../src/content/types";
import { collectChallengesFor, describeFailure, runChallenge, setupRunner } from "./helpers";

/**
 * SE0 (SLICES.md §SE0): humo de soluciones para mod01–02, análogo a
 * `mod03-06-solutions.spec.ts` (S13) pero recorriendo `getModuleChallenges`
 * (ADR-13, vía `collectChallengesFor`) para que, cuando SE1 enriquezca mod01
 * y mod02 con `pasos[].accion` de tipo "ejercicio" (mini-ejercicios, §12.2),
 * sus `solutionCode` queden cubiertos automáticamente por este smoke sin
 * modificar este archivo (CA-32).
 *
 * Hoy (antes de SE1) mod01–02 tienen contenido COMPLETO de S1 (sin `pasos`):
 * este archivo ya los cubre con la enumeración previa (retos de `llenaGaps`
 * y síntesis), igual que el smoke que ya validaba mod01–02 indirectamente en
 * `m1-vertical.spec.ts`.
 */

const MOD01_02_IDS: ModuleId[] = ["mod01", "mod02"];

const CHALLENGES = collectChallengesFor(MOD01_02_IDS);

test.describe("SE0 — humo: registry expone retos de código para mod01–02", () => {
  for (const moduleId of MOD01_02_IDS) {
    test(`${moduleId}: tiene ≥1 reto de código (llenaGaps, síntesis y/o pasos)`, () => {
      const count = CHALLENGES.filter((c) => c.moduleId === moduleId).length;
      expect(count, `${moduleId} debería tener ≥1 CodeChallenge`).toBeGreaterThanOrEqual(1);
    });
  }
});

test.describe("SE0 — humo: solutionCode pasa validationCode en el runner Pyodide real (C-RUNNER)", () => {
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

      expect(result.checks.length, describeFailure(result)).toBeGreaterThanOrEqual(1);
      expect(result.checks.every((c) => c.passed), describeFailure(result)).toBe(true);
    });
  }
});
