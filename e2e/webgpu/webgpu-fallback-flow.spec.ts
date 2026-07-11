import type { Page, Route } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { Server } from "node:http";
import { createServer } from "node:http";

/**
 * Cierre M5 (integrator) — SLICES.md "Cierre M5", recorrido end-to-end
 * completo del fallback WebGPU: degradación de Ollama → oferta (0 requests,
 * CA-40/41) → descarga fake con progreso, cancelación y reintento (CA-42/43)
 * → chat vía WebGPU con contexto de módulo/RAG y feedback Feynman (CA-44) →
 * recuperación de Ollama → retorno automático con aviso (CA-45/46).
 *
 * Contrato: `docs/arch/ARCHITECTURE-M5-WEBLLM.md` §9.3–§9.5.1. Riesgos R17/R18
 * (§9.10): no hay GPU real en CI, así que este archivo NUNCA ejercita el
 * paquete `@mlc-ai/web-llm` real ni descarga artefactos — corre contra el
 * servidor de DESARROLLO de Vite (proyecto Playwright "webgpu-fallback",
 * `playwright.config.ts`) para poder importar `src/assistant/engineStore.ts`
 * por su URL estable y sustituir, EN LA MISMA instancia singleton que usa la
 * app real (`getWebLlmClient()`, §9.5.1: identidad de objeto), los métodos de
 * `WebLlmClient` por dobles controlables desde el test — mismo patrón que
 * `window.__runChallengeInPage` de `e2e/runner/helpers.ts` para el runner de
 * Pyodide. El resto de la aplicación (engineStore, chatStore, StatusBadge,
 * WebGpuFallbackCard, ChatPanel, Layout) es el código de producción REAL, sin
 * tocar: solo el cliente WebLLM está falseado.
 *
 * `e2e/webgpu-fallback.spec.ts` (proyecto "chromium", build de producción)
 * cubre en paralelo la propiedad de "0 requests antes de aceptar" con el
 * cliente WebLLM REAL (sin sustituir), y la regresión CA-41 (WebGPU no
 * soportado) — ver ese archivo para el resto de la verificación de red.
 */

const ASISTENTE_LABEL = "Asistente";
const OLLAMA_MODEL = "qwen2.5-coder:14b";
const ARTIFACT_HOST_RE = /huggingface\.co|raw\.githubusercontent\.com/i;
const ENGINE_MODULE_PATH = "/src/assistant/engineStore.ts";

type OllamaMode = "connected" | "disconnected" | "model_missing";

interface WebllmTestControls {
  setDetectSupport(v: boolean): void;
  setModelCached(v: boolean): void;
  resolveLoad(): void;
  rejectLoad(kind: "gpu" | "red" | "cancelado", message: string): void;
  emitProgress(pct: number, texto: string): void;
  pushToken(t: string): void;
  finishChat(): void;
  failChat(message: string): void;
  lastChatMessages(): Array<{ role: string; content: string }> | null;
  chatCallCount(): number;
}

declare global {
  interface Window {
    __webllmControls?: WebllmTestControls;
  }
}

/**
 * Sustituye, EN LA INSTANCIA DE PRODUCCIÓN (`getWebLlmClient()`, §9.5.1), los
 * métodos de `WebLlmClient` por dobles controlables desde Node vía
 * `window.__webllmControls`. Se llama DESPUÉS de que la app ya haya montado y
 * resuelto un primer health-check "connected" (para no correr contra el
 * cliente real todavía sin sustituir, ver `runFlow` más abajo: el mock de
 * `/ollama/api/tags` arranca en modo "connected" a propósito).
 */
