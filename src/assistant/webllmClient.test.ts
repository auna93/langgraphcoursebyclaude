/**
 * Tests unitarios de `src/assistant/webllmClient.ts` (contrato C-WEBLLM,
 * `docs/arch/ARCHITECTURE-M5-WEBLLM.md` §9.3). Slice SF1 — SLICES.md §SF1.
 *
 * Escritos de forma INDEPENDIENTE del implementer, contra la superficie
 * pública de C-WEBLLM: `createWebLlmClient(config): WebLlmClient` y sus
 * métodos `detectSupport()` / `isModelCached()` / `load()` / `cancelLoad()` /
 * `chatStream()`.
 *
 * Cubre:
 *  - `detectSupport()` — feature-detection pura, 0 requests (A-12, CA-41).
 *  - `isModelCached()` — delega en `hasModelInCache`, sin red (CA-40a/b).
 *  - `load(onProgress)` — progreso 0→100 monótono no decreciente y resuelve
 *    cuando el engine está listo (CA-42); idempotente si ya está listo.
 *  - `cancelLoad()` — corta un load en curso: `terminate()` + el `load()`
 *    pendiente rechaza `WebLlmInitError{kind:"cancelado"}` en ≤2 s (CA-43);
 *    no-op si no hay carga en curso; el siguiente `load()` usa un worker
 *    NUEVO (ADR-17).
 *  - `load()` — fallo de init por GPU ⇒ rechaza `WebLlmInitError{kind:"gpu"}`
 *    (SU-11).
 *  - override `modelUrl`+`modelLibUrl` (ADR-18) construye una entrada custom
 *    de `appConfig` con esas URLs y el model id de CONFIG (CA-48).
 *  - `chatStream` — onToken por chunk con contenido, `signal.abort()` ⇒ NO
 *    llama a `onError` y el parcial ya emitido queda intacto (CA-22/CA-44,
 *    mismo patrón que `ollamaClient.test.ts`); error del engine a mitad ⇒
 *    `onError({kind:"engine"})` con el parcial intacto; engine no cargado ⇒
 *    `onError({kind:"engine"})` SIN rechazar la promesa.
 *
 * MOCK DE LÍMITE (R17/R18 — no hay GPU/descarga real en CI): se reemplaza el
 * paquete completo `@mlc-ai/web-llm` (que instalará el implementer como
 * parte de SF1, ver `package.json`) con un doble determinista vía
 * `vi.mock(..., factory)`; el doble nunca ejercita GPU ni red reales.
 * También se stubea el global `Worker` (ausente en jsdom, ver `pyRunner.ts`
 * — mismo patrón sin test unitario dedicado por esta misma razón) para que
 * `new Worker(new URL("./webllm.worker.ts", import.meta.url), {type:
 * "module"})` no lance en el entorno de test; el worker real NUNCA se
 * ejecuta porque `CreateWebWorkerMLCEngine` está mockeado y no usa su
 * protocolo de mensajes.
 *
 * HASTA que exista `src/assistant/webllmClient.ts` (y, por la naturaleza de
 * `vi.mock` sobre un paquete no instalado, hasta que `@mlc-ai/web-llm` esté
 * en package.json — ambos entregables de SF1), TODA esta suite falla en la
 * importación estática de `@/assistant/webllmClient` con "Failed to resolve
 * import" — rojo por la razón correcta (ausencia de código del slice).
 *
 * AMBIGÜEDADES DE CONTRATO detectadas (no resueltas aquí, reportadas al
 * reviewer/architect):
 *  - El contrato (§9.3) no especifica CÓMO distinguir `kind:"gpu"` de
 *    `kind:"red"` cuando `CreateWebWorkerMLCEngine` rechaza durante
 *    `load()` (no hay convención de forma/mensaje de error documentada).
 *    Aquí solo se testea el caso `"gpu"` (SU-11, explícito en SLICES.md
 *    §SF1); no se inventa una heurística para `"red"`.
 *  - El invariante "modelUrl y modelLibUrl: AMBOS o NINGUNO" (§9.3) no fija
 *    qué debe ocurrir si solo uno de los dos está definido (¿se ignora el
 *    override? ¿se lanza?). No se testea ese caso parcial aquí ni en
 *    `config.test.ts` para no fijar un comportamiento no especificado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatMessage, EngineStreamError } from "@/assistant/types";

// NOTA (fix de defecto de test, no de comportamiento): `FAKE_MODEL_ID` debe
// resolverse DENTRO de `vi.hoisted()` porque `vi.mock(...)` se hoistea al
// principio del archivo (por delante de cualquier `const` de nivel superior
// declarado ANTES en el código fuente); referenciar un `const` externo no
// hoisted desde dentro del factory de `vi.mock` lanza
// `ReferenceError: Cannot access '...' before initialization` en cuanto el
// paquete mockeado (`@mlc-ai/web-llm`) se importa de verdad (a partir de
// SF1). `mocks.hasModelInCache`/`mocks.createEngine` ya seguían este patrón
// correctamente; `FAKE_MODEL_ID` no lo seguía.
const mocks = vi.hoisted(() => ({
  createEngine: vi.fn(),
  hasModelInCache: vi.fn(),
  FAKE_MODEL_ID: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
}));

const FAKE_MODEL_ID = mocks.FAKE_MODEL_ID;

vi.mock("@mlc-ai/web-llm", () => ({
  CreateWebWorkerMLCEngine: mocks.createEngine,
  hasModelInCache: mocks.hasModelInCache,
  prebuiltAppConfig: {
    model_list: [
      {
        model_id: mocks.FAKE_MODEL_ID,
        model: "https://huggingface.co/mlc-ai/fake-prebuilt",
        model_lib: "https://raw.githubusercontent.com/mlc-ai/fake-prebuilt.wasm",
      },
    ],
  },
}));

// Import ESTÁTICO a propósito: valida que, una vez exista el módulo, el
// import falle EXACTAMENTE por "no existe" (no por un error de sintaxis de
// este archivo de test).
import { createWebLlmClient } from "@/assistant/webllmClient";
import type { WebLlmConfig, WebLlmLoadProgress } from "@/assistant/types";

type InitProgressCallback = (p: { progress: number; text: string }) => void;
interface FakeEngineConfigOptions {
  initProgressCallback: InitProgressCallback;
  appConfig?: { model_list: Array<{ model_id: string; model?: string; model_lib?: string }> };
}

/** jsdom no implementa `Worker`; se stubea con un doble espiable. Igual que
 *  `src/runner/pyRunner.ts` (sin test unitario dedicado por esta misma
 *  limitación de entorno), `webllmClient.ts` construye el worker con
 *  `new Worker(new URL("./webllm.worker.ts", import.meta.url), {type:
 *  "module"})` (§9.2); el doble nunca ejecuta el archivo real. */
