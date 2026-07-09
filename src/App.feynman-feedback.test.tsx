/**
 * Integración end-to-end (vitest, jsdom) de "Feedback Feynman con un clic"
 * (slice S11, SLICES.md §S11) — CA-27, A-10.
 *
 * Escrito de forma INDEPENDIENTE del implementer, contra la superficie
 * PÚBLICA/observable de la app: renderiza `<App />` completa (Layout +
 * `ModuloPage` + `FeynmanEditor` + `ChatPanel`, todos ya en PASS de slices
 * previos), guarda una explicación válida en el store REAL de progreso
 * (C-PROGRESS) y mockea únicamente la RED al nivel que fija C-OLLAMA
 * (`fetch` hacia `/ollama/api/tags` y `/ollama/api/chat`) — igual patrón que
 * `chatStore.test.ts` (S9) y `e2e/chat.spec.ts`.
 *
 * Cubre:
 *  - CA-27 (a): al pulsar "pedir feedback" con una explicación guardada, el
 *    mensaje que aparece en el chat CONTIENE la explicación guardada del
 *    alumno (usa `buildFeynmanFeedbackMessage`, C-ASSIST, para construir el
 *    valor esperado — no se asume el copy exacto del componente).
 *  - CA-27 (b): la respuesta llega en streaming con las mismas garantías que
 *    CA-21 (≥2 actualizaciones incrementales visibles antes de completarse).
 *  - SLICES.md §S11 ("abre/enfoca el sidebar"): dado que el sidebar del
 *    asistente (`Layout`, `<aside aria-label="Asistente">`) YA es visible de
 *    forma permanente en el layout (no hay mecanismo de apertura/cierre en
 *    ARCHITECTURE.md — es un panel fijo, no un drawer), la interpretación
 *    verificable de "enfocar" es que el propio contenedor del sidebar (o un
 *    elemento dentro de él) reciba el foco del teclado tras pulsar "pedir
 *    feedback", para que el alumno note que la respuesta está en camino ahí
 *    y (en layouts estrechos, donde el sidebar queda debajo del contenido)
 *    el navegador lo traiga a la vista.
 *    -----------------------------------------------------------------------
 *    CONTRATO ASUMIDO (SLICES.md §S11 no fija el mecanismo literal de
 *    "abre/enfoca"; se fija aquí para hacer el test determinista — cualquier
 *    divergencia real y justificada del implementer va al reviewer, no se
 *    relaja este test): tras `sendFeynmanFeedback`, `document.activeElement`
 *    es el propio `<aside aria-label="Asistente">` o un descendiente suyo
 *    (p. ej. el campo de texto del chat) — cualquiera de los dos cumple la
 *    intención de "enfocar el sidebar".
 *    -----------------------------------------------------------------------
 */
import { render, screen, within } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { buildFeynmanFeedbackMessage } from "@/assistant/promptBuilder";
import { getModule } from "@/content/registry";
import { useProgressStore } from "@/progress/store";
import { EXPLICACION_VALIDA } from "@/progress/test-fixtures";

const MOD01 = getModule("mod01")!;
const ASISTENTE_LABEL = "Asistente";
const MODEL_TAG = { name: "qwen2.5-coder:14b" };

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function ndjsonLine(content: string, done = false): string {
  return JSON.stringify({ message: { role: "assistant", content }, done }) + "\n";
}

function controlledStream() {
  let enqueue!: (chunk: Uint8Array) => void;
  let close!: () => void;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      enqueue = (chunk) => controller.enqueue(chunk);
      close = () => controller.close();
    },
  });
  return { stream, enqueue, close };
}

function tick(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Enruta el fetch mockeado según el endpoint de C-OLLAMA (health vs chat). */
function stubOllamaFetch() {
  const { stream, enqueue, close } = controlledStream();

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/tags")) {
        return new Response(JSON.stringify({ models: [MODEL_TAG] }), { status: 200 });
      }
      if (url.includes("/api/chat")) {
        return new Response(stream, { status: 200 });
      }
      return new Response(null, { status: 404 });
    }),
  );

  return { enqueue, close };
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={["/modulo/mod01"]}>
      <Routes>
        <Route path="/*" element={<App />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useProgressStore.getState().resetAll();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CA-27/A-10 — Feedback Feynman con un clic (integración completa de la app)", () => {
  it("envía la explicación guardada al asistente y la respuesta streamea incrementalmente", async () => {
    useProgressStore.getState().saveExplanation("mod01", EXPLICACION_VALIDA);
    const { enqueue, close } = stubOllamaFetch();

    renderApp();

    const asistente = screen.getByLabelText(ASISTENTE_LABEL);
    await screen.findByText("Conectado", { exact: true }, { timeout: 5000 });

    const tab = screen.getByRole("tab", { name: "Explica simple" });
    fireEvent.click(tab);
    const panel = screen.getByRole("tabpanel");

    const boton = within(panel).getByRole("button", { name: /pedir feedback/i });
    expect(boton).toBeEnabled();

    fireEvent.click(boton);
    await tick();

    // CA-27 (a): el mensaje enviado contiene la explicación guardada.
    const mensajeEsperado = buildFeynmanFeedbackMessage(MOD01.titulo, EXPLICACION_VALIDA);
    const userMsg = within(asistente).getByTestId("chat-message-user");
    expect(userMsg.textContent ?? "").toContain(EXPLICACION_VALIDA);
    expect(
      within(asistente).getAllByTestId("chat-message-content").at(0)?.textContent ?? "",
    ).toBe(mensajeEsperado);

    // CA-27 (b): streaming con las mismas garantías que CA-21 (>=2 updates).
    const respuesta = () => within(asistente).getByTestId("chat-message-assistant");

    enqueue(encode(ndjsonLine("Buen intento, ")));
    await tick();
    const snapshot1 = respuesta().textContent ?? "";
    expect(snapshot1.length).toBeGreaterThan(0);

    enqueue(encode(ndjsonLine("pero te falta explicar los checkpoints.")));
    await tick();
    const snapshot2 = respuesta().textContent ?? "";
    expect(snapshot2).not.toBe(snapshot1);
    expect(snapshot2.startsWith(snapshot1)).toBe(true);

    enqueue(encode(ndjsonLine("", true)));
    close();
    await vi.waitFor(() => {
      expect(screen.queryByText("Generando respuesta…")).not.toBeInTheDocument();
    });

    expect(respuesta().textContent).toContain(
      "Buen intento, pero te falta explicar los checkpoints.",
    );
  });

  it("mueve el foco al input del chat tras pedir feedback (sidebar enfocado)", async () => {
    useProgressStore.getState().saveExplanation("mod01", EXPLICACION_VALIDA);
    stubOllamaFetch();

    renderApp();

    const asistente = screen.getByLabelText(ASISTENTE_LABEL);
    await screen.findByText("Conectado", { exact: true }, { timeout: 5000 });

    const tab = screen.getByRole("tab", { name: "Explica simple" });
    fireEvent.click(tab);
    const panel = screen.getByRole("tabpanel");

    const boton = within(panel).getByRole("button", { name: /pedir feedback/i });
    fireEvent.click(boton);
    await tick();

    // El foco cae en el propio sidebar o en un descendiente suyo (p. ej. el
    // input del chat): cualquiera de los dos cumple "enfocar el sidebar".
    expect(asistente.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
  });
});