async function installFakeWebLlmClient(
  page: Page,
  opts: { autoResolveLoad?: boolean } = {},
): Promise<void> {
  await page.evaluate(
    async ({ modulePath, autoResolveLoad }) => {
      const mod = (await import(/* @vite-ignore */ modulePath)) as {
        getWebLlmClient: () => {
          detectSupport: () => Promise<boolean>;
          isModelCached: () => Promise<boolean>;
          load: (onProgress: (p: { pct: number; texto: string }) => void) => Promise<void>;
          cancelLoad: () => void;
          chatStream: (
            messages: Array<{ role: string; content: string }>,
            handlers: {
              onToken: (t: string) => void;
              onDone: () => void;
              onError: (e: { kind: string; message: string }) => void;
            },
            signal: AbortSignal,
          ) => Promise<void>;
          unload: () => void;
        };
      };
      const client = mod.getWebLlmClient();

      let detectSupportVal = true;
      let modelCachedVal = false;
      let pendingLoad: {
        resolve: () => void;
        reject: (err: { kind: string; message: string }) => void;
        onProgress: (p: { pct: number; texto: string }) => void;
      } | null = null;
      let streamHandlers: {
        onToken: (t: string) => void;
        onDone: () => void;
        onError: (e: { kind: string; message: string }) => void;
      } | null = null;
      let resolveChatPromise: (() => void) | null = null;
      const chatMessagesLog: Array<Array<{ role: string; content: string }>> = [];

      client.detectSupport = () => Promise.resolve(detectSupportVal);
      client.isModelCached = () => Promise.resolve(modelCachedVal);

      client.load = (onProgress: (p: { pct: number; texto: string }) => void) => {
        if (autoResolveLoad) {
          onProgress({ pct: 100, texto: "listo (caché)" });
          return Promise.resolve();
        }
        return new Promise<void>((resolve, reject) => {
          pendingLoad = { resolve, reject, onProgress };
        });
      };

      client.cancelLoad = () => {
        const p = pendingLoad;
        pendingLoad = null;
        p?.reject({ kind: "cancelado", message: "Descarga cancelada por el alumno." });
      };

      client.chatStream = (
        messages: Array<{ role: string; content: string }>,
        handlers: {
          onToken: (t: string) => void;
          onDone: () => void;
          onError: (e: { kind: string; message: string }) => void;
        },
        signal: AbortSignal,
      ) => {
        chatMessagesLog.push(messages);
        streamHandlers = handlers;
        return new Promise<void>((resolve) => {
          resolveChatPromise = resolve;
          if (signal.aborted) resolve();
        });
      };

      client.unload = () => undefined;

      window.__webllmControls = {
        setDetectSupport(v: boolean) {
          detectSupportVal = v;
        },
        setModelCached(v: boolean) {
          modelCachedVal = v;
        },
        resolveLoad() {
          const p = pendingLoad;
          pendingLoad = null;
          p?.resolve();
        },
        rejectLoad(kind, message) {
          const p = pendingLoad;
          pendingLoad = null;
          p?.reject({ kind, message });
        },
        emitProgress(pct, texto) {
          pendingLoad?.onProgress({ pct, texto });
        },
        pushToken(t) {
          streamHandlers?.onToken(t);
        },
        finishChat() {
          streamHandlers?.onDone();
          streamHandlers = null;
          resolveChatPromise?.();
          resolveChatPromise = null;
        },
        failChat(message) {
          streamHandlers?.onError({ kind: "engine", message });
          streamHandlers = null;
          resolveChatPromise?.();
          resolveChatPromise = null;
        },
        lastChatMessages() {
          return chatMessagesLog[chatMessagesLog.length - 1] ?? null;
        },
        chatCallCount() {
          return chatMessagesLog.length;
        },
      };
    },
    { modulePath: ENGINE_MODULE_PATH, autoResolveLoad: opts.autoResolveLoad ?? false },
  );
}

function controls(page: Page) {
  return {
    setModelCached: (v: boolean) =>
      page.evaluate((val) => window.__webllmControls!.setModelCached(val), v),
    resolveLoad: () => page.evaluate(() => window.__webllmControls!.resolveLoad()),
    emitProgress: (pct: number, texto: string) =>
      page.evaluate(([p, t]) => window.__webllmControls!.emitProgress(p, t as string), [
        pct,
        texto,
      ] as [number, string]),
    pushToken: (t: string) => page.evaluate((tok) => window.__webllmControls!.pushToken(tok), t),
    finishChat: () => page.evaluate(() => window.__webllmControls!.finishChat()),
    lastChatMessages: () => page.evaluate(() => window.__webllmControls!.lastChatMessages()),
    chatCallCount: () => page.evaluate(() => window.__webllmControls!.chatCallCount()),
  };
}

