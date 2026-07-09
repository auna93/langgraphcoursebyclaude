# ARCHITECTURE — Curso interactivo LangGraph (método Feynman) + Asistente IA local

> Fuente de verdad TÉCNICA. Producto: `docs/spec/PRD.md`. Decisiones fijas:
> `docs/reference/DECISIONS.md`. API canónica: `docs/reference/langgraph-grounding.md`
> (superficie core) + `docs/reference/langgraph-grounding-advanced.md` (superficie
> avanzada, canon para S12/S14/S15). Ningún agente redefine stack, límites de módulos,
> modelo de datos ni contratos. Huecos → devolver al architect, no parchear.
>
> **Revisión M3 (2026-07-05)**: tabla del shim avanzado RATIFICADA contra el grounding
> avanzado (la consulta Context7 pendiente queda RESUELTA); gaps de contrato de M1/M2
> resueltos (ver ADR-08..ADR-10 y notas "M3:" en los contratos). Ninguna firma ya
> consumida por slices en PASS cambia; solo hay adiciones y aclaraciones.
> **Fix M3.1 (2026-07-05)**: el ejemplo interrupt/resume del grounding-adv §1 declara
> `value: Annotated[list[str], operator.add]` (corregido en el grounding): el oráculo
> `{"value": ["Hello, Alice!", "Done"]}` REQUIERE acumulación por reducer explícito.
> La semántica por defecto del shim NO cambia: clave sin `Annotated` ⇒ sobrescritura.
> **Fix M3.2 (2026-07-05, ADR-11)**: `stream(subgraphs=True)`/prefijo `ns` queda FUERA
> de la superficie EJECUTABLE del shim (S12 cerró en PASS sin ello). Subgraph-como-nodo
> sí es ejecutable (core, S6). En mod15, `subgraphs=True`/`ns` es contenido ILUSTRATIVO
> (bloque con "copiar", sin reto ejecutable ni validación), igual que el SDK en mod16.
> **Revisión M4 (2026-07-06)**: extensión ADITIVA de C-CONTENT para el enriquecimiento
> guiado (PRD §12) — ver §8. Todos los campos nuevos son OPCIONALES: los 16 módulos y sus
> tests en PASS compilan y pasan sin cambios (ADR-12..ADR-15). Ninguna firma existente cambia.

---

## 0. Restricciones derivadas del PRD (marco de todas las decisiones)

| Restricción | Origen | Consecuencia arquitectónica |
|---|---|---|
| 100% local, sin backend propio, sin cloud | O3, NG-01/02/03, CA-10/25 | SPA estática; toda lógica en el navegador; assets self-hosted (cero CDN en runtime) |
| Validación de Python determinista, <10 s, sin red | CA-06/07/10, SU-01/02 | Runtime Python in-browser (Pyodide) en Web Worker con timeout duro |
| LangGraph no instalable de forma fiable en Pyodide | verificado (ormsgpack sin wheel wasm oficial) | Shim determinista `langgraph` con la API exacta del grounding |
| Asistente sólo Ollama localhost:11434 | A-01/02, NG-02 | Cliente fetch + NDJSON streaming + AbortController; sin SDKs cloud |
| RAG sin red y sin modelo de embeddings | A-05, CA-24, NG-02 | Recuperación léxica (BM25) in-browser sobre el contenido bundleado |
| Progreso persiste en navegador | CA-14/16, SU-03 | localStorage con esquema versionado (volumen de datos: KBs) |
| Contenido estático versionado con la app | SU-07, NG-05 | Contenido como módulos TS tipados en el bundle (type-check = validación de esquema) |
| Escala: 1 usuario local, 16 módulos, ~100 ejercicios | §6 | Sin optimizaciones prematuras (no virtualización, no code-splitting agresivo salvo Pyodide) |

## 1. Stack (decidido)

| Capa | Elección | Alternativas evaluadas | Justificación |
|---|---|---|---|
| Build/SPA | **Vite 6 + React 18 + TypeScript (strict)** | Next.js (sobra: no hay SSR ni backend), SvelteKit (menos ecosistema shadcn) | Confirma el stack sugerido. SPA estática pura; Vite da proxy dev y `import.meta.env`. |
| UI | **Tailwind CSS + shadcn/ui** | MUI (pesado), CSS propio (lento) | Confirmado. Componentes copiados al repo → sin dependencia de runtime externa. |
| Routing | **react-router v7 (modo library, HashRouter opcional)** | TanStack Router | Estándar, suficiente para 2 vistas (temario, módulo). |
| Estado global | **zustand + middleware `persist`** | Redux (ceremonia), Context (re-renders) | Store mínimo, persistencia a localStorage integrada, testeable sin React. |
| Editor de código | **CodeMirror 6 (`@codemirror/lang-python`)** | Monaco (~3 MB, workers propios que complican COOP/COEP) | Ligero, sin workers extra, tema oscuro/claro fácil. |
| Runtime Python | **Pyodide (paquete npm `pyodide`, assets self-hosted en `public/pyodide/`)** | Runner local externo (rompe "sin instalación extra"), Skulpt/Brython (sin CPython real, sin `typing_extensions`) | CPython real en wasm, `typing`/`TypedDict`/`Annotated` funcionan de verdad; carga desde mismo origen ⇒ 0 red externa (CA-10). |
| LangGraph en ejercicios | **Shim puro-Python `langgraph` (ADR-02)** | LangGraph real vía micropip (requiere wheel wasm de `ormsgpack` no oficial + cadena langchain-core/pydantic frágil y pesada) | Determinista, ligero, controlado; replica exactamente la superficie del grounding. |
| Markdown/código del curso | **react-markdown + Shiki (highlight) — contenido como TS tipado, prosa en strings markdown** | MDX (acopla contenido a build de React) | El contenido es dato, no componente; TS strict valida el esquema en compile-time (CA-28 auditables). |
| Búsqueda RAG | **MiniSearch (BM25-like, in-browser)** | Embeddings locales vía transformers.js (descarga de modelo = red, +100 MB), FlexSearch (scoring más pobre), TF-IDF a mano | 100% local, ~8 KB, fuzzy + prefix, campo boost; suficiente para 16 módulos (~300 chunks). |
| Tests | **Vitest + @testing-library/react** (unidad/componente), **Playwright** (e2e, incl. mock de Ollama y panel de red) | Jest | Nativo de Vite; Playwright permite verificar CA-10/25 (0 requests externas) e interceptar NDJSON. |

Versiones exactas las fija el implementer del slice S0 en `package.json`; el contrato es la lista anterior.

## 2. Diagrama de módulos y límites

```
┌─────────────────────────────── UI Shell (src/app/) ───────────────────────────────┐
│  Router · Layout (header + sidebar asistente) · tema · strings ES                 │
│                                                                                   │
│  ┌── pages/Temario ──┐  ┌──────── pages/Modulo ────────┐  ┌── Sidebar Asistente ─┐│
│  │ lista 16 módulos  │  │ 4 secciones Feynman:         │  │ ChatPanel            ││
│  │ + estado progreso │  │  Explica / Gaps / Llena /    │  │ StatusIndicator      ││
│  └───────┬───────────┘  │  Refina                      │  └──────┬───────────────┘│
└──────────┼──────────────┴──┬──────────┬──────────┬─────┴─────────┼────────────────┘
           │                 │          │          │               │
   C-CONTENT          C-CONTENT   C-PROGRESS   C-RUNNER      C-ASSIST ── C-RAG
           │                 │          │          │               │         │
┌──────────▼─────────┐ ┌─────▼──────────▼───┐ ┌────▼───────────┐ ┌─▼─────────▼─────┐
│ content/           │ │ progress/          │ │ runner/        │ │ assistant/ rag/ │
│ tipos + registry + │ │ zustand store +    │ │ PyWorker +     │ │ OllamaClient +  │
│ modules/01..16.ts  │ │ persist(localStorage)│ harness python │ │ promptBuilder + │
│ (dato puro, 0 deps │ │ selectores CA-15   │ │ + shim langgraph│ │ MiniSearch index│
│  de React)         │ └────────────────────┘ └────┬───────────┘ └───┬─────────────┘
└────────────────────┘                             │                 │
                                        public/pyodide/*      localhost:11434
                                        python/ (shim+harness)  (vía proxy Vite)
```

**Reglas de dependencia (obligatorias):**
- `content/` no importa nada de la app (dato puro). Todos pueden importar `content/`.
- `runner/`, `assistant/`, `rag/`, `progress/` no importan React ni entre sí.
  **Excepciones explícitas** (únicas):
  - `assistant/` → `rag/` vía C-RAG (composición del prompt, CA-24).
  - **M3:** `assistant/` → `progress/` en **solo lectura** vía C-PROGRESS
    (`sendFeynmanFeedback` lee la explicación guardada del módulo, CA-27). Prohibido
    que `assistant/` escriba en el store de progreso.
  Se consumen desde UI vía hooks finos en cada carpeta (`useRunner`, `useOllamaStatus`, …).
- La UI nunca habla con Pyodide ni con Ollama directamente: sólo vía los contratos.

### Estructura de carpetas

```
/
├─ docs/                      # spec, arch, reference (ya existe)
├─ public/pyodide/            # runtime Pyodide self-hosted (script npm postinstall lo copia)
├─ python/                    # fuentes Python: shim langgraph/ + course_harness.py
│                             # (se sirven como assets estáticos y se cargan al FS de Pyodide)
├─ scripts/copy-pyodide.mjs   # copia node_modules/pyodide → public/pyodide
├─ src/
│  ├─ app/                    # App.tsx, router, layout, theme, i18n-strings ES
│  ├─ pages/                  # TemarioPage, ModuloPage
│  ├─ components/             # ui/ (shadcn), CodeBlock (copiar), QuizCard, ChallengeCard,
│  │                          # FeynmanEditor, ChatPanel, StatusBadge, MarkdownView
│  ├─ content/                # types.ts (C-CONTENT), registry.ts, traversal.ts (M4),
│  │                          # modules/mod01.ts … mod16.ts
│  ├─ runner/                 # types.ts (C-RUNNER), pyRunner.ts, py.worker.ts, useRunner.ts
│  ├─ assistant/              # types.ts (C-OLLAMA/C-ASSIST), ollamaClient.ts,
│  │                          # promptBuilder.ts, chatStore.ts, useOllamaStatus.ts
│  ├─ rag/                    # types.ts (C-RAG), chunker.ts, index.ts (MiniSearch)
│  ├─ progress/               # types.ts (C-PROGRESS), store.ts, selectors.ts, migrations.ts
│  └─ config.ts               # AppConfig (env: modelo, baseUrl, timeouts, umbrales)
└─ e2e/                       # Playwright (incl. mock server Ollama para tests)
```

