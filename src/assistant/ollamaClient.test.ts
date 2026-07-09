/**
 * Tests unitarios de `src/assistant/ollamaClient.ts` (contrato C-OLLAMA,
 * ARCHITECTURE.md §4). Slice S8 — SLICES.md §S8.
 *
 * Cubre, con `fetch` mockeado (sin red real, CA-25 a nivel unitario):
 *  - CA-18/19/20 — los 3 estados de `checkHealth()`: conectado, modelo no
 *    instalado, sin conexión (incluye timeout, R5 tolerancia de formato).
 *  - R4 — `chatStream` parsea NDJSON con líneas partidas entre chunks,
 *    reconstruyéndolas con un buffer.
 *  - CA-22 — abort a mitad de stream: se corta, el parcial queda intacto y
 *    NO se llama a `onError`.
 *  - CA-26 — error de red a mitad de stream: `onError` se llama con el
 *    parcial ya emitido intacto.
 *  - CA-25 — todas las peticiones usan `baseUrl` (proxy), nunca un host
 *    externo hardcodeado.
 *
 * Se opera EXCLUSIVAMENTE contra la superficie pública declarada en
 * C-OLLAMA: `createOllamaClient(config): OllamaClient` (misma convención de
 * factory que `createPyRunner` en `src/runner/pyRunner.ts`), sus métodos
 * `checkHealth()` / `chatStream()`, y los tipos/constantes de
 * `src/assistant/types.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createOllamaClient } from "@/assistant/ollamaClient";
import type { ChatMessage, OllamaConfig, OllamaStreamError } from "@/assistant/types";

const BASE_CONFIG: OllamaConfig = {
  baseUrl: "/ollama",
  model: "qwen2.5-coder:14b",
  healthIntervalMs: 15000,
  healthTimeoutMs: 3000,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Construye un stream real cuyos chunks se controlan manualmente desde el test. */
function controlledStream() {
  let enqueue!: (chunk: Uint8Array) => void;
  let close!: () => void;
  let error!: (e: unknown) => void;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      enqueue = (chunk) => controller.enqueue(chunk);
      close = () => controller.close();
      error = (e) => controller.error(e);
    },
  });
  return { stream, enqueue, close, error };
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

const MESSAGES: ChatMessage[] = [{ role: "user", content: "hola" }];

describe("checkHealth — 3 estados visibles (CA-18/19/20)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("responde 200 con el modelo exacto en tags ⇒ connected (CA-18)", async () => {
    const fetchMock = vi.fn(async (_url?: string, _init?: RequestInit) =>
      jsonResponse({ models: [{ name: "qwen2.5-coder:14b" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createOllamaClient(BASE_CONFIG);
    await expect(client.checkHealth()).resolves.toBe("connected");

    // CA-25: la petición sale al baseUrl (proxy), nunca a un host externo.
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/ollama");
    expect(url).toContain("/api/tags");
  });

  it("responde 200 con un tag que comparte el nombre base (prefijo) ⇒ connected", async () => {
    // Contrato: "connected ⇔ ... algún tag cuyo nombre === model o empieza por
    // `${model.split(':')[0]}:`". Ej.: instalado "qwen2.5-coder:7b" cuenta.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ models: [{ name: "qwen2.5-coder:7b" }] })),
    );

    const client = createOllamaClient(BASE_CONFIG);
    await expect(client.checkHealth()).resolves.toBe("connected");
  });

  it("responde 200 SIN el modelo instalado ⇒ model_missing (CA-20)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ models: [{ name: "llama3:8b" }] })),
    );

    const client = createOllamaClient(BASE_CONFIG);
    await expect(client.checkHealth()).resolves.toBe("model_missing");
  });

  it("responde 200 con lista de tags vacía ⇒ model_missing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ models: [] })));

    const client = createOllamaClient(BASE_CONFIG);
    await expect(client.checkHealth()).resolves.toBe("model_missing");
  });

  it("responde con status distinto de 200 ⇒ disconnected (CA-19)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 500)));

    const client = createOllamaClient(BASE_CONFIG);
    await expect(client.checkHealth()).resolves.toBe("disconnected");
  });

  it("fetch rechaza (Ollama apagado / conexión rechazada) ⇒ disconnected (CA-19)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    const client = createOllamaClient(BASE_CONFIG);
    await expect(client.checkHealth()).resolves.toBe("disconnected");
  });

  it("no responde dentro de healthTimeoutMs ⇒ disconnected (timeout)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, opts?: { signal?: AbortSignal }) =>
          new Promise<Response>((_resolve, reject) => {
            opts?.signal?.addEventListener("abort", () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            });
          }),
      ),
    );

    const client = createOllamaClient({ ...BASE_CONFIG, healthTimeoutMs: 3000 });
    const pending = client.checkHealth();

    await vi.advanceTimersByTimeAsync(3000);

    await expect(pending).resolves.toBe("disconnected");
  });
});

