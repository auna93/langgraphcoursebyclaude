# Decisiones fijas del proyecto (locked)

> Fuente de verdad para TODOS los agentes. No re-decidir sin volver al humano.

## Producto
- **Qué**: Curso interactivo (web app) para aprender **LangGraph** con el **método Feynman**
  y ejercicios **mixtos** (retos de código Python ejecutables + quizzes conceptuales).
- **Idioma del contenido y la UI**: Español.
- **Alcance del temario**: **Completo hasta avanzado** (~14-16 módulos):
  fundamentos (State/TypedDict/reducers, nodes, edges, conditional edges, START/END,
  compile/invoke) → persistencia/checkpointing (InMemorySaver, thread_id) → memoria
  corto/largo plazo (Store) → human-in-the-loop (interrupt, Command resume) →
  streaming (values/updates/messages/custom) → tool calling (ToolNode, create_react_agent) →
  multi-agente (supervisor, swarm, handoffs con Command) → subgraphs → deployment
  (LangGraph Platform, langgraph.json).

## Asistente lateral (IA de apoyo)
- **Motor primario**: **Ollama local** en `http://localhost:11434`.
- **Fallback in-browser (WebLLM/WebGPU)** — decisión del humano, **2026-07-09**:
  cuando qwen vía Ollama NO está disponible (estados `disconnected` / `model_missing`
  del contrato C-OLLAMA), el asistente conmuta automáticamente a un modelo WebGPU
  ejecutado en el navegador (familia WebLLM). **Nunca** es motor primario ni reemplazo
  de Ollama; el retorno a Ollama es automático al recuperarse. Modelo por defecto:
  `Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC`, con override por env/config.
  Especificación completa: PRD §13 (A-11–A-16, CA-40–CA-48) y NG-02 actualizado.
  - **Trazabilidad (decisión reabierta)**: esta entrada SUSTITUYE la decisión original
    de este archivo — "Motor: Ollama local (**NO** WebLLM/WebGPU in-browser)" — fijada
    al inicio del proyecto. La reapertura fue pedida explícitamente por el humano
    ("permite la utilización de un modelo WebGPU si no se dispone de qwen"), única vía
    válida para reabrir una decisión locked. Pendiente del architect: contrato nuevo en
    `docs/arch/` (p. ej. C-WEBLLM) y su convivencia con C-OLLAMA.
- **Modelo instalado detectado**: `qwen2.5-coder:14b`. El asistente debe usar este por
  defecto y permitir override por env/config.
- **API Ollama**: `POST /api/chat` (streaming NDJSON) y `GET /api/tags` para health/detección.
- **Función**: responder dudas del curso y de la documentación de LangGraph. Debe hacer
  **RAG** sobre el contenido del curso (los módulos en `docs/spec` o el contenido generado)
  para responder con contexto, y degradar con gracia si Ollama no está corriendo:
  primero el fallback WebGPU si el navegador lo soporta (PRD §13); como estado terminal,
  mostrar instrucción: `ollama serve` + `ollama pull qwen2.5-coder:14b`.
- **UI**: barra lateral (sidebar) persistente con chat, indicador de estado del modelo
  (que distingue el motor activo: Ollama vs. WebGPU, PRD CA-45), y streaming de tokens.

## Grounding de contenido
- Documentación LangGraph obtenida vía Context7 (fuente oficial Python):
  `/websites/langchain_oss_python_langgraph`. Ver `langgraph-grounding.md`.
- Todos los ejemplos de código del curso deben usar la API vigente reflejada ahí
  (`StateGraph`, `START`/`END`, `add_conditional_edges`, `InMemorySaver`, `interrupt`,
  `Command`, `add_messages`, `ToolNode`/`create_react_agent`, `stream_mode`, subgraphs).

## Stack sugerido (a confirmar/cerrar por el architect)
- Front: Vite + React + TypeScript + shadcn/ui + Tailwind.
- Sin backend propio para el LLM: el navegador habla directo con Ollama (CORS:
  `OLLAMA_ORIGINS`), o un proxy dev de Vite si hace falta.