/** Mock de `/ollama/api/tags` controlable en caliente desde el test (mismo
 *  espíritu que `e2e/ollama-status.spec.ts`, pero con el estado mutable en
 *  vez de fijo por test, para poder simular la degradación Y la
 *  recuperación DENTRO del mismo recorrido, CA-46). */
function ollamaTagsHandler(getMode: () => OllamaMode) {
  return async (route: Route) => {
    const mode = getMode();
    if (mode === "connected") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ models: [{ name: OLLAMA_MODEL }] }),
      });
      return;
    }
    if (mode === "model_missing") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ models: [{ name: "llama3:8b" }] }),
      });
      return;
    }
    await route.abort("connectionrefused");
  };
}

function ndjsonLine(content: string, done = false): string {
  return JSON.stringify({ message: { role: "assistant", content }, done }) + "\n";
}

/** Servidor local que responde `/api/chat` (Ollama real, CA-46) tras la
 *  recuperación — mismo patrón que `e2e/chat.spec.ts`. */
function startOllamaChatServer(): Promise<{ server: Server; port: number }> {
  const server = createServer((req, res) => {
    if (req.url?.endsWith("/api/chat")) {
      res.writeHead(200, { "Content-Type": "application/x-ndjson" });
      res.write(ndjsonLine("hola "));
      setTimeout(() => {
        res.write(ndjsonLine("de vuelta", true));
        res.end();
      }, 100);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, port });
    });
  });
}

function trackArtifactRequests(page: Page): string[] {
  const artifactHost: string[] = [];
  page.on("request", (req) => {
    if (ARTIFACT_HOST_RE.test(req.url())) artifactHost.push(req.url());
  });
  return artifactHost;
}

