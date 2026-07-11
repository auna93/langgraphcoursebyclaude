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
import { STRINGS } from "@/app/strings";
import { CONFIG } from "@/config";

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

/* ============================================================================
 * SF3 — Selección de motor por mensaje + avisos de conmutación (delta
 * C-ASSIST, `docs/arch/ARCHITECTURE-M5-WEBLLM.md` §9.5). `docs/arch/
 * SLICES.md` §SF3. Cubre CA-44 (paridad WebGPU), CA-45 (avisos), CA-46
 * (retorno automático / streams no interrumpidos por conmutación) y la
 * regresión CA-19/20/25/26.
 *
 * Escrito de forma INDEPENDIENTE del implementer, contra la superficie
 * pública añadida por el delta C-ASSIST:
 *
 *   interface ChatUiMessage { ...; aviso?: "cambio_motor"; engine?: EngineKind }
 *   interface ChatState { ...; appendEngineNotice(engine: EngineKind): void }
 *   reglas normativas de send() (§9.5, puntos 1-7) y regla normativa de avisos.
 *
 * ---------------------------------------------------------------------------
 * DOBLES DE MÓDULO (mismo "nivel de mock" que ya usa este archivo para
 * Ollama —red/`fetch`— replicado para el motor, siguiendo la instrucción
 * explícita de "revisar cómo chatStore.ts importa el cliente Ollama para
 * replicar el mismo patrón de inyección/mock del motor"):
 *
 * AJUSTE DE MECÁNICA DE TEST (post-cierre de §9.5.1, adenda 2026-07-09 de
 * `ARCHITECTURE-M5-WEBLLM.md`): este archivo se escribió ANTES de que el
 * architect cerrara §9.5.1 y asumía que `chatStore.ts` importaría
 * `createWebLlmClient` directamente desde `@/assistant/webllmClient` (ver
 * histórico de git). §9.5.1 fija lo contrario, LITERALMENTE: `chatStore` NO
 * importa `createWebLlmClient` bajo ninguna circunstancia; obtiene la
 * instancia "warm" vía `getWebLlmClient()`, exportada por
 * `@/assistant/engineStore` (regla 1 de §9.5.1). En consecuencia, el doble
 * del motor WebLLM (antes en un `vi.mock("@/assistant/webllmClient", ...)`
 * separado) se CONSOLIDA aquí, dentro del mock de `@/assistant/engineStore`,
 * que es el ÚNICO módulo que `chatStore.ts` importa para obtener tanto
 * `useEngineStore` como `getWebLlmClient`. Solo cambia EL MECANISMO DE
 * INYECCIÓN (qué módulo se mockea y de dónde se importa el doble
 * controlable); ninguna aserción de comportamiento se toca — el doble de
 * `chatStream` sigue modelando la misma semántica normativa de C-WEBLLM
 * (§9.3) que antes.
 *
 * - `@/assistant/engineStore`: chatStore.ts (post-SF3) necesita leer
 *   `useEngineStore.getState().engine.active` "en el momento del envío"
 *   (ADR-19, regla 1 de send()), suscribirse a sus cambios ("API `subscribe`
 *   de zustand", regla normativa de avisos, §9.5) para disparar
 *   `appendEngineNotice`, y obtener la instancia "warm" del motor WebLLM vía
 *   `getWebLlmClient()` (§9.5.1). Se sustituye el módulo COMPLETO por un
 *   doble que implementa el mismo subconjunto mínimo de la API pública de un
 *   store de zustand (`getState`/`setState`/`subscribe`, IGUAL forma que
 *   expone un store real creado con `create<EngineState>()(...)`) que ya usa
 *   `engineStore.ts` internamente, MÁS un `getWebLlmClient()` que devuelve el
 *   cliente WebLLM controlable descrito abajo. El doble expone además
 *   `__setActive(k)` (helper de TEST, NO parte del contrato) para forzar
 *   transiciones de `engine.active` de forma determinista sin pasar por la
 *   máquina de estados real de §9.4.1 — esa máquina ya está exhaustivamente
 *   cubierta en `engineStore.test.ts` (SF2); aquí solo importa CÓMO
 *   reacciona `chatStore` a los CAMBIOS de `active`, no cómo se producen.
 *
 *   `engineTestConfig.initialActive` (mutable, vía `vi.hoisted`) fija el
 *   `engine.active` INICIAL antes de que `chatStore.ts` se importe/suscriba
 *   — imprescindible para los tests de "primer aviso de la sesión", que
 *   dependen del valor de `active` que YA existía cuando `chatStore` arrancó
 *   su suscripción (una TRANSICIÓN posterior es lo único que dispara al
 *   listener; el valor inicial nunca lo hace, ni en el store real ni en este
 *   doble). Por defecto `initialActive = "ollama"` (sin transiciones
 *   posteriores en los tests YA EXISTENTES de S9/S11, arriba en este
 *   archivo): eso NO dispara nunca la lógica de avisos (que solo reacciona a
 *   TRANSICIONES, nunca al estado inicial), así que los tests S9/S11 de
 *   arriba no se ven afectados por este mock — sí necesitan, en cambio, que
 *   el motor activo por defecto sea "ollama" para que sus envíos se sigan
 *   enrutando por `fetch` (network mock ya existente) tal y como asumían
 *   antes de SF3.
 *
 * - Cliente WebLLM controlable (`__webllmControl`, exportado SOLO por el
 *   doble de `@/assistant/engineStore`, no por el contrato real) — análogo
 *   al `fetch` mockeado para Ollama, pero para el motor WebLLM (que no tiene
 *   "red" que interceptar: corre en un Worker). El paquete real
 *   `@mlc-ai/web-llm` y el módulo real `@/assistant/webllmClient` NUNCA se
 *   importan en este archivo (`chatStore.ts` tampoco los importa, por
 *   §9.5.1). Semántica de `chatStream` modelada IDÉNTICA a la normativa de
 *   C-WEBLLM (§9.3, ya verificada a fondo en `webllmClient.test.ts`, SF1):
 *   abort ⇒ resuelve SIN onError.
 *
 * FIX de mecánica de test — RESET EXPLÍCITO del doble entre tests (defecto
 * de infraestructura, no de comportamiento; verificado empíricamente y
 * documentado por Vitest: "vi.resetModules() ... doesn't reset the mocks
 * registry"). El diseño original de este archivo asumía que
 * `vi.resetModules()` (en el `beforeEach` de nivel de archivo) forzaba
 * reejecutar el factory de `vi.mock("@/assistant/engineStore", ...)` en cada
 * test, dejando `state`/`listeners` frescos por test — Vitest NO hace eso: el
 * factory de un módulo mockeado corre UNA sola vez por archivo, así que
 * `state` y `listeners` (incl. las suscripciones de `chatStore` de tests
 * ANTERIORES, nunca desuscritas) persistían entre tests, y `engineTestConfig
 * .initialActive` solo importaba la PRIMERA vez. Fix: el doble expone
 * `__reset(active)` (limpia `listeners` y reinicializa `state`, más el
 * `__webllmControl` interno) y `resetEngineTestConfig` (ahora async) lo
 * invoca explícitamente vía el MISMO mecanismo de import dinámico que ya usa
 * el resto del archivo. Todas las llamadas a `resetEngineTestConfig(...)`
 * pasan a `await resetEngineTestConfig(...)`. Ninguna aserción de
 * comportamiento cambia.
 * ---------------------------------------------------------------------------
 */

