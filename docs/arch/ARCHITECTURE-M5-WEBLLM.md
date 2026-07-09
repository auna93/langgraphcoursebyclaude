# ARCHITECTURE §9 — Fallback in-browser del asistente (WebLLM/WebGPU) [M5]

> **Extensión NORMATIVA y ADITIVA de `docs/arch/ARCHITECTURE.md`** (léase como su
> sección §9), cerrada por el architect el **2026-07-09**. Insumos: PRD §13
> (A-11–A-16, CA-40–CA-48, SU-08–SU-11), `docs/reference/DECISIONS.md` §"Asistente
> lateral" (decisión reabierta por el humano). Todo lo de ARCHITECTURE.md §0–§8 sigue
> vigente **sin cambios**: C-OLLAMA no cambia ni una firma; los deltas de C-ASSIST y
> CONFIG son estrictamente aditivos (campos/métodos opcionales o nuevos) ⇒ S8–S11 en
> PASS siguen compilando y verdes. Huecos ⇒ volver al architect, no parchear.
>
> Vive en archivo separado por seguridad operativa (evitar reescribir 1080 líneas de
> contratos cerrados); en la próxima revisión mayor de ARCHITECTURE.md puede plegarse
> como §9 literal. Para todos los agentes: **este archivo tiene el mismo rango que
> ARCHITECTURE.md §4 (contratos cerrados, Gate 2)**.

---

## 9.0 Resolución de las preguntas abiertas del PRD §13.5

| Pregunta (PRD §13.5) | Decisión | Dónde |
|---|---|---|
| ¿Extensión del enum de estados o capa selectora? | **Capa selectora de motor (C-ENGINE)** por encima de ambos clientes; `OllamaStatus` y todo C-OLLAMA quedan intactos | §9.4, ADR-16 |
| ¿Dónde vive la abstracción común de chat en streaming? | `ChatStreamEngine` en `src/assistant/types.ts` (parte de C-WEBLLM); `OllamaClient` ya la satisface estructuralmente sin cambios | §9.3 |
| Claves CONFIG/env del fallback | `VITE_WEBLLM_ENABLED`, `VITE_WEBLLM_MODEL`, `VITE_WEBLLM_MODEL_URL`, `VITE_WEBLLM_MODEL_LIB_URL`, `VITE_WEBLLM_MODEL_SIZE_MB` → `CONFIG.webllm` | §9.6 |
| Hosting de artefactos (SU-10) e impacto en proxy/CSP | CDN pública de MLC (defaults de `prebuiltAppConfig`: HuggingFace + raw.githubusercontent), override self-host opcional por env; **ADR-06 (proxy Vite) intacto**; no hay CSP/COOP/COEP que ajustar (verificado en el repo) | ADR-18 |
| Labels/strings exactos del estado nuevo y de los avisos | Literales cerrados en §9.7 (patrón ADR-07: constantes exportadas en `src/app/strings.ts`) | §9.7 |
| Librería y ubicación de ejecución | `@mlc-ai/web-llm` en **Web Worker dedicado** (patrón `py.worker.ts`); cancelar = `worker.terminate()` | §9.1, ADR-17 |

## 9.1 Restricciones nuevas y stack (delta)

| Restricción | Origen | Consecuencia arquitectónica |
|---|---|---|
| Fallback SOLO cuando qwen vía Ollama no está disponible; Ollama siempre primario; retorno automático no pegajoso | A-11/A-14, NG-02 actualizado | Selector de motor por MENSAJE encima de ambos clientes; el health-check de C-OLLAMA sigue corriendo siempre |
| El alumno sabe siempre qué motor responde | A-16, CA-45 | Estado propio en el badge + avisos en el hilo del chat (literales cerrados) |
| Descarga de GBs solo con consentimiento; cacheado ⇒ automático | A-13, SU-08, CA-40 | Oferta con tamaño estimado desde CONFIG; `hasModelInCache` local decide oferta vs. carga automática; 0 red pre-aceptación |
| Descarga no bloquea la app y es cancelable ≤2 s | CA-42/43 | Web Worker dedicado; cancelar = `terminate()` (patrón C-RUNNER) |
| Solo GET de artefactos a dominios externos; inferencia 100% local | CA-47, A-09 | CDN pública GET-only; verificación por e2e de red (Playwright); el proxy Vite no interviene |

**Stack (fila nueva de la tabla §1):**

