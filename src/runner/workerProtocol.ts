/**
 * Protocolo interno worker <-> cliente. NO es parte de C-RUNNER (que solo
 * define la interfaz pública `PyRunner`); es un detalle de implementación de
 * `src/runner/**` y puede cambiar sin volver al architect.
 */
import type { RunChallengeRequest, RunChallengeResult } from "./types";

export interface WorkerInitMessage {
  type: "init";
  pyodideBaseUrl: string;
}

export interface WorkerRunMessage {
  type: "run";
  request: RunChallengeRequest;
}

export type WorkerInboundMessage = WorkerInitMessage | WorkerRunMessage;

export interface WorkerReadyMessage {
  type: "ready";
}

export interface WorkerInitErrorMessage {
  type: "init-error";
  message: string;
}

export interface WorkerResultMessage {
  type: "result";
  result: RunChallengeResult;
}

export interface WorkerInfraErrorMessage {
  type: "infra-error";
  message: string;
}

export type WorkerOutboundMessage =
  | WorkerReadyMessage
  | WorkerInitErrorMessage
  | WorkerResultMessage
  | WorkerInfraErrorMessage;
