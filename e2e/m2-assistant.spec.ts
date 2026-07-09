import { createServer } from "node:http";

import { expect, test } from "@playwright/test";

/**
 * Cierre M2 (integrator) — SLICES.md "Cierre M2": e2e del asistente
 * COMPLETO, de punta a punta, con mock de Ollama (sin depender de un Ollama
 * real corriendo en la máquina). Consolida en un único recorrido de usuario
 * lo que S8–S11 verifican por separado:
 *
 *   Conectado (mock, CA-18) → enviar (CA-21) → streaming incremental (CA-21)
 *   → detener (CA-22) → enviar de nuevo → error a mitad de stream (CA-26)
 *   → feedback Feynman desde el paso 1 (CA-27) → limpiar (US-16)
 *
 * más la verificación de red CA-25 (0 requests a dominios externos, solo
 * `/ollama` same-origin) durante todo el recorrido.
 *
 * Misma estrategia de red que `e2e/chat.spec.ts` y `e2e/feynman.spec.ts`:
 * se intercepta `**\/ollama/**` y se redirige a un servidor HTTP local que
 * puede emitir NDJSON troceado en tiempo real y cortar la conexión a
 * voluntad (algo que `route.fulfill` no permite).
 */

const ASISTENTE_LABEL = "Asistente";
const MODEL = "qwen2.5-coder:14b";

function ndjsonLine(content: string, done = false): string {
  return JSON.stringify({ message: { role: "assistant", content }, done }) + "\n";
}

interface ChatTurn {
  chunks: string[];
  delayMs?: number;
  failAfterChunks?: number;
}