| Capa | Elección | Alternativas evaluadas | Justificación |
|---|---|---|---|
| Motor fallback in-browser | **`@mlc-ai/web-llm` (WebGPU, familia MLC), versión exacta pineada en `package.json`** | transformers.js (WebGPU aún inmaduro para chat LLM de este tamaño y NO soporta el model id MLC que fija el PRD), wllama (CPU/wasm, sin WebGPU: viola A-11) | Verificado 2026-07-09: `prebuiltAppConfig.model_list` incluye literalmente `Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC` (pesos en `https://huggingface.co/mlc-ai/...`, wasm en `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/...`, VRAM 1629.75 MB ≈ el ~1.6 GB de A-15/SU-11). API cubre TODO el contrato: `WebWorkerMLCEngineHandler`/`CreateWebWorkerMLCEngine` (worker oficial), `initProgressCallback` (progreso 0..1), streaming OpenAI-style (`chat.completions.create({stream:true})` → AsyncGenerator con `choices[0].delta.content`), `interruptGenerate()` (CA-22), `hasModelInCache()` (CA-40a/b sin red). |

El implementer de SF1 fija y pinea la versión exacta (`~0.2.x` vigente) y añade el test
de contrato del model id (R14).

## 9.2 Módulos y límites (delta)

```
src/assistant/
  types.ts              +C-WEBLLM +C-ENGINE +delta C-ASSIST (ADITIVO; C-OLLAMA intacto)
  webllmClient.ts       NUEVO (SF1): implementación de C-WEBLLM
  webllm.worker.ts      NUEVO (SF1): worker oficial (new WebWorkerMLCEngineHandler())
  engineStore.ts        NUEVO (SF2): máquina de estados C-ENGINE (zustand, SIN persist)
  useAssistantEngine.ts NUEVO (SF2): hook fino; ÚNICA instancia, en Layout
  ollamaClient.ts       SIN CAMBIOS
  useOllamaStatus.ts    SIN CAMBIOS (única fuente del estado Ollama, ADR-10)
  chatStore.ts          SF3: selección de motor por mensaje + avisos (delta C-ASSIST)
  promptBuilder.ts      SIN CAMBIOS (paridad de prompt entre motores, CA-44)
src/components/
  StatusBadge.tsx       SF2: props pasan a AssistantEngine; label WebGPU (CA-45)
  WebGpuFallbackCard.tsx NUEVO (SF2): oferta / progreso / cancelar (CA-40b/42/43)
  ChatPanel.tsx         SF3: habilitación vía isChatEnabled (active !== null)
src/app/
  Layout.tsx            SF2: useAssistantEngine sustituye la llamada directa a useOllamaStatus
  strings.ts            SF2: TODOS los literales M5 (§9.7) — único slice que toca este archivo
src/config.ts           SF1: CONFIG.webllm (§9.6)
```

**Reglas de dependencia (sin cambios de fondo):** `assistant/` sigue sin importar React
salvo en hooks finos (`useAssistantEngine` es análogo a `useOllamaStatus`); ninguna
carpeta nueva ni dependencia nueva entre carpetas; la UI consume el estado combinado vía
`useAssistantEngine` UNA sola vez en `Layout` y lo pasa por props (misma nota del
reviewer de S8: un solo polling). `chatStore` lee `useEngineStore.getState()` (misma
mecánica intra-carpeta que ya usa con el cliente Ollama). El worker WebLLM se instancia
igual que el de Pyodide: `new Worker(new URL("./webllm.worker.ts", import.meta.url),
{ type: "module" })` (vite `worker.format: "es"` ya configurado).

## 9.3 C-WEBLLM — Cliente del motor in-browser (`src/assistant/types.ts`, ADITIVO)

