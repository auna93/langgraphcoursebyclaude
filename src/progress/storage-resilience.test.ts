/**
 * Tests de resiliencia de storage — Riesgo R6 (ARCHITECTURE.md §7):
 * "localStorage lleno o bloqueado (modo privado)". Slice S3 — SLICES.md §S3.
 *
 * El store debe degradar a memoria: ni las acciones ni la carga inicial
 * deben lanzar si `localStorage.setItem`/`getItem` lanzan excepción (quota
 * excedida, modo privado de Safari, storage deshabilitado por política).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MOD_A = "mod01";

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("R6 — localStorage.setItem lanza al guardar", () => {
  it("la acción no lanza y el cambio se conserva en memoria", async () => {
    const { useProgressStore } = await import("@/progress/store");

    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    });

    expect(() => {
      useProgressStore.getState().saveExplanation(MOD_A, "y".repeat(250));
    }).not.toThrow();

    expect(useProgressStore.getState().modules[MOD_A]?.explicacion?.texto).toBe(
      "y".repeat(250),
    );
  });
});

describe("R6 — localStorage totalmente inaccesible (getItem y setItem lanzan)", () => {
  it("la app arranca en memoria sin crashear y las acciones siguen funcionando", async () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new DOMException("SecurityError", "SecurityError");
    });
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("SecurityError", "SecurityError");
    });

    let importError: unknown = null;
    let storeModule: typeof import("@/progress/store") | undefined;
    try {
      storeModule = await import("@/progress/store");
    } catch (error) {
      importError = error;
    }
    expect(importError).toBeNull();

    const store = storeModule?.useProgressStore;
    expect(store?.getState().modules).toEqual({});

    expect(() => {
      store?.getState().saveExplanation(MOD_A, "z".repeat(250));
    }).not.toThrow();
    expect(store?.getState().modules[MOD_A]?.explicacion?.texto).toBe("z".repeat(250));
  });
});