class FakeWorker {
  postMessage = vi.fn();
  terminate = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  onmessage: unknown = null;
  onerror: unknown = null;
  constructor(..._args: unknown[]) {
    createdWorkers.push(this);
  }
}
let createdWorkers: FakeWorker[] = [];

const BASE_CONFIG: WebLlmConfig = {
  enabled: true,
  model: FAKE_MODEL_ID,
  modelUrl: "",
  modelLibUrl: "",
  modelSizeMb: 950,
};

function stubGpu(adapterResult: unknown | "absent"): void {
  if (adapterResult === "absent") {
    Reflect.deleteProperty(window.navigator as unknown as Record<string, unknown>, "gpu");
    return;
  }
  Object.defineProperty(window.navigator, "gpu", {
    value: { requestAdapter: vi.fn(async () => adapterResult) },
    configurable: true,
  });
}

function createFakeEngine() {
  return {
    chat: { completions: { create: vi.fn() } },
    interruptGenerate: vi.fn(),
    unload: vi.fn(),
  };
}
type FakeEngine = ReturnType<typeof createFakeEngine>;

/** AsyncGenerator controlable a mano, forma OpenAI-streaming
 *  (`{choices:[{delta:{content}}]}`) — análogo a `controlledStream()` de
 *  `ollamaClient.test.ts` pero para AsyncGenerator en vez de ReadableStream. */
