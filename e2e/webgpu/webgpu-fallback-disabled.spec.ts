import { expect, test } from "@playwright/test";

/**
 * Cierre M5 (integrator) — SLICES.md "Cierre M5": regresión CA-19/CA-20 con
 * el fallback WebGPU DESHABILITADO por configuración (`VITE_WEBLLM_ENABLED=
 * false`, A-11/CA-41, E8 de `docs/arch/ARCHITECTURE-M5-WEBLLM.md` §9.4.1).
 *
 * `CONFIG.webllm.enabled` (`src/config.ts`) se resuelve UNA vez de
 * `import.meta.env` al construir/servir la app — no es togleable en runtime.
 * Probar este caso de extremo a extremo (más allá del unit test exhaustivo
 * de `engineStore.test.ts`, describe "E8 — CONFIG.webllm.enabled === false")
 * exige un build + preview PROPIOS con esa variable ya fijada (proyecto
 * Playwright "webgpu-fallback-disabled", `playwright.config.ts`), para
 * confirmar el WIRING real: `import.meta.env` → `CONFIG.webllm.enabled` →
 * `engineStore`/`WebGpuFallbackCard` → terminal CA-19/20 exacto, sin ningún
 * rastro de UI del fallback.
 */

const ASISTENTE_LABEL = "Asistente";
const MODEL = "qwen2.5-coder:14b";
const ARTIFACT_HOST_RE = /huggingface\.co|raw\.githubusercontent\.com/i;

test.describe("CA-41 — fallback deshabilitado (VITE_WEBLLM_ENABLED=false): comportamiento CA-19 exacto", () => {
  test("Ollama 'Sin conexión' con el fallback desactivado ⇒ literales CA-19 intactos, sin card, 0 requests a hosts de artefactos", async ({
    page,
  }) => {
    const artifactHost: string[] = [];
    page.on("request", (req) => {
      if (ARTIFACT_HOST_RE.test(req.url())) artifactHost.push(req.url());
    });

    await page.route("**/ollama/**", (route) => route.abort("connectionrefused"));

    await page.goto("/");

    const asistente = page.getByLabel(ASISTENTE_LABEL);
    await expect(asistente.getByText("Sin conexión", { exact: true })).toBeVisible({
      timeout: 5000,
    });
    await expect(asistente.getByText("ollama serve", { exact: true })).toBeVisible();
    await expect(asistente.getByRole("textbox")).toBeDisabled();

    // E8/CA-41: con el fallback deshabilitado, la card NUNCA se renderiza,
    // pase lo que pase con Ollama (0 evaluación de WebGPU en absoluto).
    await expect(page.getByTestId("webgpu-fallback-card")).toHaveCount(0);
    await expect(page.getByText("Respaldo WebGPU activo")).toHaveCount(0);

    await page.waitForTimeout(500);
    expect(artifactHost).toEqual([]);
  });

  test("Ollama 'Modelo no instalado' con el fallback desactivado ⇒ literales CA-20 intactos, sin card", async ({
    page,
  }) => {
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
  });
});