describe("chatStream — parser NDJSON con buffer de líneas partidas (R4)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ensambla líneas NDJSON partidas arbitrariamente entre chunks", async () => {
    const line1 = JSON.stringify({ message: { content: "Hola" }, done: false }) + "\n";
    const line2 = JSON.stringify({ message: { content: " mundo" }, done: false }) + "\n";
    const line3 = JSON.stringify({ message: { content: "" }, done: true }) + "\n";
    const full = line1 + line2 + line3;
    const bytes = encode(full);

    // Cortes arbitrarios que NO respetan los límites de línea.
    const cut1 = 5;
    const cut2 = line1.length + 8;

    const { stream, enqueue, close } = controlledStream();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(stream, { status: 200 }),
    );

    enqueue(bytes.slice(0, cut1));
    enqueue(bytes.slice(cut1, cut2));
    enqueue(bytes.slice(cut2));
    close();

    const tokens: string[] = [];
    let doneCalled = false;
    const onError = vi.fn();

    const client = createOllamaClient(BASE_CONFIG);
    await client.chatStream(
      MESSAGES,
      {
        onToken: (t) => tokens.push(t),
        onDone: () => {
          doneCalled = true;
        },
        onError,
      },
      new AbortController().signal,
    );

    expect(tokens.join("")).toBe("Hola mundo");
    expect(doneCalled).toBe(true);
    expect(onError).not.toHaveBeenCalled();
  });

  it("usa POST a {baseUrl}/api/chat con stream:true (CA-25: nunca un host externo)", async () => {
    const { stream, close } = controlledStream();
    close();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(stream, { status: 200 }),
    );

    const client = createOllamaClient(BASE_CONFIG);
    await client.chatStream(
      MESSAGES,
      { onToken: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
      new AbortController().signal,
    );

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/ollama");
    expect(url).toContain("/api/chat");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe(BASE_CONFIG.model);
    expect(body.stream).toBe(true);
  });
});

describe("chatStream — abort a mitad de stream (CA-22)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("signal.abort() corta el reader en ≤2 s, conserva el parcial y NO llama a onError", async () => {
    const { stream, enqueue } = controlledStream();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(stream, { status: 200 })),
    );

    const controller = new AbortController();
    const tokens: string[] = [];
    const onError = vi.fn();
    const onDone = vi.fn();

    // Un primer token válido, luego el stream queda "abierto" (sin done:true).
    enqueue(encode(JSON.stringify({ message: { content: "parcial" }, done: false }) + "\n"));

    const client = createOllamaClient(BASE_CONFIG);
    const promise = client.chatStream(
      MESSAGES,
      { onToken: (t) => tokens.push(t), onDone, onError },
      controller.signal,
    );

    // Deja que el primer chunk se procese antes de abortar (macrotask: da
    // margen de sobra a los saltos de microtarea del fetch mockeado + lectura
    // del stream, sin acoplarse a un número exacto de ticks).
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();

    const start = Date.now();
    await promise;
    const elapsedMs = Date.now() - start;

    expect(elapsedMs).toBeLessThanOrEqual(2000);
    expect(tokens.join("")).toBe("parcial");
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("chatStream — error de red a mitad de stream (CA-26)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("onError se llama con el parcial ya emitido intacto y la app sigue viva", async () => {
    const { stream, enqueue, error } = controlledStream();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(stream, { status: 200 })),
    );

    const tokens: string[] = [];
    let capturedError: OllamaStreamError | null = null;

    enqueue(encode(JSON.stringify({ message: { content: "parcial" }, done: false }) + "\n"));

    const client = createOllamaClient(BASE_CONFIG);
    const promise = client.chatStream(
      MESSAGES,
      {
        onToken: (t) => tokens.push(t),
        onDone: vi.fn(),
        onError: (e) => {
          capturedError = e;
        },
      },
      new AbortController().signal,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    error(new TypeError("network drop"));

    await expect(promise).resolves.toBeUndefined();

    expect(tokens.join("")).toBe("parcial");
    expect(capturedError).not.toBeNull();
    expect((capturedError as unknown as OllamaStreamError).kind).toBe("network");
  });
});