## 3. Modelo de datos

No hay base de datos. Tres dominios de datos:

1. **Contenido del curso** (estático, en bundle): `CourseModule[16]` — ver C-CONTENT.
2. **Progreso del alumno** (localStorage): `ProgressState` — ver C-PROGRESS.
3. **Sesión de chat** (memoria + `sessionStorage`, US-16): `ChatMessage[]` — ver C-ASSIST.

**Invariantes globales:**
- `registry.ts` exporta exactamente 16 módulos con `id` `"mod01"…"mod16"` únicos (CA-01);
  un test de contrato lo asegura.
- Todo módulo tiene 4 secciones en orden fijo (CA-02) — el tipo lo impone estructuralmente.
- Módulos 01–15: ≥1 quiz (4–6 preguntas) y ≥1 reto de código; módulo 16 puede sustituir
  el reto por quiz de integración (CA-03) — test de contrato sobre el registry.
- `moduleStatus` es **derivado** (selector), nunca se persiste: `completado` ⇔ paso 1 +
  quizzes hechos + retos en pass (CA-15). Persistir sólo hechos primitivos evita
  inconsistencias.
- **M3:** al cierre de M3, ningún módulo del registry tiene `enConstruccion: true`
  (ver ADR-09 y C-CONTENT); el integrator lo verifica programáticamente (CA-01 sin stubs).
- **M4:** los mini-ejercicios/micro-quizzes de `pasos` (enriquecimiento §8) se integran en
  el conjunto de retos/quizzes del módulo vía la enumeración canónica (ADR-13) ⇒ CA-15 se
  amplía en su CONJUNTO sin cambiar su FÓRMULA (CA-39).

---

## 4. CONTRATOS (frontera de paralelización — cerrados en este documento)

> Cada contrato vive en el `types.ts` de su carpeta y debe transcribirse **literalmente**.
> Cambiarlos exige volver al architect (Gate 2).

### C-CONTENT — Esquema del contenido del curso (`src/content/types.ts`)

> **M4:** este contrato se EXTIENDE de forma ADITIVA en §8 (enriquecimiento guiado). Todo lo
> de abajo sigue vigente sin cambios; §8 solo AÑADE campos opcionales y tipos nuevos.

```ts
/** Identificadores estables. NUNCA renombrar una vez publicados: el progreso los referencia. */
export type ModuleId = `mod${string}`;          // "mod01" … "mod16"

export interface CourseModule {
  id: ModuleId;
  numero: number;                                // 1..16
  titulo: string;                                // español
  objetivo: string;                              // objetivo de aprendizaje (tabla PRD §6)
  /**
   * M3 (ADR-09): marcador PROGRAMÁTICO de módulo stub. `true` SOLO mientras el módulo
   * es esqueleto (S1 lo permitía hasta M3). Un módulo con contenido completo NO define
   * este campo. Al cierre de M3: `COURSE_MODULES.every(m => m.enConstruccion !== true)`.
   * La UI puede usarlo para mostrar el aviso "En construcción"; los tests de contrato
   * de S13/S14/S15 exigen que sus módulos ya no lo tengan.
   */
  enConstruccion?: true;
  /** Exactamente las 4 secciones Feynman, en este orden. */
  secciones: {
    explicaSimple: SeccionExplicaSimple;         // paso 1
    detectaGaps: SeccionQuiz;                    // paso 2
    llenaGaps: SeccionProfundiza;                // paso 3
    refinaSimplifica: SeccionRefina;             // paso 4
  };
  // M4 (§8): enriquecido?, usaLaIa?, tutorialLocal?  — campos OPCIONALES, ver §8.2.
}

export interface SeccionExplicaSimple {
  /** Markdown en español. Analogía cotidiana, sin jerga no definida. */
  contenidoMd: string;
  /** Prompt del cuadro "explícaselo a alguien que no programa". */
  consignaExplicacion: string;
  // M4 (§8): pasos? — campo OPCIONAL, ver §8.2(b).
}

export interface SeccionQuiz {
  contenidoMd?: string;                          // intro opcional
  quiz: Quiz;                                    // 4–6 preguntas
  // M4 (§8): pasos? — campo OPCIONAL, ver §8.2(b).
}

export interface SeccionProfundiza {
  contenidoMd: string;                           // API real, casos borde, errores comunes
  retos: CodeChallenge[];                        // 1–2 retos
  // M4 (§8): pasos? — campo OPCIONAL, ver §8.2(b).
}

export interface SeccionRefina {
  resumenBullets: string[];                      // ≤10 bullets
  /** Reto de síntesis: código O quiz de integración (mod16: quiz). */
  sintesis: { kind: "code"; reto: CodeChallenge } | { kind: "quiz"; quiz: Quiz };
  // M4 (§8): pasos? — campo OPCIONAL, ver §8.2(b).
}

// ---------- Quiz ----------
export interface Quiz {
  id: string;                                    // único en el módulo, ej. "mod03-quiz1"
  titulo: string;
  preguntas: QuizQuestion[];                     // 4–6 (síntesis: 3–6)
}

export type QuizQuestion =
  | { id: string; kind: "single";  enunciadoMd: string; opciones: string[]; correcta: number;   explicacionMd: string }
  | { id: string; kind: "multi";   enunciadoMd: string; opciones: string[]; correctas: number[]; explicacionMd: string }
  | { id: string; kind: "boolean"; enunciadoMd: string; correcta: boolean;                       explicacionMd: string }
  /** Predicción de salida: se muestra `codigo` y opciones de salida posibles. */
  | { id: string; kind: "output";  enunciadoMd: string; codigo: string; opciones: string[]; correcta: number; explicacionMd: string };

// ---------- Reto de código ----------
export interface CodeChallenge {
  id: string;                                    // ej. "mod05-reto1"
  titulo: string;
  enunciadoMd: string;
  /** Esqueleto con huecos `# TODO`. Es lo que ve el alumno en el editor. */
  starterCode: string;
  /** Solución de referencia (US-08). Debe pasar la validación. */
  solutionCode: string;
  /**
   * Código Python de validación. Se ejecuta DESPUÉS del código del alumno, en el mismo
   * namespace. Usa EXCLUSIVAMENTE la API del harness (M3: corregido, `run_graph` NO
   * existe):
   *   from course_harness import check, check_eq, check_raises, get_llm_calls
   * El grafo del alumno ya está construido/invocado en el namespace: la validación
   * inspecciona sus resultados (variables del alumno) o lo invoca directamente
   * (`graph.invoke(...)` es código normal). Cada check produce un CheckResult con id
   * y mensaje concreto (CA-07).
   */
  validationCode: string;
  /**
   * Dobles deterministas de LLM (SU-02). Si se define, el harness registra respuestas
   * fijas que FakeChatModel devuelve en orden/por-coincidencia; ver C-RUNNER §harness.
   */
  llmDoubles?: LlmDouble[];
  /** Timeout duro de la validación. Default 8000 (presupuesto CA-06 <10 s). */
  timeoutMs?: number;
}

export interface LlmDouble {
  /** Si el último mensaje humano contiene `matchSubstring`, responde `respuesta`;
   *  si matchSubstring se omite, es la respuesta por defecto/en orden. */
  matchSubstring?: string;
  respuesta: string;
  /** Tool calls simulados que el doble emite (para módulos 12–14). */
  toolCalls?: { name: string; args: Record<string, unknown> }[];
}

// ---------- Registry ----------
/** src/content/registry.ts */
export declare const COURSE_MODULES: readonly CourseModule[];  // length === 16, orden 1..16
export declare function getModule(id: ModuleId): CourseModule | undefined;
```

**Invariantes C-CONTENT** (test de contrato en `src/content/registry.test.ts`, slice S1):
16 módulos; ids únicos; quiz paso 2 con 4–6 preguntas; ≥1 reto en paso 3 (todos los
módulos, mod16 incluido puede tenerlo o compensar con síntesis-quiz según CA-03);
≤10 bullets en paso 4; todo string visible en español; `solutionCode` de cada reto pasa
su `validationCode` (test de humo en Pyodide, slice S14).

**Reglas M3 para autores de contenido (S13–S15) — obligatorias:**
1. `validationCode` usa SOLO `check` / `check_eq` / `check_raises` / `get_llm_calls`
   del harness (no existe `run_graph` ni ninguna otra API).
2. Stub = `enConstruccion: true` en el `CourseModule` (ADR-09). Al completar un módulo,
   ELIMINAR el campo y cualquier marcador textual "EN CONSTRUCCIÓN" del markdown. El
   campo es la fuente programática; el marcador markdown queda deprecado.
3. Fan-out paralelo: permitido SOLO bajo la semántica de superstep del shim (ADR-08 y
   C-RUNNER §superstep): dos nodos del mismo superstep solo pueden escribir la misma
   clave si tiene reducer; escrituras concurrentes a clave sin reducer son un error del
   shim (y por tanto contenido inválido). `Send` NO existe en la superficie: prohibido.
   El fan-out requiere el executor de S12: contenido con fan-out ⇒ depende de S12.
4. Toda la API usada en `contenidoMd`, `starterCode`, `solutionCode` y `validationCode`
   sale del grounding base + avanzado (CA-28). Símbolo fuera de la tabla del shim ⇒
   volver al architect; no se inventa API.
5. **M3.1 — la acumulación exige reducer explícito**: si un ejemplo/reto espera que una
   clave del estado ACUMULE valores a lo largo de varios updates (típico en HITL, donde
   varios nodos aportan a la misma lista), su `State` DEBE declararla
   `Annotated[list[...], operator.add]` (o `add_messages`). Sin `Annotated` la clave se
   SOBREESCRIBE — esa es la semántica del shim y de LangGraph real. No escribir
   contenido (ni oráculos de quiz "output") que dependa de acumulación implícita.
6. **M3.2 — `stream(subgraphs=True)`/`ns` es SOLO ilustrativo (ADR-11)**: en mod15,
   los retos EJECUTABLES usan exclusivamente subgraph-como-nodo (grounding base §6,
   soportado por el shim core) — `invoke`/`stream` normales sobre el grafo padre.
   `graph.stream(..., subgraphs=True)` y el prefijo `ns` se presentan ÚNICAMENTE en
   bloques de código ilustrativos (con botón "copiar", CA-29), citando el formato
   documentado en el grounding; PROHIBIDO usarlos en `starterCode`, `solutionCode` o
   `validationCode`, y prohibido un quiz "output" cuyo oráculo requiera ejecutarlos.
   Mismo tratamiento que mod16 da al SDK de deployment.
7. **M4 — enriquecimiento (§8)**: los mini-ejercicios de `pasos` son `CodeChallenge`
   normales (mismas reglas 1–6). El código de `tutorialLocal` es ILUSTRATIVO (no lo corre
   el runner) y usa LangGraph real + `ChatOllama`; se rige por CA-36/CA-37 (§8.5), NO por
   la superficie ejecutable del shim.

### C-RUNNER — Ejecución/validación Python (`src/runner/types.ts`)

**Arquitectura**: Pyodide corre en un **Web Worker dedicado**. Assets desde
`public/pyodide/` (mismo origen ⇒ 0 red externa, CA-10). Antes de ejecutar código del
alumno, el worker: (1) carga el paquete shim `langgraph` y `course_harness` al FS de
Pyodide desde `python/` (assets estáticos), (2) **elimina los puentes de red**
(`js.fetch`, `XMLHttpRequest`) del scope, (3) ejecuta alumno + validación en un
namespace nuevo por intento. **Timeout**: `worker.terminate()` a los `timeoutMs` +
re-init lazy del worker (única forma fiable de matar wasm síncrono).

```ts
export type RunnerState = "idle" | "loading" | "ready" | "running" | "error";

