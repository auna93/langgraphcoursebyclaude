import { useState } from "react";

import { STRINGS } from "@/app/strings";
import { isChatEnabled } from "@/assistant/engineStore";
import type { AssistantEngine } from "@/assistant/types";
import { useChatStore } from "@/assistant/chatStore";

/**
 * `ChatPanel`: UI del chat del asistente (C-ASSIST), slice S9 — CA-21
 * (render incremental durante el streaming), CA-22 (botón "detener" con
 * abort, parcial visible), CA-26 (mensaje de error en español + instrucción
 * de recuperación tras un fallo a mitad de stream). Desde SF3 (M5,
 * `docs/arch/ARCHITECTURE-M5-WEBLLM.md` §9.8): habilitación vía
 * `isChatEnabled(engine)` (sustituye a `isChatInputDisabled(status)`,
 * retirada de `StatusBadge`), paridad con el motor de respaldo WebGPU
 * (CA-44).
 *
 * Consume `chatStore` (S9, `send`/`stop`/`clear`) tal cual está definido en
 * el contrato C-ASSIST; no reimplementa streaming ni parsing aquí. El motor
 * REAL usado por `send()` se decide dentro de `chatStore` (ADR-19, §9.5),
 * independientemente de esta prop; `engine` aquí SOLO gatea la UI. Se recibe
 * por prop desde `Layout` — UN solo punto de la app llama a
 * `useAssistantEngine` (nota del reviewer de S8: evitar polling duplicado de
 * `/api/tags`).
 */

export interface ChatPanelProps {
  engine: AssistantEngine;
}

export function ChatPanel({ engine }: ChatPanelProps) {
  const mensajes = useChatStore((s) => s.mensajes);
  const generando = useChatStore((s) => s.generando);
  const send = useChatStore((s) => s.send);
  const stop = useChatStore((s) => s.stop);
  const clear = useChatStore((s) => s.clear);

  const [texto, setTexto] = useState("");

  const disabled = !isChatEnabled(engine);
  const t = STRINGS.asistente.chatPanel;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled || generando) return;
    const pregunta = texto.trim();
    if (pregunta.length === 0) return;
    send(pregunta);
    setTexto("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" data-testid="chat-panel">
      <div
        className="flex max-h-96 flex-col gap-2 overflow-y-auto md:max-h-none md:min-h-0 md:flex-1"
        data-testid="chat-messages"
      >
        {mensajes.length === 0 && (
          <p className="text-sm text-muted-foreground">{t.historialVacio}</p>
        )}
        {mensajes.map((m, idx) =>
          // M5 (§9.8): los mensajes con `aviso` (conmutación de motor, CA-45)
          // se renderizan como nota de sistema diferenciada, sin el label de
          // rol ni el bloque de error de una respuesta normal.
          m.aviso ? (
            <p
              key={idx}
              data-testid="chat-message-aviso"
              className="rounded border border-border bg-muted px-2 py-1 text-xs italic text-muted-foreground"
            >
              <span data-testid="chat-message-content">{m.content}</span>
            </p>
          ) : (
            <div key={idx} data-testid={`chat-message-${m.role}`} className="text-sm">
              <span className="font-semibold">
                {m.role === "user" ? t.tuMensajeLabel : t.asistenteMensajeLabel}
              </span>{" "}
              <span className="whitespace-pre-wrap" data-testid="chat-message-content">
                {m.content}
              </span>
              {m.error && (
                <p role="alert" className="mt-1 text-xs text-red-700 dark:text-red-400">
                  {m.error}
                </p>
              )}
            </div>
          ),
        )}
        {generando && (
          <p className="text-xs text-muted-foreground">{t.generando}</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={disabled}
          placeholder={STRINGS.estadoAsistente.chatPlaceholder}
          aria-label={STRINGS.estadoAsistente.chatPlaceholder}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={disabled || generando || texto.trim().length === 0}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            {t.enviar}
          </button>
          <button
            type="button"
            onClick={stop}
            disabled={!generando}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            {t.detener}
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={mensajes.length === 0}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            {t.limpiar}
          </button>
        </div>
      </form>
    </div>
  );
}
