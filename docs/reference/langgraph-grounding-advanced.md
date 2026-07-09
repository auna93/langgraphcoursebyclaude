# LangGraph — grounding avanzado (vía Context7) — para S12/S14/S15

Fuente: `/websites/langchain_oss_python_langgraph`. Canon para la superficie AVANZADA del
shim (S12) y el contenido de módulos 07–16. NO inventar API fuera de esto + el grounding base.

## 1. Human-in-the-loop: interrupt + Command(resume)

`interrupt` y `Command` viven en `langgraph.types`. `interrupt(value)` pausa el grafo; el
valor pasado a `Command(resume=...)` se convierte en el valor de retorno de `interrupt()`
dentro del nodo pausado. Requiere checkpointer + thread_id.

```python
import operator
from typing import Annotated
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

class State(TypedDict):
    # reducer append-only: el ejemplo demuestra ACUMULACIÓN entre nodos;
    # sin este reducer, `final_step` sobreescribiría y el output sería solo ["Done"].
    value: Annotated[list[str], operator.add]

def ask_human(state: State):
    answer = interrupt("What is your name?")   # pausa aquí
    return {"value": [f"Hello, {answer}!"]}

def final_step(state: State):
    return {"value": ["Done"]}

graph = (
    StateGraph(State)
    .add_node("ask_human", ask_human)
    .add_node("final_step", final_step)
    .add_edge(START, "ask_human")
    .add_edge("ask_human", "final_step")
    .compile(checkpointer=InMemorySaver())
)

config = {"configurable": {"thread_id": "1"}}
graph.invoke({"value": []}, config)             # corre hasta el interrupt y pausa
graph.invoke(Command(resume="Alice"), config)   # reanuda: interrupt() devuelve "Alice"
# -> {"value": ["Hello, Alice!", "Done"]}
```

- `interrupt` puede recibir un dict (payload de revisión). Al reanudar, `Command(resume=<dict>)`.
- `Command` también soporta `Command(goto="nodo", update={...})` para routing + actualización de estado.
- Inspección de estado: `graph.get_state(config)` y `graph.get_state_history(config)`
  (usados en time-travel; `state.next` indica el/los próximos nodos).

## 2. Memoria de largo plazo: Store (namespaces)

Se compila el grafo con `store=...`. El store se accede dentro del nodo. API núcleo:
`put(namespace, key, value)` / `search(namespace, query=..., limit=...)` (versión async:
`aput`/`asearch`). El `namespace` es una tupla (p.ej. `(user_id, "memories")`).

```python
from langgraph.store.memory import InMemoryStore
from langgraph.graph import StateGraph, MessagesState, START

store = InMemoryStore()

def call_model(state: MessagesState, *, store):
    namespace = ("user-1", "memories")
    store.put(namespace, "pref-1", {"data": "User prefers dark mode"})
    hits = store.search(namespace, query="preferences", limit=3)
    info = "\n".join(d.value["data"] for d in hits)
    ...

builder = StateGraph(MessagesState)
builder.add_node(call_model)
builder.add_edge(START, "call_model")
graph = builder.compile(store=store)   # el store se inyecta al nodo
```

> Nota: la doc moderna muestra el acceso vía `Runtime` (`runtime.store`) con
> `context_schema`. Para el CURSO/shim usar la forma simple `put(namespace, key, value)` /
> `search(namespace, query=...)`, que es la esencia conceptual que el alumno debe aprender
> (memoria entre hilos = Store; memoria de hilo = checkpointer). Distinguir:
> **checkpointer** = estado de UN hilo (thread_id); **Store** = memoria compartida ENTRE hilos.

## 3. Tool calling: @tool, bind_tools, ToolNode, tool_calls, ToolMessage

`@tool` (de `langchain.tools`) define una tool desde una función con docstring. El modelo
se aumenta con `model.bind_tools(tools)`. Cuando el modelo decide llamar tools, la
`AIMessage` trae `.tool_calls`: lista de `{"name": str, "args": dict, "id": str}`. El nodo
de tools ejecuta cada una y devuelve un `ToolMessage(content=..., tool_call_id=...)`.

```python
from langchain.tools import tool
from langchain.messages import SystemMessage, HumanMessage, ToolMessage
from langgraph.graph import StateGraph, MessagesState, START, END
from typing import Literal

@tool
def multiply(a: int, b: int) -> int:
    """Multiply a and b."""
    return a * b

tools = [multiply]
tools_by_name = {t.name: t for t in tools}
llm_with_tools = model.bind_tools(tools)

def llm_call(state: MessagesState):
    return {"messages": [llm_with_tools.invoke(state["messages"])]}

def tool_node(state: MessagesState):
    result = []
    for tool_call in state["messages"][-1].tool_calls:
        tool = tools_by_name[tool_call["name"]]
        observation = tool.invoke(tool_call["args"])
        result.append(ToolMessage(content=observation, tool_call_id=tool_call["id"]))
    return {"messages": result}

def should_continue(state: MessagesState) -> Literal["tool_node", END]:
    last = state["messages"][-1]
    return "tool_node" if last.tool_calls else END

b = StateGraph(MessagesState)
b.add_node("llm_call", llm_call)
b.add_node("tool_node", tool_node)
b.add_edge(START, "llm_call")
b.add_conditional_edges("llm_call", should_continue, ["tool_node", END])
b.add_edge("tool_node", "llm_call")   # cierra el ciclo modelo→tool→modelo
agent = b.compile()
```

- **`ToolNode`** (prebuilt) reemplaza al `tool_node` manual: ejecuta tools en paralelo,
  maneja errores e inyección de estado. Consume la última `AIMessage.tool_calls` y emite
  `ToolMessage`s. Para el shim: replicar la semántica de iterar `tool_calls` y devolver
  `ToolMessage(content, tool_call_id)`.
- El `FakeChatModel` del harness debe producir `AIMessage` con `tool_calls` deterministas
  (según `llmDoubles`/`toolCalls`) para que el ciclo sea reproducible sin LLM real.

## 4. create_react_agent (prebuilt) + multi-agente

- `create_react_agent(model, tools, ...)` devuelve un grafo compilado que implementa por
  dentro el loop ReAct (razonar → llamar tool → observar → repetir) equivalente al de §3.
- **Supervisor**: un `StateGraph` donde un nodo supervisor enruta (vía `add_conditional_edges`
  o `Command(goto=...)`) a agentes-nodo especializados y de vuelta.
- **Swarm / handoffs**: cada agente puede transferir el control con `Command(goto="otro_agente",
  update={...})`. Comparar: supervisor = control centralizado; swarm = handoffs peer-to-peer.

## 5. Streaming `messages` (token a token)

`stream_mode="messages"` emite tokens de los mensajes del LLM a medida que se generan
(útil para UIs de chat). Combinable con `updates`/`custom` (ver grounding base §5).

> RECORDATORIO para el shim (S12): estas APIs se emulan con dobles deterministas
> (`FakeChatModel`, `InMemorySaver`, `InMemoryStore`, `interrupt`/`Command`, `ToolNode`).
> La superficie visible al alumno debe COINCIDIR con estos símbolos y firmas; la
> implementación interna es un doble, pero los ejemplos deben ejecutarse y dar las salidas
> documentadas. La interfaz TS del runner (C-RUNNER) NO cambia.
