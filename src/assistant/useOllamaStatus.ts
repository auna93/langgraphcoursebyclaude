/**
 * Hook fino que expone el estado de conexión con Ollama (C-OLLAMA).
 *
 * Chequea al montar (CA-18: badge refleja el estado real en ≤5 s) y luego
 * periódicamente cada `config.healthIntervalMs`.
 */

import { useEffect, useRef, useState } from "react";

import { createOllamaClient } from "@/assistant/ollamaClient";
import type { OllamaClient, OllamaConfig, OllamaStatus } from "@/assistant/types";
import { CONFIG } from "@/config";

export function useOllamaStatus(
  config: OllamaConfig = CONFIG.ollama,
  client?: OllamaClient,
): OllamaStatus {
  const [status, setStatus] = useState<OllamaStatus>("checking");
  const clientRef = useRef<OllamaClient>(client ?? createOllamaClient(config));

  useEffect(() => {
    clientRef.current = client ?? createOllamaClient(config);
  }, [client, config]);

  useEffect(() => {
    let cancelled = false;

    async function check(): Promise<void> {
      setStatus("checking");
      const result = await clientRef.current.checkHealth();
      if (!cancelled) setStatus(result);
    }

    void check();
    const interval = setInterval(() => {
      void check();
    }, config.healthIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [config.baseUrl, config.model, config.healthIntervalMs, config.healthTimeoutMs, client]);

  return status;
}