test.describe("Cierre M5 — recorrido completo del fallback WebGPU (cliente sustituido, R17/R18)", () => {
  test("degradación → oferta → descarga con progreso → cancelar → reintentar → chat WebGPU (RAG+módulo) → feedback Feynman → recuperación de Ollama con aviso", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    let mode: OllamaMode = "connected";
    const artifactRequests = trackArtifactRequests(page);

    const { server: chatServer, port } = await startOllamaChatServer();

    try {
      await page.route("**/ollama/api/tags", ollamaTagsHandler(() => mode));
      await page.route("**/ollama/api/chat", async (route) => {
        const original = new URL(route.request().url());
        await route.continue({ url: `http://127.0.0.1:${port}${original.pathname}` });
      });

      // 1) Arranca "connected" a propósito: el primer health-check resuelve
      // con el cliente WebLLM REAL (aún sin sustituir) y NUNCA dispara la
      // máquina de degradación (E1/§9.4.1) — así se evita una carrera entre
      // el montaje de la app y la instalación del doble, más abajo.
      await page.goto("/");
      const asistente = page.getByLabel(ASISTENTE_LABEL);
      await expect(asistente.getByText("Conectado", { exact: true })).toBeVisible({
        timeout: 5000,
      });

      // 2) Sustituye el cliente WebLLM de producción por el doble
      // controlable (§9.5.1: MISMA instancia que `chatStore`/`engineStore`
      // usan de verdad).
      await installFakeWebLlmClient(page);

      // 3) Degradación de Ollama (disconnected).
      mode = "disconnected";

      const card = page.getByTestId("webgpu-fallback-card");
      await expect(card).toBeVisible({ timeout: 8000 });
      await expect(card.getByText("Asistente de respaldo (WebGPU)")).toBeVisible();
      await expect(asistente.getByText("Sin conexión", { exact: true })).toBeVisible();

      // CA-40/41: 0 requests al host de artefactos antes de aceptar.
      expect(artifactRequests).toEqual([]);

      // 4) Acepta la descarga (CA-40b) ⇒ "fetching" con progreso monótono
      // (CA-42), controlado desde el test.
      await card.getByRole("button", { name: "Descargar y activar" }).click();
      await expect(card.getByText("Descargando modelo WebGPU… 0 %")).toBeVisible();

      const c = controls(page);
      await c.emitProgress(10, "Fetching param cache [1/10]");
      await expect(card.getByText("Descargando modelo WebGPU… 10 %")).toBeVisible();
      await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "10");

      // 5) CA-42: la app sigue interactiva durante la descarga — navegar a
      // otro módulo (SPA, sin recargar la página) y volver.
      await page.getByText(/TypedDict/i).first().click();
      await expect(page).toHaveURL(/\/modulo\/mod02$/);
      await expect(page.getByRole("tab", { name: "Explica simple" })).toBeVisible();
      // La card de descarga sigue viva en el sidebar tras la navegación
      // (mismo estado de store, `Layout` envuelve `Outlet`).
      await expect(card.getByText("Descargando modelo WebGPU… 10 %")).toBeVisible();

      await c.emitProgress(20, "Fetching param cache [2/10]");
      await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "20");

      // 6) Cancelar (CA-43): cesa en <=2s, vuelve a terminal CA-19 + oferta accesible.
      const cancelStart = Date.now();
      await card.getByRole("button", { name: "Cancelar" }).click();
      await expect(card.getByText("Descarga cancelada. Puedes volver a activarla cuando quieras.")).toBeVisible();
      expect(Date.now() - cancelStart).toBeLessThanOrEqual(2000);
      await expect(asistente.getByText("Sin conexión", { exact: true })).toBeVisible();
      await expect(asistente.getByRole("textbox")).toBeDisabled();

      // 7) Reintento: acepta de nuevo, progresa hasta el final y resuelve.
      await card.getByRole("button", { name: "Descargar y activar" }).click();
      await c.emitProgress(50, "Fetching param cache [5/10]");
      await c.emitProgress(100, "Todo listo");
      await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
      await c.resolveLoad();

      // 8) "ready": el chat queda habilitado vía WebGPU (CA-44), badge propio
      // (CA-45) y aviso en el hilo que nombra el motor entrante.
      await expect(asistente.getByText("Respaldo WebGPU activo", { exact: true })).toBeVisible({
        timeout: 5000,
      });
      await expect(asistente.getByRole("textbox")).toBeEnabled();
      const avisoWebGpu = page.getByTestId("chat-message-aviso").last();
      await expect(avisoWebGpu).toContainText("WebGPU");

      // 9) Vuelve a mod01 (contenido real con "grafo") para verificar
      // paridad de contexto (CA-23/24 ⇒ CA-44) igual que `e2e/chat.spec.ts`.
      await page.getByRole("link", { name: "Volver al temario" }).click();
      await expect(page).toHaveURL(/\/$/);
      await page.getByText(/Grafos vs/i).first().click();
      await expect(page).toHaveURL(/\/modulo\/mod01$/);
      await expect(asistente.getByText("Respaldo WebGPU activo", { exact: true })).toBeVisible();

      const input = asistente.getByRole("textbox");
      await input.fill("¿Qué es un grafo en LangGraph?");
      await asistente.getByRole("button", { name: "Enviar" }).click();

      await expect.poll(() => c.chatCallCount(), { timeout: 5000 }).toBe(1);
      const promptMessages = await c.lastChatMessages();
      const systemMessage = promptMessages?.find((m) => m.role === "system");
      expect(systemMessage).toBeDefined();
      expect(systemMessage!.content).toContain("mod01");
      expect(systemMessage!.content).toMatch(/contexto del curso/i);
      expect(systemMessage!.content).toContain("grafo");

      const respuesta = page.getByTestId("chat-message-assistant").last();
      await c.pushToken("Un ");
      await expect(respuesta).toContainText("Un", { timeout: 5000 });
      await c.pushToken("grafo tiene nodos y aristas.");
      await expect(respuesta).toContainText("Un grafo tiene nodos y aristas.");
      await c.finishChat();
      await expect(page.getByText("Generando respuesta…")).toHaveCount(0);

      // 10) Feedback Feynman vía WebGPU (CA-27 ⇒ CA-44).
      await page.getByRole("tab", { name: "Explica simple" }).click();
      const panel = page.getByRole("tabpanel");
      const EXPLICACION =
        "Un grafo de LangGraph es una máquina de estados donde cada nodo transforma el " +
        "estado compartido y las aristas deciden el siguiente paso a seguir, incluyendo " +
        "ciclos condicionales, hasta llegar finalmente al nodo especial END.";
      const textarea = panel.getByRole("textbox");
      await textarea.fill(EXPLICACION);
      await textarea.blur();
      const guardar = panel.getByRole("button", { name: /guardar/i });
      if (await guardar.count()) await guardar.click();

      const botonFeedback = panel.getByRole("button", { name: /pedir feedback/i });
      await expect(botonFeedback).toBeEnabled();
      await botonFeedback.click();

      await expect.poll(() => c.chatCallCount(), { timeout: 5000 }).toBe(2);
      const feedbackMessages = await c.lastChatMessages();
      const userMessage = feedbackMessages?.filter((m) => m.role === "user").pop();
      expect(userMessage?.content).toContain("máquina de estados");

      const respuestaFeedback = page.getByTestId("chat-message-assistant").last();
      await c.pushToken("Buen intento.");
      await expect(respuestaFeedback).toContainText("Buen intento.");
      await c.finishChat();

      // 11) Ollama se recupera (CA-46): el siguiente mensaje va por Ollama,
      // ninguna generación en curso se interrumpió, y aparece el aviso que
      // nombra a Ollama.
      mode = "connected";
      await expect(asistente.getByText("Conectado", { exact: true })).toBeVisible({
        timeout: 8000,
      });
      const avisoOllama = page.getByTestId("chat-message-aviso").last();
      await expect(avisoOllama).toContainText("Ollama");

      await input.fill("hola");
      await asistente.getByRole("button", { name: "Enviar" }).click();
      await expect(page.getByTestId("chat-message-assistant").last()).toContainText(
        "hola de vuelta",
        { timeout: 5000 },
      );
      // El motor WebGPU (fake) NO se volvió a invocar: el mensaje fue por Ollama.
      expect(await c.chatCallCount()).toBe(2);

      // CA-47: en TODO el recorrido, 0 peticiones al host de artefactos del
      // modelo (el cliente estuvo sustituido desde el paso 2 en adelante).
      expect(artifactRequests).toEqual([]);
    } finally {
      chatServer.close();
    }
  });
});

