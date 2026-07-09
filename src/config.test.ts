import { afterEach, describe, expect, it, vi } from "vitest";

import { CONFIG } from "@/config";

describe("CONFIG (contrato CONFIG, ARCHITECTURE.md §4)", () => {
  it("resuelve los defaults documentados", () => {
    expect(CONFIG.ollama.baseUrl).toBe("/ollama");
    expect(CONFIG.ollama.model).toBe("qwen2.5-coder:14b");
    expect(CONFIG.ollama.healthIntervalMs).toBe(15000);
    expect(CONFIG.ollama.healthTimeoutMs).toBe(3000);
    expect(CONFIG.runner.pyodideBaseUrl).toBe("/pyodide/");
    expect(CONFIG.runner.defaultTimeoutMs).toBe(8000);
    expect(CONFIG.curso.umbralExplicacionChars).toBe(200);
    expect(CONFIG.curso.umbralQuizPct).toBe(80);
    expect(CONFIG.rag.topK).toBe(4);
  });
});

/**
 * Delta M5 — `CONFIG.webllm` (`docs/arch/ARCHITECTURE-M5-WEBLLM.md` §9.6,
 * slice SF1). Los overrides se verifican reimportando el módulo con
 * `vi.stubEnv` + `vi.resetModules()` (CONFIG se resuelve UNA vez al cargar
 * el módulo, igual que el resto de `CONFIG`; no se reinterpreta en runtime).
 *
 * AMBIGÜEDAD DE CONTRATO no resuelta aquí (ver también
 * `webllmClient.test.ts`): §9.3 fija el invariante "modelUrl y modelLibUrl:
 * AMBOS o NINGUNO" pero no especifica qué debe hacer `CONFIG` (o su
 * consumidor) si solo uno de los dos está definido por env. No se testea ese
 * caso parcial para no fijar un comportamiento no especificado por el
 * architect.
 */
describe("CONFIG.webllm (delta M5, ARCHITECTURE-M5-WEBLLM.md §9.6)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("resuelve los defaults documentados sin overrides (A-11/A-15, CA-40..48)", () => {
    expect(CONFIG.webllm.enabled).toBe(true);
    expect(CONFIG.webllm.model).toBe("Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC");
    expect(CONFIG.webllm.modelUrl).toBe("");
    expect(CONFIG.webllm.modelLibUrl).toBe("");
    expect(CONFIG.webllm.modelSizeMb).toBe(950);
  });

  it('VITE_WEBLLM_ENABLED="false" desactiva el fallback (CA-41)', async () => {
    vi.stubEnv("VITE_WEBLLM_ENABLED", "false");
    vi.resetModules();
    const { CONFIG: reloaded } = await import("@/config");
    expect(reloaded.webllm.enabled).toBe(false);
  });

  it("VITE_WEBLLM_ENABLED ausente ⇒ true (default, mismo comportamiento que el módulo ya cargado)", async () => {
    vi.resetModules();
    const { CONFIG: reloaded } = await import("@/config");
    expect(reloaded.webllm.enabled).toBe(true);
  });

  it("VITE_WEBLLM_MODEL sobreescribe el modelo (mismo mecanismo de override que A-01, CA-48)", async () => {
    vi.stubEnv("VITE_WEBLLM_MODEL", "Otro-Modelo-Custom-MLC");
    vi.resetModules();
    const { CONFIG: reloaded } = await import("@/config");
    expect(reloaded.webllm.model).toBe("Otro-Modelo-Custom-MLC");
  });

  it("VITE_WEBLLM_MODEL_URL + VITE_WEBLLM_MODEL_LIB_URL sobreescriben ambos (ADR-18)", async () => {
    vi.stubEnv("VITE_WEBLLM_MODEL_URL", "https://intranet.example.com/modelo/");
    vi.stubEnv("VITE_WEBLLM_MODEL_LIB_URL", "https://intranet.example.com/modelo.wasm");
    vi.resetModules();
    const { CONFIG: reloaded } = await import("@/config");
    expect(reloaded.webllm.modelUrl).toBe("https://intranet.example.com/modelo/");
    expect(reloaded.webllm.modelLibUrl).toBe("https://intranet.example.com/modelo.wasm");
  });

  it("VITE_WEBLLM_MODEL_SIZE_MB sobreescribe el tamaño estimado de la oferta (ADR-20, CA-40b)", async () => {
    vi.stubEnv("VITE_WEBLLM_MODEL_SIZE_MB", "1600");
    vi.resetModules();
    const { CONFIG: reloaded } = await import("@/config");
    expect(reloaded.webllm.modelSizeMb).toBe(1600);
  });
});
