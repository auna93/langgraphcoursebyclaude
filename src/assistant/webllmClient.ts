/**
 * Cliente WebLLM (implementación de C-WEBLLM, `src/assistant/types.ts`, contrato
 * `docs/arch/ARCHITECTURE-M5-WEBLLM.md` §9.3). Toda la computación pesada
 * (descarga de artefactos, compilación wasm/GPU, inferencia) ocurre en el Web
 * Worker dedicado `webllm.worker.ts` (patrón `py.worker.ts`/C-RUNNER, ADR-17):
 * cancelar = `worker.terminate()` + worker NUEVO en el siguiente `load()`.
 */
import {
  CreateWebWorkerMLCEngine,
  hasModelInCache,
  prebuiltAppConfig,
} from "@mlc-ai/web-llm";
import type {
  AppConfig as WebLlmAppConfig,
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  InitProgressReport,
  WebWorkerMLCEngine,
} from "@mlc-ai/web-llm";

import type {
  ChatMessage,
  EngineStreamError,
  WebLlmClient,
  WebLlmConfig,
  WebLlmInitError,
  WebLlmLoadProgress,
} from "@/assistant/types";

/** WebGPU no forma parte de `lib.dom.d.ts` de TypeScript hoy; declaración mínima
 *  local solo para la feature-detection pura de `detectSupport()` (A-12). */
interface NavigatorWithGpu {
  gpu?: {
    requestAdapter(): Promise<unknown>;
  };
}

type WebLlmEngine = Pick<WebWorkerMLCEngine, "chat" | "interruptGenerate" | "unload">;

function isWebLlmInitError(err: unknown): err is WebLlmInitError {
  return (
    typeof err === "object" &&
    err !== null &&
    "kind" in err &&
    "message" in err &&
    typeof (err as { kind: unknown }).kind === "string"
  );
}

/**
 * Heurística de clasificación gpu/red (AMBIGÜEDAD DE CONTRATO — §9.3 no fija una
 * convención): un fallo de `CreateWebWorkerMLCEngine` cuyo mensaje menciona
 * GPU/adapter/dispositivo se trata como "gpu" (SU-11 ⇒ unsupported, estado
 * ESTABLE de sesión). Cualquier otro fallo (incl. mensajes de red/fetch, y el
 * caso por defecto no identificado) se trata conservadoramente como "red"
 * (⇒ estado "error", reintentable) para no degradar a "unsupported" —
 * terminal e irreversible en la sesión (§9.4.1) — ante un fallo que podría ser
 * transitorio.
 */
function mapInitError(err: unknown): WebLlmInitError {
  const message = err instanceof Error ? err.message : String(err);
  if (/webgpu|gpu|adapter|device/i.test(message)) {
    return {
      kind: "gpu",
      message: `No se pudo inicializar el modelo local (WebGPU): ${message}`,
    };
  }
  return {
    kind: "red",
    message: `No se pudo descargar o cargar el modelo local: ${message}`,
  };
}

