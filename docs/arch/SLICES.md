# SLICES — DAG de slices verticales

> Cada slice entrega valor end-to-end y es testeable AISLADO. Orden: respetar el DAG.
> **Gate 2**: los contratos de `ARCHITECTURE.md` §4 están CERRADOS; slices que comparten
> un contrato solo se paralelizan porque el contrato ya está fijo. Si un slice necesita
> cambiar un contrato ⇒ STOP y volver al architect.
> Convención: el test-author escribe tests desde los CA listados; "toca" es orientativo,
> los contratos no.

## Vista del DAG

```
M0:            S0
              / | \_________________________
M1:         S1  S3  S6                      \
            |  /|\  |                        \
            S2  | \ S7*                      M2: S8
           /|\  |  /                              |
         S4 S5  | /                               S9
           \ \  |/                               /  \
            (S4,S5,S7 → dependen de S2+S3;    S10   S11*(+S5)
             S7 además de S6)                   \   /
M3:         S12 ──► S14, S15                     ▼
            S13 (solo S1+S6)          integrator M2
                 S13 ∥ S14 ∥ S15 (tras S12)
M4:         SE0 ──► SE1 (piloto mod01–03) ──(gate humano)──► SE2 ∥ SE3 ∥ SE4
M5:         SF1 ∥ SF2 ──► SF3   (fallback WebGPU, PRD §13; requiere S8–S11 en PASS)
```
`*` = comparte contrato con otro slice en curso (ya cerrado, ver columna Contratos).

## Milestone M0 — Fundaciones

### S0 — Scaffolding + shell UI + configuración
- **Objetivo**: repo Vite+React+TS strict funcionando: Tailwind + shadcn/ui, router con
  rutas `/` (temario placeholder) y `/modulo/:id`, layout con sidebar derecha
  (placeholder del asistente), `src/config.ts` (contrato Configuración), proxy Vite
  `/ollama → localhost:11434` (dev y preview, ADR-06), script `copy-pyodide` que puebla
  `public/pyodide/`, Vitest + Playwright configurados, strings de UI centralizados en
  `src/app/strings.ts` (español).
- **CA que cubre**: CA-05 (base: 0 strings hardcodeados en inglés en el shell); soporte
  de ADR-06 para CA-25.
- **Contratos**: produce el esqueleto de carpetas de ARCHITECTURE §2 y `CONFIG`;
  consume ninguno.
- **Toca**: raíz del repo, `src/app/`, `vite.config.ts`, `scripts/`, `e2e/` setup.
- **Depende de**: — (primer slice, incluye scaffolding).
- **Tests**: build verde; e2e humo: la app carga, layout con sidebar visible, navegación
  entre rutas; proxy responde (mock).

## Milestone M1 — Curso core (vertical completo con 2 módulos reales)

> Tras S0, **S1, S3, S6 y S8 arrancan en paralelo** (contratos C-CONTENT, C-PROGRESS,
> C-RUNNER, C-OLLAMA cerrados; no comparten archivos).

### S1 — Contenido: tipos + registry + módulos 01 y 02 + Temario
- **Objetivo**: `src/content/types.ts` transcribe C-CONTENT literal; `registry.ts` con
  los 16 módulos (01 y 02 con contenido COMPLETO según PRD §5.1 y grounding §1–2; 03–16
  como esqueleto tipado con `titulo`/`objetivo` reales de PRD §6 y secciones stub
  marcadas con `enConstruccion: true` (campo de C-CONTENT, ADR-09), permitido SOLO
  hasta M3). Página Temario lista los 16 con título, objetivo y estado (estado
  "no_iniciado" fijo hasta integrar S3; el selector llega por props/hook definido en
  C-PROGRESS).
- **CA**: CA-01, CA-04; CA-02/CA-03/CA-28 para mod01–02; CA-05 (contenido).
- **Contratos**: produce implementación de C-CONTENT; consume C-PROGRESS (solo el tipo
  `ModuleStatus` — cerrado).
- **Toca**: `src/content/**`, `src/pages/TemarioPage.tsx`.
- **Depende de**: S0.
- **Tests**: test de contrato del registry (16 módulos, ids, orden, quiz 4–6, secciones);
  e2e: temario muestra 16 y navega a cualquiera (CA-04); revisión CA-28 sobre mod01–02.

### S2 — Vista de módulo: 4 secciones Feynman + markdown + CodeBlock copiar
- **Objetivo**: `ModuloPage` renderiza las 4 secciones en orden con navegación interna;
  `MarkdownView` (react-markdown+Shiki) y `CodeBlock` con botón "copiar" (clipboard).
  Quiz/retos se muestran como placeholders con slots (los componentes llegan en S4/S7).
- **CA**: CA-02, CA-29, CA-05.
- **Contratos**: consume C-CONTENT (cerrado).
- **Toca**: `src/pages/ModuloPage.tsx`, `src/components/MarkdownView.tsx`, `CodeBlock.tsx`.
- **Depende de**: S1.
- **Tests**: componente: orden y títulos exactos de las 4 secciones (CA-02); e2e:
  copiar bloque ⇒ clipboard === contenido exacto (CA-29).

### S3 — Store de progreso + persistencia + resets
- **Objetivo**: `src/progress/` completo: store zustand+persist (localStorage
  `lgcourse.progress.v1`), acciones y selectores de C-PROGRESS (CA-15 como selector puro),
  migración v1, manejo de storage inaccesible (R6). UI mínima: acciones "reiniciar
  módulo" (con confirmación) y "reiniciar curso" expuestas como hook para Temario/Módulo.
  (M3: recomendación opcional de merge defensivo en C-PROGRESS — puede adoptarse en
  cualquier slice posterior sin cambiar el contrato.)
