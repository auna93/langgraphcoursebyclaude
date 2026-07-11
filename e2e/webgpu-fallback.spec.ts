import { expect, test } from "@playwright/test";

/**
 * Cierre M5 (integrator) — SLICES.md "Cierre M5", bloque de verificación de
 * red (CA-47/CA-40/CA-41) y regresión CA-41 (WebGPU no soportado). Contrato:
 * `docs/arch/ARCHITECTURE-M5-WEBLLM.md` §9.3/§9.4.1/§9.8.
 *
 * Corre contra el BUILD de producción (proyecto Playwright "chromium", mismo
 * servidor que `e2e/ollama-status.spec.ts`/`e2e/chat.spec.ts`) con el cliente
 * WebLLM REAL de `src/assistant/webllmClient.ts` — SIN sustituir ningún
 * método: solo se falsea `navigator.gpu` (vía `page.addInitScript`, que se
 * ejecuta ANTES de que cargue cualquier script de la app) para forzar
 * feature-detection positiva o negativa de forma determinista, sin depender
 * de si el Chromium headless de esta máquina soporta WebGPU de verdad (R18).
 *
 * NUNCA se acepta la oferta de descarga en este archivo (CA-40b/42/43/44 con
 * el motor "warm" completo se prueban en `e2e/webgpu/webgpu-fallback-flow.spec.ts`,
 * con el cliente sustituido por un doble — R17: "NO intentes cargar el modelo
 * real de varios GB en el e2e"): aquí solo se ejercita `detectSupport()` e
 * `isModelCached()` reales, ambos locales por contrato (§9.3), para anclar
 * con el código de producción sin mocks la propiedad de "0 requests" antes de
 * aceptar.
 */

const ASISTENTE_LABEL = "Asistente";
const MODEL = "qwen2.5-coder:14b";
const ARTIFACT_HOST_RE = /huggingface\.co|raw\.githubusercontent\.com/i;

/** Falsea `navigator.gpu` ANTES de que cargue cualquier script de la app
 *  (`addInitScript` se inyecta en cada documento/navegación de la página,
 *  incluida la primera). `supported=false` borra la propiedad por completo
 *  (equivalente a un navegador sin WebGPU); `supported=true` expone un
 *  `requestAdapter()` que resuelve un objeto no nulo (adapter "utilizable"). */
async function stubNavigatorGpu(
  page: import("@playwright/test").Page,
  supported: boolean,
): Promise<void> {
  await page.addInitScript((isSupported: boolean) => {
    if (!isSupported) {
      Reflect.deleteProperty(window.navigator as unknown as Record<string, unknown>, "gpu");
      return;
    }
    Object.defineProperty(window.navigator, "gpu", {
      configurable: true,
      value: {
        requestAdapter: async () => ({ __fakeAdapter: true }),
      },
    });
  }, supported);
}

function trackForeignRequests(page: import("@playwright/test").Page): {
  all: string[];
  artifactHost: string[];
} {
  const all: string[] = [];
  const artifactHost: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    const origin = new URL(url).origin;
    const appOrigin = new URL(page.url()).origin;
    if (origin !== appOrigin) {
      all.push(url);
      if (ARTIFACT_HOST_RE.test(url)) artifactHost.push(url);
    }
  });
  return { all, artifactHost };
}