export interface RunChallengeRequest {
  challengeId: string;
  studentCode: string;
  validationCode: string;                        // del CodeChallenge
  llmDoubles?: LlmDouble[];                      // del CodeChallenge
  timeoutMs: number;                             // resuelto por el caller (default 8000)
}

export interface CheckResult {
  id: string;                                    // id del check en validationCode
  description: string;                           // español, legible por el alumno
  passed: boolean;
  message?: string;                              // detalle del fallo: esperado vs obtenido
}

export type RunChallengeResult =
  | { status: "pass";    checks: CheckResult[]; stdout: string }
  | { status: "fail";    checks: CheckResult[]; stdout: string }          // ≥1 check failed
  | { status: "error";   errorKind: "syntax" | "runtime"; message: string; stdout: string }
  | { status: "timeout"; message: string };      // "El código superó el límite de N s"

export interface PyRunner {
  /** Carga Pyodide + shim. Idempotente. Llamar lazy en el primer reto visible. */
  init(): Promise<void>;
  getState(): RunnerState;
  /** Serializa ejecuciones (cola de 1). Nunca rechaza por errores del alumno:
   *  los mapea a RunChallengeResult. Rechaza sólo por fallo de infraestructura. */
  runChallenge(req: RunChallengeRequest): Promise<RunChallengeResult>;
  /** Aborta la ejecución en curso (terminate + re-init lazy). */
  cancel(): void;
}

/** M3 (ratificado): puntos de instanciación canónicos (src/runner/pyRunner.ts).
 *  - createPyRunner(): fábrica; devuelve una instancia NUEVA (tests de integración,
 *    aislamiento). No comparte worker con otras instancias.
 *  - getPyRunner(): singleton perezoso de la app; `useRunner` lo consume. La app usa
 *    UN solo runner (un worker Pyodide). */
export declare function createPyRunner(): PyRunner;
export declare function getPyRunner(): PyRunner;
```

**Contrato del harness Python** (`python/course_harness.py`) — API que usa `validationCode`:

```python
# check(id, description, condition, message="") -> registra CheckResult
# check_eq(id, description, actual, expected)   -> check con mensaje "esperado X, obtenido Y"
# check_raises(id, description, fn, exc_type)
# get_llm_calls() -> lista de invocaciones registradas por FakeChatModel (para asertar
#                    que el grafo llamó al modelo N veces, con qué mensajes)
# RESULTADOS se emiten como JSON por un canal reservado (variable __COURSE_RESULT__)
# NO existe run_graph (referencia errónea anterior, corregida en M3): invocar el grafo
# es código Python normal dentro de validationCode (graph.invoke(...), graph.stream(...)).
```

#### Tabla del shim — CERRADA (M3, ratificada contra grounding base + avanzado)

Paquete `python/langgraph/…` (+ alias `langchain*`), puro-Python (ADR-02). La columna
"Superficie EXACTA" es lo que el alumno ve y escribe (símbolos, paths de import, firmas):
debe coincidir 1:1 con el grounding. Todo lo demás (cómo se implementa por dentro) es
doble determinista y NO es superficie: puede simplificarse mientras los ejemplos de los
groundings produzcan las salidas documentadas.

**Core (S6 — ya implementado, sin cambios):**

| Superficie EXACTA (import idéntico a real) | Semántica que el shim DEBE replicar |
|---|---|
| `langgraph.graph.StateGraph, START, END` | `add_node` (nombre implícito = `fn.__name__`), `add_edge`, `add_conditional_edges` (función de ruta → nombre o END; con y sin mapping), `compile()`, esquemas input/output/private, ciclos con límite de recursión (default 25, error claro). Incluye **subgraph-como-nodo**: un grafo compilado se registra con `add_node` y se invoca como nodo (grounding base §6) |
| `langgraph.graph.MessagesState` | `TypedDict` con `messages: Annotated[list[AnyMessage], add_messages]` (lo usan los ejemplos avanzados §2–3 y los módulos 06/12–14) |
| `langgraph.graph.message.add_messages` | append + update por id; acepta dicts `{role, content}` y objetos Message del shim |
| `langgraph.config.get_stream_writer` | escribe eventos al stream `custom` |
| `langchain.messages` (alias `langchain_core.messages`) | `AnyMessage, SystemMessage, HumanMessage, AIMessage, ToolMessage` (dataclasses del shim: `.content`, `.id`; `AIMessage.tool_calls`; `ToolMessage(content, tool_call_id)`) |

**Avanzado (S12 — implementado, en PASS; la interfaz TS `PyRunner` no cambió):**

| Superficie EXACTA (import idéntico a real) | Semántica que el shim DEBE replicar |
|---|---|
| `langgraph.checkpoint.memory.InMemorySaver` | `compile(checkpointer=InMemorySaver())` + `config={"configurable": {"thread_id": ...}}`. El estado del hilo SOBREVIVE entre `invoke`/`stream` del mismo `thread_id` (el siguiente invoke parte del estado guardado); hilos distintos no se ven entre sí. Checkpoint por superstep. |
| `graph.get_state(config)` / `graph.get_state_history(config)` | `get_state` → snapshot con `.values` (estado actual) y `.next` (tupla de nombres de próximos nodos; vacía si terminó, con el nodo interrumpido si hay interrupt pendiente). `get_state_history` → lista de snapshots, más reciente primero. |
| `langgraph.types.interrupt` | `interrupt(value)` DENTRO de un nodo pausa el grafo: el resultado del `invoke` contiene la clave `"__interrupt__"` con lista de objetos con `.value == value` (payload; puede ser str o dict). Requiere checkpointer + `thread_id`; sin ellos ⇒ error claro en español. Los updates de nodos ya completados en ese superstep sí quedan en el checkpoint; el nodo interrumpido no aporta update. |
| `langgraph.types.Command` — resume | `graph.invoke(Command(resume=x), config)` reanuda: el nodo interrumpido se **re-ejecuta desde el principio** y esta vez `interrupt()` devuelve `x` (semántica real: los efectos previos al interrupt dentro del nodo se repiten). Oráculo canónico: grounding-adv §1 — cuyo `State` declara **`value: Annotated[list[str], operator.add]`** (M3.1: la acumulación proviene del reducer explícito, NO de interrupt/resume) — debe producir `{"value": ["Hello, Alice!", "Done"]}`. Con `value: list[str]` SIN reducer, el mismo grafo produce `{"value": ["Done"]}` (sobrescritura): ambos casos son tests válidos del shim. |
| `langgraph.types.Command` — goto/update | Un nodo puede devolver `Command(goto="nodo", update={...})`: aplica `update` al estado (con reducers) y enruta a `nodo` (ignora edges salientes). `goto=END` termina. Base de handoffs multi-agente (supervisor/swarm, grounding-adv §4): no hay más API multi-agente que StateGraph + conditional edges + `Command(goto=, update=)`. |
| `langgraph.store.memory.InMemoryStore` | `store = InMemoryStore()`; `compile(store=store)` INYECTA el store al nodo que declare el parámetro keyword-only `store` (firma `def node(state, *, store):`). API: `put(namespace, key, value)` con `namespace` = **tupla** de strings y `value` = dict; `get(namespace, key)` → item o `None`; `search(namespace, query=None, limit=10)` → lista de items con `.key` y `.value`; matching de `query` léxico case-insensitive sobre el contenido serializado del value, orden de inserción, determinista; `query=None` devuelve todos (hasta `limit`). Distinción que el contenido DEBE enseñar: checkpointer = memoria de UN hilo (`thread_id`); Store = memoria compartida ENTRE hilos. |
| `langchain.tools.tool` (alias `langchain_core.tools.tool`) | `@tool` sobre una función con docstring → objeto tool con `.name` (= nombre de la función), `.description` (= docstring) e `.invoke(args_dict)` que llama a la función. |
| `model.bind_tools(tools)` | Método de `FakeChatModel`: registra las tools y devuelve el modelo (permite que el contenido use el patrón real `llm_with_tools = model.bind_tools(tools)`). |
| `AIMessage.tool_calls` | Lista de dicts `{"name": str, "args": dict, "id": str}` (acceso por clave, formato EXACTO del grounding-adv §3). `[]` si no hay llamadas. Ids deterministas: `"call_1"`, `"call_2"`, … por instancia de FakeChatModel. |
| `langgraph.prebuilt.ToolNode` | `ToolNode(tools)` usable como nodo: lee `tool_calls` de la ÚLTIMA `AIMessage` de `state["messages"]`, ejecuta cada tool en el orden de la lista (secuencial, determinista) y devuelve `{"messages": [ToolMessage(content=str(resultado), tool_call_id=id), ...]}`. Tool inexistente ⇒ error claro. |
| Ciclo agente manual | El contenido enseña también el patrón manual del grounding-adv §3: `should_continue(state)` → `"tool_node"` si `state["messages"][-1].tool_calls` else `END`, con `add_conditional_edges` + edge de vuelta. El shim no añade API para esto (es composición de la superficie core). |
| `langgraph.prebuilt.create_react_agent` | `create_react_agent(model, tools)` → grafo COMPILADO (invocable/streameable, acepta checkpointer-config si se pasa a invoke) con nodos `"agent"` y `"tools"` que ejecuta el loop ReAct: modelo → si `tool_calls` → tools → modelo → … hasta `AIMessage` sin tool_calls. Estado = `MessagesState`. |
| `graph.stream(input, stream_mode=...)` | Modos `values`, `updates`, `custom` (ya core, formato del grounding base §5) y **M3:** `messages`: emite tuplas `(message_chunk, metadata)` token a token con `metadata["langgraph_node"]` = nodo emisor; con FakeChatModel el troceo es determinista por palabras (split por espacios conservando separadores) ⇒ mismos inputs, mismos chunks. Modos combinables (lista) como en el grounding. **M3.2 (ADR-11): el parámetro `subgraphs=True` y el prefijo `ns` NO forman parte de la superficie ejecutable del shim** — corrige la afirmación anterior "(ya core)", que era errónea: nunca se implementó ni testeó. En contenido, solo como bloque ilustrativo (regla 6 de C-CONTENT). |
| `course_harness.FakeChatModel(doubles)` | Doble determinista del LLM. `invoke(messages)` → `AIMessage`. Selección de respuesta: primer `LlmDouble` cuyo `matchSubstring` esté contenido en el content del último mensaje humano; si ninguno matchea, siguiente double sin `matchSubstring` en orden de definición; agotados ⇒ repite el último. Si el double trae `toolCalls` ⇒ `AIMessage(content=respuesta, tool_calls=[{name, args, id}])` con ids `call_n` consecutivos. Registra TODAS las llamadas (mensajes de entrada) → accesibles con `get_llm_calls()`. `bind_tools` ver arriba. Con esto el ciclo tool/ReAct es 100% reproducible sin LLM real. |

**Fuera de la superficie ejecutable (solo bloques ilustrativos con "copiar"):**
`graph.stream(..., subgraphs=True)` / prefijo `ns` (mod15, ADR-11) y todo
`langgraph_sdk` / `langgraph.json` (mod16, NG-06). **M4:** también el código de
`tutorialLocal` (LangGraph real + `ChatOllama`, ADR-14). Si el shim recibe
`subgraphs=True`, lanza un error claro en español ("no soportado en el entorno del
curso") — nunca un resultado incorrecto en silencio.

#### Semántica de superstep — CERRADA (ADR-08; ejecutor de S12)

- El executor procesa por **supersteps atómicos** (modelo Pregel): en cada superstep se
  ejecutan todos los nodos activos; sus updates se **recolectan** y se aplican al estado
  al CIERRE del superstep. Todos los nodos de un superstep ven el estado del cierre del
  superstep anterior (nunca updates de sus "hermanos").
- Aplicación al cierre: clave con reducer ⇒ se reduce acumulando en orden determinista
  (orden de registro con `add_node`); clave SIN reducer escrita por >1 nodo en el mismo
  superstep ⇒ **error** `InvalidUpdateError` con mensaje claro (igual que LangGraph real).
- **M3.1 (normativo):** clave SIN reducer escrita por UN nodo ⇒ SOBREESCRITURA del valor
  (last-write-wins entre supersteps). La acumulación a través de updates SOLO ocurre con
  reducer explícito (`Annotated[..., operator.add]` / `add_messages`). El shim NUNCA
  acumula implícitamente — es la semántica de LangGraph real y la que enseña el mod03.
- La ejecución interna de nodos "paralelos" es secuencial (orden de `add_node`), pero
  semánticamente atómica; con 1 nodo por superstep (todo M1) el resultado es idéntico al
  merge inmediato ⇒ los tests de S6 siguen en verde.
- `Send` / map-reduce dinámico NO está en la superficie: prohibido en contenido.
- Consecuencia para contenido: fan-out paralelo permitido solo sobre claves con reducer
  y solo desde que S12 esté en PASS (regla 3 de C-CONTENT).

El shim **no** implementa nada fuera de estas tablas; si un ejercicio necesita más
superficie ⇒ volver al architect (+ consulta Context7). Módulo 15: streaming namespaced
(`subgraphs=True`/`ns`) solo ilustrativo (ADR-11). Módulo 16 (SDK/Platform) es
conceptual: sin shim de `langgraph_sdk` (sus bloques de código son ilustrativos, solo
"copiar"). La consulta Context7 antes pendiente queda **resuelta** con
`docs/reference/langgraph-grounding-advanced.md` (§1 corregido en M3.1: `State` con
reducer `operator.add`); los tests de S12 usan sus ejemplos literales como oráculo.

### C-PROGRESS — Persistencia de progreso (`src/progress/types.ts`)

Storage: **localStorage**, clave `lgcourse.progress.v1`, vía `zustand/persist` con
`version: 1` y `migrate()`. (IndexedDB descartado: datos < 1 MB, sin blobs, sin queries.)
El chat NO se guarda aquí (US-16 usa `sessionStorage`, ver C-ASSIST).

```ts
export interface ProgressState {
  schemaVersion: 1;
  modules: Record<ModuleId, ModuleProgress | undefined>;
}