interface FakeChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface FakeEngineStreamError {
  kind: "network" | "http" | "parse" | "engine";
  message: string;
}

type FakeEngineKind = "ollama" | "webllm";

interface WebllmControl {
  push(t: string): void;
  finish(): void;
  fail(e: FakeEngineStreamError): void;
  readonly callCount: number;
  readonly lastMessages: FakeChatMessage[] | null;
  readonly lastSignal: AbortSignal | null;
}

interface EngineStoreDouble {
  getState(): { engine: { active: FakeEngineKind | null } };
  __setActive(active: FakeEngineKind | null): void;
  __reset(active: FakeEngineKind | null): void;
}

const { engineTestConfig } = vi.hoisted(() => ({
  engineTestConfig: {
    initialActive: "ollama" as FakeEngineKind | null,
  },
}));

/**
 * FIX de mecánica de test (infraestructura, no de comportamiento — ver nota
 * "RESET EXPLÍCITO del doble entre tests" en la cabecera de esta sección):
 * `vi.resetModules()` NO reejecuta el factory de `vi.mock(...)`, así que el
 * doble de `@/assistant/engineStore` es un ÚNICO singleton para todo el
 * archivo. `resetEngineTestConfig` pasa a ser ASYNC: además de fijar
 * `engineTestConfig.initialActive` (con la distinción null-explícito vs.
 * no-provisto ya corregida), importa el doble YA CARGADO (mismo mecanismo de
 * import dinámico que el resto del archivo) y llama a `__reset(...)` para
 * reinicializar su `state` y — crucialmente — limpiar los `listeners`
 * huérfanos de instancias de `chatStore` de tests anteriores (nunca
 * desuscritas, porque `chatStore.ts` no expone ese unsubscribe). Todas las
 * llamadas existentes pasan a `await resetEngineTestConfig(...)`.
 */
async function resetEngineTestConfig(
  overrides: { initialActive?: FakeEngineKind | null } = {},
): Promise<void> {
  const initialActive = overrides.initialActive === undefined ? "ollama" : overrides.initialActive;
  engineTestConfig.initialActive = initialActive;
  const mod = (await import("@/assistant/engineStore")) as unknown as {
    useEngineStore: EngineStoreDouble;
  };
  mod.useEngineStore.__reset(initialActive);
}

