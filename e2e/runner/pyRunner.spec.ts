import { expect, test } from "@playwright/test";

import {
  GROUNDING_LOOP_CHALLENGE,
  GROUNDING_SCHEMAS_CHALLENGE,
  INFINITE_LOOP_CHALLENGE,
  NETWORK_BLOCKED_CHALLENGE,
  SUMA_CHALLENGE,
} from "./fixtures";

/**
 * S6 — Runner Pyodide + shim core + harness (SLICES.md §S6, contrato C-RUNNER).
 *
 * Independientes del implementer: solo se apoyan en la interfaz pública de
 * `RunChallengeRequest`/`RunChallengeResult`/`PyRunner` (ARCHITECTURE.md §C-RUNNER) y
 * en la tabla contractual del shim `python/langgraph/` (superficie core).
 *
 * Corren contra el servidor de DESARROLLO de Vite (proyecto Playwright
 * "runner-pyodide", ver playwright.config.ts) porque S6 no expone UI: se importa
 * `/src/runner/pyRunner.ts` directamente por URL, algo que solo el dev server permite
 * sin bundlear una página de prueba. Los assets de Pyodide (`public/pyodide/`, generados
 * con `npm run copy-pyodide`) se sirven igual en dev, mismo origen (CA-10).
 *
 * ASUNCIÓN DE CONTRATO explícita (C-RUNNER solo fija la interfaz `PyRunner`, no cómo
 * se instancia): se asume que `src/runner/pyRunner.ts` exporta una función factory
 * `createPyRunner(): PyRunner`, en línea con el nombre de archivo y con la necesidad de
 * instancias aisladas por test (evita estado de worker compartido entre tests). Si el
 * implementer elige otro nombre de export, el reviewer debe hacer constar el desvío y
 * el architect debe ratificar el nombre en C-RUNNER; estos tests son la referencia de
 * "hecho" y no deben relajarse para acomodar un nombre distinto sin pasar por ese gate.
 */

const RUNNER_MODULE_PATH = "/src/runner/pyRunner.ts";

interface CheckResultLike {
  id: string;
  description: string;
  passed: boolean;
  message?: string;
}

type RunChallengeResultLike =
  | { status: "pass"; checks: CheckResultLike[]; stdout: string }
  | { status: "fail"; checks: CheckResultLike[]; stdout: string }
  | { status: "error"; errorKind: "syntax" | "runtime"; message: string; stdout: string }
  | { status: "timeout"; message: string };

interface RunChallengeRequestLike {
  challengeId: string;
  studentCode: string;
  validationCode: string;
  timeoutMs: number;
}

declare global {
  interface Window {
    __runChallengeInPage?: (
      req: RunChallengeRequestLike,
    ) => Promise<RunChallengeResultLike>;
    __getRunnerStateInPage?: () => Promise<string>;
  }
}

/**
 * Crea (o reutiliza, dentro de la misma página) un `PyRunner` vía `createPyRunner()` y
 * lo cuelga de `window` para que los tests puedan invocar `runChallenge`/`getState`
 * repetidamente sin reimportar el módulo (relevante para el test de recuperación tras
 * timeout, que necesita el MISMO runner antes y después del corte).
 */
async function setupRunner(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(async (modulePath) => {
    const mod = await import(/* @vite-ignore */ modulePath);
    if (typeof mod.createPyRunner !== "function") {
      throw new Error(
        `${modulePath} debe exportar createPyRunner(): PyRunner (ver comentario de ASUNCIÓN DE CONTRATO en pyRunner.spec.ts)`,
      );
    }
    const runner = mod.createPyRunner();
    await runner.init();
    window.__runChallengeInPage = (req: RunChallengeRequestLike) => runner.runChallenge(req);
    window.__getRunnerStateInPage = async () => runner.getState();
  }, RUNNER_MODULE_PATH);
}

async function runChallenge(
  page: import("@playwright/test").Page,
  req: RunChallengeRequestLike,
): Promise<RunChallengeResultLike> {
  return page.evaluate((r) => {
    if (!window.__runChallengeInPage) {
      throw new Error("setupRunner() no se llamó antes de runChallenge()");
    }
    return window.__runChallengeInPage(r);
  }, req);
}

test.describe("CA-06 — solución correcta pasa en <10 s", () => {
  test("suma correcta => status pass, sin checks fallidos", async ({ page }) => {
    await setupRunner(page);

    const start = Date.now();
    const result = await runChallenge(page, {
      challengeId: SUMA_CHALLENGE.id,
      studentCode: SUMA_CHALLENGE.solutionCode,
      validationCode: SUMA_CHALLENGE.validationCode,
      timeoutMs: 8000,
    });
    const elapsedMs = Date.now() - start;

    expect(result.status).toBe("pass");
    if (result.status === "pass") {
      expect(result.checks.every((c) => c.passed)).toBe(true);
      expect(result.checks.length).toBeGreaterThanOrEqual(2);
    }
    // Presupuesto CA-06: medido desde el envío de la petición, no desde init()
    // (ARCHITECTURE.md R2: init ocurre antes de que el alumno escriba).
    expect(elapsedMs).toBeLessThan(10_000);
  });
});

