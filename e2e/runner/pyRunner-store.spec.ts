import { expect, test } from "@playwright/test";

import { STORE_PUT_SEARCH_CHALLENGE, STORE_VS_CHECKPOINTER_CHALLENGE } from "./fixtures-advanced";
import { describeFailure, runChallenge, setupRunner } from "./helpers";

/**
 * S12 — Shim avanzado: InMemoryStore (put/get/search por namespace).
 * SLICES.md §S12, test (5); ARCHITECTURE.md C-RUNNER tabla "Avanzado", fila
 * `InMemoryStore`.
 */

test.describe("S12 (5) — Store: put/search por namespace, determinista", () => {
  test("search filtra por query, respeta orden de inserción, aísla namespaces", async ({
    page,
  }) => {
    await setupRunner(page);

    const result = await runChallenge(page, {
      challengeId: STORE_PUT_SEARCH_CHALLENGE.id,
      studentCode: STORE_PUT_SEARCH_CHALLENGE.studentCode,
      validationCode: STORE_PUT_SEARCH_CHALLENGE.validationCode,
      timeoutMs: 8000,
    });

    expect(result.status, describeFailure(result)).toBe("pass");
    if (result.status !== "pass") return;
    expect(result.checks.every((c) => c.passed), describeFailure(result)).toBe(true);
  });

  test("Store es memoria compartida ENTRE hilos (a diferencia del checkpointer, por hilo)", async ({
    page,
  }) => {
    await setupRunner(page);

    const result = await runChallenge(page, {
      challengeId: STORE_VS_CHECKPOINTER_CHALLENGE.id,
      studentCode: STORE_VS_CHECKPOINTER_CHALLENGE.studentCode,
      validationCode: STORE_VS_CHECKPOINTER_CHALLENGE.validationCode,
      timeoutMs: 8000,
    });

    expect(result.status, describeFailure(result)).toBe("pass");
    if (result.status !== "pass") return;
    expect(result.checks.every((c) => c.passed), describeFailure(result)).toBe(true);
  });
});