function controlledChatGenerator() {
  const queue: Array<{ choices: Array<{ delta: { content: string } }> }> = [];
  let wake: (() => void) | null = null;
  let ended = false;
  let failWith: unknown = null;

  async function* generator() {
    for (;;) {
      if (queue.length > 0) {
        yield queue.shift()!;
        continue;
      }
      if (failWith) throw failWith;
      if (ended) return;
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  }

  return {
    iterator: generator(),
    push(content: string) {
      queue.push({ choices: [{ delta: { content } }] });
      wake?.();
      wake = null;
    },
    end() {
      ended = true;
      wake?.();
      wake = null;
    },
    fail(error: unknown) {
      failWith = error;
      wake?.();
      wake = null;
    },
  };
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function loadedClient(): Promise<{ client: ReturnType<typeof createWebLlmClient>; engine: FakeEngine }> {
  const engine = createFakeEngine();
  mocks.createEngine.mockImplementation(async (_worker: unknown, _modelId: string, options: FakeEngineConfigOptions) => {
    options.initProgressCallback({ progress: 1, text: "listo" });
    return engine;
  });
  const client = createWebLlmClient(BASE_CONFIG);
  await client.load(() => undefined);
  return { client, engine };
}

const MESSAGES: ChatMessage[] = [{ role: "user", content: "hola" }];

beforeEach(() => {
  createdWorkers = [];
  mocks.createEngine.mockReset();
  mocks.hasModelInCache.mockReset();
  vi.stubGlobal("Worker", FakeWorker as unknown as typeof Worker);
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window.navigator as unknown as Record<string, unknown>, "gpu");
});

describe("detectSupport — feature-detection pura, 0 requests (A-12, CA-41)", () => {
  it("sin navigator.gpu ⇒ false", async () => {
    stubGpu("absent");
    const client = createWebLlmClient(BASE_CONFIG);
    await expect(client.detectSupport()).resolves.toBe(false);
    expect(mocks.createEngine).not.toHaveBeenCalled();
    expect(mocks.hasModelInCache).not.toHaveBeenCalled();
  });

  it("navigator.gpu presente pero requestAdapter() resuelve null ⇒ false", async () => {
    stubGpu(null);
    const client = createWebLlmClient(BASE_CONFIG);
    await expect(client.detectSupport()).resolves.toBe(false);
    expect(mocks.createEngine).not.toHaveBeenCalled();
    expect(mocks.hasModelInCache).not.toHaveBeenCalled();
  });

  it("navigator.gpu presente y requestAdapter() resuelve un adapter ⇒ true", async () => {
    stubGpu({ features: [] });
    const client = createWebLlmClient(BASE_CONFIG);
    await expect(client.detectSupport()).resolves.toBe(true);
    expect(mocks.createEngine).not.toHaveBeenCalled();
    expect(mocks.hasModelInCache).not.toHaveBeenCalled();
  });
});

describe("isModelCached — delega en hasModelInCache, sin red (CA-40a/b)", () => {
  it("true cuando hasModelInCache resuelve true", async () => {
    mocks.hasModelInCache.mockResolvedValue(true);
    const client = createWebLlmClient(BASE_CONFIG);
    await expect(client.isModelCached()).resolves.toBe(true);
    expect(mocks.createEngine).not.toHaveBeenCalled();
  });

  it("false cuando hasModelInCache resuelve false", async () => {
    mocks.hasModelInCache.mockResolvedValue(false);
    const client = createWebLlmClient(BASE_CONFIG);
    await expect(client.isModelCached()).resolves.toBe(false);
    expect(mocks.createEngine).not.toHaveBeenCalled();
  });
});

describe("load — progreso monótono 0→100 y resolución (CA-42)", () => {
  it("reporta pct no decreciente y termina en 100 al quedar listo", async () => {
    const engine = createFakeEngine();
    mocks.createEngine.mockImplementation(async (_worker: unknown, _modelId: string, options: FakeEngineConfigOptions) => {
      options.initProgressCallback({ progress: 0, text: "Fetching param cache [0/24]" });
      options.initProgressCallback({ progress: 0.42, text: "Fetching param cache [10/24]" });
      options.initProgressCallback({ progress: 1, text: "Todo listo" });
      return engine;
    });

    const client = createWebLlmClient(BASE_CONFIG);
    const seen: WebLlmLoadProgress[] = [];
    await client.load((p) => {
      seen.push(p);
    });

    expect(seen.length).toBeGreaterThanOrEqual(2);
    for (const p of seen) {
      expect(typeof p.texto).toBe("string");
      expect(p.pct).toBeGreaterThanOrEqual(0);
      expect(p.pct).toBeLessThanOrEqual(100);
    }
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i].pct).toBeGreaterThanOrEqual(seen[i - 1].pct);
    }
    expect(seen[seen.length - 1].pct).toBe(100);
  });

  it("es idempotente: una vez listo, un segundo load() resuelve sin recrear el engine", async () => {
    const { client } = await loadedClient();
    expect(mocks.createEngine).toHaveBeenCalledTimes(1);

    await client.load(() => undefined);
    expect(mocks.createEngine).toHaveBeenCalledTimes(1);
  });
});

