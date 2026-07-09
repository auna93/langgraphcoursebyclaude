/**
 * Test de CONTRATO (riesgo R14, `docs/arch/ARCHITECTURE-M5-WEBLLM.md` §9.10
 * y CA-48). Slice SF1 — SLICES.md §SF1: "test de contrato: CONFIG.webllm.model
 * existe en prebuiltAppConfig.model_list (R14)".
 *
 * A diferencia de `webllmClient.test.ts` (que reemplaza TODO el paquete
 * `@mlc-ai/web-llm` con un doble determinista para no depender de GPU/red en
 * CI), este archivo importa la librería REAL — a propósito, SIN `vi.mock` —
 * porque lo que ancla R14 es precisamente que el id de modelo configurado
 * exista en el catálogo REAL (`prebuiltAppConfig.model_list`) de la versión
 * EXACTA pineada en `package.json`. Un doble/mock no podría detectar el
 * drift de versión que R14 exige vigilar (el model id sale del catálogo o
 * cambia la API entre versiones de la librería).
 *
 * REQUIERE que el implementer de SF1 haya, como parte del slice:
 *   (1) añadido `@mlc-ai/web-llm` como dependencia real (versión EXACTA
 *       pineada) en `package.json` (`npm install`); y
 *   (2) implementado `CONFIG.webllm.model` en `src/config.ts`.
 *
 * Hasta entonces, este archivo falla en la importación estática de
 * `@mlc-ai/web-llm` con "Failed to resolve import" — es INTENCIONAL (mismo
 * espíritu que R14 exige: no se relaja, no se sustituye por un mock).
 */
import { describe, expect, it } from "vitest";

import { prebuiltAppConfig } from "@mlc-ai/web-llm";

import { CONFIG } from "@/config";

describe("Contrato R14 — CONFIG.webllm.model existe en prebuiltAppConfig (CA-48)", () => {
  it("el model id configurado está en prebuiltAppConfig.model_list", () => {
    const ids = prebuiltAppConfig.model_list.map((m) => m.model_id);
    expect(ids).toContain(CONFIG.webllm.model);
  });

  it('el default de A-15/CA-48 ("Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC") existe en el catálogo', () => {
    // Verificación independiente del override activo (si CONFIG.webllm.model
    // está sobreescrito por env, este test igual ancla que el DEFAULT del
    // producto sigue siendo resoluble en la versión pineada de la librería).
    const ids = prebuiltAppConfig.model_list.map((m) => m.model_id);
    expect(ids).toContain("Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC");
  });
});
