import type { Server } from "node:http";
import { createServer } from "node:http";

import { expect, test } from "@playwright/test";

/**
 * Explicación Feynman — paso 1 (slice S5, SLICES.md §S5) — CA-13, CA-14.
 *
 * Independiente de la implementación de UI: navega a `/modulo/mod01`, entra
 * en la sección "Explica simple" (CA-02, ya en PASS desde S2) y usa
 * únicamente contrato PÚBLICO/observable desde el navegador:
 *   - un único cuadro de texto editable dentro del panel activo;
 *   - un botón "Guardar" (guardado explícito, SLICES.md §S5) — si no existe,
 *     se confía en el guardado por debounce esperando a que persista solo;
 *   - persistencia real en `localStorage` bajo la clave `lgcourse.progress.v1`
 *     (C-PROGRESS, ARCHITECTURE.md §4), verificable con un reload real de página.
 *
 * No depende de Ollama (puerto 11434): esta sección no invoca el asistente
 * (el botón "pedir feedback" está deshabilitado hasta S11), así que corre en
 * aislamiento total de cualquier proceso de Ollama real que pueda estar
 * escuchando en la máquina.
 */

const PROGRESS_KEY = "lgcourse.progress.v1";

const EXPLICACION_199 = "x".repeat(199);
const EXPLICACION_200 = "x".repeat(200);
const EXPLICACION_PERSISTENCIA =
  "Explicación de prueba con tildes y eñe: ñ, á, é, í, ó, ú — para validar que " +
  "el texto reaparece INTEGRO tras recargar la página, sin truncarse ni alterarse.";

test.beforeEach(async ({ page }) => {
  await page.goto("/modulo/mod01");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("tab", { name: "Explica simple" }).click();
});

async function fillExplicacion(page: import("@playwright/test").Page, texto: string) {
  const panel = page.getByRole("tabpanel");
  const textarea = panel.getByRole("textbox");
  await textarea.fill(texto);
  await textarea.blur();

  // Guardado explícito si el botón existe; si no, se confía en el debounce.
  const guardar = panel.getByRole("button", { name: /guardar/i });
  if (await guardar.count()) {
    await guardar.click();
  }
}

test.describe("Explicación Feynman — umbral de 200 caracteres visible (CA-13)", () => {
  test("199 caracteres NO muestra el indicador de completado", async ({ page }) => {
    await fillExplicacion(page, EXPLICACION_199);

    const panel = page.getByRole("tabpanel");
    await expect(panel.getByText(/completad/i)).toHaveCount(0);
  });

  test("200 caracteres exactos SÍ muestra el indicador de completado", async ({ page }) => {
    await fillExplicacion(page, EXPLICACION_200);

    const panel = page.getByRole("tabpanel");
    await expect(panel.getByText(/completad/i).first()).toBeVisible();
  });
});

test.describe("Explicación Feynman — persistencia íntegra tras reload real (CA-14)", () => {
  test("guardar una explicación y recargar la página la restaura EXACTA en el mismo módulo", async ({
    page,
  }) => {
    await fillExplicacion(page, EXPLICACION_PERSISTENCIA);

    // Espera a que la persistencia (explícita o por debounce) llegue a
    // localStorage ANTES de recargar, para no crear una carrera artificial.
    await expect
      .poll(
        async () => {
          const raw = await page.evaluate((key) => window.localStorage.getItem(key), PROGRESS_KEY);
          return raw ?? "";
        },
        { timeout: 10_000 },
      )
      .toContain("Explicación de prueba con tildes");

    await page.reload();
    await page.getByRole("tab", { name: "Explica simple" }).click();

    const panelTrasReload = page.getByRole("tabpanel");
    await expect(panelTrasReload.getByRole("textbox")).toHaveValue(EXPLICACION_PERSISTENCIA);
  });

  test("la explicación guardada persiste bajo la clave 'lgcourse.progress.v1'", async ({ page }) => {
    await fillExplicacion(page, EXPLICACION_200);

    await expect
      .poll(async () => page.evaluate((key) => window.localStorage.getItem(key), PROGRESS_KEY), {
        timeout: 10_000,
      })
      .not.toBeNull();

    const raw = await page.evaluate((key) => window.localStorage.getItem(key), PROGRESS_KEY);
    const parsed = JSON.parse(raw as string);
    expect(parsed.state.modules.mod01.explicacion.texto).toBe(EXPLICACION_200);
  });
});