```ts
/** Error de streaming común a ambos motores. OllamaStreamError ⊂ EngineStreamError ⇒
 *  OllamaClient satisface ChatStreamEngine SIN cambios (tipado estructural). */
export interface EngineStreamError {
  kind: "network" | "http" | "parse" | "engine";
  message: string;
}

/** Abstracción COMÚN de chat en streaming: la frontera que hace exigibles las mismas
 *  garantías (CA-21/22 ⇒ CA-44) a ambos motores. `chatStore` programa contra ESTA
 *  interfaz, nunca contra un motor concreto. */
export interface ChatStreamEngine {
  chatStream(
    messages: ChatMessage[],
    handlers: {
      onToken(t: string): void;
      onDone(): void;
      onError(e: EngineStreamError): void;
    },
    signal: AbortSignal,
  ): Promise<void>;
}

export interface WebLlmConfig {
  /** VITE_WEBLLM_ENABLED (default true). false ⇒ fallback desactivado (CA-41). */
  enabled: boolean;
  /** VITE_WEBLLM_MODEL (default "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC", CA-48). */
  model: string;
  /** VITE_WEBLLM_MODEL_URL (default "": usar prebuiltAppConfig; ADR-18). */
  modelUrl: string;
  /** VITE_WEBLLM_MODEL_LIB_URL (default "": usar prebuiltAppConfig; ADR-18).
   *  modelUrl y modelLibUrl se definen AMBOS o NINGUNO (invariante; test de config). */
  modelLibUrl: string;
  /** VITE_WEBLLM_MODEL_SIZE_MB (default 950): tamaño ESTIMADO mostrado en la oferta
   *  (CA-40b, ADR-20). Solo informativo; no se consulta a la red. */
  modelSizeMb: number;
}

export interface WebLlmLoadProgress {
  /** 0..100, monótono NO decreciente dentro de una carga (CA-42). Deriva de
   *  initProgressCallback (report.progress 0..1) con clamp monótono. */
  pct: number;
  /** Texto informativo del engine (p. ej. "Fetching param cache [3/24]"). Solo display. */
  texto: string;
}

export interface WebLlmInitError {
  /** "gpu": sin adapter / VRAM insuficiente / fallo de init del engine ⇒ el selector lo
   *  trata como feature-detection negativa (SU-11 ⇒ unsupported).
   *  "red": fallo de descarga de artefactos ⇒ reintento accesible (error).
   *  "cancelado": consecuencia de cancelLoad() (CA-43 ⇒ cancelled). */
  kind: "gpu" | "red" | "cancelado";
  message: string;   // español, legible
}

export interface WebLlmClient extends ChatStreamEngine {
  /** Feature-detection PURA (A-12): `navigator.gpu` presente Y requestAdapter() !== null.
   *  NUNCA descarga nada ni contacta el host de artefactos (CA-40/41: 0 requests). */
  detectSupport(): Promise<boolean>;
  /** `hasModelInCache(model)` de web-llm sobre la caché local del navegador.
   *  0 peticiones de red. Decide CA-40a (carga automática) vs CA-40b (oferta). */
  isModelCached(): Promise<boolean>;
  /** Crea el Web Worker (webllm.worker.ts) y el engine vía CreateWebWorkerMLCEngine con
   *  el model id de CONFIG (CA-48) y appConfig = prebuiltAppConfig, o una entrada custom
   *  {model: modelUrl, model_lib: modelLibUrl, model_id: model} si el override está
   *  definido (ADR-18). Emite onProgress con pct monótono durante descarga Y carga
   *  (CA-42). Resuelve cuando el engine está listo para chatear; rechaza con
   *  WebLlmInitError. Idempotente si ya está listo (resuelve inmediato). */
  load(onProgress: (p: WebLlmLoadProgress) => void): Promise<void>;
  /** Cancela la descarga/carga en curso en ≤2 s (CA-43): `worker.terminate()` + worker
   *  NUEVO en el siguiente load() (mismo patrón probado que el timeout de C-RUNNER,
   *  ADR-17). Los shards ya cacheados NO se borran (el reintento no parte de cero).
   *  El load() pendiente rechaza con kind "cancelado". No-op si no hay carga en curso. */
  cancelLoad(): void;
  /** chatStream (heredado de ChatStreamEngine), semántica NORMATIVA (paridad C-OLLAMA):
   *  - stream: true ⇒ onToken por cada chunk con delta.content !== "" del AsyncGenerator;
   *  - signal.abort() ⇒ engine.interruptGenerate() y corta el bucle en ≤2 s SIN llamar
   *    onError (el parcial emitido queda, CA-22/CA-44);
   *  - error del engine a mitad ⇒ onError({kind:"engine", message}) con el parcial
   *    intacto (análogo a CA-26);
   *  - engine no cargado ⇒ onError({kind:"engine", ...}). NUNCA rechaza por errores de
   *    uso; rechaza solo por fallo de infraestructura (igual que PyRunner). */
  /** Libera engine + worker (tests/limpieza). NO borra la caché de artefactos. */
  unload(): void;
}

export declare function createWebLlmClient(config: WebLlmConfig): WebLlmClient;
```

**Worker (`src/assistant/webllm.worker.ts`)** — patrón oficial de web-llm, análogo a
`py.worker.ts`:

```ts
import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => handler.onmessage(msg);
```

Toda la computación (fetch de artefactos, compilación wasm/GPU, inferencia) ocurre en el
worker ⇒ la app del curso sigue interactiva durante la descarga (CA-42).

## 9.4 C-ENGINE — Selector de motor (`src/assistant/types.ts`, ADITIVO)

