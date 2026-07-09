/**
 * Tests de `ChatPanel` (contrato C-ASSIST `ChatState`/C-OLLAMA `ChatMessage`/
 * `OllamaStatus`, ARCHITECTURE.md §4). Slice S9 — SLICES.md §S9. Cubre
 * CA-21 (render incremental), CA-22 (detener conserva el parcial), CA-26
 * (error a mitad de stream ⇒ mensaje legible en español + app viva), y el
 * gating del input según el estado del asistente (SLICES.md §S8/§S9).
 *
 * Escritos de forma INDEPENDIENTE del implementer. En vez de mockear el
 * store (`@/assistant/chatStore`), se usa el store REAL contra un `fetch`
 * mockeado a nivel de red — exactamente la misma técnica que
 * `chatStore.test.ts` (S9) y `ollamaClient.test.ts` (S8) — porque el
 * contrato C-ASSIST no expone ningún punto de inyección de dependencias
 * para `ChatPanel`. Esto verifica el comportamiento OBSERVABLE de principio
 * a fin: UI -> store -> `OllamaClient.chatStream` -> NDJSON -> UI.
 *
 * ---------------------------------------------------------------------------
 * CONTRATO DE COMPONENTE ASUMIDO (SLICES.md §S9 solo fija "toca
 * `src/components/ChatPanel.tsx`"; se fija aquí el mínimo necesario para
 * tests deterministas, análogo al patrón de `ChallengeCard.test.tsx`, S7).
 * Se testean SOLO superficies observables (testids, nombres accesibles,
 * estados disabled) — nunca detalles de implementación internos:
 * ---------------------------------------------------------------------------
 *   export interface ChatPanelProps { status: OllamaStatus }
 *
 * - `status` lo calcula y posee el padre (`Layout`, vía `useOllamaStatus`,
 *   S8); `ChatPanel` NO hace su propio health-check — solo consume el
 *   valor recibido, igual que `StatusBadge` acepta `status` inyectable.
 * - Usa el store REAL `useChatStore` de `@/assistant/chatStore` (no
 *   mockeado): lee `mensajes`, `generando` y llama a `send`/`stop`/`clear`.
 * - Contenedor raíz con `data-testid="chat-panel"`.
 * - Historial vacío (`mensajes.length === 0`): visible el texto EXACTO
 *   `STRINGS.asistente.chatPanel.historialVacio`.
 * - Historial no vacío: contenedor `data-testid="chat-messages"`; cada
 *   mensaje es un elemento con `data-testid="chat-message-user"` o
 *   `data-testid="chat-message-assistant"` (según `role`, en orden de
 *   aparición; el testid puede repetirse entre varios mensajes del mismo
 *   rol), que contiene un descendiente `data-testid="chat-message-content"`
 *   cuyo texto es SIEMPRE el `content` actual del mensaje (recalculado en
 *   cada render — es lo que hace visible el crecimiento incremental,
 *   CA-21). Si el mensaje tiene `error`, ese texto también es visible
 *   dentro del mismo mensaje.
 * - Formulario de envío: un campo de texto con role `textbox` accesible por
 *   nombre `STRINGS.estadoAsistente.chatPlaceholder` (mismo placeholder que
 *   ya usa `Layout` en S8) y un botón cuyo nombre accesible es EXACTAMENTE
 *   `STRINGS.asistente.chatPanel.enviar` ("Enviar"). Al pulsar "Enviar" (o
 *   enviar el formulario): llama a `send(valorDelInput)` y vacía el input.
 * - El input y el botón "Enviar" están deshabilitados cuando
 *   `status !== "connected"` (misma semántica que
 *   `isChatInputDisabled` de `@/components/StatusBadge`, S8).
 * - El botón "Enviar" TAMBIÉN se deshabilita mientras `generando === true`
 *   (evita doble envío) y mientras el input está vacío/solo espacios.
 * - Botón "Detener" (nombre accesible EXACTO
 *   `STRINGS.asistente.chatPanel.detener`, "Detener"): SIEMPRE presente en
 *   el documento; DESHABILITADO mientras `generando === false`, HABILITADO
 *   mientras `generando === true`; al pulsarlo llama a `stop()` (CA-22).
 * - Botón "Limpiar conversación" (nombre accesible EXACTO
 *   `STRINGS.asistente.chatPanel.limpiar`): SIEMPRE presente; al pulsarlo
 *   llama a `clear()`.
 * ---------------------------------------------------------------------------
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

import { STRINGS } from "@/app/strings";

const CHAT_STORAGE_KEY = "lgcourse.chat.v1";

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function ndjsonLine(content: string, done = false): string {
  return JSON.stringify({ message: { role: "assistant", content }, done }) + "\n";
}

function controlledStream() {
  let enqueue!: (chunk: Uint8Array) => void;
  let close!: () => void;
  let error!: (e: unknown) => void;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      enqueue = (chunk) => controller.enqueue(chunk);
      close = () => controller.close();
      error = (e) => controller.error(e);
    },
  });
  return { stream, enqueue, close, error };
}

function tick(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mockea `fetch` respondiendo `/api/chat` con un stream controlado. Cualquier
 * otra ruta (p. ej. `/api/tags`, si el padre hiciera su propio health-check
 * — no debería, según el contrato de componente asumido) responde 200 vacío
 * para no romper otros efectos colaterales inesperados.
 */
