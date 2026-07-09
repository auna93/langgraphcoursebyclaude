import { expect, test } from "@playwright/test";

import {
  CREATE_REACT_AGENT_CHALLENGE,
  MANUAL_TOOL_CYCLE_CHALLENGE,
  TOOL_NODE_CHALLENGE,
} from "./fixtures-advanced";
import { describeFailure, runChallenge, setupRunner } from "./helpers";

/**
 * S12 — Shim avanzado: tools (@tool/bind_tools/tool_calls/ToolMessage/ToolNode)
 * y create_react_agent. SLICES.md §S12, tests (6); ARCHITECTURE.md C-RUNNER
 * tabla "Avanzado", filas de tools + ToolNode + create_react_agent.
 */

test.describe("S12 (6) — Tools: ciclo manual modelo→tool→modelo", () => {
  test("should_continue + tool_node manual produce el ciclo esperado, determinista", async ({
    page,
  }) => {
    await setupRunner(page);

    const result = await runChallenge(page, {
      challengeId: MANUAL_TOOL_CYCLE_CHALLENGE.id,
      studentCode: MANUAL_TOOL_CYCLE_CHALLENGE.studentCode,
      validationCode: MANUAL_TOOL_CYCLE_CHALLENGE.validationCode,
      llmDoubles: MANUAL_TOOL_CYCLE_CHALLENGE.llmDoubles,
      timeoutMs: 8000,
    });

    expect(result.status, describeFailure(result)).toBe("pass");
    if (result.status !== "pass") return;
    expect(result.checks.every((c) => c.passed), describeFailure(result)).toBe(true);
  });
});

test.describe("S12 (6) — Tools: ToolNode prebuilt", () => {
  test("ToolNode ejecuta la tool y produce ToolMessage; tool inexistente lanza error", async ({
    page,
  }) => {
    await setupRunner(page);

    const result = await runChallenge(page, {
      challengeId: TOOL_NODE_CHALLENGE.id,
      studentCode: TOOL_NODE_CHALLENGE.studentCode,
      validationCode: TOOL_NODE_CHALLENGE.validationCode,
      llmDoubles: TOOL_NODE_CHALLENGE.llmDoubles,
      timeoutMs: 8000,
    });

    expect(result.status, describeFailure(result)).toBe("pass");
    if (result.status !== "pass") return;
    expect(result.checks.every((c) => c.passed), describeFailure(result)).toBe(true);
  });
});

test.describe("S12 (6) — create_react_agent: loop ReAct determinista", () => {
  test("mismos inputs producen los mismos resultados; nodos agent -> tools -> agent", async ({
    page,
  }) => {
    await setupRunner(page);

    const result = await runChallenge(page, {
      challengeId: CREATE_REACT_AGENT_CHALLENGE.id,
      studentCode: CREATE_REACT_AGENT_CHALLENGE.studentCode,
      validationCode: CREATE_REACT_AGENT_CHALLENGE.validationCode,
      llmDoubles: CREATE_REACT_AGENT_CHALLENGE.llmDoubles,
      timeoutMs: 8000,
    });

    expect(result.status, describeFailure(result)).toBe("pass");
    if (result.status !== "pass") return;
    expect(result.checks.every((c) => c.passed), describeFailure(result)).toBe(true);
  });
});
