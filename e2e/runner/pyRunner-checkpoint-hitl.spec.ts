import { expect, test } from "@playwright/test";

import {
  CHECKPOINT_PERSISTENCE_CHALLENGE,
  COMMAND_GOTO_UPDATE_CHALLENGE,
  INTERRUPT_RESUME_CHALLENGE,
  INTERRUPT_WITHOUT_CHECKPOINTER_CHALLENGE,
} from "./fixtures-advanced";
import { describeFailure, runChallenge, setupRunner } from "./helpers";

/**
 * S12 — Shim avanzado: checkpointing (InMemorySaver) + HITL (interrupt/Command).
 * SLICES.md §S12, tests (1) y (4); ARCHITECTURE.md C-RUNNER tabla "Avanzado".
 *
 * Independiente del implementer: solo usa la interfaz pública `PyRunner`
 * (createPyRunner/runChallenge) y `validationCode` con la API del harness.
 */

test.describe("S12 (1) — Checkpointing: InMemorySaver + thread_id + get_state", () => {
  test("estado persiste en el mismo hilo, aislado entre hilos, get_state expone values/next", async ({
    page,
  }) => {
    await setupRunner(page);

    const result = await runChallenge(page, {
      challengeId: CHECKPOINT_PERSISTENCE_CHALLENGE.id,
      studentCode: CHECKPOINT_PERSISTENCE_CHALLENGE.studentCode,
      validationCode: CHECKPOINT_PERSISTENCE_CHALLENGE.validationCode,
      timeoutMs: 8000,
    });

    expect(result.status, describeFailure(result)).toBe("pass");
    if (result.status !== "pass") return;
    expect(result.checks.every((c) => c.passed), describeFailure(result)).toBe(true);
  });
});

test.describe("S12 (4) — HITL: interrupt + Command(resume)", () => {
  test("oráculo grounding-adv §1: resume produce {'value': ['Hello, Alice!', 'Done']}", async ({
    page,
  }) => {
    await setupRunner(page);

    const result = await runChallenge(page, {
      challengeId: INTERRUPT_RESUME_CHALLENGE.id,
      studentCode: INTERRUPT_RESUME_CHALLENGE.studentCode,
      validationCode: INTERRUPT_RESUME_CHALLENGE.validationCode,
      timeoutMs: 8000,
    });

    expect(result.status, describeFailure(result)).toBe("pass");
    if (result.status !== "pass") return;
    expect(result.checks.every((c) => c.passed), describeFailure(result)).toBe(true);
  });

  test("interrupt sin checkpointer lanza un error claro (menciona checkpointer/thread_id)", async ({
    page,
  }) => {
    await setupRunner(page);

    const result = await runChallenge(page, {
      challengeId: INTERRUPT_WITHOUT_CHECKPOINTER_CHALLENGE.id,
      studentCode: INTERRUPT_WITHOUT_CHECKPOINTER_CHALLENGE.studentCode,
      validationCode: INTERRUPT_WITHOUT_CHECKPOINTER_CHALLENGE.validationCode,
      timeoutMs: 8000,
    });

    expect(result.status, describeFailure(result)).toBe("pass");
    if (result.status !== "pass") return;
    expect(result.checks.every((c) => c.passed), describeFailure(result)).toBe(true);
  });

  test("Command(goto=, update=) enruta ignorando edges declarados y aplica el update", async ({
    page,
  }) => {
    await setupRunner(page);

    const result = await runChallenge(page, {
      challengeId: COMMAND_GOTO_UPDATE_CHALLENGE.id,
      studentCode: COMMAND_GOTO_UPDATE_CHALLENGE.studentCode,
      validationCode: COMMAND_GOTO_UPDATE_CHALLENGE.validationCode,
      timeoutMs: 8000,
    });

    expect(result.status, describeFailure(result)).toBe("pass");
    if (result.status !== "pass") return;
    expect(result.checks.every((c) => c.passed), describeFailure(result)).toBe(true);
  });
});
