import { expect, test } from "@playwright/test";

import { getModule } from "../../src/content/registry";
import { getModulePasos } from "../../src/content/traversal";
import type { ModuleId } from "../../src/content/types";
import { collectChallengesFor, describeFailure, runChallenge, setupRunner } from "./helpers";

/**
 * SE1 (SLICES.md §SE1): "smoke: cada `solutionCode` de cada mini-ejercicio
 * pasa su `validationCode` en el runner real (CA-32)".
 *
 * Es el test CRÍTICO de CA-31/CA-32 para el piloto mod01–03: no basta con que
 * los mini-ejercicios de `pasos[].accion` (kind "ejercicio") EXISTAN y estén
 * bien formados (eso lo cubre `enriquecido-mod01-03.test.ts`); su
 * `solutionCode` debe EJECUTAR y pasar en el runner Pyodide real (mismo
 * `PyRunner` que usará el alumno, C-RUNNER).
 *
 * `collectChallengesFor` (helper de SE0) usa `getModuleChallenges` — la
 * enumeración CANÓNICA que YA incluye los mini-ejercicios de `pasos`, además
 * de los retos de sección/síntesis. Este archivo es, por tanto, un test
 * DEDICADO y trazable al gate de SE1 (no depende de que el reviewer relacione
 * `mod01-02-solutions.spec.ts`/`mod03-06-solutions.spec.ts` con CA-31/32 del
 * piloto): además de ejecutar el smoke, verifica explícitamente que cada
 * módulo tiene ≥3 mini-ejercicios (CA-31) ANTES de correrlos.
 *
 * Antes de que SE1 exista, `getModulePasos(mod)` no devuelve pasos de tipo
 * "ejercicio" (mod01–03 aún sin `pasos`) ⇒ este archivo es ROJO por CA-31 (0 <
 * 3), no por un error de entorno.
 */

const MOD_IDS: ModuleId[] = ["mod01", "mod02", "mod03"];

test.describe("SE1 — CA-31: cada módulo del piloto tiene ≥3 mini-ejercicios de tipo 'ejercicio'", () => {
  for (const moduleId of MOD_IDS) {
    test(`${moduleId}: getModulePasos(mod) contiene ≥3 pasos con accion.kind === "ejercicio"`, () => {
      const mod = getModule(moduleId);
      expect(mod, `${moduleId} debe existir en el registry`).toBeDefined();
      const miniEjercicios = getModulePasos(mod!).filter((p) => p.accion.kind === "ejercicio");
      expect(
        miniEjercicios.length,
        `${moduleId} debería tener ≥3 mini-ejercicios (tiene ${miniEjercicios.length})`,
      ).toBeGreaterThanOrEqual(3);
    });
  }
});

const CHALLENGES = collectChallengesFor(MOD_IDS);

test.describe("SE1 — CA-32: solutionCode de cada mini-ejercicio (y reto de sección) pasa validationCode en el runner real", () => {
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