- **CA**: CA-15, CA-16, CA-17 (lógica; verificación e2e completa en integración M1);
  US-10.
- **Contratos**: produce implementación de C-PROGRESS; consume C-CONTENT (solo tipos —
  cerrado).
- **Toca**: `src/progress/**`.
- **Depende de**: S0. **Paralelo con S1, S6, S8.**
- **Tests**: unitarios puros del store y selectores (CA-15 tabla de verdad; CA-17 no
  toca otros módulos; mejor-resultado quiz; último-intento reto); persist round-trip
  con localStorage simulado (CA-16).

### S4 — Quiz end-to-end
- **Objetivo**: `QuizCard` con los 4 tipos de pregunta de C-CONTENT, corrección
  inmediata, explicación siempre visible tras responder, puntuación final, repetición
  ilimitada, registro en progreso (mejor resultado, umbral 80% desde CONFIG).
- **CA**: CA-11, CA-12.
- **Contratos**: consume C-CONTENT, C-PROGRESS (cerrados).
- **Toca**: `src/components/QuizCard.tsx` + integración en `ModuloPage`.
- **Depende de**: S2, S3. **Paralelo con S5 y S7.**
- **Tests**: componente con quiz de fixture: correcta/incorrecta + explicación en ambos
  casos (CA-11); 80% ⇒ hecho, 79% ⇒ no, repetir conserva mejor (CA-12).

### S5 — Explicación Feynman (paso 1)
- **Objetivo**: `FeynmanEditor`: textarea con contador, guardado (explícito + debounce),
  umbral 200 chars desde CONFIG, indicador completado, botón "pedir feedback"
  presente pero deshabilitado con tooltip hasta S11.
- **CA**: CA-13, CA-14.
- **Contratos**: consume C-CONTENT, C-PROGRESS (cerrados).
- **Toca**: `src/components/FeynmanEditor.tsx` + integración en `ModuloPage`.
- **Depende de**: S2, S3. **Paralelo con S4 y S7.**
- **Tests**: 199 chars ⇒ no completado, 200 ⇒ sí (CA-13); e2e: guardar + reload ⇒ texto
  íntegro (CA-14).

### S6 — Runner Pyodide + shim core + harness
- **Objetivo**: `src/runner/` completo según C-RUNNER: worker, init lazy, cola,
  timeout por terminate+reinit, bloqueo de red en el scope Python (CA-10);
  `createPyRunner()`/`getPyRunner()` como puntos de instanciación (C-RUNNER, ratificado
  M3); `python/course_harness.py` (check/check_eq/check_raises/get_llm_calls/
  FakeChatModel, resultado JSON); shim `python/langgraph/` **superficie core** (tabla
  "Core" de C-RUNNER): StateGraph, START/END, MessagesState, add_node/add_edge/
  add_conditional_edges, compile/invoke, esquemas input/output/private, reducers
  (`operator.add`, `add_messages`), límite de recursión, subgraph-como-nodo, mensajes
  (`langchain.messages`). (Superficie avanzada — checkpointer, interrupt, store, tools,
  streaming `messages` — llega en S12. **M3.2/ADR-11**: `stream(subgraphs=True)`/`ns`
  NO es superficie ejecutable en ningún slice; solo bloques ilustrativos en mod15.)
- **CA**: CA-06, CA-07, CA-10 (a nivel de runner, sin UI).
- **Contratos**: produce implementación de C-RUNNER; consume C-CONTENT (solo tipos
  `CodeChallenge`/`LlmDouble` — cerrado).
- **Toca**: `src/runner/**`, `python/**`, `scripts/copy-pyodide.mjs` (ajustes).
- **Depende de**: S0. **Paralelo con S1, S3, S8.**
- **Tests**: integración (navegador/Playwright o vitest browser-mode): solución correcta
  ⇒ pass <10 s (CA-06); incorrecta ⇒ fail con check identificado (CA-07); bucle infinito
  ⇒ timeout; ejemplos del grounding §1–2 ejecutados en el shim producen las salidas
  documentadas (R1); 0 requests externas durante validación (CA-10).

### S7 — UI de reto de código
- **Objetivo**: `ChallengeCard`: editor CodeMirror con starter, botón "ejecutar/validar",
  render de CheckResults (pass/fail/mensajes), stdout, estados del runner (cargando
  entorno, ejecutando, timeout), gating "ver solución" (≥1 intento, CA-09; verla marca
  `solucionVista`, nunca hecho), registro último-intento en progreso.
- **CA**: CA-06/07 (UI), CA-08, CA-09.
- **Contratos**: consume C-RUNNER, C-PROGRESS, C-CONTENT (cerrados). *Comparte C-RUNNER
  con S6 y C-PROGRESS con S3/S4/S5 — permitido porque están cerrados.*
- **Toca**: `src/components/ChallengeCard.tsx` + integración en `ModuloPage`.
- **Depende de**: S2, S3, S6. **Paralelo con S4 y S5.**
- **Tests**: componente con PyRunner mockeado (contrato C-RUNNER): pass ⇒ hecho; luego
  fail ⇒ no-hecho (CA-08); sin intentos ⇒ sin botón solución; con 1 intento ⇒ botón, y
  verla no marca hecho (CA-09).

**Cierre M1 (integrator)**: S0–S7 en PASS ⇒ e2e del vertical completo con mod01: temario
→ módulo → explicación → quiz → reto → módulo "completado" (CA-15) → reload (CA-16) →
reiniciar módulo (CA-17). Build y e2e en verde.

## Milestone M2 — Asistente IA local