export interface ModuleProgress {
  /** Paso 1: texto íntegro (CA-14). Completado ⇔ length ≥ 200 (CA-13, umbral en config). */
  explicacion: { texto: string; actualizadoEn: number } | null;
  /** Por quiz: mejor resultado histórico (CA-12). hecho ⇔ mejorPct ≥ 80. */
  quizzes: Record<string, { mejorPct: number; intentos: number }>;
  /** Por reto: cuenta el ÚLTIMO intento (CA-08). */
  retos: Record<string, { ultimoPass: boolean; intentos: number; solucionVista: boolean }>;
}

export interface ProgressActions {
  saveExplanation(moduleId: ModuleId, texto: string): void;
  recordQuizResult(moduleId: ModuleId, quizId: string, pct: number): void;     // guarda max(prev, pct)
  recordChallengeResult(moduleId: ModuleId, retoId: string, passed: boolean): void; // sobrescribe ultimoPass
  markSolutionViewed(moduleId: ModuleId, retoId: string): void;
  resetModule(moduleId: ModuleId): void;         // CA-17: sólo ese módulo
  resetAll(): void;                              // US-10
}

/** Selectores derivados (src/progress/selectors.ts) — ÚNICA fuente de estado calculado: */
export type ModuleStatus = "no_iniciado" | "en_curso" | "completado";
// moduleStatus(moduleId): CA-15 — completado ⇔ explicación ok ∧ todos los quizzes del
//   módulo (según C-CONTENT) hechos ∧ todos los retos con ultimoPass=true.
//   en_curso ⇔ existe cualquier progreso parcial. Si el contenido define un quiz/reto
//   sin entrada en progreso ⇒ no hecho.
// isSolutionAvailable(moduleId, retoId): intentos ≥ 1 (CA-09). Verla nunca marca hecho.
// isExplanationDone(moduleId): texto.length >= config.umbralExplicacion (200).
```

> **M4:** C-PROGRESS **no cambia**. Los ids de mini-ejercicios/micro-quizzes de `pasos`
> se registran en `quizzes`/`retos` igual que cualquier otro. El CONJUNTO de quizzes/retos
> de un módulo lo determina la enumeración canónica (ADR-13, §8.2(d)): `selectors.ts` deja
> de enumerar inline y delega en `content/traversal.ts`. Un test de equivalencia garantiza
> que para módulos sin `pasos` el resultado es idéntico al de S3.

**M3 — Recomendación (no obligatoria) de robustez de rehidratación:** el `merge`/`migrate`
de `zustand/persist` DEBERÍA validar la forma del estado persistido antes de fusionar
(p. ej. `modules` es objeto; cada entrada tiene `explicacion`/`quizzes`/`retos` con los
tipos esperados; valores no conformes se descartan campo a campo, cayendo al estado
inicial). Objetivo: un localStorage manipulado o corrupto degrada a "progreso vacío" sin
romper la app (extiende R6). Si se implementa, con tests unitarios de payloads malformados.

### C-OLLAMA — Cliente Ollama (`src/assistant/types.ts`)

```ts
export type OllamaStatus = "checking" | "connected" | "model_missing" | "disconnected";

export interface OllamaConfig {
  baseUrl: string;      // default "/ollama" (proxy Vite, ADR-06); override VITE_OLLAMA_BASE_URL
  model: string;        // default "qwen2.5-coder:14b"; override VITE_OLLAMA_MODEL
  healthIntervalMs: number;   // default 15000 (y check inmediato al cargar, CA-18 ≤5 s)
  healthTimeoutMs: number;    // default 3000
}

export interface ChatMessage { role: "system" | "user" | "assistant"; content: string; }

export interface OllamaClient {
  /** GET {baseUrl}/api/tags con timeout. connected ⇔ responde 200 y algún tag cuyo
   *  nombre === model o empieza por `${model.split(":")[0]}:`. model_missing ⇔ 200 sin
   *  match. disconnected ⇔ error de red/timeout/status !== 200. */
  checkHealth(): Promise<OllamaStatus>;
  /** POST {baseUrl}/api/chat, body {model, messages, stream:true}. Parsea NDJSON línea
   *  a línea (buffer de líneas incompletas). onToken por cada chunk con
   *  message.content !== "". done:true ⇒ onDone. signal.abort() ⇒ corta el reader en
   *  ≤2 s y NO llama onError (el parcial queda, CA-22). Error de red a mitad ⇒
   *  onError(OllamaStreamError) con el parcial ya emitido intacto (CA-26). */
  chatStream(
    messages: ChatMessage[],
    handlers: { onToken(t: string): void; onDone(): void; onError(e: OllamaStreamError): void },
    signal: AbortSignal
  ): Promise<void>;
}

export interface OllamaStreamError { kind: "network" | "http" | "parse"; message: string; }

