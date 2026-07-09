import { describe, expect, it } from "vitest";

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
