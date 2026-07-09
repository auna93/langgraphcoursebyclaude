/**
 * Tests de persistencia de `src/progress/store.ts` (contrato C-PROGRESS,
 * ARCHITECTURE.md §4: localStorage, clave `lgcourse.progress.v1`,
 * `zustand/persist` con `version: 1` + `migrate()`). Slice S3 — SLICES.md §S3.
 *
 * Cubre CA-16: cerrar/reabrir el navegador restaura el progreso EXACTAMENTE
 * igual. Se simula "reload" reseteando el registro de módulos de Vitest y
 * volviendo a importar `store.ts`: eso obliga a que la única fuente del
 * estado inicial sea lo que persist lee de `localStorage`, igual que un
 * reload real de la SPA.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "lgcourse.progress.v1";

const MOD_A = "mod01";
const QUIZ_A = "mod01-quiz1";
const RETO_A = "mod01-reto1";

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe("CA-16 — persist round-trip vía localStorage", () => {
  it("restaura el progreso EXACTAMENTE igual tras simular cierre/reapertura", async () => {
    const { useProgressStore } = await import("@/progress/store");

    useProgressStore.getState().saveExplanation(MOD_A, "x".repeat(250));
    useProgressStore.getState().recordQuizResult(MOD_A, QUIZ_A, 60);
    useProgressStore.getState().recordQuizResult(MOD_A, QUIZ_A, 90);
    useProgressStore.getState().recordChallengeResult(MOD_A, RETO_A, true);
    useProgressStore.getState().markSolutionViewed(MOD_A, RETO_A);

    // El middleware persist puede escribir de forma asíncrona (microtask).
    await vi.waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
    });

    const before = useProgressStore.getState().modules;

    // Simula "cerrar y reabrir": nueva instancia del módulo store, misma
    // localStorage (no se limpia entre el `waitFor` y aquí).
    vi.resetModules();
    const { useProgressStore: reloadedStore } = await import("@/progress/store");
    const after = reloadedStore.getState().modules;

    expect(after).toEqual(before);
    expect(after[MOD_A]?.explicacion?.texto).toBe("x".repeat(250));
    expect(after[MOD_A]?.quizzes[QUIZ_A]).toEqual({ mejorPct: 90, intentos: 2 });
    expect(after[MOD_A]?.retos[RETO_A]).toEqual({
      ultimoPass: true,
      intentos: 1,
      solucionVista: true,
    });
  });

  it("usa la clave de storage exacta 'lgcourse.progress.v1'", async () => {
    const { useProgressStore } = await import("@/progress/store");
    useProgressStore.getState().saveExplanation(MOD_A, "x".repeat(250));

    await vi.waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
    });

    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    // Formato estándar de zustand/persist: { state, version }.
    expect(raw.version).toBe(1);
    expect(raw.state.schemaVersion).toBe(1);
  });
});

describe("CA-16 — robustez ante datos de storage corruptos/versión desconocida", () => {
  it("no rompe la app y arranca con progreso vacío si el valor persistido es inválido", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { schemaVersion: 999, modules: null }, version: 999 }),
    );

    let importError: unknown = null;
    let storeModule: typeof import("@/progress/store") | undefined;
    try {
      storeModule = await import("@/progress/store");
    } catch (error) {
      importError = error;
    }

    expect(importError).toBeNull();
    expect(storeModule?.useProgressStore.getState().schemaVersion).toBe(1);
    expect(storeModule?.useProgressStore.getState().modules).toEqual({});
  });
});