function startChatServer() {
  let turnIndex = 0;
  const turns: ChatTurn[] = [];

  const server = createServer((req, res) => {
    if (req.url?.endsWith("/api/tags")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ models: [{ name: MODEL }] }));
      return;
    }

    if (req.url?.endsWith("/api/chat")) {
      const turn = turns[turnIndex];
      turnIndex += 1;
      if (!turn) {
        res.writeHead(500);
        res.end();
        return;
      }

      const delayMs = turn.delayMs ?? 100;
      res.writeHead(200, { "Content-Type": "application/x-ndjson" });
      let i = 0;
      let stopped = false;
      let timer: NodeJS.Timeout | undefined;

      const sendNext = () => {
        if (stopped) return;
        if (turn.failAfterChunks !== undefined && i === turn.failAfterChunks) {
          res.destroy();
          return;
        }
        if (i >= turn.chunks.length) {
          res.end();
          return;
        }
        res.write(turn.chunks[i]);
        i += 1;
        timer = setTimeout(sendNext, delayMs);
      };

      req.on("close", () => {
        stopped = true;
        if (timer) clearTimeout(timer);
      });

      sendNext();
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return {
    server,
    /** Programa la respuesta que se dará a la PRÓXIMA petición a /api/chat. */
    queueTurn(turn: ChatTurn) {
      turns.push(turn);
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

test.describe("Cierre M2 — recorrido completo del asistente (mock)", () => {
  test("conectar, enviar, streamear, detener, error a mitad de stream, feedback Feynman y limpiar — 0 requests externas", async ({
    page,
  }) => {
    const chatServer = startChatServer();
    const port = await chatServer.listen();

    // Verificación de red CA-25 durante TODO el recorrido: ninguna request
    // sale hacia un origen distinto al de la propia app (solo same-origin
    // `/ollama`, ADR-06).
    const foreignRequests: string[] = [];

    try {
      await routeToLocalServer(page, port);

      await page.goto("/modulo/mod01");
      const appOrigin = new URL(page.url()).origin;
      page.on("request", (req) => {
        const origin = new URL(req.url()).origin;
        if (origin !== appOrigin) foreignRequests.push(req.url());
      });

      const asistente = page.getByLabel(ASISTENTE_LABEL);

      // 1) Conectado (mock, CA-18).
      await expect(asistente.getByText("Conectado", { exact: true })).toBeVisible({
        timeout: 5000,
      });

      // 2) Enviar + streaming incremental (CA-21).
      chatServer.queueTurn({
        chunks: [ndjsonLine("Un "), ndjsonLine("grafo es un conjunto de nodos y aristas."), ndjsonLine("", true)],
        delayMs: 150,
      });

      const input = asistente.getByRole("textbox");
      await input.fill("¿Qué es un grafo en LangGraph?");
      await asistente.getByRole("button", { name: "Enviar" }).click();

      const primeraRespuesta = page.getByTestId("chat-message-assistant").first();
      await expect(primeraRespuesta).toContainText("Un", { timeout: 5000 });
      await expect(primeraRespuesta).toContainText(
        "Un grafo es un conjunto de nodos y aristas.",
        { timeout: 5000 },
      );
      await expect(page.getByText("Generando respuesta…")).toHaveCount(0);

      // 3) Enviar de nuevo + detener (CA-22): parcial visible, sin error.
      chatServer.queueTurn({
        chunks: [ndjsonLine("Los checkpoints "), ndjsonLine("guardan el estado del grafo.")],
        delayMs: 500,
      });

      await input.fill("Explica los checkpoints");
      await asistente.getByRole("button", { name: "Enviar" }).click();

      const segundaRespuesta = page.getByTestId("chat-message-assistant").nth(1);
      await expect(segundaRespuesta).toContainText("Los checkpoints", { timeout: 5000 });

      const start = Date.now();
      await asistente.getByRole("button", { name: "Detener" }).click();
      await expect(page.getByText("Generando respuesta…")).toHaveCount(0);
      expect(Date.now() - start).toBeLessThanOrEqual(2000);

      await expect(segundaRespuesta).toContainText("Los checkpoints");
      await expect(segundaRespuesta).not.toContainText("guardan el estado del grafo.");

      // 4) Enviar otra vez + error a mitad de stream (CA-26): mensaje legible
      // en español + la app sigue operativa.
      chatServer.queueTurn({
        chunks: [ndjsonLine("El ")],
        delayMs: 150,
        failAfterChunks: 1,
      });

      await input.fill("¿Cómo uso interrupt?");
      await asistente.getByRole("button", { name: "Enviar" }).click();

      await expect(page.getByRole("alert")).toBeVisible({ timeout: 5000 });
      const errorText = ((await page.getByRole("alert").textContent()) ?? "").toLowerCase();
      expect(errorText).toMatch(/reintent|recarg|conex|intenta/);
      expect(errorText).not.toContain("network");
      await expect(input).toBeEnabled();

      // 5) Feedback Feynman desde el paso 1 (CA-27): guardar una explicación
      // completa y pedir feedback dispara el mismo pipeline de streaming.
      await page.getByRole("tab", { name: "Explica simple" }).click();
      const panel = page.getByRole("tabpanel");
      const explicacion =
        "Un grafo de LangGraph es una máquina de estados donde cada nodo transforma el " +
        "estado compartido y las aristas deciden el siguiente paso a seguir, incluyendo " +
        "ciclos condicionales, hasta llegar finalmente al nodo especial END.";
      const textarea = panel.getByRole("textbox");
      await textarea.fill(explicacion);
      await textarea.blur();
      const guardar = panel.getByRole("button", { name: /guardar/i });
      if (await guardar.count()) await guardar.click();

      chatServer.queueTurn({
        chunks: [
          ndjsonLine("Buen intento, "),
          ndjsonLine("pero te falta explicar cómo se propaga el estado."),
          ndjsonLine("", true),
        ],
        delayMs: 150,
      });

      const botonFeedback = panel.getByRole("button", { name: /pedir feedback/i });
      await expect(botonFeedback).toBeEnabled();
      await botonFeedback.click();

      const respuestaFeedback = page.getByTestId("chat-message-assistant").last();
      await expect(respuestaFeedback).toContainText(
        "Buen intento, pero te falta explicar cómo se propaga el estado.",
        { timeout: 5000 },
      );

      // 6) Limpiar conversación (US-16).
      await asistente.getByRole("button", { name: "Limpiar conversación" }).click();
      await expect(page.getByTestId("chat-message-user")).toHaveCount(0);
      await expect(page.getByTestId("chat-message-assistant")).toHaveCount(0);

      // CA-25: a lo largo de TODO el recorrido, ninguna request salió del
      // origen de la app.
      expect(foreignRequests).toEqual([]);
    } finally {
      chatServer.server.close();
    }
  });
});
