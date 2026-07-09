import { expect, test, type Locator, type Page } from "@playwright/test";

import { mod01 } from "../src/content/modules/mod01";
import type { Quiz, QuizQuestion } from "../src/content/types";

/**
 * Cierre de Milestone M1 (integrator, SLICES.md "Cierre M1"): e2e del
 * vertical completo con mod01 — temario (progreso real) → módulo →
 * explicación → quiz → reto → módulo "completado" (CA-15) → reload (CA-16)
 * → reiniciar módulo (CA-17), sin afectar a otros módulos.
 *
 * Usa el runner Pyodide REAL (no mock) contra el build de producción servido
 * por el proyecto Playwright "chromium" (mismo servidor que el resto de e2e
 * de M1): los assets de `public/pyodide/` se sirven igual en `preview` que en
 * `dev` (CA-10, ver comentario de `playwright.config.ts`). La verificación
 * aislada del runner en distintos escenarios (timeout, error, red bloqueada)
 * ya vive en `e2e/runner/pyRunner.spec.ts` (proyecto "runner-pyodide", contra
 * el dev server) — este test solo necesita el camino feliz "pass" para cerrar
 * el vértice de extremo a extremo, así que reutiliza el reto real de mod01.
 *
 * El contenido correcto (índices de respuesta, `solutionCode`) se lee del
 * módulo real (`src/content/modules/mod01.ts`, slice S1 ya en PASS) en vez de
 * duplicarlo a mano, para no divergir si el contenido cambia.
 *
 * Actualización de cierre M4 (integrator, SE0/SE1): mod01 quedó `enriquecido`
 * con `pasos` en "Llena los gaps" (3 mini-ejercicios + 1 micro-quiz, además
 * del reto de sección). `moduleStatus`/CA-15 delega en la enumeración
 * canónica de `content/traversal.ts` (ADR-13, `progress/selectors.ts`), que
 * incluye TAMBIÉN los retos/quizzes de `pasos[].accion` — por diseño, no es
 * una regresión de CA-15 (la regla en sí no cambió: "completado" sigue
 * siendo "TODOS los quizzes hechos ∧ TODOS los retos en pass"; lo que cambió
 * es que el CONTENIDO de mod01 ahora declara más quizzes/retos). Este test
 * completa también esos mini-ejercicios/micro-quiz para que mod01 llegue a
 * "Completado" en el Temario, igual que antes del enriquecimiento.
 */

const EXPLICACION_MOD01 =
  "Un proceso necesita poder repetirse o volver atrás cuando el resultado de un paso " +
  "depende de revisar lo que pasó antes, por ejemplo corregir un texto hasta que quede " +
  "bien: eso no encaja en una simple lista de pasos fija, porque a veces hay que " +
  "regresar a un paso anterior en vez de seguir siempre hacia adelante sin parar.";

const EXPLICACION_MOD02_PARCIAL = "Explicación parcial de mod02, sin llegar al umbral.";

function correctIndicesOf(pregunta: QuizQuestion): number[] {
  switch (pregunta.kind) {
    case "single":
    case "output":
      return [pregunta.correcta];
    case "boolean":
      return [pregunta.correcta ? 0 : 1];
    case "multi":
      return pregunta.correctas;
  }
}

/** Responde TODAS las preguntas de un quiz visible en el panel activo, con la respuesta correcta. */
async function answerQuizCorrectly(page: Page, quiz: Quiz, quizSlot: Locator) {
  const fieldsets = quizSlot.locator("fieldset");
  await expect(fieldsets).toHaveCount(quiz.preguntas.length);

  for (let i = 0; i < quiz.preguntas.length; i++) {
    const fieldset = fieldsets.nth(i);
    const indices = correctIndicesOf(quiz.preguntas[i]);
    const inputs = fieldset.locator("input");
    for (const idx of indices) {
      await inputs.nth(idx).check();
    }
    await fieldset.getByRole("button", { name: /comprobar/i }).click();
  }
}

async function fillExplicacion(page: Page, texto: string) {
  const panel = page.getByRole("tabpanel");
  const textarea = panel.getByRole("textbox");
  await textarea.fill(texto);
  await textarea.blur();
  const guardar = panel.getByRole("button", { name: /guardar/i });
  if (await guardar.count()) {
    await guardar.click();
  }
}

test.describe.configure({ mode: "serial" });