vi.mock("@/assistant/engineStore", () => {
  function makeEngine(active: FakeEngineKind | null) {
    return {
      active,
      ollama: "connected" as const,
      webllm: {
        phase: "inactive" as const,
        progress: null as null,
        model: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
        lastError: null as string | null,
      },
    };
  }

  type Engine = ReturnType<typeof makeEngine>;
  type Listener = (state: { engine: Engine }, prev: { engine: Engine }) => void;

  // Cliente WebLLM controlable (§9.5.1: `chatStore` lo obtiene vía
  // `getWebLlmClient()` de ESTE módulo, nunca vía `createWebLlmClient`
  // importado de `@/assistant/webllmClient` directamente). Definido ANTES de
  // `store` para que `store.__reset` pueda reiniciarlo también (ver FIX de
  // mecánica de test en la cabecera de esta sección).
  function createControllableWebLlmClient() {
    interface Handlers {
      onToken(t: string): void;
      onDone(): void;
      onError(e: FakeEngineStreamError): void;
    }
    const calls: Array<{ messages: FakeChatMessage[]; signal: AbortSignal }> = [];
    let handlers: Handlers | null = null;
    let resolveCurrent: (() => void) | null = null;

    const client = {
      async detectSupport() {
        return true;
      },
      async isModelCached() {
        return true;
      },
      load: () => Promise.resolve(),
      cancelLoad: () => {},
      chatStream(messages: FakeChatMessage[], h: Handlers, signal: AbortSignal): Promise<void> {
        calls.push({ messages, signal });
        handlers = h;
        return new Promise<void>((resolve) => {
          resolveCurrent = resolve;
          signal.addEventListener("abort", () => {
            // Paridad con la semántica NORMATIVA de C-WEBLLM (§9.3): abort ⇒
            // interruptGenerate() + resuelve SIN llamar a onError (CA-22/44).
            resolve();
          });
        });
      },
      unload: () => {},
    };

    return {
      client,
      push(t: string) {
        handlers?.onToken(t);
      },
      finish() {
        const h = handlers;
        handlers = null;
        h?.onDone();
        resolveCurrent?.();
      },
      fail(e: FakeEngineStreamError) {
        const h = handlers;
        handlers = null;
        h?.onError(e);
        resolveCurrent?.();
      },
      get callCount() {
        return calls.length;
      },
      get lastMessages() {
        return calls[calls.length - 1]?.messages ?? null;
      },
      get lastSignal() {
        return calls[calls.length - 1]?.signal ?? null;
      },
      /** FIX de mecánica de test: limpia las llamadas/handlers acumulados de
       *  tests anteriores (el doble es un singleton para todo el archivo). */
      __reset() {
        calls.length = 0;
        handlers = null;
        resolveCurrent = null;
      },
    };
  }

  const webllmControl = createControllableWebLlmClient();

  let state = { engine: makeEngine(engineTestConfig.initialActive) };
  const listeners = new Set<Listener>();

  const store = {
    getState: () => state,
    setState: (partial: { engine?: Partial<Engine> }) => {
      const prev = state;
      state = { engine: { ...state.engine, ...(partial.engine ?? {}) } };
      listeners.forEach((l) => l(state, prev));
    },
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    __setActive: (active: FakeEngineKind | null) => {
      store.setState({ engine: { active } });
    },
    /** FIX de mecánica de test (ver cabecera de esta sección): reinicializa
     *  `state` y limpia `listeners` huérfanos de instancias de `chatStore` de
     *  tests anteriores, más el `webllmControl` asociado. */
    __reset: (active: FakeEngineKind | null) => {
      state = { engine: makeEngine(active) };
      listeners.clear();
      webllmControl.__reset();
    },
  };

  return {
    useEngineStore: store,
    getWebLlmClient: () => webllmControl.client,
    __webllmControl: webllmControl,
  };
});

function findLastAssistant(mensajes: readonly { role: string }[]) {
  for (let i = mensajes.length - 1; i >= 0; i--) {
    if (mensajes[i].role === "assistant") return mensajes[i] as ChatUiMessageLike;
  }
  return undefined;
}

interface ChatUiMessageLike {
  role: "user" | "assistant";
  content: string;
  error?: string;
  aviso?: "cambio_motor";
  engine?: FakeEngineKind;
}

async function importWebllmControl(): Promise<WebllmControl> {
  // §9.5.1: el doble controlable vive en el mock de `@/assistant/engineStore`
  // (chatStore.ts obtiene el motor WebLLM vía `getWebLlmClient()` de ese
  // módulo, nunca importando `@/assistant/webllmClient` directamente).
  const mod = (await import("@/assistant/engineStore")) as unknown as {
    __webllmControl: WebllmControl;
  };
  return mod.__webllmControl;
}

async function importFakeEngineStore(): Promise<EngineStoreDouble> {
  const mod = (await import("@/assistant/engineStore")) as unknown as {
    useEngineStore: EngineStoreDouble;
  };
  return mod.useEngineStore;
}

// Fragmentos fijos de los literales `avisoCambioMotor.aWebGpu`/`.aOllama`
// (`src/app/strings.ts`, §9.7), derivados DINÁMICAMENTE llamando a la
// función con dos modelos distintos y quedándonos con el prefijo/sufijo
// común — evita duplicar el texto español a mano y sigue validando que se
// use EXACTAMENTE la plantilla correcta (cualquier otro texto no
// coincidiría), sin fijar una suposición sobre qué valor de `modelo` usa el
// implementer internamente (§9.7 no fija la fuente del argumento `modelo`,
// solo el formato del literal).
function commonPrefixSuffix(a: string, b: string): { prefix: string; suffix: string } {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return { prefix: a.slice(0, i), suffix: j > 0 ? a.slice(a.length - j) : "" };
}

