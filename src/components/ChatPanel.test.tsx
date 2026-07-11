/**
 * Tests de `ChatPanel` (contrato C-ASSIST `ChatState`/C-OLLAMA `ChatMessage`,
 * más el delta M5 de C-ENGINE — `docs/arch/ARCHITECTURE-M5-WEBLLM.md` §9.8).
 * Slice S9 (base) + SF3 (`docs/arch/SLICES.md` §SF3, "ChatPanel habilitado
 * vía isChatEnabled(engine)"). Cubre CA-21 (render incremental), CA-22
 * (detener conserva el parcial), CA-26 (error a mitad de stream ⇒ mensaje
 * legible en español + app viva), y — NUEVO en SF3 — el gating del input vía
 * `isChatEnabled(engine)` en vez de `isChatInputDisabled(status)` (retirado).
 *
 * Escritos de forma INDEPENDIENTE del implementer. En vez de mockear el
 * store (`@/assistant/chatStore`), se usa el store REAL contra un `fetch`
 * mockeado a nivel de red — exactamente la misma técnica que
 * `chatStore.test.ts` (S9/SF3) y `ollamaClient.test.ts` (S8) — porque el
 * contrato C-ASSIST no expone ningún punto de inyección de dependencias
 * para `ChatPanel`. Esto verifica el comportamiento OBSERVABLE de principio
 * a fin: UI -> store -> `OllamaClient.chatStream` -> NDJSON -> UI.
 *
 * ---------------------------------------------------------------------------
 * CONTRATO DE COMPONENTE ASUMIDO — ACTUALIZADO EN SF3 (§9.8: "ChatPanel: prop
 * pasa a `{engine: AssistantEngine}`; habilitación por `isChatEnabled(engine)`
 * (sustituye a `isChatInputDisabled(status)`, que se elimina)"). Se fija aquí
 * el mínimo necesario para tests deterministas, análogo al patrón de
 * `ChallengeCard.test.tsx` (S7). Se testean SOLO superficies observables
 * (testids, nombres accesibles, estados disabled) — nunca detalles de
 * implementación internos:
 * ---------------------------------------------------------------------------
 *   export interface ChatPanelProps { engine: AssistantEngine }
 *
 * - `engine` lo calcula y posee el padre (`Layout`, vía `useAssistantEngine`,
 *   SF2/SF3); `ChatPanel` NO hace su propio health-check — solo consume el
 *   valor recibido para GATING (deshabilitar input/botón "Enviar" cuando
 *   `isChatEnabled(engine) === false`, es decir, `engine.active === null`).
 * - IMPORTANTE (asunción de test explícita, ver más abajo la sección
 *   "ACTIVACIÓN DEL SINGLETON"): el enrutado REAL de `send()` (a qué motor
 *   se envía el mensaje) NO depende de la prop `engine` de `ChatPanel` — por
 *   contrato (ADR-19, §9.5 regla 1) `chatStore.send()` lee
 *   `useEngineStore.getState().engine.active` de forma INDEPENDIENTE, en el
 *   momento del envío. La prop `engine` de `ChatPanel` es SOLO para gating
 *   visual (idéntica en producción porque `Layout` pasa el MISMO snapshot de
 *   `useAssistantEngine()` a ambos sitios, pero un test que renderiza
 *   `ChatPanel` en aislado, sin `Layout`, debe sincronizar ambos
 *   manualmente si quiere ejercitar un envío real de extremo a extremo).
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
 *   ya usa `Layout`) y un botón cuyo nombre accesible es EXACTAMENTE
 *   `STRINGS.asistente.chatPanel.enviar` ("Enviar"). Al pulsar "Enviar" (o
 *   enviar el formulario): llama a `send(valorDelInput)` y vacía el input.
 * - El input y el botón "Enviar" están deshabilitados cuando
 *   `isChatEnabled(engine) === false` (SF3: `engine.active === null`).
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
 * ACTIVACIÓN DEL SINGLETON (`activateOllama`, más abajo): los tests que
 * ejercitan un envío END-TO-END (CA-21/22/26, persistencia US-16) necesitan
 * que `useEngineStore` (el store REAL, no mockeado en este archivo) tenga
 * `engine.active === "ollama"` en el momento de `send()`, porque
 * `chatStore.ts` (post-SF3) lo consulta de forma independiente de la prop
 * `engine` de `ChatPanel` (ver nota de arriba). Se logra con la API PÚBLICA
 * y ya cerrada de C-ENGINE: `useEngineStore.getState()
 * .setOllamaStatus("connected")` (§9.4.1, regla E1: `ollama==="connected"`
 * ⇒ `active="ollama"` SIEMPRE, sea cual sea la fase de WebLLM) — no se
 * inventa ningún mecanismo nuevo de test, se usa el contrato normativo tal
 * cual. Importar `@/assistant/engineStore` en este archivo importa
 * transitivamente el singleton de producción cableado por SF3 (§9.4.3,
 * `createWebLlmClient(CONFIG.webllm)`); es seguro en jsdom porque esa
 * llamada es INERTE (sin Worker/red/GPU hasta `load()`, verificado en SF1).
 * ---------------------------------------------------------------------------
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

import { STRINGS } from "@/app/strings";

const CHAT_STORAGE_KEY = "lgcourse.chat.v1";

type EngineKind = "ollama" | "webllm";
type OllamaStatus = "checking" | "connected" | "model_missing" | "disconnected";
type WebLlmPhase =
  | "inactive"
  | "unsupported"
  | "offer"
  | "fetching"
  | "ready"
  | "cancelled"
  | "error";

interface AssistantEngineLike {
  active: EngineKind | null;
  ollama: OllamaStatus;
  webllm: {
    phase: WebLlmPhase;
    progress: { pct: number; texto: string } | null;
    model: string;
    lastError: string | null;
  };
}

/** Prop mínima de `ChatPanel` (§9.8) — solo importa `active` para gating en
 *  la mayoría de estos tests; el resto de campos se rellenan con un estado
 *  terminal neutro. */