test.describe("Cierre M1 — vertical completo con mod01 (CA-15, CA-16, CA-17)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
  });

  test("completar mod01 (explicación + quizzes + reto) lo marca 'Completado' en el Temario (CA-15)", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // Deja mod02 con progreso PARCIAL (solo la explicación, insuficiente para
    // completarlo), como testigo para CA-17: al reiniciar mod01, mod02 no
    // debe cambiar.
    await page.goto("/modulo/mod02");
    await page.getByRole("tab", { name: "Explica simple" }).click();
    await fillExplicacion(page, EXPLICACION_MOD02_PARCIAL);
    await expect
      .poll(async () =>
        page.evaluate(() => window.localStorage.getItem("lgcourse.progress.v1")),
      )
      .toContain("mod02");

    // --- mod01: explicación (paso 1, CA-13) ---
    await page.goto("/modulo/mod01");
    await page.getByRole("tab", { name: "Explica simple" }).click();
    await fillExplicacion(page, EXPLICACION_MOD01);
    await expect(page.getByRole("tabpanel").getByText(/completad/i).first()).toBeVisible();

    // --- mod01: quiz del paso 2 (CA-11/CA-12) ---
    await page.getByRole("tab", { name: "Detecta tus gaps" }).click();
    const quizSlot1 = page.getByRole("tabpanel").locator('[data-testid="quiz-slot"]').first();
    await answerQuizCorrectly(page, mod01.secciones.detectaGaps.quiz, quizSlot1);
    await expect(quizSlot1.getByText(/quiz superado/i)).toBeVisible();

    // --- mod01: reto de código del paso 3, runner REAL (CA-06/07/08) ---
    await page.getByRole("tab", { name: "Llena los gaps" }).click();
    const llenaGapsPanel = page.getByRole("tabpanel");
    const retoSlot = llenaGapsPanel.locator('[data-testid="reto-slot"]').first();
    const reto = mod01.secciones.llenaGaps.retos[0];

    const codeEditor = retoSlot.locator('[data-testid="challenge-code-editor"]');
    await codeEditor.fill(reto.solutionCode);
    await retoSlot.getByRole("button", { name: /ejecutar/i }).click();

    // Presupuesto real (init lazy de Pyodide + validación); el runner
    // garantiza <10s SOLO para la validación en sí (CA-06), no para el
    // arranque del entorno la primera vez, así que se da margen amplio aquí.
    await expect(retoSlot.getByText(/reto superado/i)).toBeVisible({ timeout: 60_000 });

    // --- mod01 enriquecido (SE1): mini-ejercicios/micro-quiz de `pasos` en
    // "Llena los gaps" también cuentan para `moduleStatus` (CA-15, ADR-13) ---
    const pasos = mod01.secciones.llenaGaps.pasos ?? [];
    const pasosConEjercicio = pasos.filter((p) => p.accion.kind === "ejercicio");
    // El primer `reto-slot` del panel es el de la sección (ya completado
    // arriba); los siguientes son los mini-ejercicios de `pasos`, en orden.
    const pasoRetoSlots = llenaGapsPanel.locator('[data-testid="reto-slot"]');
    for (let i = 0; i < pasosConEjercicio.length; i++) {
      const accion = pasosConEjercicio[i].accion;
      if (accion.kind !== "ejercicio") continue;
      const slot = pasoRetoSlots.nth(i + 1);
      const editor = slot.locator('[data-testid="challenge-code-editor"]');
      await editor.fill(accion.reto.solutionCode);
      await slot.getByRole("button", { name: /ejecutar/i }).click();
      await expect(slot.getByText(/reto superado/i)).toBeVisible({ timeout: 60_000 });
    }

    const pasoConQuiz = pasos.find((p) => p.accion.kind === "quiz");
    if (pasoConQuiz && pasoConQuiz.accion.kind === "quiz") {
      const quizSlotPaso = llenaGapsPanel.locator('[data-testid="quiz-slot"]').first();
      await answerQuizCorrectly(page, pasoConQuiz.accion.quiz, quizSlotPaso);
      await expect(quizSlotPaso.getByText(/quiz superado/i)).toBeVisible();
    }

    // --- mod01: síntesis del paso 4, también es un quiz (mod01) ---
    await page.getByRole("tab", { name: "Refina y simplifica" }).click();
    const sintesisPanel = page.getByRole("tabpanel");
    const sintesis = mod01.secciones.refinaSimplifica.sintesis;
    expect(sintesis.kind).toBe("quiz");
    if (sintesis.kind === "quiz") {
      await answerQuizCorrectly(page, sintesis.quiz, sintesisPanel);
      await expect(sintesisPanel.getByText(/quiz superado/i)).toBeVisible();
    }

    // --- Temario: mod01 aparece "Completado" (CA-15), mod02 "En curso" ---
    await page.getByRole("link", { name: "Volver al temario" }).click();
    const filaMod01 = page.getByRole("link", { name: /Grafos vs/i });
    await expect(filaMod01.getByText(/^Completado$/)).toBeVisible();
    const filaMod02 = page.getByRole("link", { name: /TypedDict/i });
    await expect(filaMod02.getByText(/^En curso$/)).toBeVisible();

    // --- Reload real de página: el progreso persiste EXACTO (CA-16) ---
    await page.reload();
    await expect(page.getByRole("link", { name: /Grafos vs/i }).getByText(/^Completado$/)).toBeVisible();
    await expect(page.getByRole("link", { name: /TypedDict/i }).getByText(/^En curso$/)).toBeVisible();

    await page.goto("/modulo/mod01");
    await page.getByRole("tab", { name: "Explica simple" }).click();
    await expect(page.getByRole("tabpanel").getByRole("textbox")).toHaveValue(EXPLICACION_MOD01);

    // --- Reiniciar módulo (CA-17): confirma, vuelve a "no_iniciado", mod02 intacto ---
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Reiniciar módulo" }).click();

    await page.getByRole("link", { name: "Volver al temario" }).click();
    await expect(page.getByRole("link", { name: /Grafos vs/i }).getByText(/^No iniciado$/)).toBeVisible();
    await expect(page.getByRole("link", { name: /TypedDict/i }).getByText(/^En curso$/)).toBeVisible();
  });
});