function stubChatFetch() {
  const { stream, enqueue, close, error } = controlledStream();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/chat")) {
        return new Response(stream, { status: 200 });
      }
      return new Response(JSON.stringify({ models: [] }), { status: 200 });
    }),
  );
  return { enqueue, close, error };
}

function chatPanel(): HTMLElement {
  return screen.getByTestId("chat-panel");
}

function questionInput(): HTMLElement {
  return within(chatPanel()).getByRole("textbox", {
    name: STRINGS.estadoAsistente.chatPlaceholder,
  });
}

function sendButton(): HTMLElement {
  return within(chatPanel()).getByRole("button", { name: STRINGS.asistente.chatPanel.enviar });
}

function stopButton(): HTMLElement {
  return within(chatPanel()).getByRole("button", { name: STRINGS.asistente.chatPanel.detener });
}

function isGenerando(): boolean {
  return !stopButton().hasAttribute("disabled");
}

function clearButton(): HTMLElement {
  return within(chatPanel()).getByRole("button", { name: STRINGS.asistente.chatPanel.limpiar });
}

/** Todos los mensajes visibles, en orden de aparición (contenido textual). */
function chatMessages(): HTMLElement[] {
  return within(chatPanel()).queryAllByTestId("chat-message-content");
}

/** Último mensaje del asistente (puede haber varios en una conversación larga). */
function lastAssistantMessage(): HTMLElement | undefined {
  const assistants = within(chatPanel()).queryAllByTestId("chat-message-assistant");
  return assistants[assistants.length - 1];
}

function lastAssistantText(): string {
  const el = lastAssistantMessage();
  if (!el) return "";
  return within(el).getByTestId("chat-message-content").textContent ?? "";
}

async function sendQuestion(texto: string) {
  fireEvent.change(questionInput(), { target: { value: texto } });
  fireEvent.click(sendButton());
  await tick();
}

beforeEach(() => {
  sessionStorage.clear();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChatPanel — historial vacío", () => {
  it("muestra el texto de historial vacío antes de enviar nada", async () => {
    const { ChatPanel } = await import("@/components/ChatPanel");
    render(<ChatPanel status="connected" />);

    expect(within(chatPanel()).getByText(STRINGS.asistente.chatPanel.historialVacio)).toBeInTheDocument();
  });
});