function makeEngine(active: EngineKind | null): AssistantEngineLike {
  return {
    active,
    ollama: active === "ollama" ? "connected" : "disconnected",
    webllm: {
      phase: active === "webllm" ? "ready" : "inactive",
      progress: null,
      model: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
      lastError: null,
    },
  };
}

/** Sincroniza el singleton REAL `useEngineStore` para que `chatStore.send()`
 *  (que lo consulta de forma independiente de la prop, ver cabecera) enrute
 *  por Ollama — vía la API normativa `setOllamaStatus`, no un atajo. */
async function activateOllama(): Promise<void> {
  const { useEngineStore } = await import("@/assistant/engineStore");
  useEngineStore.getState().setOllamaStatus("connected");
}

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
 * otra ruta (p. ej. `/api/tags`, que sí puede llegar a golpearse en estos
 * tests porque `useOllamaStatus`/`useEngineStore` reales pueden estar en
 * juego según el test) responde 200 vacío para no romper otros efectos
 * colaterales inesperados.
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

// ---------------------------------------------------------------------------
// SF3 — gating vía isChatEnabled(engine) (§9.8, sustituye isChatInputDisabled)
// ---------------------------------------------------------------------------
describe("ChatPanel — gating vía isChatEnabled(engine) (§9.8)", () => {
  it("con engine.active === null, el input y el botón Enviar están deshabilitados (no-regresión CA-19/20)", async () => {
    const { ChatPanel } = await import("@/components/ChatPanel");
    render(<ChatPanel engine={makeEngine(null)} />);

    expect(questionInput()).toBeDisabled();
    fireEvent.change(questionInput(), { target: { value: "hola" } });
    expect(sendButton()).toBeDisabled();
  });

  it("con engine.active === 'ollama' y texto en el input, el botón Enviar está habilitado", async () => {
    const { ChatPanel } = await import("@/components/ChatPanel");
    render(<ChatPanel engine={makeEngine("ollama")} />);

    expect(questionInput()).not.toBeDisabled();
    fireEvent.change(questionInput(), { target: { value: "hola" } });
    expect(sendButton()).not.toBeDisabled();
  });

  it("con engine.active === 'webllm' y texto en el input, el botón Enviar está habilitado (paridad WebGPU, CA-44)", async () => {
    const { ChatPanel } = await import("@/components/ChatPanel");
    render(<ChatPanel engine={makeEngine("webllm")} />);

    expect(questionInput()).not.toBeDisabled();
    fireEvent.change(questionInput(), { target: { value: "hola" } });
    expect(sendButton()).not.toBeDisabled();
  });

  it("con input vacío, el botón Enviar sigue deshabilitado aunque engine.active !== null", async () => {
    const { ChatPanel } = await import("@/components/ChatPanel");
    render(<ChatPanel engine={makeEngine("ollama")} />);

    expect(sendButton()).toBeDisabled();
  });
});

