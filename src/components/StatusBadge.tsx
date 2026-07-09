/**
 * Indicador de estado del asistente Ollama (CA-18/19/20/25).
 *
 * Muestra los 3 estados visibles en español (ADR-07) y, cuando no está
 * "Conectado", el comando de recuperación literal (CMD_SERVE/CMD_PULL).
 * El input del chat (S9) queda deshabilitado mientras el estado no sea
 * "connected"; aquí se expone `disabled` (booleano derivado del estado)
 * como gancho para esa integración.
 */

import { CMD_PULL, CMD_SERVE } from "@/assistant/types";
import type { OllamaStatus } from "@/assistant/types";
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

function recoveryCommand(status: OllamaStatus): string | null {
  if (status === "disconnected") return CMD_SERVE;
  if (status === "model_missing") return CMD_PULL(CONFIG.ollama.model);
  return null;
}

export interface StatusBadgeProps {
  /**
   * Estado recibido por prop desde `Layout`, único punto que llama a
   * `useOllamaStatus` (evita un segundo polling de `/api/tags`, nota del
   * reviewer de S8/S9).
   */
  status: OllamaStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const command = recoveryCommand(status);

  return (
    <div className="flex flex-col gap-1" data-testid="status-badge">
      <span className="inline-flex items-center gap-2 text-sm font-medium">
        <span
          aria-hidden="true"
          className={cn("h-2 w-2 rounded-full", DOT_CLASS[status])}
        />
        {LABELS[status]}
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

/** Estado derivado para deshabilitar el input del chat (S9 lo consume). */
export function isChatInputDisabled(status: OllamaStatus): boolean {
  return status !== "connected";
}
