import { expect, test } from "@playwright/test";

/**
 * Temario (slice S1, SLICES.md §S1) — CA-01 y CA-04.
 *
 * Independiente de la implementación de UI: solo se apoya en el temario
 * fijado en PRD.md §6 (16 módulos, títulos reales) y en la ruta pública
 * `/modulo/:id` ya expuesta desde S0. No asume marcado/estructura DOM
 * concretos, solo texto visible y navegación.
 */

const PRD_MODULES: { id: string; keyword: string }[] = [
  // "LangGraph" a secas es demasiado genérico: aparece también en el nombre
  // de la app / cabecera. Se usa una parte más específica del título de PRD §6.
  { id: "mod01", keyword: "Grafos vs" },
  { id: "mod02", keyword: "TypedDict" },
  { id: "mod03", keyword: "Reducers" },
  { id: "mod04", keyword: "Nodes y edges" },
  { id: "mod05", keyword: "Conditional edges" },
  { id: "mod06", keyword: "conversacional" },
  { id: "mod07", keyword: "Checkpointing" },
  { id: "mod08", keyword: "Memoria" },
  { id: "mod09", keyword: "Human-in-the-loop" },
  { id: "mod10", keyword: "Streaming I" },
  { id: "mod11", keyword: "Streaming II" },
  { id: "mod12", keyword: "Tool calling" },
  { id: "mod13", keyword: "ReAct" },
  { id: "mod14", keyword: "Multi-agente" },
  { id: "mod15", keyword: "Subgraphs" },
  { id: "mod16", keyword: "Deployment" },
];

test.describe("Temario — lista los 16 módulos (CA-01)", () => {
  test("muestra título, objetivo y estado de progreso para los 16 módulos", async ({ page }) => {
    await page.goto("/");

    for (const { id, keyword } of PRD_MODULES) {
      await expect(
        page.getByText(new RegExp(keyword, "i")).first(),
        `no se encontró el título de ${id} (palabra clave "${keyword}")`,
      ).toBeVisible();
    }

    // Estado fijo "no_iniciado" hasta que S3 integre el progreso real
    // (SLICES.md §S1: "estado 'no_iniciado' fijo hasta integrar S3").
    await expect(page.getByText(/no\s*iniciado/i).first()).toBeVisible();
  });

  test("cada módulo listado expone un objetivo de aprendizaje distinto del título", async ({ page }) => {
    await page.goto("/");

    // mod04 tiene un objetivo distintivo (menciona StateGraph, PRD §6) que no
    // aparece en su título: confirma que se renderiza el objetivo, no solo el título.
    await expect(page.getByText(/StateGraph/i).first()).toBeVisible();
  });
});

test.describe("Temario — navegación libre sin bloqueo de orden (CA-04)", () => {
  const casos = [
    PRD_MODULES[0], // primer módulo
    PRD_MODULES[15], // último módulo, nunca visitado antes
    PRD_MODULES[8], // módulo intermedio (mod09), fuera de cualquier "orden" forzado
  ];

  for (const { id, keyword } of casos) {
    test(`clic en el módulo "${keyword}" navega a /modulo/${id}`, async ({ page }) => {
      await page.goto("/");
      await page.getByText(new RegExp(keyword, "i")).first().click();
      await expect(page).toHaveURL(new RegExp(`/modulo/${id}$`));
    });
  }
});
