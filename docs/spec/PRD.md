# PRD — Curso interactivo de LangGraph (método Feynman) + Asistente IA local

> Fuente de verdad de PRODUCTO. Decisiones ya fijadas en `docs/reference/DECISIONS.md`
> (no re-decidir). Grounding de API en `docs/reference/langgraph-grounding.md`.
> Idioma del contenido y la UI: **español**.

---

## 1. Contexto y problema

Los desarrolladores Python que quieren dominar LangGraph se encuentran con documentación
extensa, en inglés, fragmentada entre conceptos (state, checkpointing, HITL, streaming,
multi-agente) y sin un camino de práctica guiada que verifique comprensión real. Leer
docs no equivale a saber construir grafos.

**Producto**: una web app en español que enseña LangGraph de fundamentos a avanzado
aplicando el **método Feynman** (explicar simple → detectar gaps → llenar gaps →
refinar), con **ejercicios mixtos** (retos de código Python verificables + quizzes
conceptuales) y un **asistente IA 100% local** (Ollama + `qwen2.5-coder:14b`) en una
barra lateral que responde dudas con RAG sobre el contenido del curso.

## 2. Objetivos de producto

- **O1**: El alumno que completa el curso puede construir, sin consultar soluciones,
  grafos LangGraph con estado tipado, routing condicional, persistencia, HITL,
  streaming, tool calling, multi-agente y subgraphs, usando la API vigente del grounding.
- **O2**: Cada módulo verifica comprensión de forma automática y objetiva: ningún
  ejercicio requiere juicio humano para marcar "hecho".
- **O3**: Toda la experiencia funciona offline/local: sin cuentas, sin cloud, sin envío
  de datos fuera de la máquina del alumno.
- **O4**: El asistente reduce la fricción de dudas: respuestas contextualizadas al
  módulo actual, en streaming, con instrucciones claras de recuperación si Ollama no
  está disponible.

## 3. Personas

| Persona | Descripción | Job-to-be-done |
|---|---|---|
| **P1 — Dev Python intermedio** (primaria) | Sabe Python (typing, funciones, dicts), poca o nula experiencia con LangChain/LangGraph. | "Quiero dominar LangGraph de forma práctica y verificable sin perderme en docs en inglés." |
| **P2 — Dev con LangChain previo** | Ya usa LLMs/LangChain, quiere formalizar agentes con grafos. | "Quiero saltar directo a persistencia, HITL y multi-agente sin repetir lo básico." |

Requisito derivado de P2: navegación libre entre módulos (el orden es recomendado, no
forzado), aunque el progreso se registre por módulo.

## 4. User stories priorizadas

Prioridad: **M** = must, **S** = should, **C** = could.

### Curso

- **US-01 (M)** — Como alumno quiero ver el temario completo con mi progreso por módulo
  para saber dónde estoy y qué me falta.
- **US-02 (M)** — Como alumno quiero recorrer cada módulo con la estructura Feynman
  (explicación simple → detección de gaps → profundización → refinamiento) para
  comprender de verdad y no solo leer.
- **US-03 (M)** — Como alumno quiero resolver retos de código Python con validación
  automática y feedback inmediato para saber objetivamente si lo hice bien.
- **US-04 (M)** — Como alumno quiero responder quizzes conceptuales con corrección
  automática y explicación de la respuesta correcta para consolidar teoría.
- **US-05 (M)** — Como alumno quiero que mi progreso (módulos, ejercicios, quizzes)
  persista entre sesiones en mi navegador para no perder avance al recargar o volver
  otro día.
- **US-06 (M)** — Como alumno quiero escribir mi propia explicación Feynman (paso 1) de
  cada concepto para forzarme a detectar lo que no entiendo.
- **US-07 (S)** — Como alumno (P2) quiero navegar libremente a cualquier módulo para
  saltar lo que ya domino.
- **US-08 (S)** — Como alumno quiero ver la solución de referencia de un reto tras
  intentarlo para comparar con mi enfoque.
- **US-09 (S)** — Como alumno quiero copiar cualquier bloque de código con un clic para
  probarlo en mi entorno local.
- **US-10 (C)** — Como alumno quiero reiniciar el progreso de un módulo o del curso
  completo para repetirlo desde cero.

### Asistente IA lateral

- **US-11 (M)** — Como alumno quiero preguntar dudas en un chat lateral y recibir
  respuestas en streaming basadas en el contenido del curso para desbloquearme sin
  salir de la app.