// FIX de mecánica de test (defecto de la sonda, no de comportamiento; mismo
// tipo de fix que el `vi.hoisted` de `FAKE_MODEL_ID` en `webllmClient.test.ts`,
// SF1): las sondas ORIGINALES ("MODELO_X" / "MODELO_Y_DISTINTO") comparten el
// substring "MODELO_" como PREFIJO común entre sí, así que
// `commonPrefixSuffix` lo incluía por error dentro de `WEBGPU_PREFIX`/
// `OLLAMA_PREFIX` — un prefijo que ningún id de modelo real (p. ej.
// "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC") empieza literalmente por
// "MODELO_", así que `content.startsWith(WEBGPU_PREFIX)` fallaba SIEMPRE,
// para cualquier implementación correcta. Sondas sin ningún carácter en común
// en la primera/última posición (aquí, dígitos "0"/"9" repetidos) hacen que
// `commonPrefixSuffix` pare exactamente en el borde de la plantilla, tal como
// pretendía el test original. Las aserciones (`startsWith`/`endsWith`/
// `toMatch(/WebGPU/)`) NO cambian.
const { prefix: WEBGPU_PREFIX, suffix: WEBGPU_SUFFIX } = commonPrefixSuffix(
  STRINGS.avisoCambioMotor.aWebGpu("0000000000"),
  STRINGS.avisoCambioMotor.aWebGpu("9999999999"),
);
const { prefix: OLLAMA_PREFIX, suffix: OLLAMA_SUFFIX } = commonPrefixSuffix(
  STRINGS.avisoCambioMotor.aOllama("0000000000"),
  STRINGS.avisoCambioMotor.aOllama("9999999999"),
);

function expectAvisoWebGpu(content: string) {
  expect(content.startsWith(WEBGPU_PREFIX)).toBe(true);
  expect(content.endsWith(WEBGPU_SUFFIX)).toBe(true);
  expect(content).toMatch(/WebGPU/);
}

function expectAvisoOllama(content: string) {
  expect(content.startsWith(OLLAMA_PREFIX)).toBe(true);
  expect(content.endsWith(OLLAMA_SUFFIX)).toBe(true);
}

// ---------------------------------------------------------------------------
// CA-46 — selección de motor por mensaje en send() (ADR-19)
// ---------------------------------------------------------------------------
describe("SF3/CA-46 — engine.active==='ollama' ⇒ send() usa el cliente Ollama", () => {
  it("hace fetch a CONFIG.ollama.baseUrl y NO llama al cliente WebLLM", async () => {
    await resetEngineTestConfig({ initialActive: "ollama" });
    const { useChatStore } = await import("@/assistant/chatStore");
    const webllmControl = await importWebllmControl();
    const { enqueue, close } = stubChatFetch();

    useChatStore.getState().send("¿qué es una tool?");
    await tick();

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalled();
    const requestedUrl = String(fetchMock.mock.calls[0][0]);
    expect(requestedUrl).toContain(CONFIG.ollama.baseUrl);
    expect(webllmControl.callCount).toBe(0);

    enqueue(encode(ndjsonLine("una tool es...", true)));
    close();
    await vi.waitFor(() => expect(useChatStore.getState().generando).toBe(false));
    expect(findLastAssistant(useChatStore.getState().mensajes)?.content).toBe("una tool es...");
  });
});

describe("SF3/CA-44 — degradado + engine.active==='webllm' (ready) ⇒ send() usa el cliente WebLLM", () => {
  it("llama a chatStream del cliente WebLLM (0 fetch) y el contenido crece con cada push (paridad CA-21)", async () => {
    await resetEngineTestConfig({ initialActive: "webllm" });
    const { useChatStore } = await import("@/assistant/chatStore");
    const webllmControl = await importWebllmControl();
    // Se usa el mismo doble bien formado que el resto del archivo (nunca un
    // `vi.fn()` desnudo): si el código bajo prueba (aún pre-SF3) SÍ llegara a
    // llamar a `fetch` aquí, un mock sin implementación haría que
    // `ollamaClient.chatStream` lance sobre `res.ok` con `res === undefined`,
    // una rejection NO capturada por este test (`send` es fire-and-forget) que
    // ensucia otros tests. Con un Response bien formado, la aserción
    // `not.toHaveBeenCalled()` seguirá fallando por la razón correcta (SF3
    // aún no filtra por `engine.active`) sin ruido adicional.
    stubChatFetch();

    useChatStore.getState().send("¿qué es un checkpoint?");
    await tick();

    expect(webllmControl.callCount).toBe(1);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();

    webllmControl.push("Un ");
    await tick();
    const snap1 = findLastAssistant(useChatStore.getState().mensajes)?.content ?? "";
    expect(snap1.length).toBeGreaterThan(0);

    webllmControl.push("checkpoint es un punto de guardado");
    await tick();
    const snap2 = findLastAssistant(useChatStore.getState().mensajes)?.content ?? "";
    expect(snap2).not.toBe(snap1);
    expect(snap2.startsWith(snap1)).toBe(true);
    expect(useChatStore.getState().generando).toBe(true);

    webllmControl.finish();
    await vi.waitFor(() => expect(useChatStore.getState().generando).toBe(false));
    expect(findLastAssistant(useChatStore.getState().mensajes)?.content).toBe(
      "Un checkpoint es un punto de guardado",
    );
  });
});

