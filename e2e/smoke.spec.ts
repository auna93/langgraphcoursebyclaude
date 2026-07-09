import { createServer, type Server } from "node:http";

import { expect, test } from "@playwright/test";

/**
 * Humo de S0 (ver SLICES.md §S0):
 *  - la app carga
 *  - layout con sidebar visible
 *  - navegación entre rutas (/ y /modulo/:id)
 *  - el proxy Vite /ollama → localhost:11434 responde (ADR-06), verificado
 *    contra un mock local del servidor Ollama (sin red externa, CA-25).
 */

test.describe("shell S0", () => {
  test("la app carga y el layout con sidebar es visible", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Temario" }),
    ).toBeVisible();
    await expect(page.getByLabel("Asistente")).toBeVisible();
  });

  test("navega entre / y /modulo/:id", async ({ page }) => {
    await page.goto("/");
    await page.goto("/modulo/mod01");

    // Desde S2, /modulo/mod01 renderiza el contenido real del módulo (ya no
    // el placeholder de S0), con las 4 secciones Feynman.
    await expect(
      page.getByRole("heading", { name: /¿Qué es LangGraph\?/ }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Volver al temario" }).click();
    await expect(
      page.getByRole("heading", { name: "Temario" }),
    ).toBeVisible();
  });
});

test.describe("proxy /ollama (ADR-06)", () => {
  let mockOllama: Server | undefined;
  /**
   * Aislamiento de contención de puerto (integración M1): en máquinas de
   * desarrollo puede haber un Ollama REAL ya escuchando en 11434 (el mismo
   * puerto que ADR-06 fija para el proxy). Intentar `listen(11434)` en ese
   * caso falla con EADDRINUSE; en vez de dejar el `beforeAll` colgado o
   * reventar la suite, se detecta el conflicto y se degrada a verificar
   * solo la FORMA del contrato (`/ollama/api/tags` responde 200 con un
   * array `models`) en vez del valor exacto del mock — el proxy same-origin
   * (que es lo único que este test certifica, CA-25/ADR-06) ya queda
   * probado igual: la petición nunca sale a un host externo, solo reenvía a
   * localhost:11434, sea el mock o el Ollama real de la máquina.
   */
  let usedRealOllama = false;

  test.beforeAll(async () => {
    const server = createServer((req, res) => {
      if (req.url === "/api/tags") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ models: [{ name: "qwen2.5-coder:14b" }] }));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    const bound = await new Promise<boolean>((resolve) => {
      server.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          resolve(false);
        } else {
          throw err;
        }
      });
      server.listen(11434, () => resolve(true));
    });

    if (bound) {
      mockOllama = server;
    } else {
      usedRealOllama = true;
    }
  });

  test.afterAll(async () => {
    if (!mockOllama) return;
    await new Promise<void>((resolve, reject) =>
      mockOllama!.close((err) => (err ? reject(err) : resolve())),
    );
  });

  test("el proxy same-origin reenvía a localhost:11434 (mock, o al Ollama real si el puerto ya está ocupado)", async ({
    request,
  }) => {
    const response = await request.get("/ollama/api/tags");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.models)).toBe(true);

    if (!usedRealOllama) {
      expect(body.models[0].name).toBe("qwen2.5-coder:14b");
    }
  });
});
