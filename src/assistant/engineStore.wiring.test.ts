/**
 * Test OBLIGATORIO de cableado del singleton de producción `useEngineStore`
 * (`docs/arch/ARCHITECTURE-M5-WEBLLM.md` §9.4.3, NORMATIVO — cerrado en la
 * adenda 2026-07-09, post-revisión de SF2). Slice SF3 — `docs/arch/
 * SLICES.md` §SF3, bullet "cableado §9.4.3 (OBLIGATORIO)".
 *
 * Archivo SEPARADO de `engineStore.test.ts` (SF2, no se toca) a propósito:
 * `engineStore.test.ts` prueba la FACTORY `createEngineStore(client)` con un
 * fake inyectado explícitamente y NUNCA importa/ejercita el singleton
 * `useEngineStore` en sí; este archivo prueba EXACTAMENTE lo contrario — el
 * cableado de producción del singleton — con un mock de módulo sobre
 * `@/assistant/webllmClient` (no un client inyectado a mano), tal como exige
 * el contrato:
 *
 * §9.4.3: "SF3 añade un test que, con el módulo `@/assistant/webllmClient`
 * sustituido por un doble (module mock) ANTES de importar `engineStore`,
 * verifica: (a) `createWebLlmClient` fue invocada EXACTAMENTE una vez con
 * `CONFIG.webllm`; y (b) el singleton enruta a ESA instancia — con
 * `CONFIG.webllm.enabled === true`, `useEngineStore.getState()
 * .setOllamaStatus("disconnected")` acaba invocando `detectSupport()` del
 * doble (demuestra que el guard 'sin cliente ⇒ unsupported permanente' ya no
 * gobierna el store de producción)."
 *
 * (c) — AÑADIDO por §9.5.1 (adenda 2026-07-09, pre-implementación SF3),
 * DESPUÉS de que el test-author escribiera la versión original de este
 * archivo (que solo cubría (a)/(b)): "`getWebLlmClient()` devuelve
 * exactamente (`===`) esa misma instancia (invariante de identidad del que
 * depende CA-44, §9.5.1)". Cubierto por el test "(c)" al final de este
 * `describe`.
 *
 * Contra el estado ANTERIOR a SF3 (`export const useEngineStore =
 * createEngineStore();`, sin cliente — SF2, ver la nota de diseño en la
 * cabecera de `engineStore.ts`), este archivo debe fallar así:
 *   (a) por assertion failure — `createWebLlmClient` mockeada nunca se
 *       invoca (0 llamadas, no 1) — NO por error de import/resolución.
 *   (b) por timeout de `vi.waitFor` — `detectSupport()` del doble nunca se
 *       llama porque, sin cliente, el store cae directo a "unsupported" sin
 *       tocar ningún `WebLlmClient` (real o doble).
 *   (c) por assertion failure — `getWebLlmClient` ni siquiera existiría como
 *       export del módulo (previo a §9.5.1/SF3).
 *
 * `@/config` se mockea (mismo patrón que `engineStore.test.ts`) para no
 * depender de variables de entorno reales al comprobar el argumento exacto
 * con el que se invoca `createWebLlmClient`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mocks, mockConfig } = vi.hoisted(() => ({
  mocks: {
    createWebLlmClient: vi.fn(),
  },
  mockConfig: {
    webllm: {
      enabled: true,
      model: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
      modelUrl: "",
      modelLibUrl: "",
      modelSizeMb: 950,
    },
  },
}));

vi.mock("@/config", () => ({ CONFIG: mockConfig }));

// El doble sustituye TODO el módulo `@/assistant/webllmClient` — la
// implementación real de SF1 (y el paquete `@mlc-ai/web-llm`) NUNCA se
// importa en este archivo.
vi.mock("@/assistant/webllmClient", () => ({
  createWebLlmClient: mocks.createWebLlmClient,
}));

interface FakeWebLlmDouble {
  detectSupport(): Promise<boolean>;
  isModelCached(): Promise<boolean>;
  load(onProgress: (p: { pct: number; texto: string }) => void): Promise<void>;
  cancelLoad(): void;
  chatStream(): Promise<void>;
  unload(): void;
  __detectSupportCallCount(): number;
}

function createFakeWebLlmDouble(): FakeWebLlmDouble {
  let detectSupportCallCount = 0;
  return {
    async detectSupport() {
      detectSupportCallCount += 1;
      // El valor de retorno es indiferente para ESTE test: lo único que
      // importa es que el singleton llegue a invocar `detectSupport()` del
      // doble en absoluto (evidencia de que enruta al cliente mockeado, no
      // al guard "sin cliente" de SF2).
      return true;
    },
    async isModelCached() {
      return false;
    },
    load() {
      return new Promise<void>(() => {
        /* nunca resuelve: no relevante para este test de cableado */
      });
    },
    cancelLoad() {},
    async chatStream() {},
    unload() {},
    __detectSupportCallCount: () => detectSupportCallCount,
  };
}