/** Textos de recuperación EXACTOS (CA-19/20, comparados literalmente en tests): */
export const CMD_SERVE = "ollama serve";
export const CMD_PULL  = (model: string) => `ollama pull ${model}`;
```

### C-RAG — Recuperación local (`src/rag/types.ts`)

Estrategia (ADR-05): **chunking en runtime al arrancar** desde `COURSE_MODULES`
(contenido ya está en el bundle; 16 módulos ⇒ índice en <100 ms; sin paso de build).
Chunk = sección Feynman partida por headings `##` de su markdown (objetivo: 150–500
palabras/chunk). Índice **MiniSearch** con campos `titulo` (boost 2) y `texto`,
tokenización con minúsculas + sin tildes; sin stemming (los términos clave son API en
inglés: `StateGraph`, `add_messages` — match exacto es lo importante).

```ts
export interface RagChunk {
  id: string;                     // `${moduleId}/${sectionKey}/${n}`
  moduleId: ModuleId;
  moduleTitulo: string;
  sectionKey: "explicaSimple" | "detectaGaps" | "llenaGaps" | "refinaSimplifica";
  titulo: string;                 // heading del chunk
  texto: string;                  // markdown plano del fragmento
}

export interface RagHit extends RagChunk { score: number; }

export interface RagIndex {
  /** Determinista para una misma query + contenido. topK default 4.
   *  boostModuleId: multiplica score de chunks de ese módulo (contexto A-06). */
  retrieve(query: string, opts?: { topK?: number; boostModuleId?: ModuleId }): RagHit[];
}
export declare function buildRagIndex(modules: readonly CourseModule[]): RagIndex;
```

> **M4:** el chunker sigue indexando el `contenidoMd` de las 4 secciones (sin cambios). El
> contenido de enriquecimiento (`pasos`, `usaLaIa`, `tutorialLocal`) NO se re-indexa en M4:
> CA-23/24 quedan intactos y ningún CA del enriquecimiento exige indexarlo. Indexar pasos/
> tutorial es mejora futura opcional fuera del alcance (ver §8.6).

### C-ASSIST — Orquestación del asistente (`src/assistant/types.ts`)

```ts
/** promptBuilder.ts — función PURA (testeable sin red, clave para CA-23/24): */
export interface PromptInput {
  pregunta: string;
  historial: ChatMessage[];             // turnos previos de la sesión (sin systems)
  currentModule: { id: ModuleId; titulo: string; objetivo: string } | null;
  ragHits: RagHit[];                    // retrieve(pregunta, {boostModuleId: currentModule?.id})
}
/** Devuelve [system, ...historial, user]. El system (español) incluye SIEMPRE:
 *  (1) rol: tutor del curso de LangGraph, responde en español;
 *  (2) bloque "MÓDULO ACTUAL: <id> — <titulo>: <objetivo>" si currentModule (CA-23);
 *  (3) bloque "CONTEXTO DEL CURSO:" con los ragHits delimitados (CA-24);
 *  (4) instrucción A-08: fuera de alcance ⇒ decirlo y redirigir al temario;
 *  (5) prioridad del contexto del curso sobre conocimiento general. */
export declare function buildPrompt(input: PromptInput): ChatMessage[];

/** Feedback Feynman (CA-27/A-10): mensaje user pre-formateado que envía el paso 1.
 *  M3: `explicacion` se obtiene LEYENDO el store de progreso (excepción de límites
 *  assistant→progress, solo lectura — ver §2). */
export declare function buildFeynmanFeedbackMessage(moduloTitulo: string, explicacion: string): string;

/** chatStore (zustand, persist en sessionStorage clave "lgcourse.chat.v1" — US-16): */
export interface ChatState {
  mensajes: { role: "user" | "assistant"; content: string; error?: string }[];
  generando: boolean;
  // M3.2 (post-M4) — el antiguo campo `status` (ADR-10) fue ELIMINADO: era código
  // muerto. La ÚNICA fuente de verdad del estado de Ollama es `useOllamaStatus`
  // (C-OLLAMA), consumido una vez en Layout y pasado por props a StatusBadge/ChatPanel.
  send(pregunta: string): void;         // compone prompt (RAG+módulo) y streamea
  stop(): void;                         // AbortController (CA-22)
  clear(): void;
  sendFeynmanFeedback(moduleId: ModuleId): void;
}
```

> **M4:** el bloque "Usa la IA" (§12.3/§8.2) NO introduce API nueva de asistente (NG-10):
> sus `promptsSugeridos` son texto copiable que el alumno pega en el chat existente (C-ASSIST
> sin cambios). No hay segundo motor ni panel.

### Configuración (`src/config.ts`)

```ts
export interface AppConfig {
  ollama: OllamaConfig;
  runner: { pyodideBaseUrl: string /* "/pyodide/" */; defaultTimeoutMs: number /* 8000 */ };
  curso: { umbralExplicacionChars: number /* 200 */; umbralQuizPct: number /* 80 */ };
  rag: { topK: number /* 4 */ };
}
export declare const CONFIG: AppConfig;   // lee import.meta.env.VITE_* con defaults
```

---

## 5. Decisiones (ADRs breves)

**ADR-01 — Pyodide en Web Worker para validar retos.**
Alternativas: runner local (proceso Python del alumno; rompe la promesa "solo navegador
+ Ollama" y complica setup), Skulpt/Brython (no soportan `typing_extensions`/semántica
CPython real que el curso enseña). Pyodide da CPython real, self-hosted, sin red.
Consecuencia: ~12 MB de assets locales y init de 2–4 s (se carga lazy y se muestra
estado "cargando entorno Python"). Timeout vía `worker.terminate()`.

**ADR-02 — Shim determinista de `langgraph` en vez de la librería real.**
LangGraph real en Pyodide exige wheels wasm no oficiales (`ormsgpack`) y arrastra
langchain-core/pydantic; frágil, pesado y con red (micropip) salvo bundle manual de toda
la cadena. El shim puro-Python replica EXACTAMENTE la superficie del grounding (tablas en
C-RUNNER), de modo que el código del alumno es idéntico al que escribiría con LangGraph
real, y las aserciones verifican comprensión de la API (grafo construido, estado
resultante, orden de nodos, checkpoints, interrupts). Riesgo de divergencia semántica
mitigado con el grounding avanzado (Context7, ya obtenido) y tests del shim contra los
ejemplos literales de ambos groundings (deben producir las salidas documentadas, p. ej.
`{'graph_output': 'My name is Lance'}` y `{"value": ["Hello, Alice!", "Done"]}` — este
último con `value: Annotated[list[str], operator.add]` en el `State`, fix M3.1). Los
LLM se sustituyen por `FakeChatModel` con `llmDoubles` (SU-02).

**ADR-03 — Contenido como TypeScript tipado (no JSON/MDX).**
TS strict valida el esquema completo en compile-time (secciones, contadores de
preguntas via tests de contrato), permite `satisfies CourseModule` y refactors seguros
de ids. La prosa va en template strings markdown. JSON perdería el tipado; MDX acoplaría
contenido a componentes.

**ADR-04 — Progreso en localStorage (zustand/persist), esquema versionado.**
Volumen ≈ KBs de texto; sin necesidad de índices ni transacciones ⇒ IndexedDB es
complejidad sin retorno. `version + migrate` protege upgrades. Sólo hechos primitivos se
persisten; los estados agregados (CA-15) son selectores. (M3: recomendación de merge
defensivo en C-PROGRESS.)

**ADR-05 — RAG léxico (MiniSearch/BM25) construido en runtime.**
Embeddings locales exigirían descargar un modelo (red ⇒ viola CA-25 en primer uso) y
darían poca ganancia en un corpus de 16 módulos donde las queries contienen términos de
API distintivos. BM25 + boost del módulo actual cumple CA-23/24 de forma verificable y
determinista. Sin paso de build: el corpus ya viaja en el bundle.

**ADR-06 — CORS con Ollama: proxy de Vite como camino por defecto.**
`vite.config.ts` define `server.proxy` y `preview.proxy`: `"/ollama" →
"http://localhost:11434"` (con `rewrite` que quita el prefijo). El navegador solo ve
peticiones same-origin a localhost ⇒ cero configuración para el alumno y CA-25 trivial.
Alternativa documentada en el README (no default): `VITE_OLLAMA_BASE_URL=http://localhost:11434`
directo, que requiere `OLLAMA_ORIGINS` permitiendo el origen de la app si el navegador
bloquea. Los e2e usan un mock del endpoint proxied.

**ADR-07 — Textos de estado/recuperación como constantes exportadas.**
CA-19/20 exigen literales exactos (`ollama serve`, `ollama pull qwen2.5-coder:14b`);
viven en C-OLLAMA y la UI los consume, nunca los redefine. Igual para los 3 labels de
estado en español: `"Conectado"`, `"Modelo no instalado"`, `"Sin conexión"` (CA-18/19/20),
exportados desde `src/app/strings.ts`.

**ADR-08 (M3) — El shim ejecuta con supersteps atómicos (no merge inmediato).**
El executor de S6 fusionaba el update de cada nodo inmediatamente; eso enseña una
semántica FALSA en cuanto hay fan-out (nodos hermanos verían updates parciales, y las
escrituras concurrentes a claves sin reducer pasarían en silencio). Alternativa evaluada:
mantener merge inmediato y prohibir fan-out en el contenido — descartada porque el
módulo 03 (reducers) pierde su caso motivador y R1 (fidelidad) es el riesgo top del
proyecto. Decisión: S12 refactoriza el executor a recolectar-updates + aplicar-al-cierre
(detalle en C-RUNNER §superstep), con `InvalidUpdateError` para escrituras concurrentes
sin reducer y sobrescritura (nunca acumulación implícita) para claves sin reducer (fix
M3.1). Compatibilidad: con 1 nodo activo por superstep el resultado es idéntico ⇒ los
tests de S6/M1 no cambian. `Send` queda fuera de la superficie.

**ADR-09 (M3) — Stubs de módulo con campo programático `enConstruccion?: true`.**
SLICES pedía marcar stubs "enConstruccion" pero C-CONTENT no definía el campo (quedaba
como marcador de texto en markdown, no verificable). Alternativa: formalizar el marcador
markdown — descartada: el cierre de M3 exige verificar CA-01 "sin stubs" de forma
programática, y un literal en prosa es frágil. Decisión: campo opcional
`enConstruccion?: true` en `CourseModule` (aditivo: el código en PASS compila sin
cambios). Regla: S13/S14/S15 eliminan el campo Y cualquier marcador textual
"EN CONSTRUCCIÓN" de sus módulos; el integrator M3 asserta
`COURSE_MODULES.every(m => m.enConstruccion !== true)` y ausencia del literal en los
`contenidoMd`.

