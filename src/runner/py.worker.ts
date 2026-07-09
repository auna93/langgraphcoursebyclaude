/// <reference lib="webworker" />
/**
 * Web Worker dedicado: init lazy de Pyodide + shim `langgraph` + harness,
 * bloqueo de red (CA-10) y ejecución de retos en namespace nuevo (CA-06/07).
 * Ver C-RUNNER (ARCHITECTURE.md §4) para el contrato que implementa.
 */
import { loadPyodide } from "pyodide";

import courseHarnessSource from "../../python/course_harness.py?raw";
import typingExtensionsSource from "../../python/typing_extensions.py?raw";
import langgraphInitSource from "../../python/langgraph/__init__.py?raw";
import langgraphRuntimeSource from "../../python/langgraph/_runtime.py?raw";
import langgraphErrorsSource from "../../python/langgraph/errors.py?raw";
import langgraphTypesSource from "../../python/langgraph/types.py?raw";
import langgraphConfigSource from "../../python/langgraph/config.py?raw";
import langgraphGraphInitSource from "../../python/langgraph/graph/__init__.py?raw";
import langgraphGraphMessageSource from "../../python/langgraph/graph/message.py?raw";
import langgraphCheckpointInitSource from "../../python/langgraph/checkpoint/__init__.py?raw";
import langgraphCheckpointMemorySource from "../../python/langgraph/checkpoint/memory.py?raw";
import langgraphStoreInitSource from "../../python/langgraph/store/__init__.py?raw";
import langgraphStoreMemorySource from "../../python/langgraph/store/memory.py?raw";
import langgraphPrebuiltInitSource from "../../python/langgraph/prebuilt/__init__.py?raw";
import langchainInitSource from "../../python/langchain/__init__.py?raw";
import langchainMessagesSource from "../../python/langchain/messages.py?raw";
import langchainToolsSource from "../../python/langchain/tools.py?raw";
import langchainCoreInitSource from "../../python/langchain_core/__init__.py?raw";
import langchainCoreMessagesSource from "../../python/langchain_core/messages.py?raw";
import langchainCoreToolsSource from "../../python/langchain_core/tools.py?raw";

import type { RunChallengeResult } from "./types";
import type { WorkerInboundMessage, WorkerOutboundMessage } from "./workerProtocol";

/* eslint-disable @typescript-eslint/no-explicit-any -- API de Pyodide no tiene tipos propios aquí */
type PyodideInterface = any;

declare const self: DedicatedWorkerGlobalScope;

let pyodide: PyodideInterface | null = null;
let harnessModule: PyodideInterface | null = null;

function post(message: WorkerOutboundMessage): void {
  self.postMessage(message);
}

/** Elimina los puentes de red del scope antes de ejecutar código del alumno (CA-10). */
function blockNetwork(): void {
  const networkBlocked = (): never => {
    throw new Error("Red deshabilitada durante la validación de retos (CA-10).");
  };
  const globalScope = self as unknown as Record<string, unknown>;
  globalScope.fetch = networkBlocked;
  globalScope.XMLHttpRequest = function XMLHttpRequestBlocked(): never {
    return networkBlocked();
  };
  globalScope.WebSocket = function WebSocketBlocked(): never {
    return networkBlocked();
  };
}