interface EngineStoreSingletonApi {
  getState(): {
    setOllamaStatus(s: "checking" | "connected" | "model_missing" | "disconnected"): void;
  };
}

beforeEach(() => {
  vi.resetModules();
  mocks.createWebLlmClient.mockReset();
  mockConfig.webllm.enabled = true;
  mockConfig.webllm.model = "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC";
  mockConfig.webllm.modelUrl = "";
  mockConfig.webllm.modelLibUrl = "";
  mockConfig.webllm.modelSizeMb = 950;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("§9.4.3 — cableado NORMATIVO del singleton useEngineStore (OBLIGATORIO, SF3)", () => {
  it("(a) createWebLlmClient se invoca EXACTAMENTE una vez con CONFIG.webllm al importar engineStore", async () => {
    const fake = createFakeWebLlmDouble();
    mocks.createWebLlmClient.mockReturnValue(fake);

    await import("@/assistant/engineStore");

    expect(mocks.createWebLlmClient).toHaveBeenCalledTimes(1);
    expect(mocks.createWebLlmClient).toHaveBeenCalledWith(mockConfig.webllm);
  });

  it("(b) el singleton enruta de verdad al doble: setOllamaStatus('disconnected') con enabled=true invoca detectSupport() del doble", async () => {
    const fake = createFakeWebLlmDouble();
    mocks.createWebLlmClient.mockReturnValue(fake);

    const mod = await import("@/assistant/engineStore");
    const useEngineStore = mod.useEngineStore as unknown as EngineStoreSingletonApi;

    expect(fake.__detectSupportCallCount()).toBe(0);
    useEngineStore.getState().setOllamaStatus("disconnected");

    // El guard "sin cliente ⇒ unsupported permanente" de SF2 NUNCA llama a
    // detectSupport (ni real ni doble); si este `waitFor` expira, el
    // singleton de producción sigue sin cablear el cliente real (regresión
    // al comportamiento interino de SF2 descrito en §9.4.3).
    await vi.waitFor(() => expect(fake.__detectSupportCallCount()).toBeGreaterThan(0));
  });

  it("(b bis) el mismo doble también recibe isModelCached()/load() en el flujo normal (evidencia adicional de enrutado, no solo detectSupport)", async () => {
    // FIX de mecánica de test (defecto pre-existente en la sonda, no de
    // comportamiento): la máquina de estados NORMATIVA §9.4.1 (E3, RATIFICADA
    // y sin cambios en SF3) solo dispara `client.load()` automáticamente
    // cuando `isModelCached()` resuelve `true` (CA-40a); con `false` la fase
    // pasa a `"offer"` (CA-40b) y `load()` NUNCA se llama. El fake original
    // devolvía `false` pero esperaba `loadCalled === true` — contradice la
    // propia máquina de estados que este test (correctamente) no toca.
    // `isModelCached() => true` es la sonda que de verdad ejercita "el mismo
    // doble también recibe load()", que es el título/intención del test.
    let isModelCachedCalled = false;
    let loadCalled = false;
    const fake: FakeWebLlmDouble = {
      async detectSupport() {
        return true;
      },
      async isModelCached() {
        isModelCachedCalled = true;
        return true;
      },
      load(_onProgress) {
        loadCalled = true;
        return new Promise<void>(() => {});
      },
      cancelLoad() {},
      async chatStream() {},
      unload() {},
      __detectSupportCallCount: () => 0,
    };
    mocks.createWebLlmClient.mockReturnValue(fake);

    const mod = await import("@/assistant/engineStore");
    const useEngineStore = mod.useEngineStore as unknown as EngineStoreSingletonApi;

    useEngineStore.getState().setOllamaStatus("model_missing");

    await vi.waitFor(() => expect(isModelCachedCalled).toBe(true));
    await vi.waitFor(() => expect(loadCalled).toBe(true));
  });

  it("(c) getWebLlmClient() devuelve exactamente (===) la MISMA instancia inyectada en useEngineStore (invariante de identidad, §9.5.1)", async () => {
    // Inciso (c) del test obligatorio de cableado, añadido por el architect
    // DESPUÉS de que el test-author escribiera este archivo (adenda
    // 2026-07-09, §9.5.1): `getWebLlmClient()` es el mecanismo por el que
    // `chatStore` obtiene la instancia "warm" del singleton (nunca
    // construyendo la suya propia) — CA-44 depende de que sea EXACTAMENTE la
    // misma instancia sobre la que `engineStore` ejecuta `load()`.
    const fake = createFakeWebLlmDouble();
    mocks.createWebLlmClient.mockReturnValue(fake);

    const mod = await import("@/assistant/engineStore");
    const getWebLlmClient = mod.getWebLlmClient as () => FakeWebLlmDouble;

    expect(getWebLlmClient()).toBe(fake);
  });
});
