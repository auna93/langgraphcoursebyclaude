import { expect, test } from "@playwright/test";

/**
 * Vista de módulo (slice S2, SLICES.md §S2) — CA-02, CA-29, CA-05.
 *
 * Independiente de la implementación de UI: se apoya solo en el contenido
 * real de mod01 (registry, slice S1 ya en PASS) y en el contrato de
 * accesibilidad ESTÁNDAR de tabs (WAI-ARIA `role="tab"` / `role="tabpanel"`,
 * ver `src/pages/ModuloPage.test.tsx` para la justificación de esta
 * decisión de contrato) que exige la navegación interna de SLICES.md §S2,
 * más el contrato de bloque de código fijado por `CodeBlock.test.tsx`:
 * contenedor `[data-testid="code-block"]` con un botón cuyo nombre
 * accesible matchea /copiar/i.
 */

const TITULOS_EN_ORDEN = [
  "Explica simple",
  "Detecta tus gaps",
  "Llena los gaps",
  "Refina y simplifica",
];

test.describe("Vista de módulo — 4 secciones Feynman en orden (CA-02)", () => {
  test("mod01 expone las 4 secciones como tabs, con los títulos exactos y en orden", async ({
    page,
  }) => {
    await page.goto("/modulo/mod01");

    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(4);
    await expect(tabs).toHaveText(TITULOS_EN_ORDEN);
  });

  test("navegar a cada sección muestra su heading exacto en el panel activo", async ({ page }) => {
    await page.goto("/modulo/mod01");

    for (const titulo of TITULOS_EN_ORDEN) {
      await page.getByRole("tab", { name: titulo }).click();
      const panel = page.getByRole("tabpanel");
      await expect(panel.getByRole("heading", { name: titulo })).toBeVisible();
    }
  });

  test("mod02 también respeta las 4 secciones en el mismo orden", async ({ page }) => {
    await page.goto("/modulo/mod02");

    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveText(TITULOS_EN_ORDEN);
  });
});

/**
 * Normaliza EOL (CRLF/LF) y espacios finales de línea.
 *
 * `page.locator(...).innerText()` es un DOM readout (pasa por el layout del
 * navegador) mientras que el botón "copiar" usa `navigator.clipboard.writeText`
 * con el string fuente exacto (verificado ya, EXACTO carácter a carácter, por
 * los unit tests de `CodeBlock` con `writeText` mockeado). Entre ambas rutas
 * pueden aparecer diferencias de espacios finales de línea / salto de línea
 * final (EOL) que no son parte del contenido real copiado, sino artefactos de
 * cómo el navegador expone `innerText()` sobre el bloque renderizado por
 * Shiki. Esta normalización NO relaja la comparación de contenido: sigue
 * exigiendo igualdad exacta línea por línea, carácter por carácter, tras
 * quitar únicamente espacios finales de línea y CRLF→LF.
 */
function normalizeForClipboardComparison(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n");
}

test.describe("Vista de módulo — copiar bloques de código (CA-29)", () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  });

  test("cada bloque de código de mod01 tiene botón copiar y copia su contenido EXACTO", async ({
    page,
  }) => {
    await page.goto("/modulo/mod01");

    // El bloque de código de mod01 vive en "Llena los gaps" (API real con
    // ejemplo de código, C-CONTENT `SeccionProfundiza.contenidoMd`).
    await page.getByRole("tab", { name: "Llena los gaps" }).click();

    const codeBlocks = page.getByRole("tabpanel").locator('[data-testid="code-block"]');
    const total = await codeBlocks.count();
    expect(total, "mod01 debe tener al menos un bloque de código en 'Llena los gaps'").toBeGreaterThan(
      0,
    );

    for (let i = 0; i < total; i++) {
      const block = codeBlocks.nth(i);
      const copyButton = block.getByRole("button", { name: /copiar/i });
      await expect(copyButton).toBeVisible();

      const expectedCode = await block.locator("code").innerText();

      await copyButton.click();

      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(normalizeForClipboardComparison(clipboardText)).toBe(
        normalizeForClipboardComparison(expectedCode),
      );
    }
  });
});

test.describe("Vista de módulo — quiz (S4) y reto de código (S7) reales, integrados en los slots", () => {
  test("mod01 muestra el quiz interactivo real y el `ChallengeCard` real (editor + ejecutar)", async ({
    page,
  }) => {
    await page.goto("/modulo/mod01");

    await page.getByRole("tab", { name: "Detecta tus gaps" }).click();
    await expect(
      page.getByRole("tabpanel").locator('[data-testid="quiz-slot"]').first(),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Llena los gaps" }).click();
    const retoSlot = page.getByRole("tabpanel").locator('[data-testid="reto-slot"]').first();
    await expect(retoSlot).toBeVisible();

    // El editor de retos real (S7, `ChallengeCard`/CodeMirror) expone su botón "ejecutar".
    await expect(retoSlot.getByRole("button", { name: /ejecutar/i })).toBeVisible();
  });
});

test.describe("Vista de módulo — UI en español (CA-05)", () => {
  test("los textos de navegación y botones de la vista están en español", async ({ page }) => {
    await page.goto("/modulo/mod01");

    await expect(page.getByRole("link", { name: "Volver al temario" })).toBeVisible();

    await page.getByRole("tab", { name: "Llena los gaps" }).click();
    await expect(page.getByRole("button", { name: /copiar/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^copy$/i })).toHaveCount(0);

    const bodyText = (await page.locator("body").innerText()).toLowerCase();
    expect(bodyText).not.toMatch(/\b(loading|welcome|click here|submit|cancel)\b/);
  });
});
