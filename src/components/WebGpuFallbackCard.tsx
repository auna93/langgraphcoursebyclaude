/**
 * Oferta / progreso / cancelar / reintento del fallback in-browser WebGPU
 * (`docs/arch/ARCHITECTURE-M5-WEBLLM.md` §9.8, CA-40b/41/42/43). Slice SF2 —
 * `docs/arch/SLICES.md` §SF2.
 *
 * 100% presentacional: recibe `engine` y las acciones (`acceptDownload`,
 * `cancelFetch`) por prop, sin leer `useEngineStore` internamente (render
 * pasivo — la descarga corre en el worker y la app sigue interactiva,
 * CA-42). Vive en el sidebar entre `StatusBadge` y `ChatPanel` (`Layout`).
 *
 * Renderiza solo si `CONFIG.webllm.enabled` y además `phase === "fetching"`
 * o (`phase ∈ {offer, cancelled, error}` y `ollama` degradado); en cualquier
 * otro caso (incl. "unsupported"/"inactive"/"ready") no renderiza nada
 * (CA-41: comportamiento CA-19/20 exacto, sin ruido de UI).
 */

import { STRINGS } from "@/app/strings";
import type { AssistantEngine } from "@/assistant/types";
import { CONFIG } from "@/config";

export interface WebGpuFallbackCardProps {
  engine: AssistantEngine;
  acceptDownload: () => void;
  cancelFetch: () => void;
}

function isOllamaDegradado(engine: AssistantEngine): boolean {
  return engine.ollama === "disconnected" || engine.ollama === "model_missing";
}

function shouldRender(engine: AssistantEngine): boolean {
  if (!CONFIG.webllm.enabled) return false;
  const { phase } = engine.webllm;
  if (phase === "fetching") return true;
  const ofertaLike = phase === "offer" || phase === "cancelled" || phase === "error";
  return ofertaLike && isOllamaDegradado(engine);
}

export function WebGpuFallbackCard({
  engine,
  acceptDownload,
  cancelFetch,
}: WebGpuFallbackCardProps) {
  if (!shouldRender(engine)) return null;

  const t = STRINGS.webgpuFallback;
  const { phase, progress, model, lastError } = engine.webllm;

  return (
    <div
      className="flex flex-col gap-2 rounded border border-border p-3 text-sm"
      data-testid="webgpu-fallback-card"
    >
      {phase === "offer" && (
        <>
          <p className="font-semibold">{t.ofertaTitulo}</p>
          <p className="text-muted-foreground">
            {t.ofertaDescripcion(model, t.tamano(CONFIG.webllm.modelSizeMb))}
          </p>
          <button
            type="button"
            className="self-start rounded bg-primary px-3 py-1.5 text-primary-foreground"
            onClick={() => acceptDownload()}
          >
            {t.activar}
          </button>
        </>
      )}

      {phase === "fetching" && (
        <>
          <p>{t.descargando(progress?.pct ?? 0)}</p>
          <div
            role="progressbar"
            aria-valuenow={progress?.pct ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 w-full overflow-hidden rounded bg-muted"
          >
            <div
              className="h-full bg-primary"
              style={{ width: `${progress?.pct ?? 0}%` }}
            />
          </div>
          <button
            type="button"
            className="self-start rounded border border-border px-3 py-1.5"
            onClick={() => cancelFetch()}
          >
            {t.cancelar}
          </button>
        </>
      )}

      {phase === "cancelled" && (
        <>
          <p className="text-muted-foreground">{t.canceladoAviso}</p>
          <button
            type="button"
            className="self-start rounded bg-primary px-3 py-1.5 text-primary-foreground"
            onClick={() => acceptDownload()}
          >
            {t.activar}
          </button>
        </>
      )}

      {phase === "error" && (
        <>
          <p className="text-destructive">{lastError ?? t.errorDescarga}</p>
          <button
            type="button"
            className="self-start rounded bg-primary px-3 py-1.5 text-primary-foreground"
            onClick={() => acceptDownload()}
          >
            {t.activar}
          </button>
        </>
      )}
    </div>
  );
}
