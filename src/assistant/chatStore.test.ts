/**
 * Tests de `src/assistant/chatStore.ts` (contrato C-ASSIST, ARCHITECTURE.md
 * §4). Slice S9 — SLICES.md §S9. Cubre CA-21, CA-22, CA-26 y US-16
 * (persistencia de sesión + limpiar conversación).
 *
 * Escritos de forma INDEPENDIENTE del implementer, contra la superficie
 * pública del contrato:
 *
 *   export interface ChatState {
 *     mensajes: { role: "user" | "assistant"; content: string; error?: string }[];
 *     generando: boolean;
 *     status: OllamaStatus;
 *     send(pregunta: string): void;
 *     stop(): void;
 *     clear(): void;
 *     sendFeynmanFeedback(moduleId: ModuleId): void;
 *   }
 *
 * No se mockea `OllamaClient` directamente: el contrato no expone ningún
 * punto de inyección de dependencias para `chatStore` (a diferencia de
 * `useOllamaStatus`, que sí acepta un `client` opcional, S8). En su lugar se
 * mockea la RED al nivel que fija C-OLLAMA — `fetch` hacia
 * `POST {baseUrl}/api/chat` con NDJSON — exactamente igual que
 * `ollamaClient.test.ts` (S8). Esto verifica el comportamiento OBSERVABLE
 * del store (mensajes, generando) sin acoplarse a cómo construye
 * internamente su cliente Ollama.
 *
 * `sendFeynmanFeedback` (CA-27, slice S11 — SLICES.md §S11) se testea al
 * final de este archivo, en su propia sección, contra el store real de
 * progreso (C-PROGRESS, `useProgressStore`, ya en PASS desde S3) y el
 * registro de contenido real (C-CONTENT, `getModule`, ya en PASS desde S1).
 *

 * ---------------------------------------------------------------------------
 * CONTRATO ASUMIDO (SLICES.md §S9 no fija estos detalles literalmente; se
 * fijan aquí para hacer los tests deterministas — cualquier divergencia real
 * y justificada del implementer va al reviewer, no se relaja el test):
 * ---------------------------------------------------------------------------
 * - `send(pregunta)` añade de inmediato `{role:"user", content: pregunta}` y
 *   `{role:"assistant", content:""}`; `generando` pasa a `true`. Cada token
 *   NDJSON recibido (`onToken`) se concatena AL VUELO al `content` del
 *   último mensaje assistant (actualización incremental visible, CA-21).
 * - Al completarse (`onDone`) `generando` pasa a `false` sin tocar el
 *   `content` ya acumulado.
 * - `stop()` aborta el streaming en curso: en <=2s deja `generando=false`,
 *   conserva EXACTAMENTE el `content` parcial emitido hasta ese momento
 *   (CA-22) y NO añade `error` al mensaje.
 * - Un error de red a mitad de stream (CA-26) deja `generando=false`,
 *   conserva el `content` parcial y añade al ÚLTIMO mensaje assistant un
 *   campo `error: string` no vacío, en español, con una pista de
 *   recuperación (alguna de: reintentar/recargar/revisar la conexión/
 *   inténtalo). La app sigue operativa: se puede volver a llamar a
 *   `send`/`clear` sin excepciones.
 * - `clear()` vacía `mensajes` a `[]` y dispara `stop()` de cualquier
 *   streaming en curso (deja `generando=false`).
 * - La sesión persiste en `sessionStorage` bajo la clave LITERAL del
 *   contrato `"lgcourse.chat.v1"` (US-16), con formato estándar de
 *   `zustand/persist` (`{state, version}`); `mensajes` sobrevive a una
 *   recarga (nueva instancia del módulo del store, misma `sessionStorage`).
 * - `sendFeynmanFeedback(moduleId)` (CA-27, A-10): lee la explicación
 *   guardada del módulo en `useProgressStore` (C-PROGRESS,
 *   `modules[moduleId]?.explicacion?.texto`) y el módulo real vía `getModule`
 *   (C-CONTENT), compone `buildFeynmanFeedbackMessage(mod.titulo, texto)`
 *   (C-ASSIST) y lo envía como turno del alumno con LAS MISMAS garantías de
 *   `send` (CA-21: mensaje `user` inmediato + placeholder `assistant` +
 *   `generando=true` + streaming incremental). Si el módulo no tiene
 *   explicación guardada (o está vacía), no hace nada observable: no añade
 *   mensajes ni cambia `generando` (invariante defensivo — el gating real de
 *   "explicación válida" vive en la UI de `FeynmanEditor`, S11, no se confía
 *   en que el store lo repita, pero tampoco debe romperse si se le llama).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildFeynmanFeedbackMessage } from "@/assistant/promptBuilder";
import type { ModuleId } from "@/content/types";

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

function stubChatFetch() {
  const { stream, enqueue, close, error } = controlledStream();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(stream, { status: 200 })),
  );
  return { enqueue, close, error };
}

beforeEach(() => {
  sessionStorage.clear();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CA-21 — render incremental (>=2 actualizaciones visibles antes de completar)", () => {
  it("el content del mensaje assistant crece con cada chunk NDJSON recibido", async () => {
    const { useChatStore } = await import("@/assistant/chatStore");
    const { enqueue, close } = stubChatFetch();

    useChatStore.getState().send("¿Qué es un grafo en LangGraph?");
    await tick();
    expect(useChatStore.getState().generando).toBe(true);

    function lastAssistant() {
      const mensajes = useChatStore.getState().mensajes;
      return mensajes[mensajes.length - 1];
    }

    // Mensajes iniciales: pregunta del alumno + placeholder de respuesta.
    expect(useChatStore.getState().mensajes.at(0)).toMatchObject({
      role: "user",
      content: "¿Qué es un grafo en LangGraph?",
    });
    expect(lastAssistant()?.role).toBe("assistant");

    enqueue(encode(ndjsonLine("Un ")));
    await tick();
    const snapshot1 = lastAssistant()?.content ?? "";
    expect(snapshot1.length).toBeGreaterThan(0);

    enqueue(encode(ndjsonLine("grafo es un conjunto de nodos y aristas")));
    await tick();
    const snapshot2 = lastAssistant()?.content ?? "";

    // >= 2 actualizaciones incrementales DISTINTAS y visibles antes de completarse.
    expect(snapshot2).not.toBe(snapshot1);
    expect(snapshot2.startsWith(snapshot1)).toBe(true);
    expect(useChatStore.getState().generando).toBe(true);

    enqueue(encode(ndjsonLine("", true)));
    close();
    await vi.waitFor(() => expect(useChatStore.getState().generando).toBe(false));

    expect(lastAssistant()?.content).toBe("Un grafo es un conjunto de nodos y aristas");
    expect(lastAssistant()?.error).toBeUndefined();
  });
});

describe("CA-22 — 'detener' corta la generación en <=2s con el parcial intacto", () => {
  it("stop() deja generando=false, conserva el parcial y no marca error", async () => {
    const { useChatStore } = await import("@/assistant/chatStore");
    const { enqueue } = stubChatFetch();

    useChatStore.getState().send("Explica los checkpoints");
    await tick();
    enqueue(encode(ndjsonLine("Los checkpoints ")));
    await tick();

    const partial = useChatStore.getState().mensajes.at(-1)?.content ?? "";
    expect(partial.length).toBeGreaterThan(0);

    const start = Date.now();
    useChatStore.getState().stop();

    await vi.waitFor(() => expect(useChatStore.getState().generando).toBe(false));
    const elapsedMs = Date.now() - start;

    expect(elapsedMs).toBeLessThanOrEqual(2000);
    expect(useChatStore.getState().mensajes.at(-1)?.content).toBe(partial);
    expect(useChatStore.getState().mensajes.at(-1)?.error).toBeUndefined();
  });
});

describe("CA-26 — error de red a mitad de stream: mensaje legible + app viva", () => {
  it("añade un error en español con pista de recuperación, sin dejar generando=true", async () => {
    const { useChatStore } = await import("@/assistant/chatStore");
    const { enqueue, error } = stubChatFetch();

    useChatStore.getState().send("¿Cómo uso interrupt?");
    await tick();
    enqueue(encode(ndjsonLine("El ")));
    await tick();

    const partial = useChatStore.getState().mensajes.at(-1)?.content ?? "";

    error(new TypeError("network drop"));
    await vi.waitFor(() => expect(useChatStore.getState().generando).toBe(false));

    const last = useChatStore.getState().mensajes.at(-1);
    expect(last?.content).toBe(partial);
    expect(last?.error).toBeTruthy();
    // Legible en español + instrucción de recuperación: no es el mensaje
    // técnico crudo del error de red, y sugiere una acción concreta.
    expect(last?.error).not.toMatch(/network drop/i);
    expect(last?.error ?? "").toMatch(/reintent|recarg|conex|intenta/i);
  });

  it("la app sigue operativa tras el error: se puede enviar otra pregunta con éxito", async () => {
    const { useChatStore } = await import("@/assistant/chatStore");
    const { enqueue: enqueue1, error: error1 } = stubChatFetch();

    useChatStore.getState().send("primera pregunta");
    await tick();
    enqueue1(encode(ndjsonLine("x")));
    await tick();
    error1(new TypeError("network drop"));
    await vi.waitFor(() => expect(useChatStore.getState().generando).toBe(false));

    // Segundo intento: nuevo fetch mockeado, sin lanzar excepciones.
    const { enqueue: enqueue2, close: close2 } = stubChatFetch();
    expect(() => useChatStore.getState().send("segunda pregunta")).not.toThrow();
    await tick();
    enqueue2(encode(ndjsonLine("respuesta", true)));
    close2();

    await vi.waitFor(() => expect(useChatStore.getState().generando).toBe(false));
    expect(useChatStore.getState().mensajes.at(-1)?.content).toBe("respuesta");
    expect(useChatStore.getState().mensajes.at(-1)?.error).toBeUndefined();
  });
});

describe("US-16 — limpiar conversación", () => {
  it("clear() vacía mensajes y detiene cualquier streaming en curso", async () => {
    const { useChatStore } = await import("@/assistant/chatStore");
    const { enqueue } = stubChatFetch();

    useChatStore.getState().send("una pregunta cualquiera");
    await tick();
    enqueue(encode(ndjsonLine("parcial")));
    await tick();

    useChatStore.getState().clear();

    expect(useChatStore.getState().mensajes).toEqual([]);
    await vi.waitFor(() => expect(useChatStore.getState().generando).toBe(false));
  });
});

describe("US-16 — persistencia de sesión (sessionStorage, clave 'lgcourse.chat.v1')", () => {
  it("restaura la conversación EXACTAMENTE igual tras simular una recarga en la misma sesión", async () => {
    const { useChatStore } = await import("@/assistant/chatStore");
    const { enqueue, close } = stubChatFetch();

    useChatStore.getState().send("¿qué es add_messages?");
    await tick();
    enqueue(encode(ndjsonLine("Es un reducer.", true)));
    close();
    await vi.waitFor(() => expect(useChatStore.getState().generando).toBe(false));

    // El middleware persist puede escribir de forma asíncrona (microtask).
    await vi.waitFor(() => {
      expect(sessionStorage.getItem(CHAT_STORAGE_KEY)).toBeTruthy();
    });

    const before = useChatStore.getState().mensajes;

    // Simula "recargar la página dentro de la misma sesión": nueva instancia
    // del módulo del store, misma `sessionStorage` (no se limpia entre medias).
    vi.resetModules();
    const { useChatStore: reloadedStore } = await import("@/assistant/chatStore");

    expect(reloadedStore.getState().mensajes).toEqual(before);
    expect(reloadedStore.getState().mensajes.at(-1)?.content).toBe("Es un reducer.");
  });

  it("usa exactamente la clave de sessionStorage 'lgcourse.chat.v1'", async () => {
    const { useChatStore } = await import("@/assistant/chatStore");
    const { enqueue, close } = stubChatFetch();

    useChatStore.getState().send("hola");
    await tick();
    enqueue(encode(ndjsonLine("hola de vuelta", true)));
    close();
    await vi.waitFor(() => expect(useChatStore.getState().generando).toBe(false));

    await vi.waitFor(() => {
      expect(sessionStorage.getItem(CHAT_STORAGE_KEY)).toBeTruthy();
    });

    // NO debe usar localStorage (US-16 exige sessionStorage explícitamente,
    // distinto del progreso que sí usa localStorage — C-PROGRESS).
    expect(localStorage.getItem(CHAT_STORAGE_KEY)).toBeNull();
  });
});

/**
 * CA-27 / A-10 — Feedback Feynman con un clic (slice S11, SLICES.md §S11).
 *
 * `sendFeynmanFeedback(moduleId)` consume C-PROGRESS (`useProgressStore`,
 * ya en PASS desde S3) y C-CONTENT (`getModule`, ya en PASS desde S1) — no se
 * mockean, se usa el store/registro REALES, igual que `FeynmanEditor.test.tsx`
 * (S5) hace con `useProgressStore`. La red se mockea exactamente igual que en
 * el resto de este archivo (fetch hacia `POST {baseUrl}/api/chat`, C-OLLAMA).
 */
