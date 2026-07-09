import { expect, test } from "@playwright/test";

import {
  CONCURRENT_WRITE_NO_REDUCER_CHALLENGE,
  FANOUT_WITH_REDUCER_CHALLENGE,
  SUPERSTEP_SIBLINGS_READ_PRIOR_STATE_CHALLENGE,
} from "./fixtures-advanced";
import { describeFailure, runChallenge, setupRunner } from "./helpers";

/**
 * S12 — Refactor del executor a supersteps atómicos (ADR-08).
 * SLICES.md §S12, test (7); ARCHITECTURE.md §Semántica de superstep.
 *
 * Cubre las DOS mitades del invariante:
 * - clave CON reducer escrita por >1 nodo del mismo superstep ⇒ se reduce en
 *   orden determinista de `add_node`.
 * - clave SIN reducer escrita por >1 nodo del mismo superstep ⇒
 *   `InvalidUpdateError`.
 * Y la semántica de lectura: los nodos de un superstep ven el estado del
 * CIERRE del superstep anterior, nunca las escrituras de sus hermanos.
 */

test.describe("S12 (7) — Fan-out sobre clave CON reducer", () => {
  test("orden determinista de aplicación (orden de registro con add_node)", async ({ page }) => {
    await setupRunner(page);

    const result = await runChallenge(page, {
      challengeId: FANOUT_WITH_REDUCER_CHALLENGE.id,
      studentCode: FANOUT_WITH_REDUCER_CHALLENGE.studentCode,
      validationCode: FANOUT_WITH_REDUCER_CHALLENGE.validationCode,
      timeoutMs: 8000,
    });

    expect(result.status, describeFailure(result)).toBe("pass");
    if (result.status !== "pass") return;
    expect(result.checks.every((c) => c.passed), describeFailure(result)).toBe(true);
  });
});

test.describe("S12 (7) — Invariante de superstep: hermanos leen el estado previo", () => {
  test("nodos del mismo superstep NUNCA ven las escrituras de sus hermanos", async ({ page }) => {
    await setupRunner(page);

    const result = await runChallenge(page, {
      challengeId: SUPERSTEP_SIBLINGS_READ_PRIOR_STATE_CHALLENGE.id,
      studentCode: SUPERSTEP_SIBLINGS_READ_PRIOR_STATE_CHALLENGE.studentCode,
      validationCode: SUPERSTEP_SIBLINGS_READ_PRIOR_STATE_CHALLENGE.validationCode,
      timeoutMs: 8000,
    });

    expect(result.status, describeFailure(result)).toBe("pass");
    if (result.status !== "pass") return;
    expect(result.checks.every((c) => c.passed), describeFailure(result)).toBe(true);
  });
});

test.describe("S12 (7) — Fan-out sobre clave SIN reducer ⇒ InvalidUpdateError", () => {
  test("escritura concurrente sin reducer en el mismo superstep lanza un error claro", async ({
    page,
  }) => {
    await setupRunner(page);

    const result = await runChallenge(page, {
      challengeId: CONCURRENT_WRITE_NO_REDUCER_CHALLENGE.id,
      studentCode: CONCURRENT_WRITE_NO_REDUCER_CHALLENGE.studentCode,
      validationCode: CONCURRENT_WRITE_NO_REDUCER_CHALLENGE.validationCode,
      timeoutMs: 8000,
    });

    expect(result.status, describeFailure(result)).toBe("pass");
    if (result.status !== "pass") return;
    expect(result.checks.every((c) => c.passed), describeFailure(result)).toBe(true);
  });
});