### S8 — Cliente Ollama + indicador de estado
- **Objetivo**: `ollamaClient.ts` según C-OLLAMA (health-check `/api/tags` con timeout,
  matching de modelo, parser NDJSON con buffer de líneas, abort); `useOllamaStatus`
  (check al cargar + periódico); `StatusBadge` en el sidebar con los 3 estados en
  español y comandos literales `CMD_SERVE`/`CMD_PULL` (ADR-07); input del chat
  deshabilitado si no "Conectado".
- **CA**: CA-18, CA-19, CA-20, CA-25 (con ADR-06).
- **Contratos**: produce implementación de C-OLLAMA; consume CONFIG.
- **Toca**: `src/assistant/ollamaClient.ts`, `useOllamaStatus.ts`,
  `src/components/StatusBadge.tsx`.
- **Depende de**: S0. **Paralelo con todo M1.**
- **Tests**: unitarios del cliente con fetch mockeado (3 estados, timeout, tags con y
  sin modelo); parser NDJSON con chunks partidos (R4); e2e con mock del proxy: estados
  y textos literales (CA-19/20), badge ≤5 s (CA-18).

### S9 — Chat con streaming + detener + errores
- **Objetivo**: `ChatPanel` + `chatStore` (C-ASSIST sin RAG todavía: `buildPrompt` se
  invoca con `ragHits: []` y `currentModule: null` — la firma ya es la final): enviar,
  render incremental, "detener" (abort, parcial visible), error a mitad de stream ⇒
  mensaje en español + instrucción de recuperación, limpiar conversación, persistencia
  de sesión (sessionStorage, US-16). **M3 (ADR-10)**: `ChatState.status` es campo
  DEPRECADO y muerto — nadie lo lee; el estado de Ollama viene de `useOllamaStatus`.
- **CA**: CA-21, CA-22, CA-26.
- **Contratos**: consume C-OLLAMA (cerrado); produce `chatStore` y esqueleto de
  `buildPrompt` con la firma final de C-ASSIST.
- **Toca**: `src/assistant/chatStore.ts`, `promptBuilder.ts` (esqueleto),
  `src/components/ChatPanel.tsx`.
- **Depende de**: S8.
- **Tests**: store con cliente mockeado: ≥2 actualizaciones incrementales (CA-21),
  stop ≤2 s con parcial intacto (CA-22), error mid-stream ⇒ mensaje legible + app viva
  (CA-26); e2e contra mock NDJSON.

### S10 — RAG + contexto de módulo
- **Objetivo**: `src/rag/` completo (chunker por secciones/headings + MiniSearch,
  `buildRagIndex`/`retrieve` según C-RAG); `buildPrompt` completo (system con módulo
  actual + chunks + reglas A-08 en español); `chatStore.send` conecta
  ruta → módulo actual → retrieve(boost) → prompt.
- **CA**: CA-23, CA-24; refuerza A-05/A-06/A-08.
- **Contratos**: produce implementación de C-RAG; consume C-CONTENT, C-ASSIST
  (cerrados). *Comparte `promptBuilder` con S9: S10 no arranca hasta S9 en PASS.*
- **Toca**: `src/rag/**`, `src/assistant/promptBuilder.ts`, `chatStore.ts` (cableado).
- **Depende de**: S9, S1.
- **Tests**: unitarios de retrieve (query con término de API ⇒ chunk del módulo
  correcto; determinismo; boost del módulo actual); `buildPrompt` puro: incluye id/tema
  del módulo N (CA-23) y ragHits no vacíos en el system (CA-24); e2e: inspección de la
  request al mock ⇒ contexto RAG presente.

### S11 — Feedback Feynman con un clic
- **Objetivo**: activar "pedir feedback" del paso 1: compone
  `buildFeynmanFeedbackMessage`, lo envía por `chatStore`, abre/enfoca el sidebar,
  respuesta en streaming con garantías de CA-21. La lectura de la explicación guardada
  usa la excepción de límites `assistant → progress` (solo lectura, ARCHITECTURE §2).
- **CA**: CA-27 (y A-10).
- **Contratos**: consume C-ASSIST, C-PROGRESS (cerrados).
- **Toca**: `src/components/FeynmanEditor.tsx` (botón), `src/assistant/chatStore.ts`
  (acción), `promptBuilder.ts` (mensaje).
- **Depende de**: S9, S5. **Paralelo con S10** (tocan métodos distintos de chatStore y
  funciones distintas del promptBuilder; si el reviewer detecta colisión real, secuenciar
  S10 → S11).
- **Tests**: clic ⇒ mensaje contiene la explicación guardada; respuesta streamea (mock);
  e2e feliz.

**Cierre M2 (integrator)**: S8–S11 en PASS ⇒ e2e asistente completo con mock y smoke
manual documentado contra Ollama real; verificación de red: solo localhost (CA-25).

## Milestone M3 — Shim avanzado + contenido completo (16/16)

> **Bloqueo previo: RESUELTO (2026-07-05).** El grounding avanzado existe
> (`docs/reference/langgraph-grounding-advanced.md`) y el architect ratificó la tabla
> del shim (C-RUNNER, tablas Core/Avanzado + §superstep, ADR-08). **S12 arrancó y cerró
> en PASS (22/22).**
> **Fix M3.1**: el ejemplo interrupt/resume del grounding-adv §1 declara
> `value: Annotated[list[str], operator.add]` — el oráculo
> `{"value": ["Hello, Alice!", "Done"]}` depende de ese reducer explícito; sin
> `Annotated` la clave se sobreescribe (semántica por defecto del shim, sin cambios).
> **Fix M3.2 (ADR-11)**: `stream(subgraphs=True)`/`ns` NO es superficie ejecutable del
> shim (la mención anterior "ya core" era errónea; nunca se implementó). En mod15 va
> SOLO como bloque ilustrativo; los retos ejecutables usan subgraph-como-nodo (core).
> Reglas de contenido para S13–S15: ver C-CONTENT "Reglas M3 para autores de contenido"
> (harness sin `run_graph`; `enConstruccion` programático; fan-out solo con reducer y
> solo tras S12; acumulación solo con reducer explícito; `subgraphs=True`/`ns`
> ilustrativo; nada fuera de los groundings).

