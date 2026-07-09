import { expect, test } from "@playwright/test";

/**
 * Cierre M4 (integrator, SLICES.md): "e2e: un módulo enriquecido navega pasos →
 * mini-ejercicio (runner) → 'Usa la IA' (prompt copiable al chat existente) →
 * 'En tu máquina' (bloques copiables). Build y e2e en verde."
 *
 * Usa mod01 (piloto SE1, ya `enriquecido: true`) como fixture real del
 * registry. No introduce UI nueva: se apoya en los `data-testid` existentes
 * de `ModuloPage.tsx` (SE0 glue: "pasos-guiados", "paso-guiado", "usa-la-ia",
 * "tutorial-local") y en el contrato de `CodeBlock` ya verificado por
 * `e2e/modulo.spec.ts` (botón cuyo nombre accesible matchea /copiar/i).
 *
 * No rompe CA-02 (S2): las 4 secciones Feynman siguen en el mismo orden con
 * los mismos títulos exactos.
 */

const TITULOS_EN_ORDEN = [
  "Explica simple",
  "Detecta tus gaps",
  "Llena los gaps",
  "Refina y simplifica",
];

test.describe("Módulo enriquecido (M4) — pasos, Usa la IA y En tu máquina, sin romper CA-02", () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  });

  test("mod01 conserva las 4 secciones Feynman en orden exacto (CA-02) tras el enriquecimiento", async ({
    page,
  }) => {
    await page.goto("/modulo/mod01");

    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(4);
    await expect(tabs).toHaveText(TITULOS_EN_ORDEN);
  });

  test("mod01 renderiza los pasos guiados con su mini-ejercicio dentro de la sección", async ({
    page,
  }) => {
    await page.goto("/modulo/mod01");

    // Los `pasos` del piloto (SE1) viven en la sección "Llena los gaps".
    await page.getByRole("tab", { name: "Llena los gaps" }).click();

    const panel = page.getByRole("tabpanel");
    const pasos = panel.locator('[data-testid="pasos-guiados"]');
    await expect(pasos).toBeVisible();

    const pasoItems = pasos.locator('[data-testid="paso-guiado"]');
    const total = await pasoItems.count();
    expect(total, "mod01 debe exponer ≥5 pasos guiados (CA-30)").toBeGreaterThanOrEqual(5);

    // Al menos un paso incluye un mini-ejercicio (ChallengeCard real, S7).
    const pasoConEjercicio = pasos.locator('[data-testid="reto-slot"]').first();
    await expect(pasoConEjercicio).toBeVisible();
    await expect(pasoConEjercicio.getByRole("button", { name: /ejecutar/i })).toBeVisible();
  });

  test("mod01 muestra el bloque 'Usa la IA' con prompt(s) copiable(s)", async ({ page }) => {
    await page.goto("/modulo/mod01");

    const usaLaIa = page.locator('[data-testid="usa-la-ia"]');
    await expect(usaLaIa).toBeVisible();
    await expect(usaLaIa.getByRole("heading", { name: "Usa la IA", exact: true })).toBeVisible();

    const promptBlock = usaLaIa.locator('[data-testid="code-block"]').first();
    await expect(promptBlock).toBeVisible();

    const copyButton = promptBlock.getByRole("button", { name: /copiar/i });
    await expect(copyButton).toBeVisible();

    const expectedPrompt = await promptBlock.locator("code").innerText();
    await copyButton.click();
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText.trim()).toBe(expectedPrompt.trim());
  });

  test("mod01 muestra 'En tu máquina' con comandos PowerShell/bash y código copiables, y salida esperada", async ({
    page,
  }) => {
    await page.goto("/modulo/mod01");

    const tutorial = page.locator('[data-testid="tutorial-local"]');
    await expect(tutorial).toBeVisible();
    await expect(tutorial.getByRole("heading", { name: /en tu máquina/i })).toBeVisible();

    const codeBlocks = tutorial.locator('[data-testid="code-block"]');
    const total = await codeBlocks.count();
    // ≥1 bloque de setup (PowerShell) + ≥1 (bash) + ≥1 de código LangGraph +
    // 1 de salida esperada (CA-35).
    expect(total).toBeGreaterThanOrEqual(4);

    for (let i = 0; i < total; i++) {
      const block = codeBlocks.nth(i);
      await expect(block.getByRole("button", { name: /copiar/i })).toBeVisible();
    }
  });

  test("las secciones 'Usa la IA' y 'En tu máquina' son visibles sin depender de la pestaña activa", async ({
    page,
  }) => {
    await page.goto("/modulo/mod01");

    await page.getByRole("tab", { name: "Explica simple" }).click();
    await expect(page.locator('[data-testid="usa-la-ia"]')).toBeVisible();
    await expect(page.locator('[data-testid="tutorial-local"]')).toBeVisible();
  });
});