**ADR-10 (M3) — `ChatState.status` deprecado; fuente de verdad = `useOllamaStatus`.**
El campo `status` del chatStore nunca se actualizaba en runtime (la UI real consume
`useOllamaStatus` en el Layout). **Actualización M3.2 (post-M4): el campo fue ELIMINADO**
de `ChatState` (types.ts) y del store; ninguna UI/test lo leía, así que la retirada no
rompió nada (931 unit + e2e verdes). Única fuente de verdad del estado de Ollama:
`useOllamaStatus` (C-OLLAMA).

**ADR-11 (M3.2) — `stream(subgraphs=True)`/`ns`: fuera de la superficie ejecutable;
en mod15 es contenido ilustrativo.**
Finding del reviewer de S12: el streaming namespaced nunca se implementó ni testeó, y
la tabla lo daba erróneamente por "ya core" mientras SLICES lo situaba en S12
(contradicción documental). La composición subgraph-como-nodo SÍ funciona (core, S6) y
S12 cerró en PASS sin `ns`. Alternativa A: añadirlo al shim (addendum de
implementer+test-author antes de S15) — descartada: coste/beneficio pobre (una única
llamada en mod15, semántica de namespacing con formato sensible a versión, R9), y el
objetivo pedagógico de "distinguir por `ns`" se cubre leyendo el formato documentado.
Decisión (B): los retos ejecutables de mod15 usan SOLO subgraph-como-nodo;
`stream(subgraphs=True)`/`ns` aparece únicamente en bloques ilustrativos con "copiar"
(mismo tratamiento que el SDK en mod16, NG-06). El shim, si recibe `subgraphs=True`,
lanza error claro en español (nunca resultado incorrecto en silencio). Regla 6 de
C-CONTENT; el quiz de mod15 puede evaluar `ns` conceptualmente (sin ejecutar).

> **ADR-12..ADR-15 (M4) — enriquecimiento guiado:** ver §8.7.

## 6. Mapa CA → módulo responsable

| CAs | Módulo(s) responsable(s) |
|---|---|
| CA-01, CA-04 | `content/` (registry) + `pages/Temario` + `progress/selectors` |
| CA-02, CA-03, CA-28 | `content/` (tipos + tests de contrato + revisión vs grounding) |
| CA-05 | `app/strings.ts` + revisión transversal |
| CA-06, CA-07, CA-08, CA-10 | `runner/` (+ `progress/` para CA-08) |
| CA-09 | `components/ChallengeCard` + `progress/selectors` |
| CA-11, CA-12 | `components/QuizCard` + `progress/` |
| CA-13, CA-14 | `components/FeynmanEditor` + `progress/` |
| CA-15, CA-16, CA-17 | `progress/` (selectores, persist, resets) |
| CA-18, CA-19, CA-20, CA-25, CA-26 | `assistant/ollamaClient` + `StatusBadge` + ADR-06 |
| CA-21, CA-22 | `assistant/chatStore` + `ChatPanel` |
| CA-23, CA-24 | `assistant/promptBuilder` + `rag/` |
| CA-27 | `assistant/` (buildFeynmanFeedbackMessage + lectura de progreso, ver §2) + paso 1 UI |
| CA-29 | `components/CodeBlock` |
| CA-30..CA-39 (M4) | `content/` (autores) + `content/traversal.ts` + smoke runner + `ModuloPage` glue — ver §8.8 |

## 7. Riesgos técnicos y mitigaciones

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | El shim diverge de la semántica real de LangGraph y el curso enseña algo falso | Media | Alto | Tests del shim contra los ejemplos literales de AMBOS groundings (salidas documentadas); grounding avanzado ya obtenido y tabla del shim ratificada (M3; §1 corregido en M3.1 con reducer explícito); superstep atómico (ADR-08) elimina la divergencia de fan-out; CA-28 audita símbolos |
| R2 | Init de Pyodide lento (>4 s) percibido como cuelgue | Media | Medio | Carga lazy al entrar al primer reto + estado visible "Preparando entorno Python…"; presupuesto CA-06 se mide desde envío, no desde init (init ocurre antes de que el alumno escriba) |
| R3 | Código del alumno con bucle infinito congela el worker | Alta | Medio | Timeout duro `worker.terminate()` + re-init; límite de recursión del shim (25) con error claro |
| R4 | NDJSON de Ollama: chunks parten líneas y rompen el parseo | Media | Medio | Buffer de líneas incompletas en el cliente; tests unitarios del parser con chunks arbitrarios |
| R5 | Cambio de versión de Ollama altera `/api/tags` o `/api/chat` | Baja | Medio | Cliente tolerante (solo lee `models[].name`, `message.content`, `done`); errores mapeados a CA-26 |
| R6 | localStorage lleno o bloqueado (modo privado) | Baja | Medio | try/catch en persist + aviso en español "el progreso no se está guardando"; app sigue funcional; (M3) merge defensivo recomendado en C-PROGRESS |
| R7 | Volumen de contenido (16 módulos con calidad Feynman) es el mayor costo del proyecto | Alta | Alto | Slices de contenido paralelizables tras cerrar C-CONTENT y con el shim listo; test de humo automático: cada `solutionCode` pasa su validación |
| R8 | RAG léxico falla con preguntas parafraseadas sin términos de API | Media | Bajo | Boost del módulo actual garantiza contexto útil (CA-23); títulos/sinónimos en español dentro de los headings de chunks |
| R9 | `ns`/`stream_mode` combinados del grounding tienen formato distinto por versión | Baja | Medio | El shim implementa exactamente el formato del grounding §5 (+ avanzado §5 para `messages`); `subgraphs=True`/`ns` queda fuera de la superficie ejecutable (ADR-11) ⇒ el riesgo de formato de `ns` desaparece del código; si el contenido necesita más ⇒ Context7 |
| R10 (M3) | El refactor a superstep (ADR-08) rompe tests de S6 en verde | Baja | Medio | Con 1 nodo/superstep la semántica es idéntica por construcción; la suite de S6 (ejemplos grounding §1–2) corre íntegra en S12 como regresión antes de añadir lo avanzado. (Verificado: S12 en PASS 22/22.) |
| R11 (M4) | La enumeración de retos/quizzes se duplica (selector vs. smoke vs. UI) y un mini-ejercicio cuenta para "hecho" en un sitio y no en otro | Media | Alto | Enumeración canónica ÚNICA en `content/` (ADR-13): `getModuleChallenges`/`getModuleQuizzes`/`getModulePasos`; selector, smoke y UI la consumen; test de equivalencia asegura que para módulos sin `pasos` el resultado es idéntico al de S3 (retrocompat) |
| R12 (M4) | El código del tutorial local (LangGraph real + `ChatOllama`) diverge de la superficie que valida el runner y enseña API que la app no puede verificar | Media | Alto | CA-36/CA-37 auditables por texto: símbolos LangGraph del tutorial ⊆ símbolos usados en los retos validados del módulo (única excepción declarada: `FakeChatModel`→`ChatOllama`); allowlist = tablas del shim (C-RUNNER) + `langchain_ollama.ChatOllama`; 0 imports cloud (NG-02) |
| R13 (M4) | Densificar diluye el foco o infla el costo de contenido (mayor riesgo del proyecto, R7) | Alta | Medio | Piloto mod01–03 con gate humano antes de escalar (§12.7); mini-ejercicios reutilizan `CodeChallenge` + smoke automático (CA-32) ⇒ 0 formato nuevo, misma verificación que ya existe; lotes paralelizables tras cerrar el delta de contrato |

---

## 8. Extensión ADITIVA de C-CONTENT — Enriquecimiento guiado (PRD §12) [M4]

> **Contrato CERRADO (2026-07-06).** Todo lo de §4 (C-CONTENT actual) sigue vigente **sin
> cambios**. Esta sección **añade** tipos y campos **OPCIONALES**: cualquier módulo sin
> ellos —los 16 actuales y sus tests en PASS— compila y pasa igual (retrocompatibilidad
> total). Ningún campo existente cambia de forma ni de obligatoriedad. Huecos ⇒ architect.
> Insumos: PRD §12 (CA-30..CA-39, NG-10..NG-14), `docs/reference/enriquecimiento-decisiones.md`.

### 8.1 Principio de retrocompatibilidad (invariante de diseño)

- **Todos** los campos nuevos son opcionales (`?`). Un `CourseModule` que no los define es
  válido. Los tests de contrato del registry (S1/S13/S14/S15) y los selectores de progreso
  (S3) **no cambian de resultado** para módulos sin enriquecer.
- No se introduce **ningún** tipo de ejercicio nuevo: los mini-ejercicios REUTILIZAN
  `CodeChallenge` (ADR-12) ⇒ el runner (C-RUNNER) y el harness los validan **idénticos**
  a cualquier reto de §5.2, y el smoke de soluciones (CA-32) es el mismo test extendido.
- El formato §12 se exige **solo** a módulos con `enriquecido: true` (rollout por fases,
  §12.7). El marcador es programático (ADR-15), análogo a `enConstruccion` (ADR-09).

### 8.2 Delta EXACTO de tipos (`src/content/types.ts`) — transcripción literal

**(a) Campos nuevos OPCIONALES en `CourseModule`** (se AÑADEN; nada existente cambia):

```ts
export interface CourseModule {
  // ... TODO lo actual intacto (id, numero, titulo, objetivo, enConstruccion?, secciones)
  /**
   * §12 (ADR-15): marcador PROGRAMÁTICO de módulo bajo formato ENRIQUECIDO. `true` SOLO
   * en módulos ya enriquecidos (piloto mod01–03; luego mod04–06, 07–11, 12–16). Los
   * tests CA-30..CA-39 se exigen ÚNICAMENTE a módulos con `enriquecido === true`; un
   * módulo sin este campo NO está obligado al formato §12 (retrocompat). Ortogonal a
   * `enConstruccion` (nunca coexisten: un stub no está enriquecido).
   */
  enriquecido?: true;
  /** §12.3: bloques "Usa la IA" (copiloto qwen). ≥1 en módulo enriquecido (CA-34). */
  usaLaIa?: UsaLaIaBlock[];
  /** §12.4: tutorial local "En tu máquina" + tramo del project spine (CA-35..CA-38). */
  tutorialLocal?: TutorialLocal;
}
```