test.describe("CA-41 — WebGPU NO soportado (feature-detection negativa): comportamiento CA-19/20 exacto", () => {
  test("Ollama 'Sin conexión' + WebGPU ausente ⇒ literales CA-19 intactos, sin card, 0 requests a hosts de artefactos", async ({
    page,
  }) => {
    await stubNavigatorGpu(page, false);
    const { artifactHost } = trackForeignRequests(page);

    await page.route("**/ollama/**", (route) => route.abort("connectionrefused"));

    await page.goto("/");

    const asistente = page.getByLabel(ASISTENTE_LABEL);
    await expect(asistente.getByText("Sin conexión", { exact: true })).toBeVisible({
      timeout: 5000,
    });
    await expect(asistente.getByText("ollama serve", { exact: true })).toBeVisible();
    await expect(asistente.getByRole("textbox")).toBeDisabled();

    // CA-41: sin WebGPU, la card de oferta/progreso NUNCA se renderiza.
    await expect(page.getByTestId("webgpu-fallback-card")).toHaveCount(0);

    // Deja pasar tiempo para que corra al menos un health-check adicional y
    // (si hubiera un hueco de wiring) una posible evaluación del fallback.
    await page.waitForTimeout(500);

    expect(artifactHost).toEqual([]);
  });

  test("Ollama 'Modelo no instalado' + WebGPU ausente ⇒ literales CA-20 intactos, sin card", async ({
    page,
  }) => {
    await stubNavigatorGpu(page, false);
    const { artifactHost } = trackForeignRequests(page);

    await page.route("**/ollama/api/tags", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ models: [{ name: "llama3:8b" }] }),
      }),
    );

    await page.goto("/");

    const asistente = page.getByLabel(ASISTENTE_LABEL);
    await expect(asistente.getByText("Modelo no instalado", { exact: true })).toBeVisible({
      timeout: 5000,
    });
    await expect(asistente.getByText(`ollama pull ${MODEL}`, { exact: true })).toBeVisible();
    await expect(page.getByTestId("webgpu-fallback-card")).toHaveCount(0);

    await page.waitForTimeout(500);
    expect(artifactHost).toEqual([]);
  });
});

test.describe("CA-40/CA-41 — 0 peticiones al host de artefactos mientras Ollama está 'connected'/'checking'", () => {
  test("con Ollama conectado, el fallback ni se activa ni se ofrece, pese a que WebGPU sí está soportado", async ({
    page,
  }) => {
    await stubNavigatorGpu(page, true);
    const { artifactHost } = trackForeignRequests(page);

    await page.route("**/ollama/api/tags", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ models: [{ name: MODEL }] }),
      }),
    );

    await page.goto("/");

    const asistente = page.getByLabel(ASISTENTE_LABEL);
    await expect(asistente.getByText("Conectado", { exact: true })).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId("webgpu-fallback-card")).toHaveCount(0);

    await page.waitForTimeout(500);
    expect(artifactHost).toEqual([]);
  });
});

test.describe("CA-40b — oferta real (cliente WebLLM de producción, sin mocks) con 0 requests antes de aceptar", () => {
  test("WebGPU soportado (real detectSupport) + Ollama degradado ⇒ aparece la oferta y NUNCA se llamó al host de artefactos", async ({
    page,
  }) => {
    await stubNavigatorGpu(page, true);
    const { artifactHost } = trackForeignRequests(page);

    await page.route("**/ollama/**", (route) => route.abort("connectionrefused"));

    await page.goto("/");

    const asistente = page.getByLabel(ASISTENTE_LABEL);
    await expect(asistente.getByText("Sin conexión", { exact: true })).toBeVisible({
      timeout: 5000,
    });

    // CA-40b: navegador fresco ⇒ nada en caché ⇒ `isModelCached()` real
    // (100% local, `hasModelInCache`) resuelve false ⇒ se muestra la oferta,
    // NUNCA una carga automática.
    const card = page.getByTestId("webgpu-fallback-card");
    await expect(card).toBeVisible({ timeout: 5000 });
    await expect(card.getByText("Asistente de respaldo (WebGPU)")).toBeVisible();
    await expect(card.getByRole("button", { name: "Descargar y activar" })).toBeVisible();

    // El chat sigue deshabilitado (active === null: la oferta no equivale a
    // motor activo hasta aceptar y cargar).
    await expect(asistente.getByRole("textbox")).toBeDisabled();

    // CA-40/41/47: NINGUNA petición salió hacia el host de artefactos del
    // modelo — `detectSupport()`/`isModelCached()` son 100% locales.
    expect(artifactHost).toEqual([]);
  });
});