```ts
export type EngineKind = "ollama" | "webllm";

export type WebLlmPhase =
  | "inactive"     // sin degradación de Ollama, o fallback deshabilitado (CONFIG)
  | "unsupported"  // feature-detection negativa o init GPU fallida (A-12/SU-11); estable en la sesión
  | "offer"        // degradado + WebGPU ok + modelo NO cacheado: oferta visible (CA-40b)
  | "fetching"     // descarga/carga de artefactos en curso, con progreso (CA-42)
  | "ready"        // engine cargado: chat vía WebLLM disponible (CA-44)
  | "cancelled"    // cancelado por el alumno EN ESTA SESIÓN (CA-43): sin auto-reintento; oferta accesible
  | "error";       // fallo de red en la descarga: mensaje legible + reintento accesible

export interface AssistantEngine {
  /** Motor que atenderá el PRÓXIMO mensaje (selección POR MENSAJE, ADR-19 ⇒ CA-46).
   *  null ⇒ input del chat deshabilitado (degradación terminal CA-19/20). */
  active: EngineKind | null;
  /** Estado CRUDO de Ollama (C-OLLAMA, sin cambios). El health-check sigue corriendo
   *  SIEMPRE, también con el fallback activo (A-14): es lo que permite el retorno
   *  automático (CA-46). */
  ollama: OllamaStatus;
  webllm: {
    phase: WebLlmPhase;
    progress: WebLlmLoadProgress | null;   // solo relevante en "fetching"
    model: string;                          // CONFIG.webllm.model (CA-48)
    lastError: string | null;               // mensaje legible en "error"
  };
}

/** Regla PURA de selección (tabla de verdad, testeable sin React):
 *  - ollama === "connected"  ⇒ "ollama"  (SIEMPRE gana: jerarquía inmutable, PRD §13.1)
 *  - ollama === "checking"   ⇒ prev      (transitorio: mantiene el motor previo; evita
 *                                          parpadeo del input en cada check periódico)
 *  - degradado (disconnected | model_missing) ⇒ phase === "ready" ? "webllm" : null */
export declare function selectActiveEngine(
  ollama: OllamaStatus,
  phase: WebLlmPhase,
  prev: EngineKind | null,
): EngineKind | null;

/** Habilitación del chat: engine.active !== null. Desde SF3 SUSTITUYE a
 *  isChatInputDisabled(status) (StatusBadge, S8) en toda la UI. */
export declare function isChatEnabled(engine: AssistantEngine): boolean;

/** engineStore (zustand, SIN persist: el ciclo de vida del fallback es por sesión de
 *  página — un reload re-evalúa desde cero, coherente con "en esa sesión" de CA-43).
 *  Vive en src/assistant/engineStore.ts; el WebLlmClient es inyectable para tests. */
export interface EngineState {
  engine: AssistantEngine;
  /** La llama useAssistantEngine en cada resultado del health-check. Ejecuta la máquina
   *  de estados normativa (§9.4.1) y recalcula `active` con selectActiveEngine. */
  setOllamaStatus(s: OllamaStatus): void;
  /** offer | cancelled | error → fetching: dispara client.load() con progreso. */
  acceptDownload(): void;
  /** fetching → cancelled: client.cancelLoad() (≤2 s, CA-43). */
  cancelFetch(): void;
}
export declare function createEngineStore(client?: WebLlmClient) /* : store zustand */;
export declare const useEngineStore /* : store zustand por defecto de la app */;
```

### 9.4.1 Máquina de estados NORMATIVA (la implementa `engineStore`, SF2)

`degradado(s) := s ∈ {"disconnected", "model_missing"}` (ambos disparan el fallback,
PRD §13.1). `checking` NUNCA dispara nada (transitorio, CA-40).

| Evento | Fase previa | Fase nueva (acciones) |
|---|---|---|
| E1 `setOllamaStatus("connected")` | `offer` / `error` | `inactive` (la oferta se retira: ya no hay degradación) |
| | `fetching` | `fetching` — **CA-46: una descarga en curso NUNCA se aborta automáticamente** |
| | `ready` | `ready` (motor queda "warm"; `active` pasa a `"ollama"` por selección) |
| | `cancelled` / `unsupported` / `inactive` | sin cambios |
| E2 `setOllamaStatus("checking")` | cualquiera | sin cambios de fase; `active` mantiene el valor previo (`prev`) |
| E3 `setOllamaStatus(degradado)` | `inactive` (y `CONFIG.webllm.enabled`) | `detectSupport()===false` ⇒ `unsupported` (CA-41, 0 requests) · `true ∧ isModelCached()` ⇒ `fetching` + `client.load()` automático (CA-40a) · `true ∧ !cached` ⇒ `offer` (CA-40b). Presupuesto: ≤3 s desde la resolución del health-check (detect/isModelCached son locales) |
| E4 `setOllamaStatus(degradado)` | cualquier otra fase | sin cambios (offer/fetching/ready/cancelled/unsupported/error se mantienen) |
| E5 `acceptDownload()` | `offer` / `cancelled` / `error` | `fetching` + `client.load(onProgress → engine.webllm.progress)` |
| E6 resolución de `load()` | `fetching` | resuelve ⇒ `ready` · rechaza `"gpu"` ⇒ `unsupported` (SU-11) · `"red"` ⇒ `error` (con `lastError`) · `"cancelado"` ⇒ `cancelled` |
| E7 `cancelFetch()` | `fetching` | `client.cancelLoad()` ⇒ `cancelled` (≤2 s, CA-43) |
| E8 `CONFIG.webllm.enabled === false` | — | la fase es SIEMPRE `inactive` (E3 no aplica) ⇒ comportamiento CA-41 exacto (CA-19/20 literales, 0 requests) |