### S12 — Shim avanzado + FakeChatModel completo — **EN PASS**
- **Objetivo**: extender `python/langgraph/` EXACTAMENTE según la tabla "Avanzado" de
  C-RUNNER: `InMemorySaver` + `thread_id` + `get_state`/`get_state_history`;
  `interrupt`/`Command(resume|goto|update)` (nodo se re-ejecuta al reanudar);
  `InMemoryStore` (`put/get/search`, namespace tupla, inyección vía `compile(store=)`);
  `stream_mode="messages"` (tuplas `(chunk, metadata)`, troceo determinista);
  `@tool` (`langchain.tools`), `bind_tools`, `AIMessage.tool_calls`
  (`{name, args, id}`), `ToolMessage`, `ToolNode`, `create_react_agent`;
  FakeChatModel completo (`llmDoubles` + `toolCalls`, ids `call_n`). Incluye el
  **refactor del executor a supersteps atómicos** (ADR-08, C-RUNNER §superstep) con
  `InvalidUpdateError` para escrituras concurrentes sin reducer. **Fuera de alcance
  (ADR-11)**: `stream(subgraphs=True)`/`ns` — el shim responde con error claro en
  español si se solicita.
- **CA**: habilita CA-03/CA-28 para módulos 07–15 (sin CA propio de UI).
- **Contratos**: extiende la implementación de C-RUNNER **sin cambiar la interfaz TS**
  (la tabla del shim es parte del contrato y está CERRADA: cualquier desvío ⇒ architect).
- **Toca**: `python/langgraph/**`, `python/course_harness.py`, tests del runner.
- **Depende de**: S6. (El pre-requisito Context7 está resuelto.)
- **Tests**: (1) regresión: TODA la suite de S6 (ejemplos grounding base §1–2) sigue en
  verde tras el refactor a superstep (R10); (2) ejemplos literales del grounding
  avanzado §1–5 producen las salidas documentadas — el fixture de interrupt/resume usa
  el `State` del §1 corregido, `value: Annotated[list[str], operator.add]`, y espera
  `{"value": ["Hello, Alice!", "Done"]}`; variante SIN reducer ⇒ `{"value": ["Done"]}`
  (sobrescritura, C-RUNNER §superstep M3.1); (3) checkpoint sobrevive entre invokes del
  mismo hilo y NO entre hilos; (4) interrupt→resume re-ejecuta el nodo y devuelve el
  resume value; (5) Store: put/search por namespace, determinista; (6) ciclo
  tool→modelo y ReAct con FakeChatModel (mismos inputs ⇒ mismos resultados, ids
  `call_n` estables); (7) fan-out: dos nodos en un superstep sobre clave con reducer ⇒
  orden determinista; sobre clave sin reducer ⇒ `InvalidUpdateError`.

### S13 — Contenido módulos 03–06
- **Objetivo**: contenido completo (4 secciones, quiz 4–6, 1–2 retos + síntesis) de
  reducers, nodes/edges, conditional edges/ciclos, add_messages. Solo requiere shim core.
  **Regla**: mientras S12 no esté en PASS, PROHIBIDO fan-out paralelo en retos/ejemplos
  ejecutables (reducers se demuestran con updates secuenciales entre supersteps); si un
  reto de mod03 quiere fan-out real, ese reto pasa a depender de S12. Eliminar
  `enConstruccion` y marcadores textuales de mod03–06 (ADR-09). `validationCode` solo
  con `check/check_eq/check_raises/get_llm_calls`. Acumulación solo con reducer
  explícito (regla 5 de C-CONTENT).
- **CA**: CA-02/03/05/28 para mod03–06.
- **Contratos**: consume C-CONTENT (cerrado). Solo añade archivos `modules/mod0X.ts`.
- **Depende de**: S1, S6. **Paralelo con S12, S14*, S15*** (*una vez S12 en PASS).
- **Tests**: contrato del registry ampliado (incluye: mod03–06 sin `enConstruccion`);
  humo: cada `solutionCode` pasa su `validationCode` en el runner real (suite automática
  por módulo).

### S14 — Contenido módulos 07–11
- **Objetivo**: checkpointing, Store, HITL, streaming I y II. Usa shim avanzado (tabla
  "Avanzado" de C-RUNNER como única API permitida; enseñar checkpointer-vs-Store y la
  re-ejecución del nodo al reanudar tal como fija el contrato; en HITL, las claves que
  acumulan llevan reducer explícito — regla 5 de C-CONTENT). Eliminar `enConstruccion`
  de mod07–11.
- **CA**: CA-02/03/05/28 para mod07–11.
- **Depende de**: S1, S12. **Paralelo con S13 y S15** (archivos disjuntos).
- **Tests**: idem S13 (humo de soluciones + contrato + sin `enConstruccion`).

### S15 — Contenido módulos 12–16
- **Objetivo**: tool calling (`@tool`/`bind_tools`/`ToolNode`/`should_continue`),
  ReAct (`create_react_agent`), multi-agente (supervisor y swarm/handoffs SOLO con
  StateGraph + conditional edges + `Command(goto=, update=)` — no hay más API),
  subgraphs y deployment. **mod15 (ADR-11 / regla 6 de C-CONTENT)**: retos EJECUTABLES
  exclusivamente sobre subgraph-como-nodo (grounding base §6, soportado por el shim
  core); `stream(subgraphs=True)`/prefijo `ns` SOLO en bloques ilustrativos con
  "copiar" (sin reto ejecutable, sin validación, sin quiz "output" que exija
  ejecutarlo; el quiz puede evaluarlo conceptualmente). **mod16** conceptual: síntesis
  = quiz de integración, sin shim de `langgraph_sdk`; bloques del SDK solo ilustrativos
  con "copiar". Eliminar `enConstruccion` de mod12–16.