**(b) Campo nuevo OPCIONAL en CADA una de las 4 secciones Feynman** (misma línea en
`SeccionExplicaSimple`, `SeccionQuiz`, `SeccionProfundiza`, `SeccionRefina`):

```ts
  /**
   * §12.2: secuencia ORDENADA de pasos guiados de ESTA sección. Opcional (retrocompat).
   * Los pasos viven sobre todo en `llenaGaps` (paso 3), pero pueden aparecer en las 4.
   * El orden del array ES el orden pedagógico y la base de CA-33 (incrementalidad
   * DENTRO de la sección).
   */
  pasos?: PasoGuiado[];
```

**(c) Tipos nuevos:**

```ts
// ---------- Paso guiado (§12.2) ----------
export interface PasoGuiado {
  id: string;                       // único en el módulo, ej. "mod01-paso1"
  titulo: string;                   // español
  /** Mini-explicación breve (markdown ES). NO vacía y ≤120 palabras (CA-30). SOLO el
   *  micro-concepto de este paso (no adelanta los siguientes). */
  explicacionMd: string;
  /** EXACTAMENTE una acción concreta (CA-30). */
  accion: PasoAccion;
}

export type PasoAccion =
  /** Caso normal: mini-ejercicio de código bajo el contrato §5.2. REUTILIZA
   *  CodeChallenge (ADR-12): mismo runner, mismo harness, mismo smoke (CA-32). Alcance
   *  reducido: 1 concepto, 1–3 `# TODO` (CA-32/CA-33). CUENTA para "hecho" (CA-15). */
  | { kind: "ejercicio"; reto: CodeChallenge }
  /** Excepción: micro-predicción/quiz de 1–2 ítems. REUTILIZA Quiz. CUENTA como quiz del
   *  módulo (CA-11/12, umbral 80% de CONFIG) — enumeración canónica ADR-13. */
  | { kind: "quiz"; quiz: Quiz }
  /** Excepción: lectura-y-ejecución sin verificación automática (raro; NO cuenta para
   *  "hecho"). El `bloqueMd` es prosa/código ilustrativo con "copiar" (CA-29). */
  | { kind: "lectura"; bloqueMd: string };

// ---------- Bloque "Usa la IA" (§12.3) ----------
export interface UsaLaIaBlock {
  id: string;                       // único en el módulo, ej. "mod01-ia1"
  titulo?: string;
  /** ≥1 prompt sugerido copiable, orientado al módulo (CA-34). */
  promptsSugeridos: string[];
  /** Checklist "cómo verificar la respuesta de la IA": ≥2 ítems (CA-34). */
  comoVerificar: string[];
  /** Guía "cómo iterar" si la respuesta no compila/no pasa. NO vacía (CA-34). */
  comoIterar: string;
  /** "Qué NO delegar" (el alumno escribe/entiende el código): ≥1 ítem (CA-34, NG-11). */
  queNoDelegar: string[];
}

// ---------- Tutorial local "En tu máquina" + project spine (§12.4) ----------
export interface TutorialLocal {
  introMd?: string;                 // encuadre opcional del tramo del módulo
  /** ≥1 bloque de setup, cada uno con AMBOS shells no vacíos (CA-35). Incremental:
   *  solo lo NUEVO del módulo, no se repite entero. */
  setup: SetupBloque[];
  /** ≥1 bloque de código LangGraph REAL (CA-35/36). ILUSTRATIVO: con "copiar" (CA-29),
   *  NO ejecutado por el runner (NG-12) — igual que los bloques ilustrativos de ADR-11. */
  codigo: TutorialCodigo[];
  /** Salida esperada LITERAL para que el alumno compare (CA-35). NO vacía. */
  salidaEsperada: string;
  /** Tramo del project spine que aporta este módulo (CA-38). */
  spine: SpinePaso;
}

export interface SetupBloque {
  titulo?: string;
  descripcionMd?: string;
  /** Comandos Windows PowerShell (copiables). NO vacío (CA-35). */
  powershell: string;
  /** Comandos bash (copiables). NO vacío (CA-35). */
  bash: string;
}

export interface TutorialCodigo {
  /** Ruta del archivo del project spine (ej. "src/graph.py"). Ata el código al spine
   *  (CA-38). */
  archivo: string;
  descripcionMd?: string;
  /** Código Python REAL: superficie LangGraph del grounding (CA-36) + donde haya LLM,
   *  `from langchain_ollama import ChatOllama` con `model="qwen2.5-coder:14b"` (u override
   *  A-01). CERO proveedores cloud (NG-02). Ilustrativo (no lo corre el runner, NG-12). */
  codigo: string;
}

export interface SpinePaso {
  /** Archivos CREADOS respecto del módulo enriquecido anterior. */
  crea: string[];
  /** Archivos MODIFICADOS respecto del módulo anterior (⊆ archivos ya creados, CA-38). */
  modifica: string[];
  /** SOLO mod01: scaffolding completo (venv + estructura `src/` + `requirements.txt`).
   *  Cuando es `true`, `crea` incluye el árbol inicial del proyecto (CA-38). */
  scaffolding?: true;
}
```

**(d) Enumeración canónica (ADR-13) — ÚNICA fuente de verdad (`src/content/traversal.ts`):**

```ts
/** Funciones PURAS sobre un CourseModule (dato puro; importables por content/, progress/,
 *  pages/ y los tests). Recorren TODAS las secciones INCLUYENDO `pasos`. Sustituyen a las
 *  enumeraciones inline privadas de `progress/selectors.ts` (quizIdsOf/challengeIdsOf). */

/** Todos los pasos del módulo, en orden de sección (explica→gaps→llena→refina) y de array. */
export declare function getModulePasos(m: CourseModule): PasoGuiado[];

/** Todos los CodeChallenge del módulo: retos de `llenaGaps`, `sintesis` (kind "code") Y
 *  `pasos[].accion` (kind "ejercicio"). Base del smoke CA-32 y del selector CA-15. */
export declare function getModuleChallenges(m: CourseModule): CodeChallenge[];

/** Todos los Quiz del módulo: `detectaGaps`, `sintesis` (kind "quiz") Y `pasos[].accion`
 *  (kind "quiz"). Base del selector CA-15 (micro-quizzes de pasos CUENTAN como quizzes). */
export declare function getModuleQuizzes(m: CourseModule): Quiz[];
```

**Invariante de retrocompat (test obligatorio en SE0):** para todo módulo SIN `pasos`,
`getModuleChallenges`/`getModuleQuizzes` devuelven exactamente el mismo conjunto de ids que
`challengeIdsOf`/`quizIdsOf` de S3 ⇒ los tests de S3 y el smoke previo no cambian de veredicto.

### 8.3 Qué CUENTA para "hecho" (CA-15 intacto en su fórmula, ampliado en su conjunto)

La fórmula de CA-15 **no cambia** (CA-39): `completado ⇔ explicación ≥200 ∧ TODOS los
quizzes hechos ∧ TODOS los retos en pass`. Lo que cambia es **qué está en esos conjuntos**,
resuelto por la enumeración canónica (ADR-13):

| Elemento nuevo | ¿Cuenta para "hecho"? | Vía |
|---|---|---|
| `pasos[].accion` kind `"ejercicio"` (mini-ejercicio) | **SÍ** (como cualquier reto, PRD §12.2) | `getModuleChallenges` → `progress.retos[id]` (C-PROGRESS sin cambios) |
| `pasos[].accion` kind `"quiz"` (micro-quiz) | **SÍ** (como cualquier quiz, umbral 80%) | `getModuleQuizzes` → `progress.quizzes[id]` |
| `pasos[].accion` kind `"lectura"` | **NO** (sin verificación) | — |
| `usaLaIa`, `tutorialLocal` | **NO** (no son ejercicios; la IA nunca califica, NG-11) | — |

C-PROGRESS **no cambia**: `progress.retos`/`progress.quizzes` ya son `Record<string, …>`
indexados por id; los ids de los mini-ejercicios/micro-quizzes se registran igual que los
demás. `selectors.ts` deja de enumerar inline y delega en `content/traversal.ts` (ADR-13).

### 8.4 Qué se EJECUTA vs. qué es ILUSTRATIVO (frontera runner ↔ tutorial local)

| Contenido | ¿Lo ejecuta el runner (Pyodide+shim)? | Notas |
|---|---|---|
| `pasos[].accion.reto` (mini-ejercicios) | **SÍ** | shim + `FakeChatModel`; `validationCode` con `check/check_eq/check_raises/get_llm_calls` (NO `run_graph`). Smoke CA-32. |
| Retos y quizzes de secciones (§5) | **SÍ** | sin cambios respecto de M1–M3. |
| `tutorialLocal.codigo` (LangGraph real + `ChatOllama`) | **NO** | ILUSTRATIVO, con "copiar" (CA-29). Mismo tratamiento que los bloques ilustrativos de ADR-11 y el SDK de mod16 (NG-06/NG-12). |
| `tutorialLocal.setup` (venv, pip, comandos shell) | **NO** | Guía reproducible; nunca corre en la app (NG-12/NG-13). |
| `pasos[].accion.lectura.bloqueMd` | **NO** | Prosa/código ilustrativo. |

**Regla dura:** `ChatOllama`, `langchain_ollama` y los comandos de shell **no** forman parte
de la superficie ejecutable del shim (C-RUNNER). Si aparecieran en `starterCode`,
`solutionCode` o `validationCode` de un reto/mini-ejercicio ⇒ contenido INVÁLIDO (el shim no
los soporta). Solo son legítimos dentro de `tutorialLocal.codigo` (ilustrativo).

### 8.5 Reglas de verificación para el test-author (CA-30..CA-39)

Se aplican **por cada módulo con `enriquecido === true`** (salvo excepción indicada). Todas
son verificables sin juicio humano. El test-author itera sobre
`COURSE_MODULES.filter(m => m.enriquecido)`.

- **CA-30 (pasos)**: `getModulePasos(m).length ≥ 5`; cada paso: `explicacionMd` no vacío y
  `contarPalabras(explicacionMd) ≤ 120` (palabras = tokens tras `split(/\s+/)` no vacíos);
  `accion` presente (exactamente una).
- **CA-31 (granularidad)**: nº de pasos con `accion.kind === "ejercicio"` `≥ 3`.
  **Excepción mod16**: puede sustituir mini-ejercicios por micro-quizzes
  (`accion.kind === "quiz"`) bajo CA-11/12.
- **CA-32 (mini-ejercicio bien formado)**: cada `CodeChallenge` de un paso: `enunciadoMd`
  no vacío; `starterCode` con **1–3** ocurrencias de `# TODO`; `validationCode` con ≥1 check
  del harness; `solutionCode` presente; y **`solutionCode` pasa su `validationCode` en el
  runner real** (extensión del smoke existente a `getModuleChallenges`, que ya incluye los
  pasos).