**Invariantes:** `unsupported` es estable durante la sesión; `cancelled` solo sale por
E5 (nunca hay auto-reintento, CA-43); ninguna transición aborta un stream de chat en
curso ni una descarga (CA-46); `progress.pct` es monótono no decreciente dentro de un
`fetching`; con `active === "ollama"` un engine `ready` queda cargado ("warm": si Ollama
vuelve a caer, el fallback es inmediato, coherente con "volver no cuesta nada" §13.1).

### 9.4.2 Hook (`src/assistant/useAssistantEngine.ts`, SF2)

```ts
/** Hook fino; ÚNICA instancia de la app, en Layout (patrón useOllamaStatus / nota del
 *  reviewer de S8: un solo polling). Internamente: status = useOllamaStatus() (C-OLLAMA
 *  INTACTO) ⇒ effect ⇒ useEngineStore.getState().setOllamaStatus(status) ⇒ devuelve el
 *  snapshot suscrito. Layout lo pasa por props a StatusBadge / WebGpuFallbackCard /
 *  ChatPanel. */
export declare function useAssistantEngine(): AssistantEngine;
```

## 9.5 Delta ADITIVO de C-ASSIST (`src/assistant/types.ts`)

```ts
export interface ChatUiMessage {
  role: "user" | "assistant";
  content: string;
  error?: string;
  /** M5 (CA-45): presente SOLO en avisos de conmutación de motor. Un aviso NUNCA entra
   *  en el historial que se envía al modelo (buildPrompt no lo ve). */
  aviso?: "cambio_motor";
  /** M5: motor que generó este mensaje assistant (transparencia/trazabilidad). */
  engine?: EngineKind;
}

export interface ChatState {
  // ... TODO lo existente SIN CAMBIOS (mensajes, generando, send, stop, clear,
  // sendFeynmanFeedback) ...
  /** M5 (CA-45): añade al hilo el aviso de conmutación al motor `engine` (literal de
   *  STRINGS.avisoCambioMotor). Síncrono; no streamea; no toca `generando`. */
  appendEngineNotice(engine: EngineKind): void;
}
```

**Reglas NORMATIVAS de `send()` (SF3):**

1. `k = useEngineStore.getState().engine.active` **en el momento del envío** (ADR-19).
   `k === null` ⇒ no-op (el input ya está deshabilitado por `isChatEnabled`).
2. Cliente: `k === "ollama"` ⇒ `OllamaClient` (S8, sin cambios; request a `/ollama`,
   verificable, CA-46) · `k === "webllm"` ⇒ `WebLlmClient`.
3. `buildPrompt` es **IDÉNTICO** para ambos motores (RAG + módulo actual + system A-08):
   CA-44 hereda CA-23/24 sin código nuevo; `sendFeynmanFeedback` reusa `send` ⇒ CA-27
   funciona con ambos motores sin cambios.
4. El historial enviado excluye los mensajes con `aviso` definido.
5. El mensaje assistant creado lleva `engine: k`.
6. `onError`: `k === "ollama"` ⇒ `STRINGS.asistente.chatPanel.errorStream` (CA-26,
   sin cambios) · `k === "webllm"` ⇒ `STRINGS.asistente.chatPanel.errorStreamWebGpu`.
7. `stop()`/`clear()`: sin cambios (AbortController único; `WebLlmClient` mapea el abort
   a `interruptGenerate`, CA-22). Un stream en curso TERMINA en el motor que lo inició.

**Regla NORMATIVA de avisos (SF3):** `chatStore` se suscribe a los cambios de
`engine.active` del engineStore (API `subscribe` de zustand). Sea
`lastAnnounced: EngineKind | null = null` (memoria de sesión de página, no persistida):

- al cambiar `active` a `k ≠ null` con `k ≠ lastAnnounced`:
  - si `lastAnnounced === null ∧ k === "ollama"` ⇒ NO hay aviso (arranque normal) y
    `lastAnnounced = k`;
  - en otro caso ⇒ `appendEngineNotice(k)` (literal `avisoCambioMotor.aWebGpu` /
    `.aOllama`, que nombra el motor entrante) y `lastAnnounced = k`.
- cambios a `null` NO anuncian (el estado terminal ya es visible en el badge).
- Presupuesto CA-45: ≤10 s desde la detección del cambio (en la práctica, síncrono).

