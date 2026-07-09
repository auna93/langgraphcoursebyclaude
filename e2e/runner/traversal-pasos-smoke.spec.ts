import { expect, test } from "@playwright/test";

import { describeFailure, runChallenge, setupRunner } from "./helpers";

/**
 * SE0 — Infra de enriquecimiento (SLICES.md §SE0, punto 5): "extender el
 * smoke de soluciones para recorrer `getModuleChallenges` (incluye pasos,
 * CA-32)". Este archivo NO enriquece contenido real (eso es SE1): usa un
 * `CourseModule` FIXTURE con un mini-ejercicio en `pasos` (mismo shape que
 * usarán mod01–03 en SE1) para probar el MECANISMO — que un
 * `PasoAccion` kind="ejercicio", enumerado vía `getModuleChallenges`
 * (ADR-13), fluye por el MISMO camino runner/harness (C-RUNNER) que
 * cualquier `CodeChallenge` de sección, ANTES de que exista contenido real
 * enriquecido.
 *
 * Independiente del implementer: solo consume `getModuleChallenges`
 * (`@/content/traversal`, contrato §8.2(d)) y `createPyRunner`/`runChallenge`
 * (C-RUNNER, ya validado por S6/S12). Antes de que `traversal.ts` exista, este
 * spec es ROJO por fallo de import dinámico ("Cannot find module") — razón
 * correcta, no un error de infraestructura del runner (que ya está en PASS).
 */

const FIXTURE_MODULE_PATH = "/src/content/test-fixtures.ts";
const TRAVERSAL_MODULE_PATH = "/src/content/traversal.ts";

interface CollectedChallenge {
  id: string;
  starterCode: string;
  solutionCode: string;
  validationCode: string;
}

declare global {
  interface Window {
    __collectFixtureChallenges?: () => Promise<CollectedChallenge[]>;
  }
}

test.describe("SE0 — humo: getModuleChallenges recorre los mini-ejercicios de `pasos` (CA-32, ADR-13)", () => {
  test("un módulo fixture con `pasos` expone su mini-ejercicio vía getModuleChallenges", async ({ page }) => {
    await page.goto("/");

    const challenges = await page.evaluate(
      async ([fixturePath, traversalPath]) => {
        const fixtures = await import(/* @vite-ignore */ fixturePath);
        const traversal = await import(/* @vite-ignore */ traversalPath);
        const modulo = fixtures.buildFixtureModuleConPasos("mod01");
        return traversal.getModuleChallenges(modulo).map((c: CollectedChallenge) => ({
          id: c.id,
          starterCode: c.starterCode,
          solutionCode: c.solutionCode,
          validationCode: c.validationCode,
        }));
      },
      [FIXTURE_MODULE_PATH, TRAVERSAL_MODULE_PATH] as const,
    );

    expect(challenges.some((c) => c.id === "mod01-paso-reto1-reto")).toBe(true);
  });

  test("el `solutionCode` del mini-ejercicio del paso pasa su `validationCode` en el runner Pyodide real", async ({ page }) => {
    await setupRunner(page);

    const challenges = await page.evaluate(
      async ([fixturePath, traversalPath]) => {
        const fixtures = await import(/* @vite-ignore */ fixturePath);
        const traversal = await import(/* @vite-ignore */ traversalPath);
        const modulo = fixtures.buildFixtureModuleConPasos("mod01");
        return traversal.getModuleChallenges(modulo).map((c: CollectedChallenge) => ({
          id: c.id,
          starterCode: c.starterCode,
          solutionCode: c.solutionCode,
          validationCode: c.validationCode,
        }));
      },
      [FIXTURE_MODULE_PATH, TRAVERSAL_MODULE_PATH] as const,
    );

    const pasoReto = challenges.find((c) => c.id === "mod01-paso-reto1-reto");
    expect(pasoReto, "getModuleChallenges debería incluir el reto del paso").toBeDefined();
    if (!pasoReto) return;

    const result = await runChallenge(page, {
      challengeId: pasoReto.id,
      studentCode: pasoReto.solutionCode,
      validationCode: pasoReto.validationCode,
      timeoutMs: 8000,
    });

    expect(result.status, describeFailure(result)).toBe("pass");
  });
});
