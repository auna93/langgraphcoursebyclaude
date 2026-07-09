import type { CourseModule } from "../types";

/**
 * Módulo 13 — Agentes ReAct: create_react_agent.
 * Contenido completo (slice S15). Código: `langgraph.prebuilt.create_react_agent`
 * (grounding-adv §4, C-RUNNER §tabla "Avanzado"). Usa las mismas tools/FakeChatModel
 * del módulo 12.
 * §12 (ADR-15, SE4): formato enriquecido — pasos guiados, "Usa la IA" y
 * tutorial local (continúa el project spine desde mod12). El tutorial compara
 * el ciclo manual (mod12, en el proyecto) con `create_react_agent` en una demo
 * aparte, sin alterar `graph.py` (mismo patrón que la demo HITL de mod09).
 */
export const mod13: CourseModule = {
  id: "mod13",
  numero: 13,
  titulo: "Agentes ReAct: create_react_agent",
  objetivo:
    "Crear un agente ReAct con create_react_agent, y explicar el loop " +
    "razonamiento/acción que ejecuta por dentro.",
  enriquecido: true,
  secciones: {
    explicaSimple: {
      contenidoMd: `## El mismo ciclo, ya montado de fábrica

En el módulo anterior construiste a mano el ciclo modelo→tool→modelo: un nodo que
llama al modelo, un router (\`should_continue\`) que decide si hace falta una tool, un
nodo que la ejecuta, y un edge de vuelta al modelo. Ese patrón — **razonar, actuar,
observar el resultado, repetir** — es tan común que tiene nombre: **ReAct**
(Reasoning + Acting).

\`create_react_agent(model, tools)\` te da ese ciclo YA CONSTRUIDO: le pasas el modelo y
la lista de tools, y te devuelve un grafo compilado listo para invocar. Por dentro
tiene, ni más ni menos, los mismos dos nodos que armaste a mano (uno que llama al
modelo, uno que ejecuta tools) conectados con el mismo router.

## ¿Cuándo usar cada uno?

- El ciclo manual (módulo 12) te sirve para casos con lógica de routing custom (por
  ejemplo, distintos caminos según qué tool se llamó) o cuando quieres inspeccionar
  cada paso.
- \`create_react_agent\` te sirve para el caso general: "quiero un agente que razone y
  use herramientas hasta tener la respuesta", sin escribir el boilerplate del ciclo.`,
      consignaExplicacion:
        "Explícale a alguien que no programa la diferencia entre 'montar el ciclo " +
        "modelo-tool-modelo pieza por pieza' y 'usar create_react_agent, que ya viene " +
        "montado', usando la metáfora de un electrodoméstico armado vs. uno por piezas.",
    },
    detectaGaps: {
      contenidoMd: "Comprueba si entiendes qué hace create_react_agent por dentro.",
      quiz: {
        id: "mod13-quiz1",
        titulo: "¿Qué monta create_react_agent?",
        preguntas: [
          {
            id: "mod13-quiz1-p1",
            kind: "single",
            enunciadoMd: "¿Qué devuelve `create_react_agent(model, tools)`?",
            opciones: [
              "Un grafo YA COMPILADO, invocable/streameable directamente",
              "Una clase que hay que compilar tú mismo con `.compile()`",
              "Solo la función `llm_call`, sin el nodo de tools",
              "Un `StateGraph` sin compilar",
            ],
            correcta: 0,
            explicacionMd:
              "`create_react_agent` devuelve el grafo ya compilado: se invoca igual que " +
              "cualquier grafo (`.invoke(...)`, `.stream(...)`).",
          },
          {
            id: "mod13-quiz1-p2",
            kind: "boolean",
            enunciadoMd:
              "El loop que ejecuta `create_react_agent` por dentro es conceptualmente " +
              "equivalente al ciclo manual modelo→tool→modelo del módulo 12: modelo, y si " +
              "hay `tool_calls`, tools, y de vuelta al modelo, hasta una respuesta sin tool_calls.",
            correcta: true,
            explicacionMd:
              "Correcto: ReAct describe exactamente ese patrón; `create_react_agent` es " +
              "una versión ya montada del mismo ciclo.",
          },
          {
            id: "mod13-quiz1-p3",
            kind: "multi",
            enunciadoMd: "¿Qué necesita `create_react_agent` para funcionar?",
            opciones: [
              "Un modelo (compatible con `bind_tools`/`tool_calls`)",
              "Una lista de tools (típicamente creadas con `@tool`)",
              "Un `StateGraph` ya armado por el alumno",
              "Un checkpointer obligatorio",
            ],
            correctas: [0, 1],
            explicacionMd:
              "Solo hacen falta el modelo y las tools; el grafo interno (nodos, router, " +
              "compile) lo arma `create_react_agent` por ti. Un checkpointer es opcional " +
              "(se puede pasar vía config al invocar), no obligatorio.",
          },
          {
            id: "mod13-quiz1-p4",
            kind: "output",
            enunciadoMd:
              "Un agente ReAct con una sola tool recibe una pregunta que requiere UNA " +
              "llamada a esa tool antes de responder. Iterando " +
              '`agent.stream(input, stream_mode="updates")`, ¿qué secuencia de nombres de ' +
              "nodo aparece?",
            codigo:
              'for chunk in agent.stream(input, stream_mode="updates"):\n    print(list(chunk.keys())[0])',
            opciones: [
              '`["agent", "tools", "agent"]`',
              '`["tools", "agent"]`',
              '`["agent"]` únicamente',
              '`["agent", "agent", "tools"]`',
            ],
            correcta: 0,
            explicacionMd:
              "El agente razona primero (nodo `agent`), pide la tool (nodo `tools`), y " +
              "vuelve al modelo (`agent` de nuevo) para dar la respuesta final.",
          },
          {
            id: "mod13-quiz1-p5",
            kind: "single",
            enunciadoMd: "¿Qué estado usa por dentro el grafo de `create_react_agent`?",
            opciones: [
              "`MessagesState` (o equivalente): la conversación como lista de mensajes",
              "Un `TypedDict` custom que el alumno debe definir",
              "No usa estado: opera sin memoria de mensajes",
              "Un `Store` obligatorio para guardar la conversación",
            ],
            correcta: 0,
            explicacionMd:
              "El agente ReAct opera sobre el estado de mensajes estándar, igual que el " +
              "ciclo manual del módulo 12.",
          },
        ],
      },
    },
    llenaGaps: {
      contenidoMd: `## create_react_agent en código real

\`\`\`python
from langchain.tools import tool
from langgraph.prebuilt import create_react_agent
from course_harness import FakeChatModel

@tool
def square(n: int) -> int:
    """Return n squared."""
    return n * n

tools = [square]

def build_react_agent():
    model = FakeChatModel()
    return create_react_agent(model, tools)

agent = build_react_agent()
result = agent.invoke({"messages": [{"role": "human", "content": "What is 5 squared?"}]})
print(result["messages"][-1].content)
# "5 squared is 25."
\`\`\`

## Inspeccionando el loop con stream

\`\`\`python
for chunk in agent.stream(
    {"messages": [{"role": "human", "content": "What is 5 squared?"}]},
    stream_mode="updates",
):
    print(list(chunk.keys())[0])
# agent
# tools
# agent
\`\`\`

**Cómo leerlo:** \`create_react_agent(model, tools)\` te ahorra escribir \`llm_call\`,
\`tool_node\`/\`ToolNode\` y \`should_continue\` a mano: nodos \`"agent"\` y \`"tools"\` ya
conectados en el ciclo ReAct. El resultado (\`result["messages"]\`) tiene la misma forma
que en el ciclo manual: human → AI(tool_call) → tool → AI(final).

**Errores comunes:**
- Pensar que \`create_react_agent\` hace algo distinto del ciclo manual: es el MISMO
  patrón, solo que ya montado — no aprende ni razona "mejor", solo ahorra código.
- Olvidar que sigue dependiendo de que el modelo soporte \`tool_calls\` (con
  \`FakeChatModel\`, de los \`llmDoubles\` configurados).
- Confundir los nombres de nodo del grafo prebuilt (\`"agent"\`, \`"tools"\`) con los que
  el alumno eligió a mano en el módulo 12 (\`"llm_call"\`, \`"tool_node"\`): son fijos
  cuando usas \`create_react_agent\`.`,
      retos: [
        {
          id: "mod13-reto1",
          titulo: "Construir un agente ReAct con create_react_agent",
          enunciadoMd:
            "Completa `build_react_agent` para que devuelva `create_react_agent(model, tools)` " +
            "con la tool `square`, y verifica que produce la respuesta final esperada.",
          starterCode: `from langchain.tools import tool
from langgraph.prebuilt import create_react_agent
from course_harness import FakeChatModel

@tool
def square(n: int) -> int:
    """Return n squared."""
    return n * n

tools = [square]

def build_react_agent():
    model = FakeChatModel()
    # TODO — devuelve create_react_agent(model, tools)
    ...
`,
          solutionCode: `from langchain.tools import tool
from langgraph.prebuilt import create_react_agent
from course_harness import FakeChatModel

@tool
def square(n: int) -> int:
    """Return n squared."""
    return n * n

tools = [square]

def build_react_agent():
    model = FakeChatModel()
    return create_react_agent(model, tools)
`,
          validationCode: `from course_harness import check_eq, get_llm_calls

agent_1 = build_react_agent()
agent_2 = build_react_agent()
input_msg = {"messages": [{"role": "human", "content": "What is 5 squared?"}]}

result_1 = agent_1.invoke(input_msg)
calls_after_first = get_llm_calls()
result_2 = agent_2.invoke(input_msg)

check_eq(
    "react_final_answer",
    "create_react_agent produce la respuesta final configurada tras el loop ReAct",
    result_1["messages"][-1].content,
    "5 squared is 25.",
)
check_eq(
    "react_llm_invoked_twice",
    "el loop ReAct invoca al modelo 2 veces: decidir la tool y dar la respuesta final",
    len(calls_after_first),
    2,
)
check_eq(
    "react_deterministic_contents",
    "mismos inputs producen los mismos contenidos de mensaje (dos instancias frescas)",
    [m.content for m in result_1["messages"]],
    [m.content for m in result_2["messages"]],
)

agent_3 = build_react_agent()
updates = list(agent_3.stream(input_msg, stream_mode="updates"))
node_sequence = [list(u.keys())[0] for u in updates]
check_eq(
    "react_node_sequence",
    "el loop ReAct pasa por los nodos agent -> tools -> agent",
    node_sequence,
    ["agent", "tools", "agent"],
)
`,
          llmDoubles: [
            { respuesta: "", toolCalls: [{ name: "square", args: { n: 5 } }] },
            { respuesta: "5 squared is 25.", toolCalls: [] },
          ],
        },
      ],
      pasos: [
        {
          id: "mod13-paso1",
          titulo: "El grafo ya compilado",
          explicacionMd:
            "Antes de inspeccionar el loop, practica lo mínimo: `create_react_agent(model, " +
            "tools)` devuelve un grafo YA COMPILADO, listo para `.invoke(...)`.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod13-paso1-reto",
              titulo: "Completa build_react_agent",
              enunciadoMd:
                "Completa `build_react_agent` para que devuelva " +
                "`create_react_agent(model, tools)` con la tool `triple`.",
              starterCode: `from langchain.tools import tool
from langgraph.prebuilt import create_react_agent
from course_harness import FakeChatModel

@tool
def triple(n: int) -> int:
    """Return n tripled."""
    return n * 3

tools = [triple]

def build_react_agent():
    model = FakeChatModel()
    # TODO: devuelve create_react_agent(model, tools)
    ...
`,
              solutionCode: `from langchain.tools import tool
from langgraph.prebuilt import create_react_agent
from course_harness import FakeChatModel

@tool
def triple(n: int) -> int:
    """Return n tripled."""
    return n * 3

tools = [triple]

def build_react_agent():
    model = FakeChatModel()
    return create_react_agent(model, tools)
`,
              validationCode: `from course_harness import check_eq

agent = build_react_agent()
result = agent.invoke({"messages": [{"role": "human", "content": "What is 4 tripled?"}]})
check_eq("paso1_final_answer", "create_react_agent produce la respuesta final configurada", result["messages"][-1].content, "4 tripled is 12.")
`,
              llmDoubles: [
                { respuesta: "", toolCalls: [{ name: "triple", args: { n: 4 } }] },
                { respuesta: "4 tripled is 12.", toolCalls: [] },
              ],
            },
          },
        },
        {
          id: "mod13-paso2",
          titulo: "Inspecciona el loop con stream",
          explicacionMd:
            "Lee cómo el streaming revela los nodos internos `\"agent\"`/`\"tools\"` del " +
            "grafo prebuilt, sin necesidad de haberlos escrito tú.",
          accion: {
            kind: "lectura",
            bloqueMd: `\`\`\`python
for chunk in agent.stream(
    {"messages": [{"role": "human", "content": "What is 5 squared?"}]},
    stream_mode="updates",
):
    print(list(chunk.keys())[0])
# agent
# tools
# agent
\`\`\`
Este fragmento ya está completo: solo léelo, no hace falta ejecutarlo ni completar nada todavía.`,
          },
        },
        {
          id: "mod13-paso3",
          titulo: "Extrae la secuencia de nodos del stream",
          explicacionMd:
            "Practica extraer la secuencia de nombres de nodo de un `stream(..., " +
            'stream_mode="updates")`: cada chunk es `{nombre_nodo: update}`.',
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod13-paso3-reto",
              titulo: "Completa secuencia_de_nodos",
              enunciadoMd:
                "Completa `secuencia_de_nodos` para que devuelva la lista de nombres de " +
                "nodo, en orden, a partir de `agent.stream(input_msg, " +
                'stream_mode="updates")`.',
              starterCode: `from langchain.tools import tool
from langgraph.prebuilt import create_react_agent
from course_harness import FakeChatModel

@tool
def triple(n: int) -> int:
    """Return n tripled."""
    return n * 3

tools = [triple]

def build_react_agent():
    model = FakeChatModel()
    return create_react_agent(model, tools)

def secuencia_de_nodos(input_msg):
    agent = build_react_agent()
    nombres = []
    # TODO: itera agent.stream(input_msg, stream_mode="updates")
    # TODO: por cada chunk, agrega a nombres list(chunk.keys())[0]
    return nombres
`,
              solutionCode: `from langchain.tools import tool
from langgraph.prebuilt import create_react_agent
from course_harness import FakeChatModel

@tool
def triple(n: int) -> int:
    """Return n tripled."""
    return n * 3

tools = [triple]

def build_react_agent():
    model = FakeChatModel()
    return create_react_agent(model, tools)

def secuencia_de_nodos(input_msg):
    agent = build_react_agent()
    nombres = []
    for chunk in agent.stream(input_msg, stream_mode="updates"):
        nombres.append(list(chunk.keys())[0])
    return nombres
`,
              validationCode: `from course_harness import check_eq

nombres = secuencia_de_nodos({"messages": [{"role": "human", "content": "What is 4 tripled?"}]})
check_eq("paso3_node_sequence", "el loop ReAct pasa por agent -> tools -> agent", nombres, ["agent", "tools", "agent"])
`,
              llmDoubles: [
                { respuesta: "", toolCalls: [{ name: "triple", args: { n: 4 } }] },
                { respuesta: "4 tripled is 12.", toolCalls: [] },
              ],
            },
          },
        },
        {
          id: "mod13-paso4",
          titulo: "Predicción: ¿cuántas veces se invoca al modelo?",
          explicacionMd:
            "Antes de la síntesis, predice cuántas veces invoca el modelo un loop ReAct " +
            "que necesita EXACTAMENTE una tool antes de responder.",
          accion: {
            kind: "quiz",
            quiz: {
              id: "mod13-paso4-quiz",
              titulo: "¿Cuántas invocaciones al modelo?",
              preguntas: [
                {
                  id: "mod13-paso4-quiz-p1",
                  kind: "single",
                  enunciadoMd:
                    "Un agente ReAct con una tool responde a una pregunta que requiere UNA " +
                    "llamada a esa tool. ¿Cuántas veces se invoca el modelo en total?",
                  opciones: ["2 veces: decidir la tool y dar la respuesta final", "1 vez", "3 veces", "0 veces: el modelo no interviene"],
                  correcta: 0,
                  explicacionMd:
                    "El modelo se invoca una vez para decidir llamar a la tool, y otra vez " +
                    "tras recibir el `ToolMessage`, para dar la respuesta final.",
                },
              ],
            },
          },
        },
        {
          id: "mod13-paso5",
          titulo: "Compara el ciclo manual con create_react_agent",
          explicacionMd:
            "Combina lo practicado: construye un agente manual (módulo 12) y uno con " +
            "`create_react_agent` para la MISMA tool, y compara sus respuestas finales.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod13-paso5-reto",
              titulo: "Compara manual vs. create_react_agent",
              enunciadoMd:
                "Completa `build_manual_agent` (ciclo manual del módulo 12) y " +
                "`build_react_agent` (`create_react_agent`) para la tool `cuadruplicar`, y " +
                "compara sus respuestas finales.",
              starterCode: `from typing import Literal
from langchain.tools import tool
from langchain.messages import ToolMessage
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.prebuilt import create_react_agent
from course_harness import FakeChatModel

@tool
def cuadruplicar(n: int) -> int:
    """Return n times 4."""
    return n * 4

tools = [cuadruplicar]
tools_by_name = {t.name: t for t in tools}

def build_manual_agent():
    model = FakeChatModel()
    llm_with_tools = model.bind_tools(tools)

    def llm_call(state: MessagesState):
        return {"messages": [llm_with_tools.invoke(state["messages"])]}

    def tool_node(state: MessagesState):
        result = []
        for tool_call in state["messages"][-1].tool_calls:
            t = tools_by_name[tool_call["name"]]
            observation = t.invoke(tool_call["args"])
            result.append(ToolMessage(content=str(observation), tool_call_id=tool_call["id"]))
        return {"messages": result}

    def should_continue(state: MessagesState) -> Literal["tool_node", "__end__"]:
        return "tool_node" if state["messages"][-1].tool_calls else END

    b = StateGraph(MessagesState)
    b.add_node("llm_call", llm_call)
    b.add_node("tool_node", tool_node)
    b.add_edge(START, "llm_call")
    b.add_conditional_edges("llm_call", should_continue, ["tool_node", END])
    b.add_edge("tool_node", "llm_call")
    return b.compile()

def build_react_agent():
    # TODO: crea un FakeChatModel() nuevo
    # TODO: devuelve create_react_agent(model, tools)
    # TODO: (usa las mismas tools que build_manual_agent)
    ...
`,
              solutionCode: `from typing import Literal
from langchain.tools import tool
from langchain.messages import ToolMessage
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.prebuilt import create_react_agent
from course_harness import FakeChatModel

@tool
def cuadruplicar(n: int) -> int:
    """Return n times 4."""
    return n * 4

tools = [cuadruplicar]
tools_by_name = {t.name: t for t in tools}

def build_manual_agent():
    model = FakeChatModel()
    llm_with_tools = model.bind_tools(tools)

    def llm_call(state: MessagesState):
        return {"messages": [llm_with_tools.invoke(state["messages"])]}

    def tool_node(state: MessagesState):
        result = []
        for tool_call in state["messages"][-1].tool_calls:
            t = tools_by_name[tool_call["name"]]
            observation = t.invoke(tool_call["args"])
            result.append(ToolMessage(content=str(observation), tool_call_id=tool_call["id"]))
        return {"messages": result}

    def should_continue(state: MessagesState) -> Literal["tool_node", "__end__"]:
        return "tool_node" if state["messages"][-1].tool_calls else END

    b = StateGraph(MessagesState)
    b.add_node("llm_call", llm_call)
    b.add_node("tool_node", tool_node)
    b.add_edge(START, "llm_call")
    b.add_conditional_edges("llm_call", should_continue, ["tool_node", END])
    b.add_edge("tool_node", "llm_call")
    return b.compile()

def build_react_agent():
    model = FakeChatModel()
    return create_react_agent(model, tools)
`,
              validationCode: `from course_harness import check_eq

input_msg = {"messages": [{"role": "human", "content": "What is 3 cuadruplicado?"}]}

manual_result = build_manual_agent().invoke(input_msg)
react_result = build_react_agent().invoke(input_msg)

check_eq(
    "paso5_same_final_answer",
    "el ciclo manual y create_react_agent producen la misma respuesta final",
    manual_result["messages"][-1].content,
    react_result["messages"][-1].content,
)
check_eq(
    "paso5_final_answer_value",
    "la respuesta final coincide con el double configurado",
    react_result["messages"][-1].content,
    "3 times 4 is 12.",
)
`,
              llmDoubles: [
                { respuesta: "", toolCalls: [{ name: "cuadruplicar", args: { n: 3 } }] },
                { respuesta: "3 times 4 is 12.", toolCalls: [] },
              ],
            },
          },
        },
      ],
    },
    refinaSimplifica: {
      resumenBullets: [
        "ReAct = razonar, actuar (llamar tool), observar el resultado, repetir hasta responder.",
        "`create_react_agent(model, tools)` devuelve un grafo YA COMPILADO con ese ciclo montado.",
        "Por dentro usa nodos `\"agent\"` y `\"tools\"`, equivalentes a los del ciclo manual del módulo 12.",
        "No cambia la semántica del ciclo modelo→tool→modelo: solo ahorra escribir el boilerplate.",
        "El estado sigue siendo mensajes: `result[\"messages\"]` tiene la misma forma que en el ciclo manual.",
        "Sigue dependiendo de que el modelo emita `tool_calls`; con `FakeChatModel`, de los `llmDoubles` configurados.",
      ],
      sintesis: {
        kind: "code",
        reto: {
          id: "mod13-reto-sintesis",
          titulo: "Síntesis: comparar el ciclo manual y create_react_agent",
          enunciadoMd:
            "Construye DOS agentes equivalentes para la misma tool `double`: uno manual " +
            "(como en el módulo 12) y uno con `create_react_agent`. Verifica que ambos " +
            "producen la misma respuesta final para la misma pregunta.",
          starterCode: `from typing import Literal
from langchain.tools import tool
from langchain.messages import ToolMessage
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.prebuilt import create_react_agent
from course_harness import FakeChatModel

@tool
def double(n: int) -> int:
    """Return n doubled."""
    return n * 2

tools = [double]
tools_by_name = {t.name: t for t in tools}

def build_manual_agent():
    model = FakeChatModel()
    llm_with_tools = model.bind_tools(tools)

    def llm_call(state: MessagesState):
        return {"messages": [llm_with_tools.invoke(state["messages"])]}

    def tool_node(state: MessagesState):
        result = []
        for tool_call in state["messages"][-1].tool_calls:
            t = tools_by_name[tool_call["name"]]
            observation = t.invoke(tool_call["args"])
            result.append(ToolMessage(content=str(observation), tool_call_id=tool_call["id"]))
        return {"messages": result}

    def should_continue(state: MessagesState) -> Literal["tool_node", "__end__"]:
        return "tool_node" if state["messages"][-1].tool_calls else END

    b = StateGraph(MessagesState)
    b.add_node("llm_call", llm_call)
    b.add_node("tool_node", tool_node)
    b.add_edge(START, "llm_call")
    b.add_conditional_edges("llm_call", should_continue, ["tool_node", END])
    b.add_edge("tool_node", "llm_call")
    return b.compile()

def build_react_agent():
    # TODO — crea un FakeChatModel() nuevo y devuelve create_react_agent(model, tools)
    ...
`,
          solutionCode: `from typing import Literal
from langchain.tools import tool
from langchain.messages import ToolMessage
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.prebuilt import create_react_agent
from course_harness import FakeChatModel

@tool
def double(n: int) -> int:
    """Return n doubled."""
    return n * 2

tools = [double]
tools_by_name = {t.name: t for t in tools}

def build_manual_agent():
    model = FakeChatModel()
    llm_with_tools = model.bind_tools(tools)

    def llm_call(state: MessagesState):
        return {"messages": [llm_with_tools.invoke(state["messages"])]}

    def tool_node(state: MessagesState):
        result = []
        for tool_call in state["messages"][-1].tool_calls:
            t = tools_by_name[tool_call["name"]]
            observation = t.invoke(tool_call["args"])
            result.append(ToolMessage(content=str(observation), tool_call_id=tool_call["id"]))
        return {"messages": result}

    def should_continue(state: MessagesState) -> Literal["tool_node", "__end__"]:
        return "tool_node" if state["messages"][-1].tool_calls else END

    b = StateGraph(MessagesState)
    b.add_node("llm_call", llm_call)
    b.add_node("tool_node", tool_node)
    b.add_edge(START, "llm_call")
    b.add_conditional_edges("llm_call", should_continue, ["tool_node", END])
    b.add_edge("tool_node", "llm_call")
    return b.compile()

def build_react_agent():
    model = FakeChatModel()
    return create_react_agent(model, tools)
`,
          validationCode: `from course_harness import check_eq, get_llm_calls

input_msg = {"messages": [{"role": "human", "content": "What is double of 4?"}]}

manual_result = build_manual_agent().invoke(input_msg)
calls_after_manual = get_llm_calls()
react_result = build_react_agent().invoke(input_msg)

check_eq(
    "sintesis_same_final_answer",
    "el ciclo manual y create_react_agent producen la misma respuesta final",
    manual_result["messages"][-1].content,
    react_result["messages"][-1].content,
)
check_eq(
    "sintesis_final_answer_value",
    "la respuesta final coincide con el double configurado",
    react_result["messages"][-1].content,
    "Double of 4 is 8.",
)
check_eq(
    "sintesis_llm_invoked_twice_manual",
    "el ciclo manual invoca al modelo 2 veces: decidir la tool y dar la respuesta final",
    len(calls_after_manual),
    2,
)
`,
          llmDoubles: [
            { respuesta: "", toolCalls: [{ name: "double", args: { n: 4 } }] },
            { respuesta: "Double of 4 is 8.", toolCalls: [] },
          ],
        },
      },
    },
  },
  usaLaIa: [
    {
      id: "mod13-ia1",
      titulo: "Usa la IA para decidir entre el ciclo manual y create_react_agent",
      promptsSugeridos: [
        "Tengo este ciclo manual modelo→tool→modelo del módulo 12. ¿Cómo lo reescribo " +
          "con `create_react_agent`, y qué pierdo/gano al hacerlo?",
        "Explícame con un caso distinto al del curso cuándo SÍ conviene el ciclo manual " +
          "en vez de `create_react_agent` (por ejemplo, routing custom tras la tool).",
      ],
      comoVerificar: [
        "¿La respuesta reconoce que `create_react_agent` usa nodos fijos `\"agent\"`/" +
          "`\"tools\"` (no los nombres que tú elegirías a mano)?",
        "¿Al pegar el código sugerido, el mini-ejercicio pasa dando la MISMA respuesta " +
          "final que el ciclo manual equivalente?",
        "¿La IA aclara que ambos dependen de que el modelo emita `tool_calls` (con " +
          "`FakeChatModel`, de los `llmDoubles` configurados)?",
      ],
      comoIterar:
        "Si las respuestas de ambos agentes no coinciden, imprime `result[\"messages\"]` " +
        "de cada uno y pregunta específicamente en qué mensaje difieren, en vez de pedir " +
        "los dos agentes reescritos enteros.",
      queNoDelegar: [
        "No le pidas que 'decida por ti' cuál usar en tu proyecto real: completa tú la " +
          "línea de `create_react_agent(model, tools)` una vez que entiendas el patrón.",
        "No copies una respuesta que use `ChatOllama` dentro de un reto ejecutable: el " +
          "runner de la app SOLO admite `FakeChatModel` (regla dura §8.4).",
      ],
    },
  ],
  tutorialLocal: {
    introMd:
      "Este tramo NO toca `graph.py` (el ciclo manual de tool calling sigue siendo el " +
      "pipeline principal): añade una demo aparte en `main.py` que reconstruye el MISMO " +
      "ciclo con `create_react_agent`, para comparar ambos enfoques con un LLM real.",
    setup: [
      {
        titulo: "Reactiva el entorno virtual (si cerraste la terminal)",
        descripcionMd: "No hay dependencias nuevas en este módulo.",
        powershell: ".venv\\Scripts\\Activate.ps1",
        bash: "source .venv/bin/activate",
      },
      {
        titulo: "Ejecuta el proyecto: primero el pipeline, luego la demo ReAct",
        descripcionMd: "",
        powershell: "python src\\main.py",
        bash: "python src/main.py",
      },
    ],
    codigo: [
      {
        archivo: "src/main.py",
        descripcionMd:
          "Se añade `demo_react()`: reconstruye el ciclo de tool calling del módulo 12 " +
          "(misma tool `contar_palabras`) usando `create_react_agent`, sin tocar `graph.py`.",
        codigo: `from langchain.tools import tool
from langchain_ollama import ChatOllama
from langgraph.prebuilt import create_react_agent

from graph import graph

config = {"configurable": {"thread_id": "sesion-5"}}


@tool
def contar_palabras(texto: str) -> int:
    """Cuenta cuántas palabras tiene un texto."""
    return len(texto.split())


def demo_react():
    model = ChatOllama(model="qwen2.5-coder:14b")
    react_agent = create_react_agent(model, [contar_palabras])
    resultado = react_agent.invoke(
        {"messages": [{"role": "human", "content": "¿Cuántas palabras tiene 'Hasta luego, Ana'?"}]}
    )
    print("ReAct:", resultado["messages"][-1].content)


if __name__ == "__main__":
    resultado = graph.invoke({"nombre": "Ana"}, config)
    print(resultado["saludo"])
    demo_react()
`,
      },
    ],
    salidaEsperada:
      "Hasta luego, Ana\nReAct: (respuesta de qwen2.5-coder:14b indicando el número de " +
      "palabras — el texto exacto varía porque el modelo genera lenguaje natural)",
    spine: {
      crea: [],
      modifica: ["src/main.py"],
    },
  },
};