- **US-12 (M)** — Como alumno quiero ver el estado del modelo local (disponible /
  no disponible / modelo no instalado) para saber si puedo usar el asistente.
- **US-13 (M)** — Como alumno quiero instrucciones exactas de recuperación cuando
  Ollama no responde (`ollama serve`, `ollama pull qwen2.5-coder:14b`) para arreglarlo
  yo mismo.
- **US-14 (S)** — Como alumno quiero que el asistente conozca el módulo que estoy
  viendo para no tener que dar contexto en cada pregunta.
- **US-15 (S)** — Como alumno quiero pedir al asistente feedback sobre mi explicación
  Feynman para detectar gaps que no veo solo.
- **US-16 (C)** — Como alumno quiero que la conversación del chat persista durante la
  sesión (y se pueda limpiar) para retomar el hilo entre módulos.

## 5. Estructura pedagógica

### 5.1 Método Feynman por módulo (obligatorio, mismos 4 pasos siempre)

Cada módulo tiene exactamente estas secciones, en este orden:

1. **Explica simple** (Feynman paso 1): explicación del concepto en lenguaje llano,
   con una analogía cotidiana, SIN jerga no definida previamente. Al final, el alumno
   escribe su propia explicación en un cuadro de texto ("explícaselo a alguien que no
   programa"). Mínimo exigido: 200 caracteres para marcarse como completado. No hay
   corrección automática del contenido; opcionalmente puede pedir feedback al asistente
   (US-15).
2. **Detecta tus gaps** (Feynman paso 2): quiz conceptual de 4–6 preguntas
   (multiple-choice / verdadero-falso / predicción de salida de código) diseñadas para
   exponer malentendidos típicos del concepto. Corrección automática inmediata.
3. **Llena los gaps** (Feynman paso 3): profundización técnica con la API real
   (código canónico del grounding), casos borde, errores comunes, y 1–2 **retos de
   código** con validación automática.
4. **Refina y simplifica** (Feynman paso 4): resumen del módulo en ≤10 bullets +
   1 reto de síntesis (código o quiz de integración) que combina el concepto con los
   de módulos anteriores.

### 5.2 Ejercicios mixtos — contrato de "hecho"

**Reto de código (Python)**
- Enunciado + esqueleto de código con huecos (`# TODO`) + criterio de validación.
- La validación es **automática y determinista**: la app evalúa el código del alumno
  contra aserciones definidas por el ejercicio y devuelve **pass/fail + mensaje de
  error concreto** (qué aserción falló). Sin juicio humano.
- Ningún reto requiere un LLM cloud para validarse. En módulos donde el grafo invoca
  un LLM (tool calling, ReAct, multi-agente), la validación usa dobles deterministas
  (respuestas simuladas provistas por el ejercicio); la ejecución "en vivo" contra
  Ollama es opcional y no afecta el estado hecho/no hecho.
- Intentos ilimitados. "Hecho" = último intento en pass.
- Botón "ver solución" disponible solo después de ≥1 intento fallido o ≥1 intento
  ejecutado (US-08); ver la solución no marca el reto como hecho.

**Quiz conceptual**
- Preguntas cerradas con corrección automática (una única respuesta correcta o conjunto
  exacto en multi-selección).
- Al responder, se muestra si es correcta y una explicación de por qué (siempre, tanto
  en acierto como en fallo).
- "Hecho" = ≥80% de aciertos en el quiz; se puede repetir ilimitadamente (cuenta el
  mejor resultado).

**Módulo completado** = paso 1 (explicación propia guardada) + todos los quizzes en
≥80% + todos los retos de código en pass.

## 6. Temario (16 módulos)

Alineado 1:1 con `docs/reference/DECISIONS.md` y el grounding. Objetivo de aprendizaje
= lo que el alumno sabe HACER al terminar.

| # | Módulo | Objetivo de aprendizaje |
|---|---|---|
| 01 | ¿Qué es LangGraph? Grafos vs. cadenas | Explicar cuándo un problema necesita un grafo (ciclos, estado, control) y no una cadena lineal; identificar los componentes: state, nodes, edges. |
| 02 | El estado: TypedDict y esquemas | Definir estados tipados con `TypedDict`; usar esquemas input/output/private de un grafo. |
| 03 | Reducers: cómo se fusiona el estado | Usar `Annotated` con reducers (`operator.add`, `add_messages`) y predecir el estado resultante tras varias actualizaciones. |
| 04 | Nodes y edges: construir el primer grafo | Construir con `StateGraph`, `add_node`, `add_edge`, `START`/`END`; `compile()` e `invoke()` un grafo lineal. |
| 05 | Conditional edges y ciclos | Implementar routing con `add_conditional_edges` y funciones de ruta (`Literal`), incluyendo loops con condición de parada. |
| 06 | Estado conversacional: `add_messages` | Modelar conversaciones con `messages: Annotated[list[AnyMessage], add_messages]` y explicar su semántica (append + update por id). |
| 07 | Checkpointing y persistencia | Compilar con `InMemorySaver`, usar `thread_id` en `config`, y demostrar que el estado sobrevive entre invocaciones del mismo hilo. |
| 08 | Memoria de corto y largo plazo (Store) | Distinguir memoria de hilo (checkpointer) de memoria entre hilos (`Store`); guardar y recuperar memorias de largo plazo. |
| 09 | Human-in-the-loop: `interrupt` y `Command` | Pausar un grafo con `interrupt(...)` dentro de un nodo y reanudarlo con `Command(resume=...)`. |
| 10 | Streaming I: `values` y `updates` | Consumir `graph.stream(...)` con `stream_mode="values"` y `"updates"` y explicar qué emite cada modo. |
| 11 | Streaming II: `messages` y `custom` | Streamear tokens (`messages`) y eventos propios con `get_stream_writer()` (`custom`), combinando modos. |
| 12 | Tool calling: `ToolNode` y herramientas | Definir tools, conectarlas con `ToolNode` y cerrar el ciclo modelo→tool→modelo. |
| 13 | Agentes ReAct: `create_react_agent` | Crear un agente ReAct con `create_react_agent`, y explicar el loop razonamiento/acción que ejecuta por dentro. |
| 14 | Multi-agente: supervisor, swarm y handoffs | Diseñar sistemas multi-agente con patrón supervisor y handoffs vía `Command`; comparar supervisor vs. swarm. |
| 15 | Subgraphs: composición de grafos | Usar un grafo compilado como nodo de otro; compartir claves de estado padre/hijo; streamear con `subgraphs=True` distinguiendo por `ns`. |
| 16 | Deployment: `langgraph.json` y Platform | Describir la estructura de `langgraph.json`, y consumir un deployment con el SDK (`get_sync_client`, `runs.stream`). |

Reglas de contenido:
- Todo ejemplo de código usa exclusivamente la API del grounding; si un módulo necesita
  más profundidad de API que la disponible, se pide consulta Context7 adicional al
  orquestador — **no se inventa API**.
- El módulo 16 es principalmente conceptual/quiz (no se exige deployment real).

## 7. Requisitos del asistente IA lateral

| ID | Requisito |
|---|---|
| A-01 | Motor: Ollama local en `http://localhost:11434`. Modelo por defecto `qwen2.5-coder:14b`, con override por configuración/env. Sin ningún proveedor cloud. |
| A-02 | Health-check vía `GET /api/tags` al cargar la app y de forma periódica/reintento; chat vía `POST /api/chat` con streaming NDJSON. |
| A-03 | Indicador de estado siempre visible en el sidebar con 3 estados: **Conectado** (Ollama responde y el modelo está en `/api/tags`), **Modelo no instalado** (Ollama responde pero falta el modelo), **Sin conexión** (Ollama no responde). |
| A-04 | Degradación con gracia: en "Sin conexión" el chat se deshabilita y muestra el comando `ollama serve`; en "Modelo no instalado" muestra `ollama pull qwen2.5-coder:14b`. La app del curso sigue 100% funcional sin asistente. |
| A-05 | RAG sobre el contenido del curso: cada respuesta se construye con fragmentos relevantes de los módulos como contexto. El asistente responde en español y prioriza el contenido del curso sobre conocimiento general. |
| A-06 | Contexto de ubicación: el módulo actualmente abierto se incluye como contexto prioritario de la conversación (US-14). |
| A-07 | Streaming de tokens: la respuesta se pinta incrementalmente; existe control para detener la generación en curso. |
| A-08 | Si la pregunta está fuera del alcance del curso/LangGraph, el asistente lo dice y redirige al temario (comportamiento definido por system prompt). |
| A-09 | Privacidad: cero peticiones de red a dominios externos originadas por el asistente; todo ocurre entre el navegador y `localhost`. |
| A-10 | Feedback Feynman (US-15): desde el paso 1 de un módulo, el alumno puede enviar su explicación al asistente con un solo clic para recibir crítica de gaps. |

## 8. Criterios de aceptación (medibles, numerados)

Formato Given/When/Then u observable numérico. Cada CA debe poder convertirse en test
sin reinterpretación.

### Curso y navegación

- **CA-01**: Given la app cargada, When se abre la vista de temario, Then se listan
  exactamente 16 módulos, cada uno con título, objetivo de aprendizaje y estado de
  progreso (no iniciado / en curso / completado).
- **CA-02**: Given cualquier módulo, When se abre, Then contiene las 4 secciones
  Feynman en el orden: "Explica simple", "Detecta tus gaps", "Llena los gaps",
  "Refina y simplifica".
- **CA-03**: Given cualquier módulo, Then contiene ≥1 quiz de 4–6 preguntas (paso 2)
  y ≥1 reto de código con validación automática (paso 3), salvo el módulo 16, que
  puede sustituir el reto de código por un quiz de integración.
- **CA-04**: Given un alumno en cualquier vista, When hace clic en cualquier módulo del
  temario, Then navega a él sin restricción de orden (no hay módulos bloqueados).
- **CA-05**: Toda la UI y el contenido visible están en español (0 strings de UI en
  inglés, excluyendo código fuente, nombres de API y comandos).

### Ejercicios — reto de código

- **CA-06**: Given un reto de código con una solución correcta, When el alumno la envía,
  Then el sistema muestra "pass" y marca el reto como hecho en <10 s.
- **CA-07**: Given un reto de código con una solución incorrecta, When el alumno la
  envía, Then el sistema muestra "fail" con al menos un mensaje que identifica la
  aserción o comprobación fallida (no un error genérico).
- **CA-08**: Given un reto ya en pass, When el alumno envía una solución que falla,
  Then el estado del reto pasa a no-hecho (cuenta el último intento).
- **CA-09**: Given un reto sin ningún intento, Then el botón "ver solución" no está
  disponible; When existe ≥1 intento, Then sí lo está; y ver la solución nunca cambia
  el estado del reto a hecho.
- **CA-10**: Ningún reto de código realiza llamadas de red fuera de `localhost` durante
  su validación (verificable con el panel de red: 0 requests externas).

### Ejercicios — quiz

- **CA-11**: Given una pregunta de quiz, When el alumno responde, Then se indica
  correcta/incorrecta y se muestra la explicación asociada en ambos casos.
- **CA-12**: Given un quiz respondido con ≥80% de aciertos, Then el quiz queda marcado
  como hecho; con <80%, queda como no hecho y puede repetirse; el estado refleja
  siempre el mejor resultado alcanzado.

### Explicación Feynman (paso 1)

- **CA-13**: Given el cuadro de explicación propia, When el texto guardado tiene ≥200
  caracteres, Then el paso 1 se marca como completado; con <200, no.
- **CA-14**: Given una explicación guardada, When el alumno recarga la página, Then el
  texto reaparece íntegro.

### Progreso

- **CA-15**: Un módulo se marca "completado" si y solo si: paso 1 completado + todos
  sus quizzes en hecho + todos sus retos de código en pass.
- **CA-16**: Given progreso registrado (módulos, quizzes, retos, explicaciones), When
  se cierra y reabre el navegador en la misma máquina/perfil, Then el progreso se
  restaura exactamente igual.
- **CA-17**: Given la acción "reiniciar módulo" confirmada, Then todos los estados de
  ese módulo vuelven a no-iniciado y los de los demás módulos no cambian.

### Asistente

- **CA-18**: Given Ollama corriendo con `qwen2.5-coder:14b` instalado, Then el
  indicador muestra "Conectado" en ≤5 s tras cargar la app.
- **CA-19**: Given Ollama apagado, Then el indicador muestra "Sin conexión", el input
  del chat queda deshabilitado y se muestra literalmente el comando `ollama serve`.
- **CA-20**: Given Ollama corriendo sin el modelo, Then el indicador muestra "Modelo no
  instalado" y se muestra literalmente `ollama pull qwen2.5-coder:14b`.
- **CA-21**: Given estado "Conectado", When el alumno envía una pregunta, Then el primer
  token visible aparece en ≤10 s y la respuesta se renderiza incrementalmente (≥2
  actualizaciones visibles antes de completarse en respuestas de >50 tokens).
- **CA-22**: Given una generación en curso, When el alumno pulsa "detener", Then la
  generación cesa en ≤2 s y el texto parcial permanece visible.
- **CA-23**: Given el alumno en el módulo N, When pregunta "¿de qué trata este módulo?"
  (o equivalente), Then la respuesta menciona el tema del módulo N (verificable porque
  el contexto enviado al modelo incluye el contenido/identificador del módulo N).
- **CA-24**: Given una pregunta cuya respuesta está en un módulo concreto, Then el
  prompt enviado a Ollama contiene fragmentos recuperados del contenido del curso
  (verificable inspeccionando la request: el contexto RAG no está vacío).
- **CA-25**: Given cualquier uso del asistente, Then las únicas peticiones de red
  salen hacia `localhost:11434` (0 requests a dominios externos).
- **CA-26**: Given una caída de Ollama a mitad de respuesta, Then la UI muestra un
  error legible en español con la instrucción de recuperación, sin romper la app.
- **CA-27**: Given el paso 1 de un módulo con explicación escrita, When el alumno pulsa
  "pedir feedback", Then la explicación se envía al asistente como mensaje y llega
  respuesta en streaming (mismas garantías que CA-21).

### Contenido / fidelidad de API

- **CA-28**: El 100% de los bloques de código del curso usan exclusivamente los
  símbolos y patrones presentes en `docs/reference/langgraph-grounding.md` (o
  extensiones aprobadas vía Context7 documentadas ahí): `StateGraph`, `START`/`END`,
  `add_conditional_edges`, `InMemorySaver`, `interrupt`, `Command`, `add_messages`,
  `ToolNode`/`create_react_agent`, `stream_mode`, subgraphs, `langgraph.json`.
  Verificable por revisión: cero usos de APIs deprecadas o inventadas.
- **CA-29**: Cada bloque de código del curso tiene un control "copiar" que copia el
  contenido exacto del bloque al portapapeles.

## 9. No-goals (explícitos)

- **NG-01**: Sin autenticación, cuentas de usuario ni backend de identidad.
- **NG-02**: Sin backend propio de LLM ni proveedores cloud (OpenAI, Anthropic, etc.);
  el único motor de IA es Ollama local. No WebLLM/WebGPU in-browser.
- **NG-03**: Sin sincronización de progreso entre dispositivos ni almacenamiento en la
  nube.
- **NG-04**: Sin certificados, gamificación avanzada (rankings, badges sociales) ni
  features multiusuario/colaborativas.
- **NG-05**: Sin editor/CMS para modificar el contenido del curso desde la UI.
- **NG-06**: Sin deployment real a LangGraph Platform en los ejercicios (el módulo 16
  es conceptual).
- **NG-07**: Sin evaluación por LLM que decida el estado hecho/no hecho de ejercicios
  (el asistente da feedback, nunca califica).
- **NG-08**: Sin soporte de otros idiomas distintos del español en esta versión.
- **NG-09**: Sin telemetría ni analítica externa.

## 10. Supuestos (con default decidido — no bloquean)

- **SU-01**: El *mecanismo* de ejecución/validación de los retos Python (in-browser,
  runner local u otro) lo decide el architect. El contrato de producto es CA-06/07/10:
  validación automática, determinista, con feedback, sin red externa.
- **SU-02**: Los retos que involucran LLM se validan con dobles deterministas (SU
  derivado de "sin cloud" + reproducibilidad); la ejecución live con Ollama es opcional
  y no puntúa. Anotado en §5.2.
- **SU-03**: "Persistencia de progreso" = persistencia local del navegador en la misma
  máquina/perfil (CA-16). Consecuencia aceptada: borrar datos del navegador borra el
  progreso.
- **SU-04**: El paso 1 Feynman no se corrige automáticamente (solo umbral de longitud +
  feedback opcional del asistente), para cumplir NG-07.
- **SU-05**: El umbral de 80% en quizzes y 200 caracteres en explicaciones son defaults
  de producto razonables; ajustables por el humano sin impacto de diseño.
- **SU-06**: El alumno dispone de una máquina capaz de correr `qwen2.5-coder:14b`; si
  no, el override de modelo (A-01) permite usar uno menor sin cambios de producto.
- **SU-07**: El contenido del curso es estático y se versiona con la app (el índice RAG
  se construye a partir de él; cómo, lo decide el architect).

## 11. Preguntas abiertas

**Bloqueantes: ninguna.** Todas las ambigüedades detectadas quedaron resueltas con
defaults explícitos en §10, revisables por el humano sin re-trabajo de diseño.

---

## 12. Enriquecimiento guiado (contenido de módulos)

> Sección **aditiva**. No re-decide nada de §1–§11: la estructura Feynman (§5.1), el
> contrato de "hecho" (§5.2), el temario (§6), el asistente (§7) y la fidelidad de API
> (CA-28) siguen vigentes tal cual. Esta sección **densifica el contenido dentro** de
> las 4 secciones Feynman de cada módulo y añade un tutorial local reproducible.
> Fuente de decisiones fijas: `docs/reference/enriquecimiento-decisiones.md`.

### 12.1 Objetivo pedagógico

- **OE1 — Guiado e incremental**: el alumno avanza en **pasos pequeños** (de menos a
  más), cada uno con una **mini-explicación breve** antes de la acción, en vez de leer
  un muro de teoría seguido de un único reto grande.
- **OE2 — Mini-ejercicios frecuentes**: más puntos de práctica verificable y más
  granulares que "un reto por sección", para consolidar cada micro-concepto en caliente.
- **OE3 — IA como copiloto**: el alumno aprende a usar el asistente local (qwen del
  sidebar, §7) para desbloquearse y aprender sintaxis Python sobre la marcha, con
  prompts sugeridos y verificación de la respuesta de la IA — sin delegar el aprendizaje.
- **OE4 — De cero a grafo real en su máquina**: cada módulo aporta un tramo de un
  tutorial local reproducible ("project spine") que lleva del scaffolding (venv,
  carpetas, `pip install`) hasta un grafo LangGraph **REAL** ejecutándose localmente.
- **OE5 — Foco en código de grafos**: la densificación no diluye el foco; la mayoría de
  pasos y mini-ejercicios producen o modifican código que construye grafos LangGraph.

Estos objetivos **enriquecen** O1–O4 (§2); no los sustituyen.

### 12.2 Estructura de "pasos guiados" (dentro de las secciones Feynman)

Un **módulo enriquecido** organiza su contenido como una **secuencia ordenada de PASOS
pequeños**. Cada **PASO** tiene exactamente:

1. **Mini-explicación** (breve): 1–2 párrafos o ≤6 bullets que introducen SOLO el
   micro-concepto de ese paso (sin adelantar los siguientes).
2. **Acción concreta**: casi siempre un **mini-ejercicio** de código verificable
   (mismo contrato de §5.2: validación automática, determinista, pass/fail con mensaje);
   excepcionalmente una micro-predicción/quiz de 1–2 ítems o una acción de lectura-y-ejecución.

Relación con las 4 secciones Feynman (§5.1) — los pasos **viven sobre todo en "Llena
los gaps" (paso 3)**, pero pueden aparecer en las cuatro:
- "Explica simple": 0 o pocos pasos (el foco sigue siendo la explicación llana + cuadro
  propio de ≥200 caracteres; CA-13 intacto).
- "Detecta tus gaps": puede incluir micro-predicciones como pasos; el quiz de 4–6
  preguntas (CA-03) permanece.
- "Llena los gaps": **cuerpo principal** de los pasos guiados y mini-ejercicios.
- "Refina y simplifica": el reto de síntesis (§5.1) permanece; puede precederse de 1–2
  pasos de repaso.

Un **mini-ejercicio** es un reto de código bajo el contrato §5.2 pero de **alcance
reducido** (típicamente 1 concepto, esqueleto con 1–3 `# TODO`), y **cuenta para el
estado "hecho" del módulo** exactamente como cualquier reto de código de §5.2/CA-15
(no se crea un contrato de progreso nuevo).

### 12.3 Bloque "Usa la IA" (copiloto qwen)

Cada módulo enriquecido incluye **al menos un** bloque **"Usa la IA"** que contiene:
- **Prompt(s) sugeridos** listos para copiar, orientados a ese módulo (p.ej. pedir que
  explique una línea de sintaxis Python, proponer un enfoque, o revisar por qué falla
  una aserción).
- **Cómo verificar** la respuesta de la IA: checklist breve (¿usa la API del grounding?
  ¿pasa la validación del mini-ejercicio? ¿coincide con la salida esperada?).
- **Cómo iterar**: qué re-preguntar si la respuesta no compila o no pasa.
- **Qué NO delegar**: el alumno escribe/entiende el código; la IA asiste, no resuelve
  por él (coherente con NG-07: la IA nunca califica ni marca "hecho").

Relación con el asistente lateral (§7): el bloque **reutiliza el asistente existente**
(US-11, US-14, A-06); no introduce un motor ni panel nuevo. Los prompts sugeridos están
pensados para enviarse a ese chat con el módulo actual como contexto.

### 12.4 Tutorial local "En tu máquina" (project spine)

Cada módulo enriquecido incluye una sección **"En tu máquina"** que es **texto/guía
reproducible** (no un entorno ejecutado por la app; ver NG-12). Contenido mínimo:

- **Comandos de setup exactos y copiables**, para **Windows PowerShell y bash**
  (`python -m venv .venv`, activación por-OS, `pip install -r requirements.txt`,
  `python src/main.py`), según el grounding de instalación
  (`enriquecimiento-decisiones.md` §"Grounding oficial"). El setup es **incremental**:
  solo se introduce lo nuevo del módulo, no se repite entero cada vez.
- **Código LangGraph REAL** (misma superficie de API que valida el runner, CA-28). En
  módulos con LLM (12–14, y donde aplique), usa `ChatOllama(model="qwen2.5-coder:14b")`
  vía `langchain-ollama`; en módulos sin LLM (state, edges, reducers) no se requiere modelo.
- **Cómo ejecutarlo** y la **salida esperada** literal (para que el alumno compare).
- **Diferencia app vs. máquina explicitada**: en la app el LLM se simula con doble
  determinista (§5.2/SU-02); en la máquina corre `ChatOllama` con qwen.

**"Project spine"**: un único proyecto local que **crece módulo a módulo** desde el
scaffolding (mod01: venv + estructura `src/state.py`, `src/graph.py`, `src/main.py` +
`requirements.txt`) hasta un grafo terminado y ejecutable. Cada módulo indica
explícitamente **qué archivo(s) crea o modifica** respecto del estado del módulo anterior.

### 12.5 Criterios de aceptación del enriquecimiento (medibles, numerados)

Verificables por test o inspección de contenido. Aplican a **cada módulo enriquecido**
(salvo excepción indicada); el alcance por fase está en §12.7.

- **CA-30 (pasos)**: Cada módulo enriquecido contiene una secuencia de **≥5 PASOS**
  ordenados; **cada PASO** contiene una mini-explicación de **≤120 palabras** seguida de
  exactamente una acción concreta. Verificable: la estructura de datos del módulo expone
  pasos con campos `explicacion` (no vacío, ≤120 palabras) y `accion`.
- **CA-31 (granularidad de mini-ejercicios)**: Cada módulo enriquecido contiene
  **≥3 mini-ejercicios** de código verificables bajo el contrato §5.2 (validación
  automática, determinista, pass/fail con mensaje que identifica la aserción fallida,
  CA-06/07/10). Excepción: el módulo 16 (conceptual, §6) puede sustituirlos por
  micro-quizzes bajo CA-11/12.
- **CA-32 (mini-ejercicio bien formado)**: Cada mini-ejercicio tiene enunciado,
  esqueleto con **1–3 `# TODO`**, al menos una aserción de validación y una solución de
  referencia; su solución de referencia **pasa** su propia validación (verificable por
  test automático que ejecuta la solución contra las aserciones y obtiene pass).
- **CA-33 (incrementalidad)**: Dentro de un módulo, los mini-ejercicios están **ordenados
  de menor a mayor alcance** — el número de `# TODO` (o de aserciones) del ejercicio *n*
  es **≥** al del ejercicio *n−1* dentro de la misma sección. Verificable por inspección
  de metadatos.
- **CA-34 (bloque "Usa la IA")**: Cada módulo enriquecido contiene **≥1** bloque
  "Usa la IA" con los 4 componentes de §12.3: **≥1 prompt sugerido copiable**, checklist
  de verificación (**≥2 ítems**), guía de iteración y lista "qué NO delegar" (**≥1 ítem**).
  Verificable: campos presentes y no vacíos.
- **CA-35 (tutorial local presente)**: Cada módulo enriquecido contiene una sección
  "En tu máquina" con: **≥1 bloque de comandos** para **ambos** shells (PowerShell y
  bash), **≥1 bloque de código LangGraph real**, y una **salida esperada** declarada.
  Cada bloque tiene control "copiar" (CA-29). Verificable por inspección de estructura.
- **CA-36 (fidelidad de API del tutorial local)**: El 100% del código de las secciones
  "En tu máquina" usa exclusivamente símbolos del grounding (CA-28); donde haya LLM,
  usa `ChatOllama` de `langchain-ollama` con `model="qwen2.5-coder:14b"` (u override
  A-01) y **cero** proveedores cloud (coherente con NG-02). Verificable por revisión:
  0 APIs inventadas/deprecadas, 0 imports de proveedores cloud.
- **CA-37 (coherencia app↔máquina)**: Para cada módulo enriquecido, los símbolos de API
  de LangGraph usados en el código "En tu máquina" son un **subconjunto** de los usados
  en los retos/mini-ejercicios validados por el runner del mismo módulo (salvo el
  reemplazo declarado doble-determinista→`ChatOllama` y el setup/instalación).
  Verificable por comparación de conjuntos de símbolos; la única diferencia admitida es
  la del cliente LLM.
- **CA-38 (project spine continuo)**: Cada módulo enriquecido (a partir del mod01)
  declara explícitamente **qué archivo(s) crea o modifica** del project spine respecto
  del módulo anterior, y el mod01 incluye el scaffolding completo (venv + estructura
  `src/` + `requirements.txt`). Verificable: campo de "archivos tocados" no vacío por
  módulo; continuidad sin saltos (ningún módulo modifica un archivo no creado antes).
- **CA-39 (no rompe contratos previos)**: El enriquecimiento **no altera** CA-01–CA-29;
  en particular, cada módulo conserva sus 4 secciones Feynman (CA-02), su quiz de 4–6
  preguntas y su reto de código de sección (CA-03), y el estado "completado" sigue
  rigiéndose por CA-15. Verificable: CA-01–CA-29 siguen pasando tras el enriquecimiento.

### 12.6 No-goals del enriquecimiento

- **NG-10**: El bloque "Usa la IA" **no introduce** un segundo asistente ni un motor de
  IA nuevo; reutiliza el asistente local de §7. (No contradice NG-02.)
- **NG-11**: La IA copiloto **no valida ni marca** mini-ejercicios como hechos; el estado
  "hecho" lo decide siempre la validación determinista (refuerza NG-07).
- **NG-12**: La app **no ejecuta LangGraph real** ni gestiona el entorno local del
  alumno: el tutorial "En tu máquina" es **guía reproducible** (texto + comandos +
  código + salida esperada), no un runtime gestionado por la app. La validación dentro
  de la app sigue siendo la del runner determinista (SU-01).
- **NG-13**: El project spine **no se genera ni se descarga automáticamente** desde la
  app (no hay generador de proyectos); el alumno lo construye siguiendo la guía.
- **NG-14**: El enriquecimiento **no añade módulos ni cambia el temario** de §6 (16
  módulos); solo densifica el contenido interno.

> Ajuste declarado a no-goals previos: ninguno de §9 se contradice. NG-06 (sin
> deployment real) y NG-02 (sin cloud) siguen intactos; el tutorial local corre
> LangGraph real **en la máquina del alumno**, no un deployment ni un motor cloud, lo
> cual es compatible con ambos.

### 12.7 Alcance y fases

- **Fase piloto — mod01–03**: se enriquecen primero para validar formato (pasos,
  mini-ejercicios, "Usa la IA", "En tu máquina", scaffolding del project spine en mod01).
  Gate de fase: CA-30–CA-39 pasan en mod01–03 y el humano aprueba el estilo.
- **Lotes siguientes** (tras aprobar el piloto): mod04–06, mod07–11, mod12–16, en ese
  orden. Cada lote debe cumplir CA-30–CA-39 antes de cerrarse.

### 12.8 Preguntas abiertas del enriquecimiento

**Bloqueantes: ninguna.** El motor local, el ritmo y la coexistencia runner↔tutorial
están fijados en `docs/reference/enriquecimiento-decisiones.md`. Los umbrales de
CA-30/31/33 (≥5 pasos, ≥3 mini-ejercicios, orden por nº de `# TODO`) son defaults de
producto ajustables por el humano sin re-trabajo de diseño.
