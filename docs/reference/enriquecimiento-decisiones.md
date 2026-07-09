# Enriquecimiento de módulos — decisiones e insumos (locked)

> Fuente de verdad para el enriquecimiento pedagógico del curso. Deriva del feedback
> del usuario (2026-07): "los módulos son muy escuetos; quiero paso a paso, mini-ejercicios
> con mini-explicaciones, y tutoriales de cómo replicar lo mismo en mi máquina".

## Intención pedagógica (verbatim del usuario, es el norte)
- Ejercicios **guiados paso a paso** (incrementales, de menos a más).
- Enseñar **cómo usar la IA para resolverlos** (aprender la sintaxis Python sobre la
  marcha, sin limitarse solo a eso): la IA como copiloto, con prompts y verificación.
- Sin dejar de lado el **código para el desarrollo de grafos** (el foco sigue siendo
  construir grafos LangGraph con código).
- Enseñar **desde el armado de la estructura del proyecto hasta su finalización**:
  scaffolding (carpetas, venv, archivos), construir incrementalmente, hasta terminar
  un proyecto que corre en la máquina del alumno.

## Decisiones fijas
- **Motor local para tutoriales "en tu máquina"**: **Ollama + `qwen2.5-coder:14b`** vía
  `langchain-ollama` (`ChatOllama`). Sin API keys, 100% local, coherente con el asistente
  del curso y con los no-goals (sin cloud). Los módulos SIN LLM (state, edges, reducers)
  no requieren modelo.
- **Ritmo**: **piloto mod01–03** con el nuevo formato para validar estilo, luego seguir
  por lotes (mod04–06, 07–11, 12–16).
- El **runner in-browser (Pyodide + shim)** sigue siendo el que valida los retos dentro
  de la app (determinista, sin red). El **tutorial local** es el puente para que el alumno
  reproduzca lo mismo con LangGraph REAL en su máquina. Ambos coexisten: la app valida; el
  tutorial local enseña a ejecutarlo de verdad.

## Grounding oficial de instalación / local (vía Context7)
Fuente: docs.langchain.com/oss/python/langgraph (overview, studio, quickstart).

- Requisito: **Python 3.11+**.
- Instalación base: `pip install langchain langgraph` (o `pip install -U langgraph`).
- Modelo local (decisión del curso): `pip install langchain-ollama` y
  ```python
  from langchain_ollama import ChatOllama
  model = ChatOllama(model="qwen2.5-coder:14b")  # requiere `ollama serve` + pull del modelo
  ```
- "Hello world" oficial (overview) — grafo mínimo ejecutable:
  ```python
  from langgraph.graph import StateGraph, MessagesState, START, END

  def mock_llm(state: MessagesState):
      return {"messages": [{"role": "ai", "content": "hello world"}]}

  graph = StateGraph(MessagesState)
  graph.add_node(mock_llm)
  graph.add_edge(START, "mock_llm")
  graph.add_edge("mock_llm", END)
  graph = graph.compile()
  graph.invoke({"messages": [{"role": "user", "content": "hi!"}]})
  ```
- Servidor de desarrollo opcional (avanzado, mod16): `pip install "langgraph-cli[inmem]"`
  y `langgraph dev` (Studio local).
- Estructura de proyecto local sugerida (para el "project spine" del curso):
  ```
  mi-proyecto-langgraph/
    .venv/                 # python -m venv .venv
    requirements.txt       # langgraph, langchain, langchain-ollama
    src/
      state.py             # esquemas de estado (TypedDict)
      graph.py             # construcción del StateGraph
      main.py              # invoca/streamea el grafo
    README.md
  ```
  Comandos base (Windows PowerShell y bash):
  - `python -m venv .venv` → activar (`.venv\Scripts\Activate.ps1` / `source .venv/bin/activate`)
  - `pip install -r requirements.txt`
  - `python src/main.py`

## Nota de coherencia con el shim
- El código de los tutoriales locales usa la API REAL de LangGraph (misma superficie que el
  grounding base/avanzado que ya usa el shim), de modo que lo que el alumno valida en la app
  es lo mismo que corre en su máquina. Diferencia esperada y a explicar: en la app el LLM se
  simula con `FakeChatModel` (determinista); en la máquina, `ChatOllama` con qwen.
