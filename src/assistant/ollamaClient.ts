/**
 * Cliente Ollama (implementación de C-OLLAMA, `src/assistant/types.ts`).
 *
 * Todas las peticiones van vía el proxy Vite `/ollama` (ADR-06, CA-25):
 * el navegador nunca contacta `localhost:11434` directamente.
 */

import type {
  ChatMessage,
  OllamaClient,
  OllamaConfig,
  OllamaStatus,
  OllamaStreamError,
} from "@/assistant/types";

interface OllamaTagsResponse {
  models?: { name?: string }[];
}

interface OllamaChatChunk {
  message?: { role?: string; content?: string };
  done?: boolean;
}

function modelMatches(tagName: string | undefined, model: string): boolean {
  if (!tagName) return false;
  if (tagName === model) return true;
  const family = model.split(":")[0];
  return tagName.startsWith(`${family}:`);
}

export function createOllamaClient(config: OllamaConfig): OllamaClient {
  async function checkHealth(): Promise<OllamaStatus> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.healthTimeoutMs);
    try {
      const res = await fetch(`${config.baseUrl}/api/tags`, {
        method: "GET",
        signal: controller.signal,
      });
      if (!res.ok) return "disconnected";
      const data = (await res.json()) as OllamaTagsResponse;
      const hasModel = (data.models ?? []).some((m) =>
        modelMatches(m.name, config.model),
      );
      return hasModel ? "connected" : "model_missing";
    } catch {
      return "disconnected";
    } finally {
      clearTimeout(timer);
    }
  }

  async function chatStream(
    messages: ChatMessage[],
    handlers: {
      onToken(t: string): void;
      onDone(): void;
      onError(e: OllamaStreamError): void;
    },
    signal: AbortSignal,
  ): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${config.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: config.model, messages, stream: true }),
        signal,
      });
    } catch (err) {
      if (signal.aborted) return;
      handlers.onError({
        kind: "network",
        message: err instanceof Error ? err.message : "Error de red",
      });
      return;
    }

    if (!res.ok || !res.body) {
      if (signal.aborted) return;
      handlers.onError({
        kind: "http",
        message: `Respuesta HTTP ${res.status}`,
      });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // El mock/implementación de `fetch` no siempre propaga el abort al reader
    // del body (depende del entorno); se cancela explícitamente para que
    // `signal.abort()` corte la lectura en curso en ≤2 s (CA-22).
    const onAbort = () => {
      void reader.cancel().catch(() => {});
    };
    signal.addEventListener("abort", onAbort);

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (signal.aborted) return;
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // La última entrada puede ser una línea incompleta: se conserva en el buffer.
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          processLine(line, handlers);
        }
      }
      // Procesa cualquier resto final que llegara sin salto de línea.
      if (buffer.trim().length > 0) {
        processLine(buffer, handlers);
      }
      handlers.onDone();
    } catch (err) {
      if (signal.aborted) return;
      handlers.onError({
        kind: "network",
        message: err instanceof Error ? err.message : "Error de red",
      });
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }

  function processLine(
    line: string,
    handlers: {
      onToken(t: string): void;
      onDone(): void;
      onError(e: OllamaStreamError): void;
    },
  ): void {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;
    try {
      const chunk = JSON.parse(trimmed) as OllamaChatChunk;
      const content = chunk.message?.content;
      if (content && content !== "") {
        handlers.onToken(content);
      }
    } catch {
      handlers.onError({
        kind: "parse",
        message: "No se pudo interpretar la respuesta de Ollama",
      });
    }
  }

  return { checkHealth, chatStream };
}