- **CA**: CA-02/03/05/28 para mod12–16.
- **Depende de**: S1, S12. **Paralelo con S13 y S14.**
- **Tests**: idem S13; mod16: test de contrato acepta síntesis-quiz (CA-03); auditoría
  mod15: ningún `starterCode`/`solutionCode`/`validationCode` contiene `subgraphs=True`
  (ADR-11).

**Cierre M3 (integrator)**: S12–S15 en PASS ⇒ suite completa: CA-01 con verificación
PROGRAMÁTICA de "sin stubs": `COURSE_MODULES.every(m => m.enConstruccion !== true)` y
ningún `contenidoMd` contiene el literal "EN CONSTRUCCIÓN" (ADR-09); humo de las 16
soluciones; e2e global; auditoría CA-28 (contra grounding base + avanzado, incl.
ausencia de `subgraphs=True` en código ejecutable de mod15, ADR-11) y CA-05 sobre todo
el contenido; verificación final CA-10/25 (panel de red limpio). Fin del producto según
PRD §1–§11.

## Milestone M4 — Enriquecimiento guiado (PRD §12, CA-30..CA-39)

> **Contratos CERRADOS (2026-07-06):** el delta ADITIVO de C-CONTENT está en
> `ARCHITECTURE.md` §8 (tipos `PasoGuiado`/`UsaLaIaBlock`/`TutorialLocal`/`SpinePaso`,
> enumeración canónica ADR-13, reglas de verificación §8.5, ADR-12..ADR-15). Todos los
> campos son OPCIONALES ⇒ Gate contratos superado sin re-bloquear a M1–M3 (los 16 módulos
> y sus tests en PASS siguen compilando y verdes). **SE0 debe cerrar antes de paralelizar
> cualquier contenido enriquecido**: es el único slice que toca `types.ts`, `traversal.ts`
> y `selectors.ts` (infra compartida). Tras SE0, SE1–SE4 solo AÑADEN archivos de contenido
> (disjuntos) ⇒ paralelizables. **Gate humano**: SE2–SE4 no arrancan hasta que el humano
> apruebe el estilo del piloto SE1 (PRD §12.7).

### SE0 — Infra de enriquecimiento (contrato + enumeración + glue UI)
- **Objetivo**: (1) transcribir el delta §8.2 en `src/content/types.ts` (campos opcionales
  `enriquecido?`/`usaLaIa?`/`tutorialLocal?` en `CourseModule`; `pasos?` en las 4 secciones;
  tipos nuevos) — y corregir el comentario stale `run_graph` (nota §8.8); (2) crear
  `src/content/traversal.ts` con la enumeración canónica `getModulePasos`/
  `getModuleChallenges`/`getModuleQuizzes` (ADR-13); (3) refactorizar
  `progress/selectors.ts` para delegar en `traversal.ts` (sin cambiar C-PROGRESS);
  (4) glue presentacional en `ModuloPage`: wrappers finos `PasoView`, `UsaLaIaView`,
  `TutorialLocalView` que reutilizan `MarkdownView`/`CodeBlock`/`ChallengeCard`/`QuizCard`
  (sin UI nueva compleja, §8.6); (5) extender el smoke de soluciones para recorrer
  `getModuleChallenges` (incluye pasos, CA-32). **Ningún módulo se enriquece en SE0** (solo
  infra): el registry no cambia de veredicto.
- **CA**: habilita CA-30..CA-39 (sin CA propio); **protege CA-39** con el test de
  equivalencia de enumeración.
- **Contratos**: extiende la IMPLEMENTACIÓN de C-CONTENT según §8 (contrato ya cerrado por
  el architect); consume C-PROGRESS, C-RUNNER (sin cambiarlos).
- **Toca**: `src/content/types.ts`, `src/content/traversal.ts` (nuevo),
  `src/progress/selectors.ts`, `src/pages/ModuloPage.tsx` (+ wrappers), smoke del runner.
- **Depende de**: S2, S3, S6 (todos en PASS). **Paralelo con M3 si conviene** (no comparte
  archivos de contenido; sí toca `selectors.ts` y `types.ts` ⇒ coordinar con S13–S15 en
  vuelo: si están abiertos, secuenciar SE0 tras el cierre de M3 para evitar colisión en
  `types.ts`).
- **Tests**: (a) **equivalencia**: para todo módulo SIN `pasos`,
  `getModuleChallenges`/`getModuleQuizzes` === conjunto de ids de `challengeIdsOf`/
  `quizIdsOf` previos ⇒ tests de S3 y smoke previo intactos (CA-39); (b) tipos: un
  `CourseModule` sin campos nuevos compila (retrocompat); (c) un módulo fixture CON `pasos`
  (ejercicio + quiz) ⇒ sus ids aparecen en la enumeración y afectan `moduleStatus`;
  (d) `ModuloPage` renderiza pasos/usaLaIa/tutorialLocal de un fixture sin romper CA-02
  (siguen las 4 secciones en orden).