describe("ChatPanel — gating por estado del asistente", () => {
  it("deshabilita el input y el botón Enviar si el estado NO es 'Conectado'", async () => {
    const { ChatPanel } = await import("@/components/ChatPanel");
    render(<ChatPanel status="disconnected" />);

    expect(questionInput()).toBeDisabled();
    expect(sendButton()).toBeDisabled();
  });

  it("con estado 'Conectado' y texto en el input, el botón Enviar está habilitado", async () => {
    const { ChatPanel } = await import("@/components/ChatPanel");
    render(<ChatPanel status="connected" />);

    fireEvent.change(questionInput(), { target: { value: "hola" } });
    expect(sendButton()).not.toBeDisabled();
  });
});

describe("CA-21 — render incremental (>=2 actualizaciones visibles antes de completar)", () => {
  it("el texto del último mensaje crece con cada chunk NDJSON recibido, antes del done", async () => {
    const { ChatPanel } = await import("@/components/ChatPanel");
    const { enqueue, close } = stubChatFetch();

    render(<ChatPanel status="connected" />);
    await sendQuestion("¿Qué es un grafo en LangGraph?");

    // El input se limpia tras enviar.
    expect(questionInput()).toHaveValue("");

    // Aparecen la pregunta del alumno y el placeholder de respuesta.
    expect(
      within(chatPanel()).getAllByTestId("chat-message-user")[0]?.textContent ?? "",
    ).toContain("¿Qué es un grafo en LangGraph?");
    expect(lastAssistantMessage()).toBeDefined();

    enqueue(encode(ndjsonLine("Un ")));
    await waitFor(() => expect(lastAssistantText().length).toBeGreaterThan(0));
    const snapshot1 = lastAssistantText();

    enqueue(encode(ndjsonLine("grafo es un conjunto de nodos y aristas")));
    await waitFor(() => expect(lastAssistantText()).not.toBe(snapshot1));
    const snapshot2 = lastAssistantText();

    // >= 2 actualizaciones incrementales DISTINTAS, visibles ANTES de completar.
    expect(snapshot2.startsWith(snapshot1)).toBe(true);
    expect(isGenerando()).toBe(true);

    enqueue(encode(ndjsonLine("", true)));
    close();

    await waitFor(() => expect(isGenerando()).toBe(false));
    expect(lastAssistantText()).toContain("Un grafo es un conjunto de nodos y aristas");
  });
});

describe("CA-22 — botón 'Detener' cesa la generación en <=2s con el parcial visible", () => {
  it("al pulsar 'Detener', el texto parcial permanece visible y la generación cesa", async () => {
    const { ChatPanel } = await import("@/components/ChatPanel");
    const { enqueue } = stubChatFetch();

    render(<ChatPanel status="connected" />);
    await sendQuestion("Explica los checkpoints");

    enqueue(encode(ndjsonLine("Los checkpoints ")));
    await waitFor(() => expect(lastAssistantText().length).toBeGreaterThan(0));
    const partial = lastAssistantText();

    expect(isGenerando()).toBe(true);
    const start = Date.now();
    fireEvent.click(stopButton());

    await waitFor(() => expect(isGenerando()).toBe(false));
    const elapsedMs = Date.now() - start;

    expect(elapsedMs).toBeLessThanOrEqual(2000);
    // El texto PARCIAL permanece visible tal cual, sin marcarse como error.
    expect(lastAssistantText()).toBe(partial);
    // App viva: el input vuelve a aceptar una nueva pregunta (Enviar deja de
    // estar bloqueado por "generando"; el único motivo restante para
    // deshabilitarlo sería un input vacío, no el estado de la conversación).
    fireEvent.change(questionInput(), { target: { value: "otra pregunta" } });
    expect(sendButton()).not.toBeDisabled();
  });
});