// ---------------------------------------------------------------------------
// CA-46 — una generación en curso NUNCA se corta por conmutar el motor
// ---------------------------------------------------------------------------
describe("SF3/CA-46 — un stream en curso NO se corta al conmutar active, en ningún sentido", () => {
  it("iniciado en 'ollama': cambiar active a 'webllm' a mitad no re-enruta el stream (termina vía Ollama)", async () => {
    await resetEngineTestConfig({ initialActive: "ollama" });
    const { useChatStore } = await import("@/assistant/chatStore");
    const webllmControl = await importWebllmControl();
    const fakeEngineStore = await importFakeEngineStore();
    const { enqueue, close } = stubChatFetch();

    useChatStore.getState().send("pregunta larga");
    await tick();
    enqueue(encode(ndjsonLine("parte 1 ")));
    await tick();

    // Conmuta el motor A MITAD del stream (CA-46: nunca debe abortar/re-enrutar).
    fakeEngineStore.__setActive("webllm");
    await tick();

    expect(useChatStore.getState().generando).toBe(true);
    expect(webllmControl.callCount).toBe(0); // el stream sigue siendo el de Ollama

    enqueue(encode(ndjsonLine("parte 2", true)));
    close();

    await vi.waitFor(() => expect(useChatStore.getState().generando).toBe(false));
    const last = findLastAssistant(useChatStore.getState().mensajes);
    expect(last?.content).toBe("parte 1 parte 2");
    expect(last?.engine).toBe("ollama");
  });

  it("iniciado en 'webllm': cambiar active a 'ollama' a mitad no re-enruta el stream (termina vía WebLLM)", async () => {
    await resetEngineTestConfig({ initialActive: "webllm" });
    const { useChatStore } = await import("@/assistant/chatStore");
    const webllmControl = await importWebllmControl();
    const fakeEngineStore = await importFakeEngineStore();
    // Ver nota en el test hermano de arriba: Response bien formado para que
    // una llamada real a fetch (comportamiento pre-SF3) no deje una
    // rejection sin capturar.
    stubChatFetch();

    useChatStore.getState().send("pregunta larga");
    await tick();
    webllmControl.push("parte 1 ");
    await tick();

    fakeEngineStore.__setActive("ollama");
    await tick();

    expect(useChatStore.getState().generando).toBe(true);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled(); // el stream sigue siendo el de WebLLM

    webllmControl.push("parte 2");
    webllmControl.finish();

    await vi.waitFor(() => expect(useChatStore.getState().generando).toBe(false));
    const last = findLastAssistant(useChatStore.getState().mensajes);
    expect(last?.content).toBe("parte 1 parte 2");
    expect(last?.engine).toBe("webllm");
  });
});