### SE1 — Piloto: enriquecer mod01–03
- **Objetivo**: enriquecer mod01, mod02 y mod03 al formato §12: marcarlos
  `enriquecido: true`; añadir `pasos` (≥5 por módulo, mini-explicaciones ≤120 palabras,
  ≥3 mini-ejercicios `CodeChallenge` incrementales por módulo); ≥1 bloque `usaLaIa`;
  `tutorialLocal` con setup PowerShell+bash, código LangGraph real (mod01: scaffolding del
  project spine — venv + `src/state.py`/`src/graph.py`/`src/main.py` + `requirements.txt`;
  mod01–03 sin LLM ⇒ sin `ChatOllama`), salida esperada y `spine`. Coherencia app↔máquina
  (CA-37): los símbolos del tutorial ⊆ los de los retos del módulo. Solo shim core.
- **CA**: CA-30..CA-39 para mod01–03.
- **Contratos**: consume C-CONTENT extendido (§8), C-RUNNER (para el smoke). Solo modifica
  `modules/mod01.ts`, `mod02.ts`, `mod03.ts`.
- **Depende de**: SE0 (y S1 para mod01–02, S13 para mod03 — ya en PASS al cierre de M3).
- **Tests**: reglas §8.5 sobre mod01–03 (CA-30..CA-38); smoke: cada `solutionCode` de cada
  mini-ejercicio pasa su `validationCode` en el runner real (CA-32); regresión CA-01..CA-29
  + equivalencia (CA-39); CA-38 continuidad del spine mod01→02→03.
- **Gate de fase (PRD §12.7)**: CA-30..CA-39 en verde en mod01–03 **y aprobación humana**
  del estilo antes de lanzar SE2–SE4.

### SE2 — Enriquecer mod04–06
- **Objetivo**: mismo formato §12 para nodes/edges, conditional edges/ciclos, add_messages
  (mod04–06). Solo shim core. Continúa el project spine desde mod03 (CA-38).
- **CA**: CA-30..CA-39 para mod04–06.
- **Contratos**: consume C-CONTENT extendido, C-RUNNER. Solo modifica `mod04–06.ts`.
- **Depende de**: SE1 (gate humano). **Paralelo con SE3 y SE4** (archivos disjuntos).
- **Tests**: reglas §8.5 sobre mod04–06; smoke de mini-ejercicios; CA-38 continuidad.

### SE3 — Enriquecer mod07–11
- **Objetivo**: formato §12 para checkpointing, Store, HITL, streaming I/II (mod07–11).
  Usa shim avanzado (S12) en los mini-ejercicios; el `tutorialLocal` puede introducir
  `ChatOllama` donde el módulo use LLM (regla dura §8.4: ChatOllama SOLO en tutorial,
  nunca en retos ejecutables). Continúa el spine (CA-38).
- **CA**: CA-30..CA-39 para mod07–11.
- **Contratos**: consume C-CONTENT extendido, C-RUNNER (shim avanzado, S12). Solo modifica
  `mod07–11.ts`.
- **Depende de**: SE1 (gate humano), S12. **Paralelo con SE2 y SE4.**
- **Tests**: reglas §8.5; smoke; CA-36/37 (fidelidad y coherencia app↔máquina, incl.
  `ChatOllama` de `langchain_ollama`, 0 cloud); CA-38 continuidad.

### SE4 — Enriquecer mod12–16
- **Objetivo**: formato §12 para tool calling, ReAct, multi-agente, subgraphs, deployment
  (mod12–16). Shim avanzado (S12). **mod15**: mini-ejercicios ejecutables SOLO con
  subgraph-como-nodo (ADR-11); `subgraphs=True`/`ns` no aparece en código ejecutable.
  **mod16** conceptual: CA-31 permite sustituir mini-ejercicios por micro-quizzes
  (excepción §8.5); el tutorial local puede ser ilustrativo del SDK (no ejecutable).
  `tutorialLocal` con `ChatOllama` donde aplique (mod12–14). Cierra el project spine
  (proyecto terminado y ejecutable en la máquina del alumno, CA-38).
- **CA**: CA-30..CA-39 para mod12–16 (CA-31 con excepción mod16).
- **Contratos**: consume C-CONTENT extendido, C-RUNNER (shim avanzado). Solo modifica
  `mod12–16.ts`.
- **Depende de**: SE1 (gate humano), S12. **Paralelo con SE2 y SE3.**
- **Tests**: reglas §8.5; smoke (mod16: micro-quizzes en lugar de mini-ejercicios);
  auditoría mod15 (0 `subgraphs=True` en código ejecutable); CA-36/37; CA-38 (spine final,
  sin saltos desde mod01).

**Cierre M4 (integrator)**: SE0–SE4 en PASS ⇒ CA-30..CA-39 verdes en los 16 módulos
enriquecidos; smoke de TODOS los mini-ejercicios; regresión completa CA-01..CA-29 (CA-39);
auditoría CA-36/37 (allowlist shim + `ChatOllama`, 0 cloud) y CA-38 (spine continuo
mod01→mod16); e2e: un módulo enriquecido navega pasos → mini-ejercicio (runner) → "Usa la
IA" (prompt copiable al chat existente) → "En tu máquina" (bloques copiables). Build y e2e
en verde. Fin del enriquecimiento según PRD §12.

## Milestone M5 — Fallback in-browser del asistente (WebLLM/WebGPU, PRD §13)

> **Contratos CERRADOS (2026-07-09):** C-WEBLLM (cliente WebLLM en Web Worker) y
> C-ENGINE (selector de motor) + deltas ADITIVOS de C-ASSIST y CONFIG, definidos en
> **`docs/arch/ARCHITECTURE-M5-WEBLLM.md`** (extensión normativa §9 de ARCHITECTURE.md;
> mismo rango que §4). **C-OLLAMA no cambia ni una firma** (ADR-16): el health-check
> sigue siendo la única fuente del estado de Ollama, también con el fallback activo
> (así se detecta el retorno, CA-46). Todos los cambios de tipos son aditivos ⇒ S8–S11
> en PASS siguen compilando y verdes.
> **Paralelización**: SF1 ∥ SF2 tras el cierre de contratos (archivos disjuntos; SF2
> usa un `WebLlmClient` fake conforme a C-WEBLLM hasta integrar SF1). **SF3 requiere
> SF1+SF2 en PASS** (cablea `chatStore` con `engineStore` y el cliente real).
> **Strings**: TODOS los literales M5 (§9.7, incl. los avisos que consumirá SF3) los
> añade SF2 a `src/app/strings.ts` — único slice M5 que toca ese archivo.