## 9.6 Delta de Configuración (`src/config.ts`, SF1)

```ts
export interface AppConfig {
  // ... ollama, runner, curso, rag SIN CAMBIOS ...
  webllm: WebLlmConfig;
}
```

| Clave env | Default | Uso |
|---|---|---|
| `VITE_WEBLLM_ENABLED` | `true` (`"false"` desactiva) | A-11: fallback on/off (CA-41) |
| `VITE_WEBLLM_MODEL` | `"Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC"` | CA-48 (literal exacto); mismo mecanismo de override que A-01 |
| `VITE_WEBLLM_MODEL_URL` | `""` (⇒ prebuiltAppConfig) | ADR-18: base de pesos self-host opcional |
| `VITE_WEBLLM_MODEL_LIB_URL` | `""` (⇒ prebuiltAppConfig) | ADR-18: wasm lib self-host opcional (ambos o ninguno) |
| `VITE_WEBLLM_MODEL_SIZE_MB` | `950` | ADR-20: tamaño estimado de la oferta (CA-40b) |

El implementer añade un helper `readBoolean` junto a `readString`/`readNumber`
(detalle de implementación).

## 9.7 Literales EXACTOS (patrón ADR-07 — `src/app/strings.ts`, los añade SF2)

Los 3 labels existentes (`"Conectado"`, `"Modelo no instalado"`, `"Sin conexión"`) y los
comandos `CMD_SERVE`/`CMD_PULL` NO cambian (CA-19/20 intactos). Nuevos:

```ts
estadoAsistente: {
  // ... existentes intactos ...
  /** M5 (CA-45): contiene "WebGPU" y es distinto de los 3 literales existentes (sin
   *  colisión por substring con "Conectado"). */
  respaldoWebGpu: "Respaldo WebGPU activo",
},
webgpuFallback: {
  ofertaTitulo: "Asistente de respaldo (WebGPU)",
  ofertaDescripcion: (modelo: string, tamano: string) =>
    `Ollama no está disponible. Puedes activar un modelo local en tu navegador (${modelo}). ` +
    `Requiere una única descarga de ~${tamano}; quedará en la caché del navegador para las próximas sesiones.`,
  activar: "Descargar y activar",
  descargando: (pct: number) => `Descargando modelo WebGPU… ${pct} %`,
  cancelar: "Cancelar",
  canceladoAviso: "Descarga cancelada. Puedes volver a activarla cuando quieras.",
  errorDescarga:
    "No se pudo descargar o cargar el modelo WebGPU. Comprueba tu conexión y vuelve a intentarlo.",
  /** Formato del tamaño estimado (CA-40b "en MB/GB"): mb < 1000 ⇒ `${mb} MB`;
   *  mb ≥ 1000 ⇒ `${(mb/1000) con 1 decimal, coma decimal} GB` (p. ej. "1,6 GB"). */
  tamano: (mb: number) => string,
},
avisoCambioMotor: {
  /** Ambos avisos NOMBRAN el motor entrante (CA-45). */
  aWebGpu: (modelo: string) =>
    `Ollama no está disponible. A partir de ahora el asistente responde con el modelo local ` +
    `${modelo} en tu navegador (WebGPU, modo respaldo); la calidad puede ser menor.`,
  aOllama: (modelo: string) =>
    `Ollama vuelve a estar disponible. El asistente vuelve a responder con ${modelo} vía Ollama.`,
},
asistente.chatPanel: {
  // ... existentes intactos ...
  errorStreamWebGpu:
    "Se interrumpió la respuesta del modelo WebGPU local. Vuelve a intentarlo; si el problema persiste, recarga la página.",
},
```

## 9.8 Especificación de UI (SF2/SF3 — presentacional, sin contrato nuevo de datos)

**`StatusBadge` (SF2):** `StatusBadgeProps` pasa de `{ status: OllamaStatus }` a
`{ engine: AssistantEngine }` (Layout es el único emisor; cambio coordinado en SF2).
Mapeo normativo:

- `active === "webllm"` ⇒ label `estadoAsistente.respaldoWebGpu` (CA-45) **y** se
  mantiene visible el comando de recuperación del motor primario según `engine.ollama`
  (`CMD_SERVE` si `disconnected`, `CMD_PULL(model)` si `model_missing`): guía el retorno
  a Ollama (espíritu US-13/A-04). Color del punto: distinto de los existentes
  (recomendado, no contractual).
- `active === "ollama"` ⇒ comportamiento EXACTO actual según `engine.ollama` (labels y
  comandos ADR-07 sin cambios).
- `active === null` ⇒ comportamiento EXACTO actual según `engine.ollama` (CA-19/20
  literales; "Comprobando…" en checking). La oferta/progreso NO vive en el badge.

