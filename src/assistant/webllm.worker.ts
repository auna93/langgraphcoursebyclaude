/// <reference lib="webworker" />
/**
 * Web Worker dedicado: handler oficial de `@mlc-ai/web-llm` (patrón análogo a
 * `src/runner/py.worker.ts`). Toda la computación (fetch de artefactos,
 * compilación wasm/GPU, inferencia) ocurre aquí ⇒ la app del curso sigue
 * interactiva durante la descarga (CA-42). Ver C-WEBLLM
 * (`docs/arch/ARCHITECTURE-M5-WEBLLM.md` §9.3) para el contrato que implementa.
 */
import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => handler.onmessage(msg);