async function initPyodide(pyodideBaseUrl: string): Promise<void> {
  const baseUrl = pyodideBaseUrl.endsWith("/") ? pyodideBaseUrl : `${pyodideBaseUrl}/`;
  // `loadPyodide` (el pequeño orquestador JS) se bundlea desde el paquete npm
  // `pyodide` como cualquier otro módulo (mismo origen tras el build, CA-10).
  // Los assets pesados (wasm/zip/lock) se cargan aparte desde `indexURL`,
  // que apunta a `public/pyodide/` self-hosted (ADR-01) — desacoplado de
  // dónde vive el loader JS, que es justo para lo que sirve esta opción.
  pyodide = await loadPyodide({ indexURL: baseUrl });

  pyodide.FS.mkdirTree("/course/langgraph/graph");
  pyodide.FS.mkdirTree("/course/langgraph/checkpoint");
  pyodide.FS.mkdirTree("/course/langgraph/store");
  pyodide.FS.mkdirTree("/course/langgraph/prebuilt");
  pyodide.FS.mkdirTree("/course/langchain");
  pyodide.FS.mkdirTree("/course/langchain_core");
  pyodide.FS.writeFile("/course/course_harness.py", courseHarnessSource);
  pyodide.FS.writeFile("/course/typing_extensions.py", typingExtensionsSource);
  pyodide.FS.writeFile("/course/langgraph/__init__.py", langgraphInitSource);
  pyodide.FS.writeFile("/course/langgraph/_runtime.py", langgraphRuntimeSource);
  pyodide.FS.writeFile("/course/langgraph/errors.py", langgraphErrorsSource);
  pyodide.FS.writeFile("/course/langgraph/types.py", langgraphTypesSource);
  pyodide.FS.writeFile("/course/langgraph/config.py", langgraphConfigSource);
  pyodide.FS.writeFile("/course/langgraph/graph/__init__.py", langgraphGraphInitSource);
  pyodide.FS.writeFile("/course/langgraph/graph/message.py", langgraphGraphMessageSource);
  pyodide.FS.writeFile("/course/langgraph/checkpoint/__init__.py", langgraphCheckpointInitSource);
  pyodide.FS.writeFile("/course/langgraph/checkpoint/memory.py", langgraphCheckpointMemorySource);
  pyodide.FS.writeFile("/course/langgraph/store/__init__.py", langgraphStoreInitSource);
  pyodide.FS.writeFile("/course/langgraph/store/memory.py", langgraphStoreMemorySource);
  pyodide.FS.writeFile("/course/langgraph/prebuilt/__init__.py", langgraphPrebuiltInitSource);
  pyodide.FS.writeFile("/course/langchain/__init__.py", langchainInitSource);
  pyodide.FS.writeFile("/course/langchain/messages.py", langchainMessagesSource);
  pyodide.FS.writeFile("/course/langchain/tools.py", langchainToolsSource);
  pyodide.FS.writeFile("/course/langchain_core/__init__.py", langchainCoreInitSource);
  pyodide.FS.writeFile("/course/langchain_core/messages.py", langchainCoreMessagesSource);
  pyodide.FS.writeFile("/course/langchain_core/tools.py", langchainCoreToolsSource);

  pyodide.runPython("import sys\nif '/course' not in sys.path:\n    sys.path.insert(0, '/course')\n");
  harnessModule = pyodide.pyimport("course_harness");

  // Bloqueo de red DESPUÉS de cargar Pyodide (que sí necesita fetch para sus
  // propios assets). A partir de aquí, 0 requests durante la validación.
  blockNetwork();
}

function mapRunError(error: unknown): RunChallengeResult {
  const message = error instanceof Error ? error.message : String(error);
  return { status: "error", errorKind: "runtime", message, stdout: "" };
}

async function runChallenge(request: {
  challengeId: string;
  studentCode: string;
  validationCode: string;
  llmDoubles?: unknown;
  timeoutMs: number;
}): Promise<RunChallengeResult> {
  if (!pyodide || !harnessModule) {
    throw new Error("Pyodide no está inicializado (llama init() antes de runChallenge).");
  }

  const llmDoublesJson = request.llmDoubles ? JSON.stringify(request.llmDoubles) : null;

  let resultJson: string;
  try {
    resultJson = harnessModule.run_attempt(
      request.studentCode,
      request.validationCode,
      llmDoublesJson,
    );
  } catch (error) {
    return mapRunError(error);
  }

  // Canal reservado documentado en C-RUNNER: además del valor de retorno,
  // se publica el JSON del intento en `__COURSE_RESULT__` del scope global.
  pyodide.globals.set("__COURSE_RESULT__", resultJson);

  const parsed = JSON.parse(resultJson) as {
    kind: "ok" | "syntax" | "runtime";
    checks: { id: string; description: string; passed: boolean; message: string | null }[];
    stdout: string;
    message: string | null;
  };

  const checks = parsed.checks.map((c) => ({
    id: c.id,
    description: c.description,
    passed: c.passed,
    ...(c.message ? { message: c.message } : {}),
  }));

  if (parsed.kind === "syntax") {
    return { status: "error", errorKind: "syntax", message: parsed.message ?? "Error de sintaxis.", stdout: parsed.stdout };
  }
  if (parsed.kind === "runtime") {
    return { status: "error", errorKind: "runtime", message: parsed.message ?? "Error en tiempo de ejecución.", stdout: parsed.stdout };
  }
  const allPassed = checks.length > 0 && checks.every((c) => c.passed);
  return allPassed
    ? { status: "pass", checks, stdout: parsed.stdout }
    : { status: "fail", checks, stdout: parsed.stdout };
}

self.onmessage = async (event: MessageEvent<WorkerInboundMessage>) => {
  const message = event.data;
  if (message.type === "init") {
    try {
      await initPyodide(message.pyodideBaseUrl);
      post({ type: "ready" });
    } catch (error) {
      post({ type: "init-error", message: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  if (message.type === "run") {
    try {
      const result = await runChallenge(message.request);
      post({ type: "result", result });
    } catch (error) {
      post({ type: "infra-error", message: error instanceof Error ? error.message : String(error) });
    }
  }
};