describe("cancelLoad — corta un load en curso (CA-43)", () => {
  it("terminate() + el load pendiente rechaza WebLlmInitError{kind:'cancelado'} en ≤2 s", async () => {
    let progressCb: InitProgressCallback | null = null;
    mocks.createEngine.mockImplementation((_worker: unknown, _modelId: string, options: FakeEngineConfigOptions) => {
      progressCb = options.initProgressCallback;
      return new Promise(() => {
        /* nunca se resuelve: simula descarga en curso */
      });
    });

    const client = createWebLlmClient(BASE_CONFIG);
    const pending = client.load(() => undefined);

    await tick();
    expect(progressCb).not.toBeNull();
    expect(createdWorkers).toHaveLength(1);

    const start = Date.now();
    client.cancelLoad();

    await expect(pending).rejects.toMatchObject({ kind: "cancelado" });
    const elapsedMs = Date.now() - start;

    expect(elapsedMs).toBeLessThanOrEqual(2000);
    expect(createdWorkers[0].terminate).toHaveBeenCalledTimes(1);
  });

  it("es no-op si no hay carga en curso", () => {
    const client = createWebLlmClient(BASE_CONFIG);
    expect(() => client.cancelLoad()).not.toThrow();
  });

  it("un load() posterior a cancelar crea un worker NUEVO (re-init lazy, ADR-17)", async () => {
    mocks.createEngine.mockImplementationOnce(
      () =>
        new Promise(() => {
          /* nunca resuelve */
        }),
    );
    const client = createWebLlmClient(BASE_CONFIG);
    const firstLoad = client.load(() => undefined);
    await tick();
    expect(createdWorkers).toHaveLength(1);

    client.cancelLoad();
    await expect(firstLoad).rejects.toMatchObject({ kind: "cancelado" });

    const engine = createFakeEngine();
    mocks.createEngine.mockImplementationOnce(async (_worker: unknown, _modelId: string, options: FakeEngineConfigOptions) => {
      options.initProgressCallback({ progress: 1, text: "listo" });
      return engine;
    });
    await client.load(() => undefined);

    expect(createdWorkers).toHaveLength(2);
  });
});

describe("load — fallo de init por GPU (SU-11)", () => {
  it("rechaza WebLlmInitError{kind:'gpu'} si CreateWebWorkerMLCEngine falla al iniciar", async () => {
    mocks.createEngine.mockRejectedValue(new Error("WebGPU device could not be created"));
    const client = createWebLlmClient(BASE_CONFIG);
    await expect(client.load(() => undefined)).rejects.toMatchObject({ kind: "gpu" });
  });
});

describe("override modelUrl + modelLibUrl (ADR-18, CA-48)", () => {
  it("sin override: usa prebuiltAppConfig con el model id de CONFIG", async () => {
    const engine = createFakeEngine();
    mocks.createEngine.mockImplementation(async (_worker: unknown, modelId: string, options: FakeEngineConfigOptions) => {
      expect(modelId).toBe(FAKE_MODEL_ID);
      expect(options.appConfig?.model_list.some((m) => m.model_id === FAKE_MODEL_ID)).toBe(true);
      options.initProgressCallback({ progress: 1, text: "listo" });
      return engine;
    });
    const client = createWebLlmClient(BASE_CONFIG);
    await client.load(() => undefined);
    expect(mocks.createEngine).toHaveBeenCalledTimes(1);
  });

  it("con override: construye una entrada custom de appConfig con las URLs y el model id de CONFIG", async () => {
    const overrideConfig: WebLlmConfig = {
      ...BASE_CONFIG,
      modelUrl: "https://intranet.example.com/modelos/qwen-1.5b/",
      modelLibUrl: "https://intranet.example.com/wasm/qwen-1.5b.wasm",
    };
    const engine = createFakeEngine();
    mocks.createEngine.mockImplementation(async (_worker: unknown, modelId: string, options: FakeEngineConfigOptions) => {
      expect(modelId).toBe(FAKE_MODEL_ID);
      expect(options.appConfig?.model_list).toContainEqual({
        model: overrideConfig.modelUrl,
        model_lib: overrideConfig.modelLibUrl,
        model_id: FAKE_MODEL_ID,
      });
      options.initProgressCallback({ progress: 1, text: "listo" });
      return engine;
    });
    const client = createWebLlmClient(overrideConfig);
    await client.load(() => undefined);
    expect(mocks.createEngine).toHaveBeenCalledTimes(1);
  });
});