/**
 * CA-27/A-10 — "Feedback Feynman con un clic" (slice S11, SLICES.md §S11).
 *
 * Igual estrategia de red que `e2e/chat.spec.ts` (S9): se intercepta
 * `/ollama/**` y se redirige a un servidor HTTP local que sí puede emitir
 * NDJSON troceado en tiempo real. Aquí, además, se inspecciona el CUERPO de
 * la petición a `/api/chat` para verificar que contiene la explicación
 * guardada del alumno (CA-27: "la explicación se envía al asistente como
 * mensaje"), sin asumir el copy exacto que compone `buildFeynmanFeedbackMessage`.
 */
const MODEL = "qwen2.5-coder:14b";

function ndjsonLine(content: string, done = false): string {
  return JSON.stringify({ message: { role: "assistant", content }, done }) + "\n";
}

function startChatServer(chunks: string[]): Promise<{ server: Server; port: number; lastBody: () => string }> {
  let lastBody = "";

  const server = createServer((req, res) => {
    if (req.url?.endsWith("/api/tags")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ models: [{ name: MODEL }] }));
      return;
    }

    if (req.url?.endsWith("/api/chat")) {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        lastBody = raw;
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        let i = 0;
        const sendNext = () => {
          if (i >= chunks.length) {
            res.end();
            return;
          }
          res.write(chunks[i]);
          i += 1;
          setTimeout(sendNext, 150);
        };
        sendNext();
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, port, lastBody: () => lastBody });
    });
  });
}

async function routeToLocalServer(page: import("@playwright/test").Page, port: number) {
  await page.route("**/ollama/**", async (route) => {
    const original = new URL(route.request().url());
    await route.continue({ url: `http://127.0.0.1:${port}${original.pathname}` });
  });
}

test.describe("CA-27/A-10 — pedir feedback envía la explicación y streamea la respuesta", () => {
  test("con una explicación completa guardada, 'pedir feedback' la envía y la respuesta llega incremental", async ({
    page,
  }) => {
    const EXPLICACION =
      "Un grafo de LangGraph es una máquina de estados donde cada nodo transforma el estado " +
      "compartido y las aristas deciden el siguiente paso a seguir, incluyendo ciclos " +
      "condicionales, hasta llegar finalmente al nodo especial END.";

    const { server, port, lastBody } = await startChatServer([
      ndjsonLine("Buen intento, "),
      ndjsonLine("pero te falta explicar los checkpoints."),
      ndjsonLine("", true),
    ]);

    try {
      await routeToLocalServer(page, port);
      await page.goto("/modulo/mod01");
      await page.evaluate(() => window.localStorage.clear());
      await page.reload();
      await page.getByRole("tab", { name: "Explica simple" }).click();

      const panel = page.getByRole("tabpanel");
      await fillExplicacion(page, EXPLICACION);

      const asistente = page.getByLabel("Asistente");
      await expect(asistente.getByText("Conectado", { exact: true })).toBeVisible({
        timeout: 5000,
      });

      const boton = panel.getByRole("button", { name: /pedir feedback/i });
      await expect(boton).toBeEnabled();
      await boton.click();

      // La explicación viaja en el cuerpo de la petición real a /api/chat.
      await expect
        .poll(() => lastBody(), { timeout: 5000 })
        .toContain("Un grafo de LangGraph es una máquina de estados");

      const respuesta = page.getByTestId("chat-message-assistant").last();
      await expect(respuesta).toContainText("Buen intento,", { timeout: 5000 });
      await expect(respuesta).toContainText(
        "Buen intento, pero te falta explicar los checkpoints.",
        { timeout: 5000 },
      );
    } finally {
      server.close();
    }
  });
});
