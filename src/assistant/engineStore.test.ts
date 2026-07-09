/**
 * Tests de `src/assistant/engineStore.ts` (contrato C-ENGINE,
 * `docs/arch/ARCHITECTURE-M5-WEBLLM.md` §9.4/§9.4.1). Slice SF2 —
 * `docs/arch/SLICES.md` §SF2. Cubre la máquina de estados NORMATIVA completa
 * (tabla de eventos E1–E8), la función pura `selectActiveEngine` (tabla de
 * verdad) e `isChatEnabled`. CAs cubiertos: CA-40, CA-41, CA-43, CA-46 (a
 * nivel de store; CA-42/CA-45 UI se testean en `WebGpuFallbackCard.test.tsx`
 * / `StatusBadge.test.tsx`).
 *
 * Escrito de forma INDEPENDIENTE del implementer, contra la superficie
 * pública de C-ENGINE:
 *
 *   export declare function createEngineStore(client?: WebLlmClient);
 *   export declare function selectActiveEngine(
 *     ollama: OllamaStatus, phase: WebLlmPhase, prev: EngineKind | null,
 *   ): EngineKind | null;
 *   export declare function isChatEnabled(engine: AssistantEngine): boolean;
 *
 * `WebLlmClient` (C-WEBLLM, §9.3) se sustituye SIEMPRE por un FAKE
 * inyectable con comportamiento controlable (`createFakeWebLlmClient`, más
 * abajo) — el slice SF1 (implementación real sobre `@mlc-ai/web-llm`) NO se
 * usa aquí ni se importa, tal como fija el architect ("SF2 usa un
 * `WebLlmClient` fake conforme a C-WEBLLM hasta integrar SF1",
 * SLICES.md §SF2).
 *
 * `CONFIG.webllm` se mockea explícitamente (vía `vi.mock("@/config", ...)`)
 * en vez de depender del `config.ts` real: así los tests son deterministas
 * sean cual sea el estado de SF1 (que es quien añade `CONFIG.webllm` a
 * `src/config.ts`, §9.6).
 *
 * ---------------------------------------------------------------------------
 * NOTA sobre el fake de `cancelLoad()`: el contrato C-WEBLLM (§9.3) fija
 * LITERALMENTE que "el `load()` pendiente rechaza con kind 'cancelado'"
 * cuando se cancela. El fake modela exactamente ese comportamiento (no es
 * una libertad de test-author): `cancelLoad()` rechaza la última carga
 * pendiente con `{kind: "cancelado", ...}`. Esto hace que E7 (`cancelFetch`)
 * y la rama "cancelado" de E6 (resolución de `load()`) sean, en la práctica,
 * la MISMA vía observable — coherente con el contrato.
 * ---------------------------------------------------------------------------
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEngineStore, isChatEnabled, selectActiveEngine } from "@/assistant/engineStore";

type OllamaStatus = "checking" | "connected" | "model_missing" | "disconnected";
type EngineKind = "ollama" | "webllm";
type WebLlmPhase =
  | "inactive"
  | "unsupported"
  | "offer"
  | "fetching"
  | "ready"
  | "cancelled"
  | "error";

interface WebLlmLoadProgress {
  pct: number;
  texto: string;
}

interface WebLlmInitError {
  kind: "gpu" | "red" | "cancelado";
  message: string;
}

interface AssistantEngine {
  active: EngineKind | null;
  ollama: OllamaStatus;
  webllm: {
    phase: WebLlmPhase;
    progress: WebLlmLoadProgress | null;
    model: string;
    lastError: string | null;
  };
}

interface EngineStoreApi {
  getState(): {
    engine: AssistantEngine;
    setOllamaStatus(s: OllamaStatus): void;
    acceptDownload(): void;
    cancelFetch(): void;
  };
}

const { mockConfig } = vi.hoisted(() => ({
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

// ---------------------------------------------------------------------------
// Fake de WebLlmClient (C-WEBLLM, §9.3): comportamiento 100% controlable
// desde el test, sin GPU/red/worker real.
// ---------------------------------------------------------------------------
interface PendingLoad {
  onProgress: (p: WebLlmLoadProgress) => void;
  resolve: () => void;
  reject: (err: WebLlmInitError) => void;
}

interface FakeWebLlmClientOptions {
  detectSupport?: boolean;
  isModelCached?: boolean;
}

function createFakeWebLlmClient(opts: FakeWebLlmClientOptions = {}) {
  const state = {
    detectSupport: opts.detectSupport ?? true,
    isModelCached: opts.isModelCached ?? false,
  };
  const loadCalls: PendingLoad[] = [];
  let cancelLoadCallCount = 0;
  let detectSupportCallCount = 0;
  let isModelCachedCallCount = 0;

  return {
    async detectSupport(): Promise<boolean> {
      detectSupportCallCount += 1;
      return state.detectSupport;
    },
    async isModelCached(): Promise<boolean> {
      isModelCachedCallCount += 1;
      return state.isModelCached;
    },
    load(onProgress: (p: WebLlmLoadProgress) => void): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        loadCalls.push({ onProgress, resolve, reject });
      });
    },
    cancelLoad(): void {
      cancelLoadCallCount += 1;
      const pending = loadCalls[loadCalls.length - 1];
      pending?.reject({ kind: "cancelado", message: "Descarga cancelada por el alumno." });
    },
    async chatStream(): Promise<void> {
      throw new Error("chatStream no se usa en los tests de engineStore (SF2)");
    },
    unload(): void {},
    // --- helpers de test (no forman parte del contrato C-WEBLLM) ---
    __loadCallCount: () => loadCalls.length,
    __cancelLoadCallCount: () => cancelLoadCallCount,
    __detectSupportCallCount: () => detectSupportCallCount,
    __isModelCachedCallCount: () => isModelCachedCallCount,
    __lastLoad: () => loadCalls[loadCalls.length - 1],
    __setDetectSupport: (v: boolean) => {
      state.detectSupport = v;
    },
    __setIsModelCached: (v: boolean) => {
      state.isModelCached = v;
    },
  };
}

type FakeClient = ReturnType<typeof createFakeWebLlmClient>;

function makeStore(opts?: FakeWebLlmClientOptions): { store: EngineStoreApi; client: FakeClient } {
  const client = createFakeWebLlmClient(opts);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const store = createEngineStore(client as any) as unknown as EngineStoreApi;
  return { store, client };
}

async function sleep(ms = 20): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Helpers para alcanzar cada fase de forma determinista.
// ---------------------------------------------------------------------------
async function toOffer(store: EngineStoreApi, client: FakeClient): Promise<void> {
  client.__setDetectSupport(true);
  client.__setIsModelCached(false);
  store.getState().setOllamaStatus("disconnected");
  await vi.waitFor(() => expect(store.getState().engine.webllm.phase).toBe("offer"), {
    timeout: 3000,
  });
}

async function toFetchingViaAccept(store: EngineStoreApi, client: FakeClient): Promise<void> {
  await toOffer(store, client);
  store.getState().acceptDownload();
  await vi.waitFor(() => expect(store.getState().engine.webllm.phase).toBe("fetching"));
}

async function toReady(store: EngineStoreApi, client: FakeClient): Promise<void> {
  await toFetchingViaAccept(store, client);
  client.__lastLoad()!.resolve();
  await vi.waitFor(() => expect(store.getState().engine.webllm.phase).toBe("ready"));
}

async function toCancelled(store: EngineStoreApi, client: FakeClient): Promise<void> {
  await toFetchingViaAccept(store, client);
  store.getState().cancelFetch();
  await vi.waitFor(() => expect(store.getState().engine.webllm.phase).toBe("cancelled"));
}

async function toUnsupported(store: EngineStoreApi, client: FakeClient): Promise<void> {
  client.__setDetectSupport(false);
  store.getState().setOllamaStatus("disconnected");
  await vi.waitFor(() => expect(store.getState().engine.webllm.phase).toBe("unsupported"), {
    timeout: 3000,
  });
}

async function toError(store: EngineStoreApi, client: FakeClient): Promise<void> {
  await toFetchingViaAccept(store, client);
  client.__lastLoad()!.reject({ kind: "red", message: "Fallo de red descargando pesos." });
  await vi.waitFor(() => expect(store.getState().engine.webllm.phase).toBe("error"));
}

beforeEach(() => {
  mockConfig.webllm.enabled = true;
  mockConfig.webllm.model = "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC";
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  mockConfig.webllm.enabled = true;
});

// ---------------------------------------------------------------------------
// Estado inicial
// ---------------------------------------------------------------------------
describe("Estado inicial de createEngineStore", () => {
  it("arranca en fase 'inactive', active=null, sin progreso/error, model de CONFIG.webllm.model", () => {
    const { store } = makeStore();
    const engine = store.getState().engine;

    expect(engine.webllm.phase).toBe("inactive");
    expect(engine.active).toBeNull();
    expect(engine.webllm.progress).toBeNull();
    expect(engine.webllm.lastError).toBeNull();
    expect(engine.webllm.model).toBe(mockConfig.webllm.model);
  });
});

// ---------------------------------------------------------------------------
// E1 — setOllamaStatus("connected")
// ---------------------------------------------------------------------------
describe("E1 — setOllamaStatus('connected')", () => {
  it("desde 'offer' ⇒ 'inactive' (la oferta se retira) y active pasa a 'ollama'", async () => {
    const { store, client } = makeStore();
    await toOffer(store, client);

    store.getState().setOllamaStatus("connected");

    await vi.waitFor(() => expect(store.getState().engine.webllm.phase).toBe("inactive"));
    expect(store.getState().engine.active).toBe("ollama");
  });

  it("desde 'error' ⇒ 'inactive' y active pasa a 'ollama'", async () => {
    const { store, client } = makeStore();
    await toError(store, client);

    store.getState().setOllamaStatus("connected");

    await vi.waitFor(() => expect(store.getState().engine.webllm.phase).toBe("inactive"));
    expect(store.getState().engine.active).toBe("ollama");
  });

  it("desde 'fetching' ⇒ permanece 'fetching' (CA-46: una descarga en curso NUNCA se aborta automáticamente)", async () => {
    const { store, client } = makeStore();
    await toFetchingViaAccept(store, client);
    const loadCountAntes = client.__loadCallCount();

    store.getState().setOllamaStatus("connected");

    await vi.waitFor(() => expect(store.getState().engine.active).toBe("ollama"));
    expect(store.getState().engine.webllm.phase).toBe("fetching");
    expect(client.__cancelLoadCallCount()).toBe(0);
    expect(client.__loadCallCount()).toBe(loadCountAntes);
  });

  it("desde 'cancelled' ⇒ sin cambios de fase (active pasa a 'ollama')", async () => {
    const { store, client } = makeStore();
    await toCancelled(store, client);

    store.getState().setOllamaStatus("connected");

    await vi.waitFor(() => expect(store.getState().engine.active).toBe("ollama"));
    expect(store.getState().engine.webllm.phase).toBe("cancelled");
  });

  it("desde 'unsupported' ⇒ sin cambios de fase (active pasa a 'ollama')", async () => {
    const { store, client } = makeStore();
    await toUnsupported(store, client);

    store.getState().setOllamaStatus("connected");

    await vi.waitFor(() => expect(store.getState().engine.active).toBe("ollama"));
    expect(store.getState().engine.webllm.phase).toBe("unsupported");
  });

  it("desde 'inactive' (estado inicial) ⇒ sin cambios de fase (active pasa a 'ollama')", async () => {
    const { store } = makeStore();
    expect(store.getState().engine.webllm.phase).toBe("inactive");

    store.getState().setOllamaStatus("connected");

    await vi.waitFor(() => expect(store.getState().engine.active).toBe("ollama"));
    expect(store.getState().engine.webllm.phase).toBe("inactive");
  });

  it("'warm': desde 'ready', connected mueve active a 'ollama' manteniendo el engine cargado", async () => {
    const { store, client } = makeStore();
    await toReady(store, client);
    // Ollama sigue degradado en este punto (nunca se llamó setOllamaStatus con
    // otro valor durante `toReady`): active ya es "webllm" por selección.
    expect(store.getState().engine.active).toBe("webllm");

    store.getState().setOllamaStatus("connected");

    await vi.waitFor(() => expect(store.getState().engine.active).toBe("ollama"));
    expect(store.getState().engine.webllm.phase).toBe("ready");
  });
});

// ---------------------------------------------------------------------------
// E2 — setOllamaStatus("checking")
// ---------------------------------------------------------------------------
describe("E2 — setOllamaStatus('checking')", () => {
  it("no dispara la máquina de degradación ni cambia la fase (transitorio)", async () => {
    const { store, client } = makeStore({ detectSupport: true, isModelCached: false });

    store.getState().setOllamaStatus("checking");
    await sleep();

    expect(store.getState().engine.webllm.phase).toBe("inactive");
    expect(client.__detectSupportCallCount()).toBe(0);
    expect(client.__loadCallCount()).toBe(0);
  });

  it("preserva active='ollama' durante un check periódico", async () => {
    const { store } = makeStore();
    store.getState().setOllamaStatus("connected");
    await vi.waitFor(() => expect(store.getState().engine.active).toBe("ollama"));

    store.getState().setOllamaStatus("checking");

    expect(store.getState().engine.active).toBe("ollama");
  });

  it("preserva active='webllm' durante un check periódico", async () => {
    const { store, client } = makeStore();
    await toReady(store, client);
    expect(store.getState().engine.active).toBe("webllm");

    store.getState().setOllamaStatus("checking");

    expect(store.getState().engine.active).toBe("webllm");
  });

  it("preserva active=null durante un check periódico", async () => {
    const { store } = makeStore();
    expect(store.getState().engine.active).toBeNull();

    store.getState().setOllamaStatus("checking");
    await sleep();

    expect(store.getState().engine.active).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// E3 — setOllamaStatus(degradado) desde 'inactive' (y CONFIG.webllm.enabled)
// ---------------------------------------------------------------------------
describe("E3 — setOllamaStatus(degradado) desde 'inactive'", () => {
  it("detectSupport()===false ⇒ 'unsupported' (CA-41), 0 llamadas a load, 0 a isModelCached", async () => {
    const { store, client } = makeStore({ detectSupport: false });

    store.getState().setOllamaStatus("disconnected");

    await vi.waitFor(() => expect(store.getState().engine.webllm.phase).toBe("unsupported"), {
      timeout: 3000,
    });
    expect(client.__loadCallCount()).toBe(0);
    expect(client.__isModelCachedCallCount()).toBe(0);
  });

  it("detectSupport()===true + isModelCached()===true ⇒ 'fetching' y dispara load() automático (CA-40a)", async () => {
    const { store, client } = makeStore({ detectSupport: true, isModelCached: true });

    store.getState().setOllamaStatus("model_missing");

    await vi.waitFor(() => expect(store.getState().engine.webllm.phase).toBe("fetching"), {
      timeout: 3000,
    });
    expect(client.__loadCallCount()).toBe(1);
  });

  it("detectSupport()===true + no cacheado ⇒ 'offer' (CA-40b), sin llamar a load todavía", async () => {
    const { store, client } = makeStore({ detectSupport: true, isModelCached: false });

    store.getState().setOllamaStatus("disconnected");

    await vi.waitFor(() => expect(store.getState().engine.webllm.phase).toBe("offer"), {
      timeout: 3000,
    });
    expect(client.__loadCallCount()).toBe(0);
  });

  it("dispara igual con ambos disparadores degradados: 'disconnected' y 'model_missing'", async () => {
    for (const status of ["disconnected", "model_missing"] as const) {
      const { store, client } = makeStore({ detectSupport: true, isModelCached: false });
      store.getState().setOllamaStatus(status);
      await vi.waitFor(() => expect(store.getState().engine.webllm.phase).toBe("offer"));
      expect(client.__loadCallCount()).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// E4 — setOllamaStatus(degradado) desde cualquier otra fase: sin cambios
// ---------------------------------------------------------------------------
describe("E4 — degradado desde una fase distinta de 'inactive': sin cambios de fase", () => {
  const casos: Array<[string, (store: EngineStoreApi, client: FakeClient) => Promise<void>]> = [
    ["offer", toOffer],
    ["fetching", toFetchingViaAccept],
    ["cancelled", toCancelled],
    ["unsupported", toUnsupported],
    ["error", toError],
  ];

  for (const [nombre, setup] of casos) {
    it(`fase '${nombre}' permanece igual ante un nuevo evento degradado (active=null salvo 'ready')`, async () => {
      const { store, client } = makeStore();
      await setup(store, client);
      const faseAntes = store.getState().engine.webllm.phase;
      const loadCountAntes = client.__loadCallCount();

      store.getState().setOllamaStatus("model_missing");
      await sleep();

      expect(store.getState().engine.webllm.phase).toBe(faseAntes);
      expect(client.__loadCallCount()).toBe(loadCountAntes);
      expect(store.getState().engine.active).toBeNull();
    });
  }

  it("'unsupported' es estable en la sesión: un nuevo evento degradado NO repite detectSupport()", async () => {
    const { store, client } = makeStore({ detectSupport: false });
    await toUnsupported(store, client);
    expect(client.__detectSupportCallCount()).toBe(1);

    store.getState().setOllamaStatus("model_missing");
    await sleep();

    expect(store.getState().engine.webllm.phase).toBe("unsupported");
    expect(client.__detectSupportCallCount()).toBe(1);
  });

  it("'cancelled' no tiene auto-reintento: solo sale mediante acceptDownload() (E5, CA-43)", async () => {
    const { store, client } = makeStore();
    await toCancelled(store, client);
    const loadCountAntes = client.__loadCallCount();

    store.getState().setOllamaStatus("model_missing");
    await sleep();

    expect(store.getState().engine.webllm.phase).toBe("cancelled");
    expect(client.__loadCallCount()).toBe(loadCountAntes);
  });

  it("desde 'ready': permanece 'ready' pero active vuelve a 'webllm' de inmediato (warm, sin nueva carga)", async () => {
    const { store, client } = makeStore();
    await toReady(store, client);
    expect(store.getState().engine.active).toBe("webllm");

    store.getState().setOllamaStatus("connected");
    await vi.waitFor(() => expect(store.getState().engine.active).toBe("ollama"));
    expect(store.getState().engine.webllm.phase).toBe("ready");

    const loadCountAntes = client.__loadCallCount();
    store.getState().setOllamaStatus("disconnected");

    await vi.waitFor(() => expect(store.getState().engine.active).toBe("webllm"));
    expect(store.getState().engine.webllm.phase).toBe("ready");
    expect(client.__loadCallCount()).toBe(loadCountAntes);
  });
});

// ---------------------------------------------------------------------------
// E5 — acceptDownload()
// ---------------------------------------------------------------------------
describe("E5 — acceptDownload()", () => {
  it("desde 'offer' ⇒ 'fetching' + dispara client.load()", async () => {
    const { store, client } = makeStore();
    await toOffer(store, client);
    expect(client.__loadCallCount()).toBe(0);

    store.getState().acceptDownload();

    await vi.waitFor(() => expect(store.getState().engine.webllm.phase).toBe("fetching"));
    expect(client.__loadCallCount()).toBe(1);
  });

  it("desde 'cancelled' ⇒ 'fetching' + nueva llamada a client.load()", async () => {
    const { store, client } = makeStore();
    await toCancelled(store, client);
    const antes = client.__loadCallCount();

    store.getState().acceptDownload();

    await vi.waitFor(() => expect(store.getState().engine.webllm.phase).toBe("fetching"));
    expect(client.__loadCallCount()).toBe(antes + 1);
  });

  it("desde 'error' ⇒ 'fetching' + nueva llamada a client.load()", async () => {
    const { store, client } = makeStore();
    await toError(store, client);
    const antes = client.__loadCallCount();

    store.getState().acceptDownload();

    await vi.waitFor(() => expect(store.getState().engine.webllm.phase).toBe("fetching"));
    expect(client.__loadCallCount()).toBe(antes + 1);
  });
});

// ---------------------------------------------------------------------------
// E6 — resolución de load()
// ---------------------------------------------------------------------------
describe("E6 — resolución de load()", () => {
  it("éxito ⇒ 'ready'", async () => {
    const { store, client } = makeStore();
    await toFetchingViaAccept(store, client);

    client.__lastLoad()!.resolve();

    await vi.waitFor(() => expect(store.getState().engine.webllm.phase).toBe("ready"));
  });

  it("rechazo kind:'gpu' ⇒ 'unsupported' (SU-11)", async () => {
    const { store, client } = makeStore();
    await toFetchingViaAccept(store, client);

    client.__lastLoad()!.reject({ kind: "gpu", message: "Sin adaptador WebGPU utilizable." });

    await vi.waitFor(() => expect(store.getState().engine.webllm.phase).toBe("unsupported"));
  });

  it("rechazo kind:'red' ⇒ 'error' con lastError seteado", async () => {
    const { store, client } = makeStore();
    await toFetchingViaAccept(store, client);

    client.__lastLoad()!.reject({ kind: "red", message: "Fallo de red descargando pesos." });

    await vi.waitFor(() => expect(store.getState().engine.webllm.phase).toBe("error"));
    expect(store.getState().engine.webllm.lastError).toBe("Fallo de red descargando pesos.");
  });

  it("rechazo kind:'cancelado' ⇒ 'cancelled'", async () => {
    const { store, client } = makeStore();
    await toFetchingViaAccept(store, client);

    client.__lastLoad()!.reject({ kind: "cancelado", message: "Cancelado." });

    await vi.waitFor(() => expect(store.getState().engine.webllm.phase).toBe("cancelled"));
  });
});

// ---------------------------------------------------------------------------
// E7 — cancelFetch()
// ---------------------------------------------------------------------------
describe("E7 — cancelFetch()", () => {
  it("desde 'fetching' llama a client.cancelLoad() y termina en 'cancelled' en <=2s (CA-43)", async () => {
    const { store, client } = makeStore();
    await toFetchingViaAccept(store, client);

    const start = Date.now();
    store.getState().cancelFetch();

    await vi.waitFor(() => expect(store.getState().engine.webllm.phase).toBe("cancelled"));
    const elapsedMs = Date.now() - start;

    expect(elapsedMs).toBeLessThanOrEqual(2000);
    expect(client.__cancelLoadCallCount()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// E8 — CONFIG.webllm.enabled === false
// ---------------------------------------------------------------------------
describe("E8 — CONFIG.webllm.enabled === false", () => {
  it("la fase es SIEMPRE 'inactive' pase lo que pase con Ollama; 0 llamadas a detectSupport/isModelCached/load", async () => {
    mockConfig.webllm.enabled = false;
    const { store, client } = makeStore({ detectSupport: true, isModelCached: true });

    for (const status of ["checking", "connected", "disconnected", "model_missing"] as const) {
      store.getState().setOllamaStatus(status);
      await sleep();
      expect(store.getState().engine.webllm.phase).toBe("inactive");
    }

    expect(client.__detectSupportCallCount()).toBe(0);
    expect(client.__isModelCachedCallCount()).toBe(0);
    expect(client.__loadCallCount()).toBe(0);
  });

  it("active se sigue computando con normalidad (ollama gana; degradado ⇒ null, nunca 'webllm')", async () => {
    mockConfig.webllm.enabled = false;
    const { store } = makeStore({ detectSupport: true, isModelCached: true });

    store.getState().setOllamaStatus("connected");
    await vi.waitFor(() => expect(store.getState().engine.active).toBe("ollama"));

    store.getState().setOllamaStatus("disconnected");
    await sleep();
    expect(store.getState().engine.active).toBeNull();
    expect(store.getState().engine.webllm.phase).toBe("inactive");
  });
});

// ---------------------------------------------------------------------------
// Progreso durante 'fetching' (wiring del progreso reportado por el cliente)
// ---------------------------------------------------------------------------
describe("engine.webllm.progress refleja el progreso emitido por client.load(onProgress)", () => {
  it("actualiza pct/texto cuando el cliente reporta progreso", async () => {
    const { store, client } = makeStore();
    await toFetchingViaAccept(store, client);
    expect(store.getState().engine.webllm.progress).toBeNull();

    client.__lastLoad()!.onProgress({ pct: 42, texto: "Fetching param cache [3/24]" });

    await vi.waitFor(() => expect(store.getState().engine.webllm.progress?.pct).toBe(42));
    expect(store.getState().engine.webllm.progress?.texto).toBe("Fetching param cache [3/24]");
  });
});

// ---------------------------------------------------------------------------
// engineStore NO persiste (contrato explícito: "zustand, SIN persist")
// ---------------------------------------------------------------------------
describe("engineStore no persiste entre sesiones", () => {
  it("no escribe en localStorage ni sessionStorage al cambiar de fase", async () => {
    const { store, client } = makeStore();
    await toReady(store, client);

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// selectActiveEngine — función PURA (tabla de verdad, sin store)
// ---------------------------------------------------------------------------
describe("selectActiveEngine — función PURA (tabla de verdad)", () => {
  const FASES: WebLlmPhase[] = [
    "inactive",
    "unsupported",
    "offer",
    "fetching",
    "ready",
    "cancelled",
    "error",
  ];

  it.each(FASES)(
    "ollama='connected' ⇒ SIEMPRE 'ollama', sea cual sea la fase (%s) o prev",
    (fase) => {
      expect(selectActiveEngine("connected", fase, null)).toBe("ollama");
      expect(selectActiveEngine("connected", fase, "webllm")).toBe("ollama");
      expect(selectActiveEngine("connected", fase, "ollama")).toBe("ollama");
    },
  );

  it.each(FASES)("ollama='checking' ⇒ devuelve 'prev' tal cual (fase=%s)", (fase) => {
    expect(selectActiveEngine("checking", fase, null)).toBeNull();
    expect(selectActiveEngine("checking", fase, "ollama")).toBe("ollama");
    expect(selectActiveEngine("checking", fase, "webllm")).toBe("webllm");
  });

  it.each(["disconnected", "model_missing"] as const)(
    "ollama='%s' + fase='ready' ⇒ 'webllm'",
    (status) => {
      expect(selectActiveEngine(status, "ready", null)).toBe("webllm");
      expect(selectActiveEngine(status, "ready", "ollama")).toBe("webllm");
      expect(selectActiveEngine(status, "ready", "webllm")).toBe("webllm");
    },
  );

  it.each(["disconnected", "model_missing"] as const)(
    "ollama='%s' + fase!='ready' ⇒ null, para cualquier otra fase",
    (status) => {
      for (const fase of FASES.filter((f) => f !== "ready")) {
        expect(selectActiveEngine(status, fase, "ollama")).toBeNull();
        expect(selectActiveEngine(status, fase, "webllm")).toBeNull();
        expect(selectActiveEngine(status, fase, null)).toBeNull();
      }
    },
  );
});

// ---------------------------------------------------------------------------
// isChatEnabled
// ---------------------------------------------------------------------------
describe("isChatEnabled(engine)", () => {
  function baseEngine(active: EngineKind | null): AssistantEngine {
    return {
      active,
      ollama: "connected",
      webllm: { phase: "inactive", progress: null, model: "m", lastError: null },
    };
  }

  it("true cuando active === 'ollama'", () => {
    expect(isChatEnabled(baseEngine("ollama"))).toBe(true);
  });

  it("true cuando active === 'webllm'", () => {
    expect(isChatEnabled(baseEngine("webllm"))).toBe(true);
  });

  it("false cuando active === null", () => {
    expect(isChatEnabled(baseEngine(null))).toBe(false);
  });
});