describe("ChatPanel — historial vacío", () => {
  it("muestra el texto de historial vacío antes de enviar nada", async () => {
    const { ChatPanel } = await import("@/components/ChatPanel");
    render(<ChatPanel engine={makeEngine("ollama")} />);

    expect(within(chatPanel()).getByText(STRINGS.asistente.chatPanel.historialVacio)).toBeInTheDocument();
  });
});

describe("CA-21 — render incremental (>=2 actualizaciones visibles antes de completar)", () => {
  it("el texto del último mensaje crece con cada chunk NDJSON recibido, antes del done", async () => {
    await activateOllama();
    const { ChatPanel } = await import("@/components/ChatPanel");
    const { enqueue, close } = stubChatFetch();

    render(<ChatPanel engine={makeEngine("ollama")} />);
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
    await activateOllama();
    const { ChatPanel } = await import("@/components/ChatPanel");
    const { enqueue } = stubChatFetch();

    render(<ChatPanel engine={makeEngine("ollama")} />);
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
    await activateOllama();
    const { ChatPanel } = await import("@/components/ChatPanel");
    const { enqueue, error } = stubChatFetch();

    render(<ChatPanel engine={makeEngine("ollama")} />);
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
    await activateOllama();
    const { ChatPanel } = await import("@/components/ChatPanel");
    const { enqueue: enqueue1, error: error1 } = stubChatFetch();

    render(<ChatPanel engine={makeEngine("ollama")} />);
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
    await activateOllama();
    const { ChatPanel } = await import("@/components/ChatPanel");
    const { enqueue, close } = stubChatFetch();

    render(<ChatPanel engine={makeEngine("ollama")} />);
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

  it("botón 'Detener' siempre presente, deshabilitado en reposo, incluso con engine.active === null", async () => {
    const { ChatPanel } = await import("@/components/ChatPanel");
    render(<ChatPanel engine={makeEngine(null)} />);

    expect(stopButton()).toBeInTheDocument();
    expect(stopButton()).toBeDisabled();
  });
});

describe("ChatPanel — persistencia de sesión (US-16, reutiliza el store real)", () => {
  it("una conversación completada persiste y se muestra igual en una nueva instancia del store", async () => {
    await activateOllama();
    const { ChatPanel } = await import("@/components/ChatPanel");
    const { enqueue, close } = stubChatFetch();

    render(<ChatPanel engine={makeEngine("ollama")} />);
    await sendQuestion("¿qué es add_messages?");
    enqueue(encode(ndjsonLine("Es un reducer.", true)));
    close();
    await waitFor(() => expect(isGenerando()).toBe(false));

    await waitFor(() => expect(sessionStorage.getItem(CHAT_STORAGE_KEY)).toBeTruthy());

    vi.resetModules();
    await activateOllama();
    const { ChatPanel: ReloadedChatPanel } = await import("@/components/ChatPanel");
    render(<ReloadedChatPanel engine={makeEngine("ollama")} />);

    const panels = screen.getAllByTestId("chat-panel");
    const reloadedPanel = panels[panels.length - 1] as HTMLElement;
    expect(within(reloadedPanel).getByText(/Es un reducer\./)).toBeInTheDocument();
  });
});
