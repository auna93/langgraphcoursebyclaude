import type { Server } from "node:http";
import { createServer } from "node:http";

import { expect, test } from "@playwright/test";

/**
 * Chat con streaming (slice S9, SLICES.md §S9, contrato C-ASSIST/C-OLLAMA).
 * CA-21 (render incremental), CA-22 (detener con parcial visible), CA-26
 * (error a mitad de stream con mensaje legible + instrucción de recuperación).
 *
 * El proxy `/ollama` (ADR-06) reenvía a `localhost:11434`; para no depender
 * de si hay (o no) un Ollama real corriendo en esa máquina, se intercepta la
 * petición a nivel de navegador (`page.route`) y se REDIRIGE
 * (`route.continue({ url })`, mismo protocolo `http`) hacia un servidor HTTP
 * de prueba local que sí puede emitir NDJSON troceado en el tiempo real
 * (algo que `route.fulfill` no permite: entrega el cuerpo completo de una
 * vez). Así el streaming, el aborto y el fallo a mitad de respuesta son
 * observables como eventos de red reales, deterministas y aislados.
 */

const ASISTENTE_LABEL = "Asistente";
const MODEL = "qwen2.5-coder:14b";

function ndjsonLine(content: string, done = false): string {
  return JSON.stringify({ message: { role: "assistant", content }, done }) + "\n";
}

interface ChatServerOptions {
  /** ms entre cada trozo NDJSON enviado. */
  delayMs?: number;
  /** si se indica, tras enviar este número de trozos se corta la conexión (simula error de red). */
  failAfterChunks?: number;
}

function startChatServer(
  chunks: string[],
  options: ChatServerOptions = {},
): Promise<{ server: Server; port: number }> {
  const delayMs = options.delayMs ?? 200;

  const server = createServer((req, res) => {
    if (req.url?.endsWith("/api/tags")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ models: [{ name: MODEL }] }));
      return;
    }

    if (req.url?.endsWith("/api/chat")) {
      res.writeHead(200, { "Content-Type": "application/x-ndjson" });
      let i = 0;
      let stopped = false;
      let timer: NodeJS.Timeout | undefined;

      const sendNext = () => {
        if (stopped) return;
        if (options.failAfterChunks !== undefined && i === options.failAfterChunks) {
          res.destroy();
          return;
        }
        if (i >= chunks.length) {
          res.end();
          return;
        }
        res.write(chunks[i]);
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

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, port });
    });
  });
}

async function routeToLocalServer(page: import("@playwright/test").Page, port: number) {
  await page.route("**/ollama/**", async (route) => {
    const original = new URL(route.request().url());
    await route.continue({ url: `http://127.0.0.1:${port}${original.pathname}` });
  });
}

test.describe("CA-21 — render incremental del streaming", () => {
  test("el texto de la respuesta crece con cada trozo NDJSON antes de completarse", async ({
    page,
  }) => {
    const { server, port } = await startChatServer([
      ndjsonLine("Un "),
      ndjsonLine("grafo es un conjunto de nodos y aristas."),
      ndjsonLine("", true),
    ]);

    try {
      await routeToLocalServer(page, port);
      await page.goto("/");

      const asistente = page.getByLabel(ASISTENTE_LABEL);
      await expect(asistente.getByText("Conectado", { exact: true })).toBeVisible({
        timeout: 5000,
      });

      const input = asistente.getByRole("textbox");
      await input.fill("¿Qué es un grafo en LangGraph?");
      await asistente.getByRole("button", { name: "Enviar" }).click();

      const respuesta = page.getByTestId("chat-message-assistant").last();

      // Primer trozo visible antes de completarse (actualización incremental #1).
      await expect(respuesta).toContainText("Un", { timeout: 5000 });

      // Segundo trozo se AÑADE al primero (actualización incremental #2, contenido distinto y creciente).
      await expect(respuesta).toContainText(
        "Un grafo es un conjunto de nodos y aristas.",
        { timeout: 5000 },
      );

      // Al completarse, deja de mostrarse el indicador "generando…".
      await expect(page.getByText("Generando respuesta…")).toHaveCount(0);
    } finally {
      server.close();
    }
  });
});

test.describe("CA-22 — 'detener' corta el streaming con el parcial visible", () => {
  test("al pulsar Detener el contenido parcial se conserva y deja de generar", async ({
    page,
  }) => {
    const { server, port } = await startChatServer(
      [ndjsonLine("Los checkpoints "), ndjsonLine("guardan el estado del grafo.")],
      { delayMs: 500 },
    );

    try {
      await routeToLocalServer(page, port);
      await page.goto("/");

      const asistente = page.getByLabel(ASISTENTE_LABEL);
      await expect(asistente.getByText("Conectado", { exact: true })).toBeVisible({
        timeout: 5000,
      });

      const input = asistente.getByRole("textbox");
      await input.fill("Explica los checkpoints");
      await asistente.getByRole("button", { name: "Enviar" }).click();

      const respuesta = page.getByTestId("chat-message-assistant").last();
      await expect(respuesta).toContainText("Los checkpoints", { timeout: 5000 });

      const start = Date.now();
      await asistente.getByRole("button", { name: "Detener" }).click();

      await expect(page.getByText("Generando respuesta…")).toHaveCount(0);
      const elapsedMs = Date.now() - start;
      expect(elapsedMs).toBeLessThanOrEqual(2000);

      // El parcial emitido hasta el momento del abort se conserva intacto.
      await expect(respuesta).toContainText("Los checkpoints");
      await expect(respuesta).not.toContainText("guardan el estado del grafo.");
    } finally {
      server.close();
    }
  });
});