// ---------------------------------------------------------------------------
// CA-45 — regla normativa de avisos (§9.5)
// ---------------------------------------------------------------------------
describe("SF3/CA-45 — avisos de conmutación de motor (regla normativa de §9.5)", () => {
  it("el PRIMER 'ollama' de la sesión (desde null/arranque) NO genera aviso", async () => {
    await resetEngineTestConfig({ initialActive: null });
    const { useChatStore } = await import("@/assistant/chatStore");
    const fakeEngineStore = await importFakeEngineStore();

    expect(useChatStore.getState().mensajes).toEqual([]);
    fakeEngineStore.__setActive("ollama");
    await tick();

    expect(useChatStore.getState().mensajes.filter((m) => m.aviso).length).toBe(0);
  });

  it("conmutación 'ollama' → 'webllm' (tras el arranque silencioso) añade un aviso que nombra WebGPU (literal exacto de avisoCambioMotor.aWebGpu)", async () => {
    await resetEngineTestConfig({ initialActive: null });
    const { useChatStore } = await import("@/assistant/chatStore");
    const fakeEngineStore = await importFakeEngineStore();

    fakeEngineStore.__setActive("ollama"); // arranque silencioso (primer ollama de sesión)
    await tick();
    expect(useChatStore.getState().mensajes.filter((m) => m.aviso).length).toBe(0);

    fakeEngineStore.__setActive("webllm");
    await tick();

    const avisos = useChatStore.getState().mensajes.filter((m) => m.aviso === "cambio_motor");
    expect(avisos.length).toBe(1);
    expectAvisoWebGpu(avisos[0].content);
  });

  it("conmutación 'webllm' → 'ollama' (tras un cambio previo) añade el aviso aOllama", async () => {
    await resetEngineTestConfig({ initialActive: null });
    const { useChatStore } = await import("@/assistant/chatStore");
    const fakeEngineStore = await importFakeEngineStore();

    fakeEngineStore.__setActive("webllm"); // establece lastAnnounced="webllm" (aviso aWebGpu)
    await tick();
    fakeEngineStore.__setActive("ollama");
    await tick();

    const avisos = useChatStore.getState().mensajes.filter((m) => m.aviso === "cambio_motor");
    expect(avisos.length).toBe(2);
    expectAvisoWebGpu(avisos[0].content);
    expectAvisoOllama(avisos[1].content);
  });

  it("una transición a null NO genera aviso (el estado terminal ya es visible en el badge)", async () => {
    await resetEngineTestConfig({ initialActive: "ollama" });
    const { useChatStore } = await import("@/assistant/chatStore");
    const fakeEngineStore = await importFakeEngineStore();

    fakeEngineStore.__setActive(null);
    await tick();

    expect(useChatStore.getState().mensajes.filter((m) => m.aviso).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §9.5 regla 4 — el historial enviado al motor excluye mensajes con aviso
// ---------------------------------------------------------------------------
describe("SF3/§9.5 regla 4 — el historial enviado al motor excluye los mensajes con aviso", () => {
  it("los avisos de cambio de motor NO viajan en el payload de la petición a Ollama", async () => {
    await resetEngineTestConfig({ initialActive: null });
    const { useChatStore } = await import("@/assistant/chatStore");
    const fakeEngineStore = await importFakeEngineStore();

    // Genera dos avisos reales vía transiciones de motor antes de enviar nada.
    fakeEngineStore.__setActive("webllm");
    await tick();
    fakeEngineStore.__setActive("ollama");
    await tick();

    const avisos = useChatStore.getState().mensajes.filter((m) => m.aviso === "cambio_motor");
    expect(avisos.length).toBe(2);

    const { enqueue, close } = stubChatFetch();
    useChatStore.getState().send("¿qué es un checkpoint?");
    await tick();

    const fetchMock = vi.mocked(fetch);
    const lastCall = fetchMock.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const init = lastCall?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as { messages: { role: string; content: string }[] };

    for (const aviso of avisos) {
      expect(body.messages.some((m) => m.content === aviso.content)).toBe(false);
    }
    // La lista de mensajes SÍ contiene los avisos en el estado interno del store
    // (se ven en el hilo del chat); solo se excluyen del PROMPT enviado al motor.
    expect(useChatStore.getState().mensajes.some((m) => m.aviso === "cambio_motor")).toBe(true);

    enqueue(encode(ndjsonLine("un checkpoint es...", true)));
    close();
    await vi.waitFor(() => expect(useChatStore.getState().generando).toBe(false));
  });
});

// ---------------------------------------------------------------------------
// CA-23/CA-24 ⇒ CA-44 — paridad de contexto (módulo actual + RAG) vía WebLLM.
//
// Finding del reviewer sobre SF3 (SLICES.md, "Milestone M5" → SF3 → "Tests",
// ~línea 569): "paridad: prompt vía WebLLM incluye módulo actual y ragHits no
// vacíos (CA-23/24 ⇒ CA-44)". `chatStore.ts` construye `prompt` UNA SOLA VEZ
// (líneas ~129-134, `buildPrompt({pregunta, historial, currentModule,
// ragHits})`) y lo pasa IDÉNTICO a `engineClient.chatStream` sea `client`
// (Ollama) o `webllm` (línea ~164) — no hay una segunda construcción de
// prompt condicionada al motor. El criterio de aserción es el MISMO que ya
// usa `e2e/chat.spec.ts:252-259` para Ollama inspeccionando la request de
// red; aquí se replica inspeccionando directamente
// `webllmControl.lastMessages` porque WebLLM corre en un Worker sin red
// observable (no hay `fetch` que interceptar).
// ---------------------------------------------------------------------------
describe("SF3/CA-23/CA-24 ⇒ CA-44 — paridad de contexto (módulo actual + RAG) vía WebLLM", () => {
  const MODULE_ID: ModuleId = "mod01";
  const MODULE_PATH = "/modulo/mod01";

  // `getCurrentModuleId()` (chatStore.ts) lee `window.location.pathname` en
  // cada `send()`; se restaura tras cada test de este bloque para no
  // filtrar estado al resto del archivo (single jsdom window por archivo).
  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("el array de mensajes recibido por el motor WebLLM incluye el módulo actual (CA-23) y fragmentos RAG no vacíos (CA-24)", async () => {
    await resetEngineTestConfig({ initialActive: "webllm" });
    const { useChatStore } = await import("@/assistant/chatStore");
    const { getModule } = await import("@/content/registry");
    const webllmControl = await importWebllmControl();

    const courseModule = getModule(MODULE_ID);
    expect(courseModule).toBeDefined();

    window.history.pushState({}, "", MODULE_PATH);

    // Mismo término que el e2e de CA-23/24 para Ollama (e2e/chat.spec.ts:243):
    // presente en el contenido de mod01, garantiza >=1 chunk RAG real (no un
    // resultado vacío por falta de coincidencia léxica).
    useChatStore.getState().send("¿Qué es un grafo en LangGraph?");
    await tick();

    expect(webllmControl.callCount).toBe(1);
    const messages = webllmControl.lastMessages;
    expect(messages).not.toBeNull();
    const systemMessage = messages!.find((m) => m.role === "system");
    expect(systemMessage).toBeDefined();

    // CA-23: el system referencia el módulo actual (id + título) — mismo
    // criterio que e2e/chat.spec.ts:253-254 para Ollama.
    expect(systemMessage!.content).toContain(MODULE_ID);
    expect(systemMessage!.content).toContain(courseModule!.titulo);

    // CA-24: el bloque de contexto RAG está presente y no vacío — mismo
    // criterio que e2e/chat.spec.ts:258-259 para Ollama. A diferencia de la
    // versión anterior de este test (FAIL de reviewer): ni "contexto del
    // curso" (bloque `prioridadContexto`, strings.ts:164, incondicional) ni
    // "grafo" (bloque `moduloActual` vía `objetivo` de mod01, mod01.ts:12,
    // CA-23) son exclusivos de RAG. El prefijo "### " de cada chunk
    // (promptBuilder.ts:37) SÍ lo es: ningún otro bloque fijo del system
    // (rol/moduloActual/fueraDeAlcance/prioridadContexto) contiene "###",
    // así que esta aserción es falsable por una mutación RAG-only
    // (ragHits: [] solo para webllm, dejando currentModule intacto) sin que
    // la cace la aserción de CA-23 de arriba.
    expect(systemMessage!.content).toContain("CONTEXTO DEL CURSO:\n### ");
    // Refuerzo: substring del CUERPO del chunk mod01/explicaSimple/0
    // ("Una receta contra un tablero de juego", mod01.ts:19), recuperado
    // dentro del topK=4 para esta query exacta (verificado); no aparece en
    // ningún otro bloque del system prompt.
    expect(systemMessage!.content).toContain("tablero de juego");

    webllmControl.push("Un grafo tiene nodos.");
    webllmControl.finish();
    await vi.waitFor(() => expect(useChatStore.getState().generando).toBe(false));
  });

  it("el historial enviado al motor WebLLM también excluye los mensajes con aviso (§9.5 regla 4, lado WebLLM — hoy solo probado del lado Ollama)", async () => {
    await resetEngineTestConfig({ initialActive: null });
    const { useChatStore } = await import("@/assistant/chatStore");
    const fakeEngineStore = await importFakeEngineStore();
    const webllmControl = await importWebllmControl();

    fakeEngineStore.__setActive("ollama"); // arranque silencioso (primer ollama de sesión)
    await tick();
    fakeEngineStore.__setActive("webllm"); // dispara el aviso aWebGpu (activo queda en webllm)
    await tick();

    const avisos = useChatStore.getState().mensajes.filter((m) => m.aviso === "cambio_motor");
    expect(avisos.length).toBe(1);

    window.history.pushState({}, "", MODULE_PATH);
    useChatStore.getState().send("¿qué es un checkpoint?");
    await tick();

    const messages = webllmControl.lastMessages;
    expect(messages).not.toBeNull();
    for (const aviso of avisos) {
      expect(messages!.some((m) => m.content === aviso.content)).toBe(false);
    }
    // Igual que en la contraparte de Ollama (línea ~997): el aviso SIGUE
    // visible en el hilo del chat; solo se excluye del prompt enviado al motor.
    expect(useChatStore.getState().mensajes.some((m) => m.aviso === "cambio_motor")).toBe(true);

    webllmControl.push("un checkpoint es...");
    webllmControl.finish();
    await vi.waitFor(() => expect(useChatStore.getState().generando).toBe(false));
  });
});

// ---------------------------------------------------------------------------
// §9.5 regla 5 — el mensaje assistant creado queda etiquetado con engine:k
// ---------------------------------------------------------------------------
describe("SF3/§9.5 regla 5 — el mensaje assistant creado queda etiquetado con engine:k", () => {
  it("engine:'ollama' cuando el motor activo en el envío es ollama", async () => {
    await resetEngineTestConfig({ initialActive: "ollama" });
    const { useChatStore } = await import("@/assistant/chatStore");
    const { enqueue, close } = stubChatFetch();

    useChatStore.getState().send("pregunta");
    await tick();
    enqueue(encode(ndjsonLine("respuesta", true)));
    close();
    await vi.waitFor(() => expect(useChatStore.getState().generando).toBe(false));

    expect(findLastAssistant(useChatStore.getState().mensajes)?.engine).toBe("ollama");
  });

  it("engine:'webllm' cuando el motor activo en el envío es webllm", async () => {
    await resetEngineTestConfig({ initialActive: "webllm" });
    const { useChatStore } = await import("@/assistant/chatStore");
    const webllmControl = await importWebllmControl();

    useChatStore.getState().send("pregunta");
    await tick();
    webllmControl.push("respuesta");
    webllmControl.finish();
    await vi.waitFor(() => expect(useChatStore.getState().generando).toBe(false));

    expect(findLastAssistant(useChatStore.getState().mensajes)?.engine).toBe("webllm");
  });
});

// ---------------------------------------------------------------------------
// §9.5 regla 1 — engine.active === null ⇒ send() es no-op
// ---------------------------------------------------------------------------
describe("SF3/§9.5 regla 1 — engine.active === null ⇒ send() es no-op", () => {
  it("no llama a ningún cliente ni añade mensajes ni cambia generando", async () => {
    await resetEngineTestConfig({ initialActive: null });
    const { useChatStore } = await import("@/assistant/chatStore");
    const webllmControl = await importWebllmControl();
    // Ver nota en "CA-44 ... webllm ready": Response bien formado para que una
    // llamada real a fetch (comportamiento pre-SF3, que aún no respeta
    // engine.active===null) no deje una rejection sin capturar.
    stubChatFetch();

    useChatStore.getState().send("¿hola?");
    await tick();

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(webllmControl.callCount).toBe(0);
    expect(useChatStore.getState().mensajes).toEqual([]);
    expect(useChatStore.getState().generando).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §9.5 regla 6 — error string por motor
// ---------------------------------------------------------------------------
describe("SF3/§9.5 regla 6 — error string por motor (CA-26 heredado + errorStreamWebGpu nuevo)", () => {
  it("motor ollama ⇒ usa STRINGS.asistente.chatPanel.errorStream (sin cambios, CA-26)", async () => {
    await resetEngineTestConfig({ initialActive: "ollama" });
    const { useChatStore } = await import("@/assistant/chatStore");
    const { enqueue, error } = stubChatFetch();

    useChatStore.getState().send("pregunta");
    await tick();
    enqueue(encode(ndjsonLine("parcial")));
    await tick();
    error(new TypeError("network drop"));

    await vi.waitFor(() => expect(useChatStore.getState().generando).toBe(false));
    expect(findLastAssistant(useChatStore.getState().mensajes)?.error).toBe(
      STRINGS.asistente.chatPanel.errorStream,
    );
  });

  it("motor webllm ⇒ usa STRINGS.asistente.chatPanel.errorStreamWebGpu (literal nuevo)", async () => {
    await resetEngineTestConfig({ initialActive: "webllm" });
    const { useChatStore } = await import("@/assistant/chatStore");
    const webllmControl = await importWebllmControl();

    useChatStore.getState().send("pregunta");
    await tick();
    webllmControl.push("parcial ");
    await tick();
    webllmControl.fail({ kind: "engine", message: "engine crashed" });

    await vi.waitFor(() => expect(useChatStore.getState().generando).toBe(false));
    const last = findLastAssistant(useChatStore.getState().mensajes);
    expect(last?.content).toBe("parcial ");
    expect(last?.error).toBe(STRINGS.asistente.chatPanel.errorStreamWebGpu);
  });
});

// ---------------------------------------------------------------------------
// §9.5 regla 7 — stop()/clear() sin cambios de comportamiento
// ---------------------------------------------------------------------------
describe("SF3/§9.5 regla 7 — stop()/clear() llaman al abort correcto sin importar el motor activo", () => {
  it("con motor webllm activo, stop() aborta el AbortSignal recibido por chatStream, conserva el parcial y no marca error (<=2s, CA-22)", async () => {
    await resetEngineTestConfig({ initialActive: "webllm" });
    const { useChatStore } = await import("@/assistant/chatStore");
    const webllmControl = await importWebllmControl();

    useChatStore.getState().send("Explica los checkpoints");
    await tick();
    webllmControl.push("Los checkpoints ");
    await tick();

    expect(webllmControl.lastSignal?.aborted).toBe(false);

    const start = Date.now();
    useChatStore.getState().stop();

    await vi.waitFor(() => expect(useChatStore.getState().generando).toBe(false));
    const elapsedMs = Date.now() - start;

    expect(elapsedMs).toBeLessThanOrEqual(2000);
    expect(webllmControl.lastSignal?.aborted).toBe(true);
    const last = findLastAssistant(useChatStore.getState().mensajes);
    expect(last?.content).toBe("Los checkpoints ");
    expect(last?.error).toBeUndefined();
  });

  it("clear() también aborta un stream vía webllm en curso y vacía mensajes", async () => {
    await resetEngineTestConfig({ initialActive: "webllm" });
    const { useChatStore } = await import("@/assistant/chatStore");
    const webllmControl = await importWebllmControl();

    useChatStore.getState().send("una pregunta cualquiera");
    await tick();
    webllmControl.push("parcial");
    await tick();

    useChatStore.getState().clear();

    expect(useChatStore.getState().mensajes).toEqual([]);
    await vi.waitFor(() => expect(useChatStore.getState().generando).toBe(false));
    expect(webllmControl.lastSignal?.aborted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CA-27/A-10 — sendFeynmanFeedback reusa send(): funciona igual con WebGPU
// ---------------------------------------------------------------------------
describe("SF3 — sendFeynmanFeedback funciona igual con ambos motores (CA-27 vía WebGPU)", () => {
  const MOD_ID: ModuleId = "mod01";
  const EXPLICACION =
    "Un grafo de LangGraph es una máquina de estados donde cada nodo transforma el estado " +
    "compartido y las aristas deciden el siguiente paso, hasta llegar a END.";

  it("con motor webllm activo, envía la explicación guardada y la respuesta llega vía el cliente WebLLM", async () => {
    await resetEngineTestConfig({ initialActive: "webllm" });
    localStorage.clear();
    const { useChatStore } = await import("@/assistant/chatStore");
    const { useProgressStore } = await import("@/progress/store");
    const webllmControl = await importWebllmControl();

    useProgressStore.getState().resetAll();
    useProgressStore.getState().saveExplanation(MOD_ID, EXPLICACION);

    useChatStore.getState().sendFeynmanFeedback(MOD_ID);
    await tick();

    expect(webllmControl.callCount).toBe(1);
    const userMsg = useChatStore.getState().mensajes.find((m) => m.role === "user");
    expect(userMsg?.content).toContain(EXPLICACION);

    webllmControl.push("Buen intento, ");
    webllmControl.finish();
    await vi.waitFor(() => expect(useChatStore.getState().generando).toBe(false));

    expect(findLastAssistant(useChatStore.getState().mensajes)?.engine).toBe("webllm");
  });
});