**`WebGpuFallbackCard` (SF2, nuevo, en el sidebar entre StatusBadge y ChatPanel):**
renderiza solo si `CONFIG.webllm.enabled` y además
`phase === "fetching"` **o** (`phase ∈ {offer, cancelled, error}` y `ollama` degradado):

- `offer`: `ofertaTitulo` + `ofertaDescripcion(model, tamano(modelSizeMb))` + botón
  `activar` → `acceptDownload()` (CA-40b).
- `fetching`: `descargando(pct)` + barra de progreso (≥1 actualización visible por cada
  10%, CA-42) + botón `cancelar` → `cancelFetch()` (CA-43). La card es render pasivo:
  la descarga corre en el worker y la app sigue interactiva (CA-42).
- `cancelled`: `canceladoAviso` + botón `activar` (la oferta permanece accesible, CA-43).
- `error`: `lastError`/`errorDescarga` + botón `activar` (reintento).
- `unsupported`/`inactive`: NO se renderiza nada (CA-41: comportamiento CA-19/20 exacto).

**`ChatPanel` (SF3):** prop pasa a `{ engine: AssistantEngine }`; habilitación por
`isChatEnabled(engine)` (sustituye a `isChatInputDisabled(status)`, que se elimina).
Los mensajes con `aviso` se renderizan como nota de sistema diferenciada (estilo libre).

## 9.9 ADRs nuevos

**ADR-16 (M5) — Capa selectora de motor (C-ENGINE) en vez de extender `OllamaStatus`.**
Alternativa A: añadir estados al enum (`"webgpu_ready"`, …) — descartada: (1) C-OLLAMA
está cerrado y en PASS (S8/S9 lo transcriben literal); (2) mezclaría dos dimensiones
ortogonales — el estado REAL de Ollama debe seguir observable mientras el fallback está
activo, porque el retorno automático (A-14/CA-46) depende de detectar `connected` en el
health-check que sigue corriendo; un enum fusionado pierde esa información; (3)
`checkHealth()` reporta hechos de Ollama, no política de selección de motor. Decisión:
C-ENGINE (`engineStore` + `useAssistantEngine` + `selectActiveEngine` pura) COMPONE el
status crudo con la fase WebLLM y expone `active`. `useOllamaStatus` queda como única
fuente del estado de Ollama (coherente con ADR-10). Todo el delta es aditivo.

**ADR-17 (M5) — `@mlc-ai/web-llm` en Web Worker dedicado; cancelar = `terminate()`.**
Librería: web-llm es el runtime oficial de MLC y el ÚNICO que sirve el model id MLC que
el PRD fija literalmente en CA-48 (verificado en `prebuiltAppConfig`); alternativas
(transformers.js, wllama) no cumplen A-11/CA-48. Ejecución en Web Worker dedicado con el
handler oficial (`WebWorkerMLCEngineHandler`), mismo patrón que Pyodide (ADR-01): la
descarga de ~1 GB y la compilación wasm/GPU no bloquean el hilo UI (CA-42). Cancelación
de descarga: web-llm no ofrece un cancel first-class ⇒ `worker.terminate()` + worker
nuevo en el siguiente intento — patrón ya probado en el timeout de C-RUNNER; los shards
ya bajados quedan en la caché del navegador (el reintento reanuda). Versión exacta
pineada (R14).

**ADR-18 (M5) — Artefactos desde la CDN pública de MLC; override self-host opcional;
ADR-06 intacto.**
Self-host por defecto descartado: ~1 GB de pesos no se versiona con la app ni se sirve
desde `public/` de forma razonable, y el PRD ya admite la excepción de descarga (O3,
A-09, CA-47). Defaults de `prebuiltAppConfig`: pesos `https://huggingface.co/mlc-ai/
<model>` y wasm `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/...`.
Impacto en el proxy Vite (ADR-06): NINGUNO — Ollama sigue yendo exclusivamente vía
`/ollama`; los artefactos van directos navegador→CDN (GET sin body, CA-47) y no pasan
por el proxy. La app no define CSP ni COOP/COEP hoy (verificado en `vite.config.ts` e
`index.html`); si algún día se añaden, `connect-src` debe permitir ambos hosts (y CORP
si hubiera COEP) — queda anotado como condición de mantenimiento. Playwright verifica
CA-47 interceptando la red: solo GET a los hosts de artefactos, solo tras aceptar la
oferta, y 0 requests externas con el modelo ya cacheado. Override corporativo/local:
`VITE_WEBLLM_MODEL_URL` + `VITE_WEBLLM_MODEL_LIB_URL` (ambos o ninguno) construyen una
entrada custom de `AppConfig` para el MISMO model id (CA-48 verificable por la URL
solicitada).