describe("CA-27/A-10 — sendFeynmanFeedback: feedback Feynman con un clic", () => {
  const MOD_ID: ModuleId = "mod01";
  const EXPLICACION =
    "Un grafo de LangGraph es una máquina de estados donde cada nodo transforma el estado " +
    "compartido y las aristas deciden el siguiente paso, hasta llegar a END.";

  beforeEach(async () => {
    localStorage.clear();
  });

  it("envía la explicación guardada como mensaje del alumno, compuesto con buildFeynmanFeedbackMessage", async () => {
    const { useChatStore } = await import("@/assistant/chatStore");
    const { useProgressStore } = await import("@/progress/store");
    const { getModule } = await import("@/content/registry");

    useProgressStore.getState().resetAll();
    useProgressStore.getState().saveExplanation(MOD_ID, EXPLICACION);

    stubChatFetch();

    useChatStore.getState().sendFeynmanFeedback(MOD_ID);
    await tick();

    const mod = getModule(MOD_ID);
    expect(mod).toBeDefined();
    const mensajeEsperado = buildFeynmanFeedbackMessage(mod!.titulo, EXPLICACION);

    const mensajes = useChatStore.getState().mensajes;
    const userMsg = mensajes.find((m) => m.role === "user");

    expect(userMsg).toBeDefined();
    expect(userMsg?.content).toBe(mensajeEsperado);
    expect(userMsg?.content).toContain(EXPLICACION);
  });

  it("la respuesta llega en streaming con las mismas garantías que CA-21 (>=2 actualizaciones incrementales)", async () => {
    const { useChatStore } = await import("@/assistant/chatStore");
    const { useProgressStore } = await import("@/progress/store");

    useProgressStore.getState().resetAll();
    useProgressStore.getState().saveExplanation(MOD_ID, EXPLICACION);

    const { enqueue, close } = stubChatFetch();

    function lastAssistant() {
      const mensajes = useChatStore.getState().mensajes;
      return mensajes[mensajes.length - 1];
    }

    useChatStore.getState().sendFeynmanFeedback(MOD_ID);
    await tick();
    expect(useChatStore.getState().generando).toBe(true);
    expect(lastAssistant()?.role).toBe("assistant");

    enqueue(encode(ndjsonLine("Buen intento, ")));
    await tick();
    const snapshot1 = lastAssistant()?.content ?? "";
    expect(snapshot1.length).toBeGreaterThan(0);

    enqueue(encode(ndjsonLine("pero te falta explicar cómo se propaga el estado entre nodos.")));
    await tick();
    const snapshot2 = lastAssistant()?.content ?? "";

    expect(snapshot2).not.toBe(snapshot1);
    expect(snapshot2.startsWith(snapshot1)).toBe(true);
    expect(useChatStore.getState().generando).toBe(true);

    enqueue(encode(ndjsonLine("", true)));
    close();
    await vi.waitFor(() => expect(useChatStore.getState().generando).toBe(false));

    expect(lastAssistant()?.content).toBe(
      "Buen intento, pero te falta explicar cómo se propaga el estado entre nodos.",
    );
    expect(lastAssistant()?.error).toBeUndefined();
  });

  it("no rompe ni añade mensajes si el módulo no tiene explicación guardada", async () => {
    const { useChatStore } = await import("@/assistant/chatStore");
    const { useProgressStore } = await import("@/progress/store");

    useProgressStore.getState().resetAll();
    // Sin llamar a saveExplanation: el módulo no tiene progreso alguno.

    expect(() => useChatStore.getState().sendFeynmanFeedback(MOD_ID)).not.toThrow();
    await tick();

    expect(useChatStore.getState().mensajes).toEqual([]);
    expect(useChatStore.getState().generando).toBe(false);
  });
});
