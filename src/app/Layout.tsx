import { Link, Outlet } from "react-router-dom";

import { STRINGS } from "@/app/strings";
import { StatusBadge } from "@/components/StatusBadge";
import { WebGpuFallbackCard } from "@/components/WebGpuFallbackCard";
import { ChatPanel } from "@/components/ChatPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAssistantEngine } from "@/assistant/useAssistantEngine";
import { useEngineStore } from "@/assistant/engineStore";

/**
 * Layout raíz del shell: header + contenido principal + sidebar derecha
 * (asistente: badge de estado, S8; oferta/progreso del respaldo WebGPU, M5
 * SF2; chat completo, S9).
 *
 * `useAssistantEngine` se llama UNA sola vez aquí (nota del reviewer de S8:
 * evitar polling duplicado de `/api/tags`; sigue siendo la única llamada a
 * `useOllamaStatus`, ahora compuesta con la fase del fallback WebLLM,
 * `docs/arch/ARCHITECTURE-M5-WEBLLM.md` §9.4.2) y se pasa por props a
 * `StatusBadge`/`WebGpuFallbackCard`. `ChatPanel` sigue recibiendo
 * `engine.ollama` como interino hasta que SF3 cablee `isChatEnabled`.
 *
 * `id="asistente-sidebar"` (slice S11, CA-27): único punto de la app donde
 * vive el sidebar, usado por `FeynmanEditor` para desplazarlo a la vista
 * (`scrollIntoView`) y enfocar el input del chat tras pedir feedback Feynman.
 */
export function Layout() {
  const engine = useAssistantEngine();
  const acceptDownload = useEngineStore((s) => s.acceptDownload);
  const cancelFetch = useEngineStore((s) => s.cancelFetch);

  return (
    <div className="flex min-h-screen flex-col md:h-screen md:min-h-0">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <Link to="/" className="text-lg font-semibold">
          {STRINGS.app.nombre}
        </Link>
        <ThemeToggle />
      </header>

      <div className="flex flex-1 flex-col md:min-h-0 md:flex-row">
        <main className="flex-1 p-4 md:overflow-y-auto">
          <Outlet />
        </main>

        <aside
          id="asistente-sidebar"
          aria-label={STRINGS.asistente.titulo}
          className="flex w-full flex-col border-t border-border p-4 md:w-96 md:min-h-0 md:border-l md:border-t-0 lg:w-[28rem]"
        >
          <h2 className="mb-2 shrink-0 text-sm font-semibold uppercase text-muted-foreground">
            {STRINGS.asistente.titulo}
          </h2>
          <div className="shrink-0">
            <StatusBadge engine={engine} />
          </div>
          <div className="mt-2 shrink-0">
            <WebGpuFallbackCard
              engine={engine}
              acceptDownload={acceptDownload}
              cancelFetch={cancelFetch}
            />
          </div>
          <div className="mt-2 flex min-h-0 flex-1 flex-col">
            <ChatPanel status={engine.ollama} />
          </div>
        </aside>
      </div>
    </div>
  );
}