export function createWebLlmClient(config: WebLlmConfig): WebLlmClient {
  let status: "idle" | "loading" | "ready" = "idle";
  let worker: Worker | null = null;
  let engine: WebLlmEngine | null = null;
  let loadPromise: Promise<void> | null = null;
  let pendingCancelReject: ((err: WebLlmInitError) => void) | null = null;

  /**
   * AMBIGÜEDAD DE CONTRATO (§9.3: "modelUrl y modelLibUrl: AMBOS o NINGUNO",
   * sin especificar qué ocurre si solo uno está definido): se trata como
   * configuración inválida y se degrada a los defaults de `prebuiltAppConfig`
   * (ADR-18) en vez de lanzar — evita que un typo de despliegue tumbe el
   * fallback entero; se avisa por consola para diagnóstico.
   */
  function buildAppConfig(): WebLlmAppConfig {
    const { modelUrl, modelLibUrl, model } = config;
    if (modelUrl && modelLibUrl) {
      return {
        model_list: [{ model: modelUrl, model_lib: modelLibUrl, model_id: model }],
      };
    }
    if (modelUrl || modelLibUrl) {
      console.warn(
        "[webllmClient] VITE_WEBLLM_MODEL_URL y VITE_WEBLLM_MODEL_LIB_URL deben " +
          "definirse ambos o ninguno (§9.3); se ignora el override parcial y se " +
          "usan los defaults de prebuiltAppConfig (ADR-18).",
      );
    }
    return prebuiltAppConfig;
  }

  async function detectSupport(): Promise<boolean> {
    const gpu = (navigator as unknown as NavigatorWithGpu).gpu;
    if (!gpu) return false;
    try {
      const adapter = await gpu.requestAdapter();
      return adapter !== null && adapter !== undefined;
    } catch {
      return false;
    }
  }

  async function isModelCached(): Promise<boolean> {
    return hasModelInCache(config.model, buildAppConfig());
  }

  function load(onProgress: (p: WebLlmLoadProgress) => void): Promise<void> {
    if (status === "ready") return Promise.resolve();
    if (loadPromise) return loadPromise;

    status = "loading";
    const currentWorker = new Worker(new URL("./webllm.worker.ts", import.meta.url), {
      type: "module",
    });
    worker = currentWorker;

    let lastPct = 0;
    const appConfig = buildAppConfig();

    let rejectCancel: ((err: WebLlmInitError) => void) | null = null;
    const cancellation = new Promise<never>((_resolve, reject) => {
      rejectCancel = reject;
    });
    pendingCancelReject = rejectCancel;

    const createPromise = CreateWebWorkerMLCEngine(currentWorker, config.model, {
      appConfig,
      initProgressCallback: (report: InitProgressReport) => {
        const clamped = Math.min(1, Math.max(0, report.progress));
        const pct = Math.max(lastPct, Math.round(clamped * 100));
        lastPct = pct;
        onProgress({ pct, texto: report.text });
      },
    });

    const promise = Promise.race([createPromise, cancellation])
      .then((readyEngine) => {
        engine = readyEngine;
        status = "ready";
      })
      .catch((err: unknown) => {
        status = "idle";
        if (worker === currentWorker) {
          currentWorker.terminate();
          worker = null;
        }
        throw isWebLlmInitError(err) ? err : mapInitError(err);
      })
      .finally(() => {
        loadPromise = null;
        pendingCancelReject = null;
      });

    loadPromise = promise;
    return promise;
  }

  function cancelLoad(): void {
    if (status !== "loading") return;
    status = "idle";
    const currentWorker = worker;
    worker = null;
    currentWorker?.terminate();
    const reject = pendingCancelReject;
    pendingCancelReject = null;
    reject?.({ kind: "cancelado", message: "Descarga cancelada por el alumno." });
  }

  async function chatStream(
    messages: ChatMessage[],
    handlers: {
      onToken(t: string): void;
      onDone(): void;
      onError(e: EngineStreamError): void;
    },
    signal: AbortSignal,
  ): Promise<void> {
    if (!engine) {
      handlers.onError({
        kind: "engine",
        message: "El modelo WebGPU local no está cargado.",
      });
      return;
    }
    const activeEngine = engine;

    let aborted = signal.aborted;
    let resolveAbort: (() => void) | null = null;
    const abortSignal = new Promise<void>((resolve) => {
      resolveAbort = resolve;
    });
    const onAbort = () => {
      aborted = true;
      activeEngine.interruptGenerate();
      resolveAbort?.();
    };
    signal.addEventListener("abort", onAbort);
    if (aborted) onAbort();

    try {
      const stream = (await activeEngine.chat.completions.create({
        messages: messages as unknown as ChatCompletionMessageParam[],
        stream: true,
      })) as AsyncIterable<ChatCompletionChunk>;
      const iterator = stream[Symbol.asyncIterator]();

      while (!aborted) {
        // Carrera entre el siguiente chunk y el abort: si el signal se aborta
        // mientras `iterator.next()` sigue pendiente (p. ej. esperando al
        // siguiente token del engine), el bucle corta de inmediato en vez de
        // esperar a que el generator resuelva por sí solo (CA-22 ≤2 s).
        const step = await Promise.race([
          iterator.next().then((r) => ({ aborted: false as const, result: r })),
          abortSignal.then(() => ({ aborted: true as const, result: null })),
        ]);
        if (step.aborted) break;
        if (step.result.done) break;
        const content = step.result.value.choices[0]?.delta?.content ?? "";
        if (content !== "") handlers.onToken(content);
      }
      if (!aborted) handlers.onDone();
    } catch (err) {
      if (!aborted) {
        handlers.onError({
          kind: "engine",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }

  function unload(): void {
    if (engine) {
      void engine.unload();
      engine = null;
    }
    if (worker) {
      worker.terminate();
      worker = null;
    }
    status = "idle";
    loadPromise = null;
    pendingCancelReject = null;
  }

  return { detectSupport, isModelCached, load, cancelLoad, chatStream, unload };
}
