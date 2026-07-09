/**
 * Cliente del runner (implementación de `PyRunner`, C-RUNNER). Vive en el
 * hilo principal; el trabajo real ocurre en `py.worker.ts` (Web Worker
 * dedicado). Cola de 1 ejecución; timeout duro vía `worker.terminate()` +
 * re-init lazy (única forma fiable de matar wasm síncrono, ver ADR-01/R3).
 */
import { CONFIG } from "@/config";

import type { PyRunner, RunChallengeRequest, RunChallengeResult, RunnerState } from "./types";
import type { WorkerOutboundMessage } from "./workerProtocol";

function timeoutResult(timeoutMs: number): RunChallengeResult {
  const seconds = Math.round(timeoutMs / 1000);
  return { status: "timeout", message: `El código superó el límite de ${seconds} s` };
}

export class PyodideRunner implements PyRunner {
  private readonly pyodideBaseUrl: string;
  private worker: Worker | null = null;
  private state: RunnerState = "idle";
  private initPromise: Promise<void> | null = null;
  /** Cola de ejecuciones: garantiza como máximo 1 intento en curso. */
  private queue: Promise<void> = Promise.resolve();

  constructor(pyodideBaseUrl: string) {
    this.pyodideBaseUrl = pyodideBaseUrl;
  }

  getState(): RunnerState {
    return this.state;
  }

  init(): Promise<void> {
    if (this.state === "ready") return Promise.resolve();
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.startWorker().catch((error: unknown) => {
      this.state = "error";
      this.initPromise = null;
      throw error;
    });
    return this.initPromise;
  }

  runChallenge(request: RunChallengeRequest): Promise<RunChallengeResult> {
    const run = () => this.runOnce(request);
    const result = this.queue.then(run, run);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  cancel(): void {
    this.hardReset();
  }

  private startWorker(): Promise<void> {
    this.state = "loading";
    this.worker = new Worker(new URL("./py.worker.ts", import.meta.url), { type: "module" });
    return new Promise<void>((resolve, reject) => {
      const worker = this.worker;
      if (!worker) {
        reject(new Error("No se pudo crear el worker del runner."));
        return;
      }
      const onMessage = (event: MessageEvent<WorkerOutboundMessage>) => {
        const message = event.data;
        if (message.type === "ready") {
          worker.removeEventListener("message", onMessage);
          this.state = "ready";
          resolve();
        } else if (message.type === "init-error") {
          worker.removeEventListener("message", onMessage);
          reject(new Error(message.message));
        }
      };
      const onError = (event: ErrorEvent) => {
        worker.removeEventListener("message", onMessage);
        reject(new Error(event.message || "Fallo al inicializar el worker del runner."));
      };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError, { once: true });
      worker.postMessage({ type: "init", pyodideBaseUrl: this.pyodideBaseUrl });
    });
  }

  private async runOnce(request: RunChallengeRequest): Promise<RunChallengeResult> {
    await this.init();
    const worker = this.worker;
    if (!worker) {
      throw new Error("El runner no está inicializado (fallo de infraestructura).");
    }
    this.state = "running";

    return new Promise<RunChallengeResult>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.hardReset();
        resolve(timeoutResult(request.timeoutMs));
      }, request.timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
      };

      const onMessage = (event: MessageEvent<WorkerOutboundMessage>) => {
        if (settled) return;
        const message = event.data;
        if (message.type === "result") {
          settled = true;
          cleanup();
          this.state = "ready";
          resolve(message.result);
        } else if (message.type === "infra-error") {
          settled = true;
          cleanup();
          this.hardReset();
          reject(new Error(message.message));
        }
      };
      const onError = (event: ErrorEvent) => {
        if (settled) return;
        settled = true;
        cleanup();
        this.hardReset();
        reject(new Error(event.message || "Fallo de infraestructura del runner."));
      };

      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      worker.postMessage({ type: "run", request });
    });
  }

  /** Termina el worker actual (mata wasm síncrono) y prepara re-init lazy. */
  private hardReset(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.state = "idle";
    this.initPromise = null;
  }
}

/**
 * Factory pública de `PyRunner` (nombre elegido por el test-author en
 * `e2e/runner/pyRunner.spec.ts`; C-RUNNER solo fija la interfaz `PyRunner`,
 * no cómo se instancia). Cada llamada crea una instancia aislada con su
 * propio worker/cola — útil para tests; la app usa el singleton de
 * `useRunner.ts`.
 */
export function createPyRunner(pyodideBaseUrl: string = CONFIG.runner.pyodideBaseUrl): PyRunner {
  return new PyodideRunner(pyodideBaseUrl);
}