test.describe("CA-26 — error de red a mitad de stream", () => {
  test("muestra un mensaje en español con instrucción de recuperación y la app sigue operativa", async ({
    page,
  }) => {
    const { server, port } = await startChatServer([ndjsonLine("El ")], {
      delayMs: 200,
      failAfterChunks: 1,
    });

    try {
      await routeToLocalServer(page, port);
      await page.goto("/");

      const asistente = page.getByLabel(ASISTENTE_LABEL);
      await expect(asistente.getByText("Conectado", { exact: true })).toBeVisible({
        timeout: 5000,
      });

      const input = asistente.getByRole("textbox");
      await input.fill("¿Cómo uso interrupt?");
      await asistente.getByRole("button", { name: "Enviar" }).click();

      // Mensaje de error visible: en español, con una pista de recuperación.
      await expect(page.getByRole("alert")).toBeVisible({ timeout: 5000 });
      const errorText = (await page.getByRole("alert").textContent()) ?? "";
      expect(errorText.toLowerCase()).toMatch(/reintent|recarg|conex|intenta/);
      expect(errorText.toLowerCase()).not.toContain("network");

      // La app sigue operativa: se puede volver a escribir y enviar.
      await expect(input).toBeEnabled();
      await expect(input).toHaveValue("");
    } finally {
      server.close();
    }
  });
});

test.describe("CA-23/CA-24 — la request a /api/chat lleva contexto del módulo actual y fragmentos RAG", () => {
  test("estando en /modulo/mod01, el system de la petición real incluye el módulo actual y chunks de contexto no vacíos", async ({
    page,
  }) => {
    const { server, port } = await startChatServer([ndjsonLine("Un grafo tiene nodos.", true)], {
      delayMs: 50,
    });

    try {
      await routeToLocalServer(page, port);
      await page.goto("/modulo/mod01");

      const asistente = page.getByLabel(ASISTENTE_LABEL);
      await expect(asistente.getByText("Conectado", { exact: true })).toBeVisible({
        timeout: 5000,
      });

      const requestBodyPromise = page.waitForRequest(
        (req) => req.url().includes("/ollama/api/chat") && req.method() === "POST",
      );

      const input = asistente.getByRole("textbox");
      // Término presente en el contenido de mod01 (paso "Explica simple"):
      // garantiza que `retrieve` devuelva >=1 chunk real (CA-24), no un
      // resultado vacío por falta de coincidencia léxica.
      await input.fill("¿Qué es un grafo en LangGraph?");
      await asistente.getByRole("button", { name: "Enviar" }).click();

      const request = await requestBodyPromise;
      const body = request.postDataJSON() as { messages: { role: string; content: string }[] };

      const systemMessage = body.messages.find((m) => m.role === "system");
      expect(systemMessage).toBeDefined();

      // CA-23: el system referencia el módulo actual (id + tema/título).
      expect(systemMessage!.content).toContain("mod01");
      expect(systemMessage!.content).toContain("¿Qué es LangGraph? Grafos vs. cadenas");

      // CA-24: el bloque de contexto RAG está presente y no vacío (contiene
      // fragmentos reales del contenido del módulo, no un placeholder).
      expect(systemMessage!.content).toMatch(/contexto del curso/i);
      expect(systemMessage!.content).toContain("grafo");

      await expect(page.getByTestId("chat-message-assistant").last()).toContainText(
        "Un grafo tiene nodos.",
        { timeout: 5000 },
      );
    } finally {
      server.close();
    }
  });
});

test.describe("US-16 — limpiar conversación", () => {
  test("el botón 'Limpiar conversación' vacía el historial", async ({ page }) => {
    const { server, port } = await startChatServer([ndjsonLine("hola de vuelta", true)], {
      delayMs: 100,
    });

    try {
      await routeToLocalServer(page, port);
      await page.goto("/");

      const asistente = page.getByLabel(ASISTENTE_LABEL);
      await expect(asistente.getByText("Conectado", { exact: true })).toBeVisible({
        timeout: 5000,
      });

      const input = asistente.getByRole("textbox");
      await input.fill("hola");
      await asistente.getByRole("button", { name: "Enviar" }).click();

      await expect(page.getByTestId("chat-message-assistant").last()).toContainText(
        "hola de vuelta",
        { timeout: 5000 },
      );

      await asistente.getByRole("button", { name: "Limpiar conversación" }).click();

      await expect(page.getByTestId("chat-message-user")).toHaveCount(0);
      await expect(page.getByTestId("chat-message-assistant")).toHaveCount(0);
      await expect(
        asistente.getByText("Aún no hay mensajes. Escribe tu primera pregunta.", {
          exact: true,
        }),
      ).toBeVisible();
    } finally {
      server.close();
    }
  });
});
