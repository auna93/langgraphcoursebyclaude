/**
 * Indicador de estado del asistente (CA-18/19/20/25, y CA-45 desde M5).
 *
 * Muestra los 3 estados visibles de Ollama en español (ADR-07) y, cuando no
 * está "Conectado", el comando de recuperación literal (CMD_SERVE/CMD_PULL).
 * Desde M5 (`docs/arch/ARCHITECTURE-M5-WEBLLM.md` §9.8), cuando el motor
 * activo es el respaldo WebGPU (`engine.active === "webllm"`), el label pasa
 * a `estadoAsistente.respaldoWebGpu`, manteniendo visible el comando de
 * recuperación del motor primario (según `engine.ollama`) para guiar el
 * retorno a Ollama. El input del chat (S9) queda deshabilitado mientras
 * `engine.active === null`.
 */

import { CMD_PULL, CMD_SERVE } from "@/assistant/types";
import type { AssistantEngine, OllamaStatus } from "@/assistant/types";
import { STRINGS } from "@/app/strings";
import { CONFIG } from "@/config";
import { cn } from "@/lib/utils";

const LABELS: Record<OllamaStatus, string> = {
  checking: STRINGS.estadoAsistente.comprobando,
  connected: STRINGS.estadoAsistente.conectado,
  model_missing: STRINGS.estadoAsistente.modeloNoInstalado,
  disconnected: STRINGS.estadoAsistente.sinConexion,
};

const DOT_CLASS: Record<OllamaStatus, string> = {
  checking: "bg-muted-foreground",
  connected: "bg-green-500",
  model_missing: "bg-yellow-500",
  disconnected: "bg-red-500",
};

/** Color del punto cuando el motor activo es el respaldo WebGPU: distinto de
 *  los 4 existentes (recomendado por §9.8, no contractual). */
const WEBGPU_DOT_CLASS = "bg-blue-500";

function recoveryCommand(status: OllamaStatus): string | null {
  if (status === "disconnected") return CMD_SERVE;
  if (status === "model_missing") return CMD_PULL(CONFIG.ollama.model);
  return null;
}

export interface StatusBadgeProps {
  /**
   * Snapshot combinado recibido por prop desde `Layout` (única instancia de
   * `useAssistantEngine`, que a su vez es la única llamada a
   * `useOllamaStatus` — evita un segundo polling de `/api/tags`, nota del
   * reviewer de S8/S9).
   */
  engine: AssistantEngine;
}

export function StatusBadge({ engine }: StatusBadgeProps) {
  const command = recoveryCommand(engine.ollama);
  const isWebGpu = engine.active === "webllm";
  const label = isWebGpu ? STRINGS.estadoAsistente.respaldoWebGpu : LABELS[engine.ollama];
  const dotClass = isWebGpu ? WEBGPU_DOT_CLASS : DOT_CLASS[engine.ollama];

  return (
    <div className="flex flex-col gap-1" data-testid="status-badge">
      <span className="inline-flex items-center gap-2 text-sm font-medium">
        <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", dotClass)} />
        {label}
      </span>
      {command !== null && (
        <p className="text-xs text-muted-foreground">
          {STRINGS.estadoAsistente.instruccionRecuperacion}{" "}
          <code className="rounded bg-muted px-1 py-0.5">{command}</code>
        </p>
      )}
    </div>
  );
}
