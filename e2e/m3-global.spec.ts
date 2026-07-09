import { createServer } from "node:http";

import { expect, test } from "@playwright/test";

import { mod09 } from "../src/content/modules/mod09";

/**
 * Cierre de Milestone M3 (integrator, SLICES.md "Cierre M3") — e2e GLOBAL del
 * producto completo (16/16 módulos):
 *
 *   Temario con 16 módulos reales (CA-01) → abre un módulo AVANZADO (mod09,
 *   HITL: interrupt/Command(resume=...), shim avanzado de S12) → resuelve su
 *   reto con el runner Pyodide REAL (pass, CA-06/07) → el asistente responde
 *   con contexto del módulo (RAG, CA-23/24) → verificación de red: 0 requests
 *   externas durante TODO el recorrido (CA-10 en la validación del reto,
 *   CA-25 en el asistente — solo `/ollama` same-origin, ADR-06).
 *
 * Corre en el proyecto Playwright "chromium" (build de producción, `preview`)
 * porque necesita tanto la UI completa (ChallengeCard, ChatPanel) como los
 * assets de `public/pyodide/` servidos same-origin (CA-10) — mismo servidor
 * que `e2e/m1-vertical.spec.ts` y `e2e/m2-assistant.spec.ts`, cuya estrategia
 * de mock de Ollama y de red reutiliza.
 */

const ASISTENTE_LABEL = "Asistente";
const MODEL = "qwen2.5-coder:14b";

function ndjsonLine(content: string, done = false): string {
  return JSON.stringify({ message: { role: "assistant", content }, done }) + "\n";
}

function startChatServer() {
  const server = createServer((req, res) => {
    if (req.url?.endsWith("/api/tags")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ models: [{ name: MODEL }] }));
      return;
    }

    if (req.url?.endsWith("/api/chat")) {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        (server as unknown as { lastRequestBody: string }).lastRequestBody = body;
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(ndjsonLine("Respuesta con contexto del módulo."));
        res.write(ndjsonLine("", true));
        res.end();
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return {
    server,
    getLastRequestBody(): string {
      return (server as unknown as { lastRequestBody?: string }).lastRequestBody ?? "";
    },
    listen(): Promise<number> {
      return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          const address = server.address();
          resolve(typeof address === "object" && address ? address.port : 0);
        });
      });
    },
  };
}

async function routeToLocalServer(page: import("@playwright/test").Page, port: number) {
  await page.route("**/ollama/**", async (route) => {
    const original = new URL(route.request().url());
    await route.continue({ url: `http://127.0.0.1:${port}${original.pathname}` });
  });
}

test.describe("Cierre M3 — producto completo, e2e global (16/16 módulos)", () => {
  test("temario 16/16 (CA-01) → módulo avanzado mod09 (HITL) → reto real pass → asistente con contexto → 0 requests externas (CA-10/CA-25)", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const chatServer = startChatServer();
    const port = await chatServer.listen();

    const foreignRequests: string[] = [];

    try {
      await routeToLocalServer(page, port);

      // --- Temario: 16 módulos reales, sin stubs (CA-01) ---
      await page.goto("/");
      const appOrigin = new URL(page.url()).origin;
      page.on("request", (req) => {
        const origin = new URL(req.url()).origin;
        if (origin !== appOrigin) foreignRequests.push(req.url());
      });

      for (const keyword of [
        "Grafos vs",
        "TypedDict",
        "Reducers",
        "Nodes y edges",
        "Conditional edges",
        "conversacional",
        "Checkpointing",
        "Memoria",
        "Human-in-the-loop",
        "Streaming I",
        "Streaming II",
        "Tool calling",
        "ReAct",
        "Multi-agente",
        "Subgraphs",
        "Deployment",
      ]) {
        await expect(
          page.getByText(new RegExp(keyword, "i")).first(),
          `no se encontró el título de un módulo (palabra clave "${keyword}")`,
        ).toBeVisible();
      }
      await expect(page.getByText(/🚧|en construcción/i)).toHaveCount(0);

      // --- Módulo avanzado: mod09 (HITL, shim avanzado de S12) ---
      await page.goto("/modulo/mod09");
      await page.getByRole("tab", { name: "Llena los gaps" }).click();

      const retoSlot = page.getByRole("tabpanel").locator('[data-testid="reto-slot"]').first();
      const reto = mod09.secciones.llenaGaps.retos[0];

      const codeEditor = retoSlot.locator('[data-testid="challenge-code-editor"]');
      await codeEditor.fill(reto.solutionCode);
      await retoSlot.getByRole("button", { name: /ejecutar/i }).click();

      // Presupuesto amplio: init lazy de Pyodide (primera vez) + validación
      // real del shim avanzado (checkpointer + interrupt/resume).
      await expect(retoSlot.getByText(/reto superado/i)).toBeVisible({ timeout: 60_000 });

      // --- Asistente responde con contexto del módulo (RAG, CA-23/24) ---
      const asistente = page.getByLabel(ASISTENTE_LABEL);
      await expect(asistente.getByText("Conectado", { exact: true })).toBeVisible({
        timeout: 5000,
      });

      const input = asistente.getByRole("textbox");
      await input.fill("¿Cómo funciona interrupt y Command(resume=...) en este módulo?");
      await asistente.getByRole("button", { name: "Enviar" }).click();

      const respuesta = page.getByTestId("chat-message-assistant").first();
      await expect(respuesta).toContainText("Respuesta con contexto del módulo.", {
        timeout: 5000,
      });

      const requestBody = chatServer.getLastRequestBody();
      // El system prompt (buildPrompt, C-ASSIST) incluye id/tema del módulo
      // actual (CA-23) y chunks del RAG (CA-24) — se verifica indirectamente
      // que el prompt enviado a Ollama menciona el módulo actual.
      expect(requestBody.toLowerCase()).toContain("mod09");

      // --- Verificación final de red: 0 requests externas en TODO el
      // recorrido (CA-10 durante la validación del reto vía Pyodide/shim, y
      // CA-25 en el asistente — solo `/ollama` same-origin, ADR-06). ---
      expect(foreignRequests).toEqual([]);
    } finally {
      chatServer.server.close();
    }
  });
});
