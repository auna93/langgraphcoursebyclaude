import { expect, test } from "@playwright/test";

/**
 * Indicador de estado de Ollama (slice S8, SLICES.md §S8, contrato C-OLLAMA).
 *
 * Independiente de la implementación: solo se apoya en texto visible en la
 * UI, dentro de la región del asistente (`aria-label="Asistente"`, ya
 * expuesta desde S0 en `src/app/Layout.tsx`).
 *
 * Se intercepta la red a nivel de navegador (`page.route`) en vez de levantar
 * un servidor HTTP real en el puerto 11434: esto hace los tests deterministas
 * e independientes de si hay (o no) un Ollama real corriendo en la máquina
 * donde se ejecutan (el proxy de Vite `/ollama` — ADR-06 — sigue siendo la
 * única ruta same-origin que la app usa; interceptar `**\/ollama/**` cubre
 * exactamente esa superficie sin tocar el puerto real). El proxy en sí
 * (`/ollama` → `localhost:11434`) ya se verifica aparte en
 * `e2e/smoke.spec.ts`.
 */

const ASISTENTE_LABEL = "Asistente";
const MODEL = "qwen2.5-coder:14b";

test.describe("CA-18 — Ollama conectado con el modelo instalado", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/ollama/api/tags", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ models: [{ name: MODEL }] }),
      }),
    );
  });

  test("el indicador muestra 'Conectado' en <=5 s tras cargar", async ({ page }) => {
    await page.goto("/");

    const asistente = page.getByLabel(ASISTENTE_LABEL);
    await expect(asistente.getByText("Conectado", { exact: true })).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe("CA-20 — Ollama corriendo sin el modelo instalado", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/ollama/api/tags", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ models: [{ name: "llama3:8b" }] }),
      }),
    );
  });

  test("el indicador muestra 'Modelo no instalado' y el comando literal de pull", async ({
    page,
  }) => {
    await page.goto("/");

    const asistente = page.getByLabel(ASISTENTE_LABEL);
    await expect(
      asistente.getByText("Modelo no instalado", { exact: true }),
    ).toBeVisible({ timeout: 5000 });

    // CA-20: comando literal exacto, sin envolver ni truncar.
    await expect(
      asistente.getByText(`ollama pull ${MODEL}`, { exact: true }),
    ).toBeVisible();
  });
});

test.describe("CA-19 — Ollama apagado (o inalcanzable)", () => {
  test.beforeEach(async ({ page }) => {
    // Simula Ollama apagado / conexión rechazada abortando toda petición
    // dirigida al proxy `/ollama`, sin depender de qué haya (o no) escuchando
    // realmente en localhost:11434 en la máquina que ejecuta el test.
    await page.route("**/ollama/**", (route) => route.abort("connectionrefused"));
  });

  test("el indicador muestra 'Sin conexión', el input del chat se deshabilita y aparece 'ollama serve'", async ({
    page,
  }) => {
    await page.goto("/");

    const asistente = page.getByLabel(ASISTENTE_LABEL);
    await expect(asistente.getByText("Sin conexión", { exact: true })).toBeVisible({
      timeout: 5000,
    });

    // CA-19: comando literal exacto.
    await expect(asistente.getByText("ollama serve", { exact: true })).toBeVisible();

    // El input del chat queda deshabilitado mientras no esté "Conectado".
    await expect(asistente.getByRole("textbox")).toBeDisabled();
  });
});

test.describe("CA-25 — únicas peticiones de red salen hacia el propio origen (vía proxy /ollama, ADR-06)", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/ollama/api/tags", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ models: [{ name: MODEL }] }),
      }),
    );
  });

  test("ninguna request del asistente sale hacia un origen distinto al de la app", async ({
    page,
  }) => {
    const foreignRequests: string[] = [];

    await page.goto("/");
    const appOrigin = new URL(page.url()).origin;

    page.on("request", (req) => {
      const origin = new URL(req.url()).origin;
      if (origin !== appOrigin) foreignRequests.push(req.url());
    });

    const asistente = page.getByLabel(ASISTENTE_LABEL);
    await expect(asistente.getByText("Conectado", { exact: true })).toBeVisible({
      timeout: 5000,
    });

    // Deja pasar tiempo suficiente para que se dispare al menos un
    // health-check adicional: TODA request (incluidas las del asistente hacia
    // `/ollama`) debe quedarse en el mismo origen que la app (same-origin,
    // vía proxy), nunca un host/puerto/protocolo distinto.
    await page.waitForTimeout(500);

    expect(foreignRequests).toEqual([]);
  });
});
