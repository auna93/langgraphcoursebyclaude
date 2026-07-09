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
- **Motor**: **Ollama local** en `http://localhost:11434` (NO WebLLM/WebGPU in-browser).
- **Modelo instalado detectado**: `qwen2.5-coder:14b`. El asistente debe usar este por
  defecto y permitir override por env/config.
- **API Ollama**: `POST /api/chat` (streaming NDJSON) y `GET /api/tags` para health/detección.
- **Función**: responder dudas del curso y de la documentación de LangGraph. Debe hacer
  **RAG** sobre el contenido del curso (los módulos en `docs/spec` o el contenido generado)
  para responder con contexto, y degradar con gracia si Ollama no está corriendo
  (mostrar instrucción: `ollama serve` + `ollama pull qwen2.5-coder:14b`).
- **UI**: barra lateral (sidebar) persistente con chat, indicador de estado del modelo,
  y streaming de tokens.

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