describe("chatStream — paridad C-OLLAMA (CA-44)", () => {
  it("emite onToken por cada chunk con contenido no vacío (delta.content !== '')", async () => {
    const { client, engine } = await loadedClient();
    const gen = controlledChatGenerator();
    engine.chat.completions.create.mockResolvedValue(gen.iterator);

    const tokens: string[] = [];
    const onDone = vi.fn();
    const onError = vi.fn();
    const promise = client.chatStream(
      MESSAGES,
      { onToken: (t) => tokens.push(t), onDone, onError },
      new AbortController().signal,
    );

    await tick();
    gen.push("Hola");
    gen.push(""); // contenido vacío: NO debe generar onToken (paridad NDJSON, R14 nota "delta.content")
    gen.push(" mundo");
    gen.end();

    await promise;

    expect(tokens.join("")).toBe("Hola mundo");
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("signal.abort() ⇒ interruptGenerate(), corta en ≤2 s, SIN onError, parcial intacto (CA-22/CA-44)", async () => {
    const { client, engine } = await loadedClient();
    const gen = controlledChatGenerator();
    engine.chat.completions.create.mockResolvedValue(gen.iterator);

    const controller = new AbortController();
    const tokens: string[] = [];
    const onError = vi.fn();
    const onDone = vi.fn();

    gen.push("parcial");

    const promise = client.chatStream(
      MESSAGES,
      { onToken: (t) => tokens.push(t), onDone, onError },
      controller.signal,
    );

    await tick();
    controller.abort();

    const start = Date.now();
    await promise;
    const elapsedMs = Date.now() - start;

    expect(elapsedMs).toBeLessThanOrEqual(2000);
    expect(tokens.join("")).toBe("parcial");
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(engine.interruptGenerate).toHaveBeenCalledTimes(1);
  });

  it("error del engine a mitad ⇒ onError({kind:'engine'}) con el parcial intacto", async () => {
    const { client, engine } = await loadedClient();
    const gen = controlledChatGenerator();
    engine.chat.completions.create.mockResolvedValue(gen.iterator);

    const tokens: string[] = [];
    let captured: EngineStreamError | null = null;

    gen.push("parcial");

    const promise = client.chatStream(
      MESSAGES,
      {
        onToken: (t) => tokens.push(t),
        onDone: vi.fn(),
        onError: (e) => {
          captured = e;
        },
      },
      new AbortController().signal,
    );

    await tick();
    gen.fail(new Error("engine crashed"));

    await expect(promise).resolves.toBeUndefined();
    expect(tokens.join("")).toBe("parcial");
    expect(captured).not.toBeNull();
    expect((captured as unknown as EngineStreamError).kind).toBe("engine");
  });

  it("engine no cargado ⇒ onError(kind:'engine'), NUNCA rechaza la promesa", async () => {
    const client = createWebLlmClient(BASE_CONFIG); // sin load() previo
    let captured: EngineStreamError | null = null;

    await expect(
      client.chatStream(
        MESSAGES,
        {
          onToken: vi.fn(),
          onDone: vi.fn(),
          onError: (e) => {
            captured = e;
          },
        },
        new AbortController().signal,
      ),
    ).resolves.toBeUndefined();

    expect(captured).not.toBeNull();
    expect((captured as unknown as EngineStreamError).kind).toBe("engine");
  });
});
