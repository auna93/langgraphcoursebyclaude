/**
 * Hook fino que expone el `AssistantEngine` combinado (C-ENGINE, `docs/arch/
 * ARCHITECTURE-M5-WEBLLM.md` §9.4.2). Análogo directo de
 * `useOllamaStatus.ts` (C-OLLAMA).
 *
 * ÚNICA instancia de la app, en `Layout` (misma nota del reviewer de S8:
 * evitar un segundo polling de `/api/tags`). Internamente: `status =
 * useOllamaStatus()` (C-OLLAMA intacto) ⇒ efecto ⇒
 * `useEngineStore.getState().setOllamaStatus(status)` (ejecuta la máquina de
 * estados normativa, §9.4.1) ⇒ devuelve el snapshot suscrito de
 * `engine.webllm`/`engine.active`.
 */

import { useEffect } from "react";

import { useEngineStore } from "@/assistant/engineStore";
import type { AssistantEngine } from "@/assistant/types";
import { useOllamaStatus } from "@/assistant/useOllamaStatus";

export function useAssistantEngine(): AssistantEngine {
  const status = useOllamaStatus();

  useEffect(() => {
    useEngineStore.getState().setOllamaStatus(status);
  }, [status]);

  return useEngineStore((state) => state.engine);
}