- **CA-33 (incrementalidad)**: DENTRO de cada sección, para los mini-ejercicios en orden de
  array, `#TODO(n) ≥ #TODO(n−1)` (o, en su defecto, `#asserciones(n) ≥ #asserciones(n−1)`).
  Se compara solo entre ejercicios de la MISMA sección.
- **CA-34 ("Usa la IA")**: `usaLaIa.length ≥ 1`; por bloque: `promptsSugeridos.length ≥ 1`,
  `comoVerificar.length ≥ 2`, `comoIterar` no vacío, `queNoDelegar.length ≥ 1`.
- **CA-35 (tutorial local presente)**: `tutorialLocal` definido; `setup.length ≥ 1` con cada
  `SetupBloque.powershell` y `.bash` no vacíos; `codigo.length ≥ 1`; `salidaEsperada` no
  vacía. El control "copiar" de cada bloque lo da `CodeBlock` (CA-29, ya existente).
- **CA-36 (fidelidad API tutorial local)** — auditable por TEXTO: en
  `tutorialLocal.codigo[].codigo`, los imports/símbolos de `langgraph*`/`langchain*`
  pertenecen al **allowlist** = símbolos de las tablas del shim (C-RUNNER, Core+Avanzado)
  **∪** `{ langchain_ollama.ChatOllama }`; y **0** imports de proveedores cloud (regex sobre
  `openai|anthropic|langchain_openai|langchain_anthropic|langchain_google|…`). El `model=` de
  `ChatOllama` = `"qwen2.5-coder:14b"` o el override `VITE_OLLAMA_MODEL`.
- **CA-37 (coherencia app↔máquina)** — auditable por conjuntos: sea `Smax` = símbolos
  LangGraph usados en los retos/mini-ejercicios validados por el runner del módulo
  (`starterCode`+`solutionCode`+`validationCode` de `getModuleChallenges`), y `Stut` =
  símbolos LangGraph de `tutorialLocal.codigo`. Se exige `Stut ⊆ Smax`. **Única diferencia
  admitida**: el cliente LLM (`FakeChatModel` en el runner ↔ `ChatOllama` en el tutorial) y
  los símbolos de setup/instalación (imports de `langchain_ollama`, no de `langgraph`). Los
  comandos de shell y `ChatOllama` NO se ejecutan (son ilustrativos, como ADR-11).
- **CA-38 (project spine continuo)** — auditable sobre el registry ordenado: por módulo
  enriquecido, `spine.crea ∪ spine.modifica ≠ ∅`; mod01 tiene `spine.scaffolding === true`;
  y para todo archivo en `spine.modifica`, ese archivo aparece en `spine.crea` de **algún
  módulo enriquecido anterior** (o del propio, antes de modificarse) ⇒ sin saltos.
- **CA-39 (no rompe contratos previos)**: la suite CA-01..CA-29 sigue verde tras enriquecer;
  y el test de equivalencia de §8.2(d) confirma que para módulos sin `pasos` la enumeración
  es idéntica a S3. Los 16 módulos y sus tests en PASS siguen compilando y verdes.

### 8.6 Impacto en el resto de módulos (glue, sin UI nueva compleja)

- **`content/`**: transcribir el delta §8.2 en `types.ts`; nuevo `traversal.ts` con la
  enumeración canónica (ADR-13). Dato puro; sin deps de React.
- **`progress/selectors.ts`**: `quizIdsOf`/`challengeIdsOf` se reemplazan por delegación a
  `getModuleQuizzes`/`getModuleChallenges` (ADR-13). C-PROGRESS **no cambia**; el test de
  equivalencia protege a S3.
- **`pages/ModuloPage` (S2)**: puede renderizar TODO lo nuevo con los componentes
  EXISTENTES — `MarkdownView` (explicaciones, prosa), `CodeBlock` (prompts "Usa la IA",
  setup PowerShell/bash, `tutorialLocal.codigo`, `salidaEsperada`; todos con "copiar"
  CA-29), `ChallengeCard` (mini-ejercicios kind `"ejercicio"`), `QuizCard` (micro-quizzes
  kind `"quiz"`). Glue presentacional mínimo (trabajo del implementer del slice, NO diseño
  de UI nueva): tres wrappers finos `PasoView`, `UsaLaIaView`, `TutorialLocalView` que
  componen los componentes anteriores; sin estado nuevo, sin contrato nuevo. Los
  mini-ejercicios reusan el cableado `ChallengeCard`↔`useRunner`↔`progress` de S7 sin
  cambios (mismo `CodeChallenge`, mismo registro por id).
- **`rag/` (C-RAG)**: sin cambios (§C-RAG nota M4). El RAG sigue indexando `contenidoMd`.

### 8.7 ADRs del enriquecimiento

**ADR-12 (M4) — Mini-ejercicios REUTILIZAN `CodeChallenge` (no un tipo nuevo).**
Alternativa: un tipo `MiniEjercicio` ligero. Descartada: `CodeChallenge`
(starter/solution/validation + `llmDoubles`) ya expresa un ejercicio verificable por el
runner; reusarlo hace que el shim, el harness, el smoke (CA-32), `ChallengeCard` y el
registro de progreso (por id) funcionen **sin una sola línea nueva** en el runner o en
C-PROGRESS. El "alcance reducido" (1 concepto, 1–3 `# TODO`) es una convención de contenido
verificada por CA-32/33, no un tipo. Consecuencia: los mini-ejercicios cuentan para CA-15
igual que cualquier reto (PRD §12.2), lo cual es exactamente lo deseado.

**ADR-13 (M4) — Enumeración canónica de retos/quizzes en `content/traversal.ts`.**
Al añadir `pasos`, la lista de retos/quizzes de un módulo deja de ser trivial. Si cada
consumidor (selector CA-15, smoke CA-32, UI, tests) la reconstruye por su cuenta, un
mini-ejercicio podría contar para el smoke y no para "completado" (bug silencioso, R11).
Alternativa: extender inline `quizIdsOf`/`challengeIdsOf` en `selectors.ts`. Descartada:
dejaría la lógica duplicada entre progress, content y UI. Decisión: una sola función pura por
dimensión en `content/` (dato puro, importable por todos), y `selectors.ts` delega. Test de
equivalencia asegura retrocompat con S3. Decisión asociada CERRADA: los micro-quizzes de
`pasos` CUENTAN como quizzes del módulo (uniformidad de CA-15; umbrales ajustables por el
humano vía CONFIG sin re-diseño).

**ADR-14 (M4) — Tutorial local: ILUSTRATIVO (no ejecutable) + spine DECLARATIVO.**
`tutorialLocal.codigo` usa LangGraph REAL + `ChatOllama`, superficie que el shim NO ejecuta
(ChatOllama, shell) y que NG-12 prohíbe correr en la app. Alternativa: ejecutar el tutorial
(rechazada por NG-12/NG-13) o validar su código con el shim (imposible: usa símbolos fuera de
la superficie ejecutable). Decisión: tratarlo como los bloques ilustrativos de ADR-11 (con
"copiar", sin ejecución) y garantizar coherencia por AUDITORÍA DE TEXTO (CA-36/37): sus
símbolos LangGraph ⊆ los validados por el runner, con la única excepción del cliente LLM. El
project spine se modela DECLARATIVAMENTE (`SpinePaso.crea/modifica`) para verificar
continuidad sin saltos (CA-38) sin generar ni descargar nada (NG-13).

**ADR-15 (M4) — Marcador programático `enriquecido?: true` (rollout por fases).**
El enriquecimiento se despliega por lotes (piloto mod01–03, luego 04–06/07–11/12–16, §12.7).
Los tests CA-30..CA-39 no pueden exigirse a módulos aún no enriquecidos. Alternativa:
inferir "enriquecido" de la presencia de `pasos`/`tutorialLocal`. Descartada: frágil (un
módulo a medias pasaría/fallaría de forma ambigua) y no distingue "no enriquecido todavía"
de "enriquecido incompleto". Decisión: campo explícito `enriquecido?: true` (aditivo,
análogo a `enConstruccion`); el test-author itera solo sobre `COURSE_MODULES.filter(m =>
m.enriquecido)`. Nunca coexiste con `enConstruccion` (un stub no está enriquecido).

### 8.8 Mapa CA → módulo responsable (enriquecimiento)

| CAs | Módulo(s) responsable(s) |
|---|---|
| CA-30, CA-31, CA-33 | `content/` (autores) + test de contrato sobre `getModulePasos`/enumeración |
| CA-32 | `content/` + smoke `getModuleChallenges` en el runner real (C-RUNNER) |
| CA-34 | `content/` (`usaLaIa`) + test de contrato |
| CA-35 | `content/` (`tutorialLocal`) + `components/CodeBlock` (CA-29) |
| CA-36, CA-37 | `content/` + auditoría de símbolos (allowlist tablas del shim + `ChatOllama`) |
| CA-38 | `content/` (`spine`) + test de continuidad sobre el registry ordenado |
| CA-39 | regresión CA-01..CA-29 + test de equivalencia de enumeración (ADR-13) |

> **Nota de drift detectado (no bloqueante, para el implementer de SE0):** el comentario de
> `src/content/types.ts` (bloque de `validationCode`) aún cita `run_graph`, API inexistente
> corregida en M3 (C-RUNNER: solo `check/check_eq/check_raises/get_llm_calls`). Al transcribir
> el delta §8.2, corregir también ese comentario para alinearlo con C-RUNNER. Es un comentario,
> no afecta tipos ni tests.