test.describe("CA-07 — solución incorrecta falla con check identificado", () => {
  test("suma incorrecta => status fail con mensaje concreto esperado/obtenido", async ({
    page,
  }) => {
    await setupRunner(page);

    const result = await runChallenge(page, {
      challengeId: SUMA_CHALLENGE.id,
      studentCode: SUMA_CHALLENGE.incorrectCode,
      validationCode: SUMA_CHALLENGE.validationCode,
      timeoutMs: 8000,
    });

    expect(result.status).toBe("fail");
    if (result.status !== "fail") return;

    const failing = result.checks.find((c) => !c.passed);
    expect(failing, "debe existir al menos un CheckResult fallido").toBeTruthy();
    expect(failing?.id).toBe("suma_2_3");
    // El mensaje debe ser concreto (esperado vs obtenido, ARCHITECTURE.md §harness),
    // no un genérico "fallo" sin datos.
    expect(failing?.message).toBeTruthy();
    expect(failing?.message).toMatch(/5/); // valor esperado
    expect(failing?.message).toMatch(/-1/); // valor obtenido (2 - 3)
  });
});

test.describe("Timeout — bucle infinito se corta y el runner se recupera", () => {
  test("timeout con mensaje legible, y una ejecución posterior vuelve a funcionar", async ({
    page,
  }) => {
    await setupRunner(page);

    const timeoutMs = 1500;
    const start = Date.now();
    const timedOut = await runChallenge(page, {
      challengeId: INFINITE_LOOP_CHALLENGE.id,
      studentCode: INFINITE_LOOP_CHALLENGE.studentCode,
      validationCode: INFINITE_LOOP_CHALLENGE.validationCode,
      timeoutMs,
    });
    const elapsedMs = Date.now() - start;

    expect(timedOut.status).toBe("timeout");
    if (timedOut.status === "timeout") {
      expect(timedOut.message).toBeTruthy();
      expect(timedOut.message.length).toBeGreaterThan(0);
    }
    // No debe colgarse indefinidamente: debe resolver cerca del timeoutMs pedido,
    // con margen para el terminate()+reinit del worker.
    expect(elapsedMs).toBeLessThan(timeoutMs + 8000);

    // La cola no debe quedar bloqueada tras el corte (ARCHITECTURE.md: "única forma
    // fiable de matar wasm síncrono" es terminate + re-init lazy).
    const recovered = await runChallenge(page, {
      challengeId: SUMA_CHALLENGE.id,
      studentCode: SUMA_CHALLENGE.solutionCode,
      validationCode: SUMA_CHALLENGE.validationCode,
      timeoutMs: 8000,
    });
    expect(recovered.status).toBe("pass");
  });
});

test.describe("R1 — fidelidad del shim frente al grounding oficial", () => {
  test("grounding §1: loop con route hasta longitud 7 produce la salida documentada", async ({
    page,
  }) => {
    await setupRunner(page);

    const result = await runChallenge(page, {
      challengeId: GROUNDING_LOOP_CHALLENGE.id,
      studentCode: GROUNDING_LOOP_CHALLENGE.studentCode,
      validationCode: GROUNDING_LOOP_CHALLENGE.validationCode,
      timeoutMs: 8000,
    });

    expect(result.status, JSON.stringify(result)).toBe("pass");
  });

  test("grounding §2: esquemas input/output/private producen 'My name is Lance'", async ({
    page,
  }) => {
    await setupRunner(page);

    const result = await runChallenge(page, {
      challengeId: GROUNDING_SCHEMAS_CHALLENGE.id,
      studentCode: GROUNDING_SCHEMAS_CHALLENGE.studentCode,
      validationCode: GROUNDING_SCHEMAS_CHALLENGE.validationCode,
      timeoutMs: 8000,
    });

    expect(result.status, JSON.stringify(result)).toBe("pass");
  });
});

test.describe("CA-10 — sin acceso a red durante la validación", () => {
  test("0 requests externas y js.fetch/XMLHttpRequest bloqueados en el scope Python", async ({
    page,
  }) => {
    await setupRunner(page);

    const externalRequests: string[] = [];
    page.on("request", (req) => {
      const url = new URL(req.url());
      const isSameOriginAsset =
        url.hostname === "localhost" || url.hostname === "127.0.0.1";
      if (!isSameOriginAsset) {
        externalRequests.push(req.url());
      }
    });

    const result = await runChallenge(page, {
      challengeId: NETWORK_BLOCKED_CHALLENGE.id,
      studentCode: NETWORK_BLOCKED_CHALLENGE.studentCode,
      validationCode: NETWORK_BLOCKED_CHALLENGE.validationCode,
      timeoutMs: 8000,
    });

    expect(result.status, JSON.stringify(result)).toBe("pass");
    expect(
      externalRequests,
      `no debe haber requests a hosts externos durante la validación: ${externalRequests.join(", ")}`,
    ).toEqual([]);
  });
});