### SF1 — Cliente WebLLM + worker (C-WEBLLM)
- **Objetivo**: `src/assistant/webllmClient.ts` + `webllm.worker.ts` según C-WEBLLM
  (§9.3): `detectSupport` (navigator.gpu + requestAdapter, sin red), `isModelCached`
  (`hasModelInCache`), `load` vía `CreateWebWorkerMLCEngine` con el model id de
  `CONFIG.webllm.model` (CA-48) y progreso 0–100 monótono (CA-42), `cancelLoad` por
  `worker.terminate()` + re-init lazy (CA-43, patrón C-RUNNER/ADR-17), `chatStream`
  (AsyncGenerator → onToken; abort → `interruptGenerate()` ≤2 s sin onError, parcial
  intacto; errores mapeados a `EngineStreamError`), `unload`; appConfig custom si
  `VITE_WEBLLM_MODEL_URL`+`VITE_WEBLLM_MODEL_LIB_URL` están definidos (ADR-18);
  `CONFIG.webllm` en `src/config.ts` (§9.6); dependencia `@mlc-ai/web-llm` con versión
  EXACTA pineada (R14).
- **CA**: CA-42, CA-43, CA-44 (a nivel de cliente, sin UI), CA-47 (GET-only por
  construcción; verificación e2e de red en el cierre M5), CA-48.
- **Contratos**: produce la implementación de C-WEBLLM; consume CONFIG (delta cerrado).
  No toca C-OLLAMA ni chatStore.
- **Toca**: `src/assistant/webllmClient.ts` (nuevo), `src/assistant/webllm.worker.ts`
  (nuevo), `src/config.ts` (claves `webllm`), `package.json` (dep pineada).
- **Depende de**: S0 (y S8 solo por convivir en `src/assistant/`, sin archivos
  compartidos). **Paralelo con SF2.**
- **Tests**: unitarios con engine/worker fakes inyectables: progreso monótono no
  decreciente 0→100 (CA-42); `cancelLoad` ⇒ terminate y el `load` pendiente rechaza
  `"cancelado"` (CA-43); abort de `chatStream` ⇒ sin onError y parcial intacto (CA-22
  para CA-44); error del engine ⇒ `onError(kind:"engine")`; init GPU fallida ⇒ rechaza
  `"gpu"` (SU-11); override construye appConfig con el id exacto y las URLs custom
  (CA-48/ADR-18); test de contrato: `CONFIG.webllm.model` existe en
  `prebuiltAppConfig.model_list` (R14). Smoke manual documentado con GPU real.

### SF2 — Selector de motor + oferta/descarga + badge (C-ENGINE)
- **Objetivo**: `engineStore` con la máquina de estados NORMATIVA (§9.4.1: E1–E8, con
  `WebLlmClient` inyectable), `selectActiveEngine` e `isChatEnabled` puros,
  `useAssistantEngine` (hook fino, ÚNICA instancia en `Layout`), `StatusBadge` extendido
  (props `AssistantEngine`; label `"Respaldo WebGPU activo"` cuando `active==="webllm"`;
  literales y comandos CA-19/20 EXACTOS en estados terminales), `WebGpuFallbackCard`
  (oferta con tamaño estimado MB/GB, progreso con cancelar, reintento; §9.8), TODOS los
  strings M5 (§9.7) y cableado de `Layout` (pasa el snapshot por props; `ChatPanel`
  sigue recibiendo `engine.ollama` como interino hasta SF3).
- **CA**: CA-40, CA-41, CA-42 (UI), CA-43 (UI), CA-45 (parte badge).
- **Contratos**: produce la implementación de C-ENGINE; consume C-WEBLLM (cerrado;
  client fake hasta integrar SF1) y C-OLLAMA (solo lectura de `OllamaStatus`, sin
  cambios).
- **Toca**: `src/assistant/engineStore.ts` (nuevo), `useAssistantEngine.ts` (nuevo),
  `src/components/StatusBadge.tsx`, `src/components/WebGpuFallbackCard.tsx` (nuevo),
  `src/app/strings.ts`, `src/app/Layout.tsx`.
- **Depende de**: S8 (en PASS). **Paralelo con SF1.**
- **Tests**: unitarios de la máquina de estados (tabla E1–E8: `checking` no dispara
  nada; `connected` retira la oferta pero NO aborta un `fetching` (CA-46); degradado +
  `inactive` ⇒ detect/cache ⇒ `offer`|`fetching` en ≤3 s (CA-40a/b); sin WebGPU o
  `enabled=false` ⇒ `unsupported`/`inactive` con 0 llamadas a `load` (CA-41);
  `cancelled` estable sin auto-reintento; init GPU fallida ⇒ `unsupported` (SU-11));
  `selectActiveEngine` tabla de verdad (incl. `checking` mantiene `prev`); componente:
  oferta muestra tamaño en MB/GB y botón (CA-40b); progreso con ≥1 actualización por
  cada 10% (CA-42); cancelar ⇒ vuelve a literales CA-19/20 con oferta accesible
  (CA-43/CA-41); badge muestra literal que contiene `WebGPU`, distinto de los 3
  existentes (CA-45); e2e con client fake: durante una "descarga" se navega a otro
  módulo y se responde un quiz (CA-42 no bloquea).