**ADR-19 (M5) — Selección de motor POR MENSAJE en `send()`; nunca migrar un stream vivo.**
CA-46 exige no interrumpir generaciones por conmutación (en ningún sentido). Alternativa:
"cliente activo" global con re-enrutado de conexiones — descartada (complejidad y riesgo
de cortar streams). Decisión: `chatStore.send()` lee `engine.active` en el momento del
envío y elige cliente; un stream en curso termina en el motor que lo inició. El engine
WebLLM queda "warm" cuando Ollama vuelve (re-fallback instantáneo, coste cero); no hay
`unload()` automático (la VRAM se libera al cerrar la pestaña).

**ADR-20 (M5) — Oferta con tamaño ESTIMADO desde CONFIG; cero red antes de aceptar.**
CA-40/41 exigen 0 peticiones al host de artefactos hasta la aceptación, y SU-08 protege
conexiones medidas. Alternativa: pedir el manifest del modelo para el tamaño exacto —
descartada (petición externa pre-consentimiento). Decisión: `VITE_WEBLLM_MODEL_SIZE_MB`
(default 950, tamaño aproximado del repo MLC del modelo default) alimenta la oferta;
`detectSupport()`/`isModelCached()` son operaciones locales (navigator.gpu / caché).

## 9.10 Riesgos nuevos y mitigaciones

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R14 | Drift de versión de web-llm: el model id sale de `prebuiltAppConfig` o cambia la API | Baja | Alto | Versión EXACTA pineada en `package.json`; test de contrato (SF1): `CONFIG.webllm.model` resoluble en `prebuiltAppConfig.model_list` (CA-48); cliente tolerante solo lee `delta.content` |
| R15 | El contexto (~4k) del modelo 1.5B se desborda con RAG (topK=4) + historial largo | Media | Medio | Paridad de prompt se mantiene (CA-44); un overflow se mapea a `onError(kind:"engine")` con mensaje legible; mitigación futura sin re-diseño: topK reducido para webllm vía CONFIG (NO ahora) |
| R16 | Descarga de ~1 GB frágil o lenta en conexiones malas | Media | Medio | Progreso visible + cancelable (CA-42/43); la caché conserva shards ya bajados ⇒ el reintento no parte de cero; fase `error` con reintento accesible |
| R17 | E2e con GPU/descarga real inviable en CI | Alta | Medio | C-WEBLLM inyectable (mismo patrón que OllamaClient en chatStore): unit/e2e con cliente fake determinista; smoke manual documentado contra GPU real (igual que el smoke de Ollama real en M2) |
| R18 | WebGPU ausente en Playwright/CI headless | Alta | Bajo | CA-41 se testea forzando `detectSupport() === false` (inyección); CA-40/42/43/44 con client fake; NADA del CI depende de GPU real |

## 9.11 Mapa CA → módulo responsable (delta de la tabla §6)

| CAs | Módulo(s) responsable(s) |
|---|---|
| CA-40, CA-41 | `assistant/engineStore` + `useAssistantEngine` + `components/WebGpuFallbackCard` (+ `CONFIG.webllm.enabled`) |
| CA-42, CA-43 | `assistant/webllmClient` (progreso/cancel) + `engineStore` + `WebGpuFallbackCard` |
| CA-44 | `assistant/chatStore` (selección por mensaje) + `webllmClient.chatStream` + `promptBuilder` (SIN cambios) |
| CA-45 | `components/StatusBadge` (label) + `chatStore.appendEngineNotice` + `app/strings` (§9.7) |
| CA-46 | `selectActiveEngine` + `chatStore` (ADR-19) + `engineStore` (E1: fetching no se aborta) |
| CA-47 | ADR-18 + e2e de red (Playwright, `e2e/`) |
| CA-48 | `CONFIG.webllm.model` + `webllmClient` (appConfig) + test de contrato R14 |

## 9.12 Qué NO cambia (protección de lo que está en verde)

- **C-OLLAMA**: ni una firma. `ollamaClient.ts` y `useOllamaStatus.ts` no se tocan.
- **C-RAG, C-CONTENT, C-PROGRESS, C-RUNNER**: sin cambios.
- **`promptBuilder`**: sin cambios (la paridad CA-44 se logra reusándolo tal cual).
- **CA-19/CA-20**: labels y comandos literales intactos como estado terminal (badge con
  `active === null`); CA-25 queda con la única excepción acotada de CA-47.
- Los tests de S8–S11 en PASS siguen compilando y verdes: todos los campos/métodos
  nuevos de tipos son aditivos/opcionales; los cambios de props de `StatusBadge`/
  `ChatPanel` son cambios de UI de los slices SF2/SF3 con sus propios tests (el
  test-author actualiza los specs de componente afectados DENTRO del slice que los toca).