describe("CA-26 — error a mitad de stream: mensaje legible en español + app viva", () => {
  it("muestra un error en español con instrucción de recuperación sin romper la app", async () => {
    const { ChatPanel } = await import("@/components/ChatPanel");
    const { enqueue, error } = stubChatFetch();

    render(<ChatPanel status="connected" />);
    await sendQuestion("¿Cómo uso interrupt?");

    enqueue(encode(ndjsonLine("El ")));
    await waitFor(() => expect(lastAssistantText().length).toBeGreaterThan(0));
    const partial = lastAssistantText();

    error(new TypeError("network drop"));

    await waitFor(() => expect(isGenerando()).toBe(false));

    const panelText = chatPanel().textContent ?? "";
    // Legible en español con pista de recuperación concreta, nunca el error técnico crudo.
    expect(panelText).not.toMatch(/network drop/i);
    expect(panelText).toMatch(/reintent|recarg|conex|intenta/i);
    // El texto parcial ya emitido sigue presente (no se pierde).
    expect(lastAssistantText()).toContain(partial.trim());

    // La app sigue operativa: el input vuelve a aceptar una nueva pregunta.
    fireEvent.change(questionInput(), { target: { value: "otra pregunta" } });
    expect(sendButton()).not.toBeDisabled();
  });

  it("tras el error, se puede enviar y completar otra pregunta con éxito", async () => {
    const { ChatPanel } = await import("@/components/ChatPanel");
    const { enqueue: enqueue1, error: error1 } = stubChatFetch();

    render(<ChatPanel status="connected" />);
    await sendQuestion("primera pregunta");
    enqueue1(encode(ndjsonLine("x")));
    await waitFor(() => expect(lastAssistantText().length).toBeGreaterThan(0));
    error1(new TypeError("network drop"));
    await waitFor(() => expect(isGenerando()).toBe(false));

    const { enqueue: enqueue2, close: close2 } = stubChatFetch();
    await sendQuestion("segunda pregunta");
    enqueue2(encode(ndjsonLine("respuesta exitosa", true)));
    close2();

    await waitFor(() => expect(isGenerando()).toBe(false));
    expect(lastAssistantText()).toBe("respuesta exitosa");
  });
});

describe("ChatPanel — botón 'Limpiar conversación'", () => {
  it("está siempre presente y vacía el historial al pulsarlo", async () => {
    const { ChatPanel } = await import("@/components/ChatPanel");
    const { enqueue, close } = stubChatFetch();

    render(<ChatPanel status="connected" />);
    expect(clearButton()).toBeInTheDocument();

    await sendQuestion("una pregunta cualquiera");
    enqueue(encode(ndjsonLine("respuesta", true)));
    close();
    await waitFor(() => expect(chatMessages().length).toBeGreaterThan(0));

    fireEvent.click(clearButton());

    await waitFor(() =>
      expect(
        within(chatPanel()).getByText(STRINGS.asistente.chatPanel.historialVacio),
      ).toBeInTheDocument(),
    );
    expect(chatMessages()).toHaveLength(0);
  });
});

describe("ChatPanel — persistencia de sesión (US-16, reutiliza el store real)", () => {
  it("una conversación completada persiste y se muestra igual en una nueva instancia del store", async () => {
    const { ChatPanel } = await import("@/components/ChatPanel");
    const { enqueue, close } = stubChatFetch();

    render(<ChatPanel status="connected" />);
    await sendQuestion("¿qué es add_messages?");
    enqueue(encode(ndjsonLine("Es un reducer.", true)));
    close();
    await waitFor(() => expect(isGenerando()).toBe(false));

    await waitFor(() => expect(sessionStorage.getItem(CHAT_STORAGE_KEY)).toBeTruthy());

    vi.resetModules();
    const { ChatPanel: ReloadedChatPanel } = await import("@/components/ChatPanel");
    render(<ReloadedChatPanel status="connected" />);

    const panels = screen.getAllByTestId("chat-panel");
    const reloadedPanel = panels[panels.length - 1] as HTMLElement;
    expect(within(reloadedPanel).getByText(/Es un reducer\./)).toBeInTheDocument();
  });
});