test.describe("CA-40a — modelo ya cacheado: activación automática sin oferta, 0 requests", () => {
  test("con isModelCached()===true, el fallback se activa solo (sin oferta) y el chat WebGPU queda listo", async ({
    page,
  }) => {
    let mode: OllamaMode = "connected";
    const artifactRequests = trackArtifactRequests(page);

    await page.route("**/ollama/api/tags", ollamaTagsHandler(() => mode));
    await page.route("**/ollama/api/chat", (route) => route.abort("connectionrefused"));

    await page.goto("/");
    const asistente = page.getByLabel(ASISTENTE_LABEL);
    await expect(asistente.getByText("Conectado", { exact: true })).toBeVisible({
      timeout: 5000,
    });

    await installFakeWebLlmClient(page, { autoResolveLoad: true });
    await controls(page).setModelCached(true);

    mode = "model_missing";

    await expect(asistente.getByText("Respaldo WebGPU activo", { exact: true })).toBeVisible({
      timeout: 8000,
    });
    await expect(asistente.getByRole("textbox")).toBeEnabled();

    // CA-40a: la oferta NUNCA se mostró (activación 100% automática).
    await expect(page.getByRole("button", { name: "Descargar y activar" })).toHaveCount(0);

    expect(artifactRequests).toEqual([]);
  });
});
