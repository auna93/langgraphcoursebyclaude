import { expect, test } from "@playwright/test";

import { STREAM_MESSAGES_CHALLENGE } from "./fixtures-advanced";
import { describeFailure, runChallenge, setupRunner } from "./helpers";

/**
 * S12 — Shim avanzado: `stream_mode="messages"` (tuplas (chunk, metadata),
 * troceo determinista por palabras con FakeChatModel). SLICES.md §S12,
 * incluido en el objetivo "streaming messages"; ARCHITECTURE.md C-RUNNER
 * tabla "Avanzado", fila `graph.stream(..., stream_mode=...)`.
 */

test.describe("S12 — Streaming stream_mode='messages'", () => {
  test("emite tuplas (chunk, metadata) con langgraph_node, reconstruye el mensaje y es determinista", async ({
    page,
  }) => {
    await setupRunner(page);

    const result = await runChallenge(page, {
      challengeId: STREAM_MESSAGES_CHALLENGE.id,
      studentCode: STREAM_MESSAGES_CHALLENGE.studentCode,
      validationCode: STREAM_MESSAGES_CHALLENGE.validationCode,
      llmDoubles: STREAM_MESSAGES_CHALLENGE.llmDoubles,
      timeoutMs: 8000,
    });

    expect(result.status, describeFailure(result)).toBe("pass");
    if (result.status !== "pass") return;
    expect(result.checks.every((c) => c.passed), describeFailure(result)).toBe(true);
  });
});