### SF3 — Chat vía WebGPU + conmutación con avisos (delta C-ASSIST)
- **Objetivo**: `chatStore` según §9.5: selección de motor POR MENSAJE en `send()`
  (ADR-19; `active===null` ⇒ no-op), mensaje assistant etiquetado con `engine`,
  historial excluye avisos, error string por motor (`errorStream` /
  `errorStreamWebGpu`), `appendEngineNotice` + suscripción a cambios de `active` con la
  regla normativa de anuncio (todo cambio a motor no-null distinto del último anunciado,
  salvo el primer `"ollama"` de la sesión); `ChatPanel` habilitado vía
  `isChatEnabled(engine)` (sustituye y elimina `isChatInputDisabled`); paridad completa
  con WebLLM: `buildPrompt` y `sendFeynmanFeedback` SIN cambios (CA-23/24/27 heredados).
- **CA**: CA-44 (paridad completa CA-21/22/23/24/27 vía WebGPU), CA-45 (avisos en el
  hilo), CA-46; regresión CA-19/20/25/26 (CA-25 con la excepción acotada de CA-47).
- **Contratos**: consume C-ENGINE, C-WEBLLM y el delta C-ASSIST (todos cerrados).
  Comparte `chatStore` con S9/S10/S11 (cerrados, en PASS) — solo se permite porque los
  contratos están fijos.
- **Toca**: `src/assistant/chatStore.ts`, `src/components/ChatPanel.tsx`,
  `src/components/StatusBadge.tsx` (retirada de `isChatInputDisabled`),
  `src/app/Layout.tsx` (prop de ChatPanel), tests afectados de S9.
- **Depende de**: SF1, SF2 (ambos en PASS) + S9/S10/S11 (en PASS).
- **Tests**: store con AMBOS clientes fake: con `connected` ⇒ el send va al cliente
  Ollama (request a `/ollama`, CA-46 verificable); degradado + `ready` ⇒ va al cliente
  WebLLM; una generación en curso NO se corta al conmutar en ningún sentido (CA-46);
  avisos: degradado→`ready` ⇒ aviso que nombra WebGPU en ≤10 s; `ready`→`connected` ⇒
  siguiente send por Ollama + aviso que nombra Ollama; primer `connected` de sesión ⇒
  SIN aviso (CA-45); el historial enviado al motor excluye mensajes con `aviso`;
  paridad: prompt vía WebLLM incluye módulo actual y ragHits no vacíos (CA-23/24 ⇒
  CA-44); stop ≤2 s con parcial visible (CA-22); feedback Feynman vía WebLLM (CA-27);
  ≥2 actualizaciones incrementales (CA-21); e2e con mocks de ambos motores (caída de
  Ollama simulada ⇒ oferta ⇒ activación fake ⇒ chat ⇒ recuperación ⇒ retorno).

**Cierre M5 (integrator)**: SF1–SF3 en PASS ⇒ e2e completo con mocks: degradación →
oferta (0 requests al host de artefactos antes de aceptar, CA-40/41) → descarga fake con
progreso y cancelación (CA-42/43) → chat vía WebGPU con RAG/módulo/feedback (CA-44) →
recuperación de Ollama → retorno automático con aviso (CA-45/46); regresión completa
CA-18..CA-27 (CA-19/20 con fallback deshabilitado y con WebGPU no soportado, CA-41);
verificación de red (Playwright): 0 requests externas salvo GET de artefactos tras
aceptar la oferta y 0 con modelo cacheado (CA-47/CA-25); test de contrato del model id
(CA-48/R14); smoke manual documentado con GPU real + Ollama real (apagar/encender
`ollama serve` durante una sesión). Build y e2e en verde. Fin del fallback según PRD §13.

## Resumen de paralelización (Gate 2 ya superado para todos)

| Tras PASS de… | Pueden ir EN PARALELO |
|---|---|
| S0 | S1, S3, S6, S8 |
| S1+S3 (y S6 para S7) | S2 → luego S4, S5, S7 |
| S8 | S9 (M2 avanza en paralelo con M1 desde S8) |
| S9 | S10, S11 (S11 requiere también S5) |
| S6 (Context7 resuelto, tabla ratificada) | S12; S13 en paralelo desde S1+S6 (sin fan-out hasta S12) |
| S12 (en PASS) | S13 ∥ S14 ∥ S15 |
| S2+S3+S6 (M4) | SE0 (infra; coordinar `types.ts` con S13–S15 en vuelo) |
| SE0 + gate humano del piloto | SE2 ∥ SE3 ∥ SE4 (SE1 va primero: piloto mod01–03) |
| S8–S11 en PASS + contratos M5 cerrados (2026-07-09) | SF1 ∥ SF2 |
| SF1 + SF2 | SF3 (único consumidor del delta C-ASSIST M5) |

**Contratos compartidos ya cerrados** (ninguno bloquea, pero cambiarlos re-bloquea a
todos sus consumidores): C-CONTENT (+ delta §8, cerrado M4) → S1,S2,S4,S5,S7,S10,S13–S15,
SE0–SE4 · C-PROGRESS → S3,S4,S5,S7,S11,SE0 · C-RUNNER (+tablas shim, cerradas en M3) →
S6,S7,S12–S15,SE0–SE4 · C-OLLAMA → S8,S9 (M5: SF2/SF3 lo consumen en SOLO lectura, sin
cambios) · C-ASSIST (+ delta M5, cerrado 2026-07-09) → S9,S10,S11,SF3 · C-RAG → S10 ·
C-WEBLLM (M5) → SF1,SF2,SF3 · C-ENGINE (M5) → SF2,SF3.
