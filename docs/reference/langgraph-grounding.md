# LangGraph — grounding oficial (vía Context7)

Fuente: `/websites/langchain_oss_python_langgraph` — docs.langchain.com/oss/python/langgraph
(reputación High, benchmark 85). API vigente a 2026-07. Usar estos patrones como canon
para TODOS los ejemplos y ejercicios del curso.

## 1. State + nodes + edges + conditional (loop)

```python
import operator
from typing import Annotated, Literal
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    # operator.add como reducer => append-only
    aggregate: Annotated[list, operator.add]

def a(state: State):
    return {"aggregate": ["A"]}

def b(state: State):
    return {"aggregate": ["B"]}

builder = StateGraph(State)
builder.add_node(a)
builder.add_node(b)

def route(state: State) -> Literal["b", END]:
    return "b" if len(state["aggregate"]) < 7 else END

builder.add_edge(START, "a")
builder.add_conditional_edges("a", route)
builder.add_edge("b", "a")
graph = builder.compile()
```

## 2. Múltiples esquemas de estado (input/output/private)

```python
from typing import TypedDict
from langgraph.graph import END, START, StateGraph

class InputState(TypedDict):
    user_input: str
class OutputState(TypedDict):
    graph_output: str
class OverallState(TypedDict):
    foo: str; user_input: str; graph_output: str
class PrivateState(TypedDict):
    bar: str

def node_1(state: InputState) -> OverallState:
    return {"foo": state["user_input"] + " name"}
def node_2(state: OverallState) -> PrivateState:
    return {"bar": state["foo"] + " is"}
def node_3(state: PrivateState) -> OutputState:
    return {"graph_output": state["bar"] + " Lance"}

builder = StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)
builder.add_node("node_1", node_1); builder.add_node("node_2", node_2); builder.add_node("node_3", node_3)
builder.add_edge(START, "node_1"); builder.add_edge("node_1", "node_2")
builder.add_edge("node_2", "node_3"); builder.add_edge("node_3", END)
graph = builder.compile()
graph.invoke({"user_input": "My"})  # {'graph_output': 'My name is Lance'}
```

## 3. Reducer add_messages (estado de conversación)

```python
from langchain.messages import AnyMessage
from langgraph.graph.message import add_messages
from typing import Annotated
from typing_extensions import TypedDict

class GraphState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
```

## 4. Checkpointing / persistencia

```python
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver
from langchain_core.runnables import RunnableConfig
from typing import Annotated
from typing_extensions import TypedDict
from operator import add

class State(TypedDict):
    foo: str
    bar: Annotated[list[str], add]

def node_a(state: State): return {"foo": "a", "bar": ["a"]}
def node_b(state: State): return {"foo": "b", "bar": ["b"]}

workflow = StateGraph(State)
workflow.add_node(node_a); workflow.add_node(node_b)
workflow.add_edge(START, "node_a"); workflow.add_edge("node_a", "node_b"); workflow.add_edge("node_b", END)

checkpointer = InMemorySaver()
graph = workflow.compile(checkpointer=checkpointer)
config: RunnableConfig = {"configurable": {"thread_id": "1"}}
graph.invoke({"foo": "", "bar": []}, config)
```

## 5. Streaming (updates + custom con get_stream_writer)

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.config import get_stream_writer

class State(TypedDict):
    topic: str
    joke: str

def generate_joke(state: State):
    writer = get_stream_writer()
    writer({"status": "thinking of a joke..."})
    return {"joke": f"Why did the {state['topic']} go to school? To get a sundae education!"}

graph = (StateGraph(State).add_node(generate_joke)
         .add_edge(START, "generate_joke").add_edge("generate_joke", END).compile())

for chunk in graph.stream({"topic": "ice cream"}, stream_mode=["updates", "custom"], version="v2"):
    if chunk["type"] == "updates":
        for node_name, state in chunk["data"].items():
            print(f"Node {node_name} updated: {state}")
    elif chunk["type"] == "custom":
        print(f"Status: {chunk['data']['status']}")
```

Modos de stream: `values`, `updates`, `messages`, `custom`. Para subgraphs: `subgraphs=True`
y distinguir por el campo `ns` (namespace).

> NOTA (M3.2): el ejemplo de arriba usa la forma `chunk["type"]`/`chunk["data"]` (dict)
> que aparece en algunas versiones de la doc. El **shim ejecutable** del curso (y por tanto
> los retos de mod10/mod11) emite cada evento como una **tupla `(modo, evento)`** cuando se
> combinan modos (p.ej. `for modo, evento in graph.stream(..., stream_mode=["updates","custom"])`),
> que es la semántica de LangGraph real vigente. Usa la forma de tupla en el código ejecutable;
> la forma de dict queda solo como referencia histórica de la doc.

## 6. Subgraphs (composición padre/hijo + streaming)

```python
from langgraph.graph import START, StateGraph
from typing import TypedDict

class SubgraphState(TypedDict):
    foo: str  # clave compartida con el padre
    bar: str

def subgraph_node_1(state: SubgraphState): return {"bar": "bar"}
def subgraph_node_2(state: SubgraphState): return {"foo": state["foo"] + state["bar"]}

subgraph_builder = StateGraph(SubgraphState)
subgraph_builder.add_node(subgraph_node_1); subgraph_builder.add_node(subgraph_node_2)
subgraph_builder.add_edge(START, "subgraph_node_1"); subgraph_builder.add_edge("subgraph_node_1", "subgraph_node_2")
subgraph = subgraph_builder.compile()

class ParentState(TypedDict):
    foo: str

def node_1(state: ParentState): return {"foo": "hi! " + state["foo"]}

builder = StateGraph(ParentState)
builder.add_node("node_1", node_1)
builder.add_node("node_2", subgraph)   # subgraph como nodo
builder.add_edge(START, "node_1"); builder.add_edge("node_1", "node_2")
graph = builder.compile()

for chunk in graph.stream({"foo": "foo"}, stream_mode="updates", subgraphs=True, version="v2"):
    ...  # chunk["ns"] identifica subgraph vs root
```

## 7. Deployment (LangGraph Platform / SDK)

```python
from langgraph_sdk import get_sync_client

client = get_sync_client(url="your-deployment-url", api_key="your-langsmith-api-key")
for chunk in client.runs.stream(
    None, "agent",  # nombre del agente definido en langgraph.json
    input={"messages": [{"role": "human", "content": "What is LangGraph?"}]},
    stream_mode="updates",
):
    print(chunk.event, chunk.data)
```

`langgraph.json` declara los grafos/agentes desplegables. Human-in-the-loop se apoya en
`interrupt(...)` dentro de un nodo y se reanuda con `Command(resume=...)`.

> NOTA para agentes: si necesitáis MÁS profundidad en cualquier tema (interrupt/Command
> exacto, Store de memoria largo plazo, ToolNode, create_react_agent, supervisor/swarm),
> pedidlo al orquestador para una consulta Context7 adicional; NO inventéis API.
