import { expect, test } from "@playwright/test";

import {
  GROUNDING_LOOP_CHALLENGE,
  GROUNDING_SCHEMAS_CHALLENGE,
  SUMA_CHALLENGE,
} from "./fixtures";
import { describeFailure, runChallenge, setupRunner } from "./helpers";

/**
 * S12 — Regresión R10: el refactor del executor a supersteps atómicos
 * (ADR-08) NO puede romper la superficie CORE ya en PASS desde S6. SLICES.md
 * §S12, test (8): "TODA la suite de S6 (ejemplos grounding base §1–2) sigue
 * en verde tras el refactor a superstep". ARCHITECTURE.md riesgo R10.
 *
 * Este archivo es DELIBERADAMENTE redundante con `pyRunner.spec.ts` (S6): se
 * mantiene como gate explícito de S12 (si `pyRunner.spec.ts` se tocara o se
 * saltara en CI, esto sigue verificando la regresión), usando exactamente los
 * mismos fixtures/oráculos que S6 (ningún caso nuevo aquí).
 *
 * Nota: con 1 nodo activo por superstep (todos los ejemplos grounding §1-2)
 * el resultado del executor por supersteps debe ser IDÉNTICO al del executor
 * de merge inmediato (ARCHITECTURE.md ADR-08, "Compatibilidad").
 */

test.describe("R10 — regresión: ejemplos grounding base §1-2 sin cambios tras ADR-08", () => {
  test("grounding §1: loop con route hasta longitud 7 sigue produciendo la salida documentada", async ({
    page,
  }) => {
    await setupRunner(page);

    const result = await runChallenge(page, {
      challengeId: GROUNDING_LOOP_CHALLENGE.id,
      studentCode: GROUNDING_LOOP_CHALLENGE.studentCode,
      validationCode: GROUNDING_LOOP_CHALLENGE.validationCode,
      timeoutMs: 8000,
    });

    expect(result.status, describeFailure(result)).toBe("pass");
  });

  test("grounding §2: esquemas input/output/private siguen produciendo 'My name is Lance'", async ({
    page,
  }) => {
    await setupRunner(page);

    const result = await runChallenge(page, {
      challengeId: GROUNDING_SCHEMAS_CHALLENGE.id,
      studentCode: GROUNDING_SCHEMAS_CHALLENGE.studentCode,
      validationCode: GROUNDING_SCHEMAS_CHALLENGE.validationCode,
      timeoutMs: 8000,
    });

    expect(result.status, describeFailure(result)).toBe("pass");
  });

  test("reto trivial ajeno al shim (suma) sigue pasando: el runner en sí no regresiona", async ({
    page,
  }) => {
    await setupRunner(page);

    const result = await runChallenge(page, {
      challengeId: SUMA_CHALLENGE.id,
      studentCode: SUMA_CHALLENGE.solutionCode,
      validationCode: SUMA_CHALLENGE.validationCode,
      timeoutMs: 8000,
    });

    expect(result.status, describeFailure(result)).toBe("pass");
    if (result.status !== "pass") return;
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });
});
