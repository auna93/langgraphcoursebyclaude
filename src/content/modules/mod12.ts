import type { CourseModule } from "../types";

/**
 * Módulo 12 — Tool calling: ToolNode y herramientas.
 * Contenido completo (slice S15). Código: superficie AVANZADA del grounding-adv
 * §3 y C-RUNNER §tabla "Avanzado" (@tool, bind_tools, AIMessage.tool_calls,
 * ToolMessage, ToolNode). Ciclo manual should_continue/tool_node es composición
 * de superficie core (add_conditional_edges), sin API nueva del shim.
 * §12 (ADR-15, SE4): formato enriquecido — pasos guiados, "Usa la IA" y
 * tutorial local (continúa el project spine desde mod11). Primer módulo del
 * lote 12–16 que añade tool calling REAL al proyecto (ChatOllama.bind_tools +
 * ToolNode, ilustrativo, NG-12); los retos siguen usando FakeChatModel.
 */
export const mod12: CourseModule = {
  id: "mod12",
  numero: 12,
  titulo: "Tool calling: ToolNode y herramientas",
  objetivo: "Definir tools, conectarlas con ToolNode y cerrar el ciclo modelo→tool→modelo.",
  enriquecido: true,
  secciones: {
    explicaSimple: {
      contenidoMd: `## Un asistente que sabe pedir una calculadora

Imagina que le preguntas a alguien "¿cuánto es 6 por 7?" y, en vez de intentar
calcularlo de memoria, esa persona te dice: "espera, uso la calculadora" — pulsa los
números, lee el resultado, y te lo dice. El modelo de lenguaje puede hacer lo mismo:
en vez de "inventar" una respuesta numérica, puede **pedir usar una herramienta**
(una función tuya, como \`multiply(a, b)\`), esperar el resultado, y responder con él.

Ese "pedir usar una herramienta" se llama **tool call**. El modelo no ejecuta la
función — solo dice "quiero llamar a \`multiply\` con \`a=6, b=7\`". Tu código es quien
de verdad ejecuta la función y le devuelve el resultado al modelo para que termine de
responder.

## El ciclo: modelo → tool → modelo

1. Le pasas al modelo la pregunta y la lista de herramientas disponibles
   (\`bind_tools\`).
2. El modelo responde con un \`AIMessage\` que, en vez de (o además de) texto, trae
   \`.tool_calls\`: la lista de peticiones de herramienta.
3. Tu código ejecuta cada tool solicitada y empaqueta el resultado en un
   \`ToolMessage\`.
4. Se lo devuelves al modelo (como parte de la conversación) para que dé la
   respuesta FINAL, ya con el dato correcto.`,
      consignaExplicacion:
        "Explícale a alguien que no programa, con la metáfora de 'pedir prestada una " +
        "calculadora en vez de inventar el resultado', qué es un tool call y por qué " +
        "el ciclo modelo→tool→modelo necesita volver a llamar al modelo una segunda vez.",
    },
    detectaGaps: {
      contenidoMd: "Comprueba si distingues bien qué hace el modelo y qué hace tu código.",
      quiz: {
        id: "mod12-quiz1",
        titulo: "¿Quién ejecuta la tool?",
        preguntas: [
          {
            id: "mod12-quiz1-p1",
            kind: "single",
            enunciadoMd:
              "Cuando un `AIMessage` trae `.tool_calls` no vacío, ¿quién ejecuta " +
              "realmente la función asociada?",
            opciones: [
              "El código del programador (nodo de tools / ToolNode), nunca el modelo",
              "El propio modelo, internamente",
              "Se ejecuta sola al crear el `AIMessage`",
              "Nadie: el tool_call es solo informativo y no se ejecuta",
            ],
            correcta: 0,
            explicacionMd:
              "El modelo solo DECIDE qué tool llamar y con qué argumentos; la ejecución " +
              "real la hace tu código (un nodo de tools manual o `ToolNode`).",
          },
          {
            id: "mod12-quiz1-p2",
            kind: "boolean",
            enunciadoMd:
              "`model.bind_tools(tools)` devuelve un modelo nuevo (o aumentado) que sabe " +
              "emitir `tool_calls` describiendo las herramientas disponibles.",
            correcta: true,
            explicacionMd:
              "Correcto: `bind_tools` es el patrón para 'darle a conocer' al modelo qué " +
              "herramientas puede pedir usar.",
          },
          {
            id: "mod12-quiz1-p3",
            kind: "multi",
            enunciadoMd: "¿Qué forma tiene cada elemento de `AIMessage.tool_calls`?",
            opciones: [
              "Un dict con las claves `name`, `args`, `id`",
              "Accesible por clave: `tool_call['name']`, `tool_call['args']`, `tool_call['id']`",
              "Un objeto de clase `ToolCall` sin claves accesibles",
              "`args` es siempre un string, nunca un dict",
            ],
            correctas: [0, 1],
            explicacionMd:
              "El formato exacto del grounding es un dict con `name` (str), `args` (dict) " +
              "e `id` (str), accesible por clave.",
          },
          {
            id: "mod12-quiz1-p4",
            kind: "output",
            enunciadoMd:
              "`should_continue(state)` hace `return \"tool_node\" if state[\"messages\"][-1].tool_calls else END`. " +
              "El último mensaje es un `AIMessage` SIN tool_calls (`[]`). ¿A dónde enruta " +
              "`add_conditional_edges(\"llm_call\", should_continue, [\"tool_node\", END])`?",
            codigo:
              'def should_continue(state):\n    last = state["messages"][-1]\n    return "tool_node" if last.tool_calls else END',
            opciones: ["A END: termina el ciclo", "A tool_node: sigue el ciclo", "Lanza un error", "A llm_call de nuevo"],
            correcta: 0,
            explicacionMd:
              "Sin `tool_calls` por resolver, `should_continue` devuelve `END`: el modelo ya " +
              "dio su respuesta final y no hace falta volver a llamar tools.",
          },
          {
            id: "mod12-quiz1-p5",
            kind: "single",
            enunciadoMd: "¿Qué produce `ToolNode(tools)` al ejecutarse como nodo?",
            opciones: [
              "Lee `tool_calls` del último `AIMessage`, ejecuta cada tool y devuelve `{'messages': [ToolMessage(...), ...]}`",
              "Modifica el `AIMessage` original en el sitio, sin añadir mensajes nuevos",
              "Llama de nuevo al modelo automáticamente",
              "Ignora `tool_calls` y ejecuta todas las tools registradas siempre",
            ],
            correcta: 0,
            explicacionMd:
              "`ToolNode` reemplaza al nodo manual: itera `tool_calls`, ejecuta cada tool y " +
              "añade un `ToolMessage` por cada una al estado de mensajes.",
          },
        ],
      },
    },
    llenaGaps: {
      contenidoMd: `## @tool + bind_tools + ciclo manual

\`\`\`python
from typing import Literal
from langchain.tools import tool
from langchain.messages import ToolMessage
from langgraph.graph import StateGraph, MessagesState, START, END
from course_harness import FakeChatModel

@tool
def multiply(a: int, b: int) -> int:
    """Multiply a and b."""
    return a * b

tools = [multiply]
tools_by_name = {t.name: t for t in tools}
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
    last = state["messages"][-1]
    return "tool_node" if last.tool_calls else END

b = StateGraph(MessagesState)
b.add_node("llm_call", llm_call)
b.add_node("tool_node", tool_node)
b.add_edge(START, "llm_call")
b.add_conditional_edges("llm_call", should_continue, ["tool_node", END])
b.add_edge("tool_node", "llm_call")   # cierra el ciclo modelo -> tool -> modelo
agent = b.compile()
\`\`\`

## ToolNode prebuilt: el mismo ciclo con menos código

\`\`\`python
from langgraph.prebuilt import ToolNode

builder = StateGraph(MessagesState)
builder.add_node("llm_call", llm_call)
builder.add_node("tools", ToolNode(tools))
builder.add_edge(START, "llm_call")
builder.add_conditional_edges(
    "llm_call",
    lambda s: "tools" if s["messages"][-1].tool_calls else END,
    ["tools", END],
)
builder.add_edge("tools", "llm_call")
graph = builder.compile()
\`\`\`

**Cómo leerlo:** \`ToolNode(tools)\` sustituye al \`tool_node\` manual — hace exactamente
lo mismo (lee \`tool_calls\` del último \`AIMessage\`, ejecuta cada tool, devuelve
\`ToolMessage\`s), con menos código propio.

**Errores comunes:**
- Ejecutar la tool tú mismo cuando el modelo "quiere" llamarla: el modelo solo pide,
  nunca ejecuta.
- Olvidar el edge de vuelta \`tool_node -> llm_call\`: sin él, el modelo nunca ve el
  resultado de la tool y no puede dar su respuesta final.
- Pedir una tool que no existe en \`tools_by_name\`/\`ToolNode\`: lanza un error claro,
  no falla en silencio.
- Confundir \`tool_call["id"]\` (identifica la petición) con \`tool_call["name"]\`
  (identifica qué tool llamar): \`ToolMessage(tool_call_id=...)\` debe referenciar el
  \`id\`, no el \`name\`.`,
      retos: [
        {
          id: "mod12-reto1",
          titulo: "Ciclo manual modelo→tool→modelo con should_continue",
          enunciadoMd:
            "Completa `tool_node` y `should_continue` para cerrar el ciclo: el modelo pide " +
            "`multiply(6, 7)`, tu código ejecuta la tool y se lo devuelve, y el modelo da " +
            "la respuesta final.",
          starterCode: `from typing import Literal
from langchain.tools import tool
from langchain.messages import ToolMessage
from langgraph.graph import StateGraph, MessagesState, START, END
from course_harness import FakeChatModel

@tool
def multiply(a: int, b: int) -> int:
    """Multiply a and b."""
    return a * b

tools = [multiply]
tools_by_name = {t.name: t for t in tools}

def build_agent():
    model = FakeChatModel()
    llm_with_tools = model.bind_tools(tools)

    def llm_call(state: MessagesState):
        return {"messages": [llm_with_tools.invoke(state["messages"])]}

    def tool_node(state: MessagesState):
        # TODO — por cada tool_call en state["messages"][-1].tool_calls,
        # ejecuta tools_by_name[tool_call["name"]].invoke(tool_call["args"])
        # y añade un ToolMessage(content=str(resultado), tool_call_id=tool_call["id"])
        ...

    def should_continue(state: MessagesState) -> Literal["tool_node", "__end__"]:
        # TODO — "tool_node" si el último mensaje tiene tool_calls, si no END
        ...

    b = StateGraph(MessagesState)
    b.add_node("llm_call", llm_call)
    b.add_node("tool_node", tool_node)
    b.add_edge(START, "llm_call")
    b.add_conditional_edges("llm_call", should_continue, ["tool_node", END])
    b.add_edge("tool_node", "llm_call")
    return b.compile()
`,
          solutionCode: `from typing import Literal
from langchain.tools import tool
from langchain.messages import ToolMessage
from langgraph.graph import StateGraph, MessagesState, START, END
from course_harness import FakeChatModel

@tool
def multiply(a: int, b: int) -> int:
    """Multiply a and b."""
    return a * b

tools = [multiply]
tools_by_name = {t.name: t for t in tools}

def build_agent():
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
        last = state["messages"][-1]
        return "tool_node" if last.tool_calls else END

    b = StateGraph(MessagesState)
    b.add_node("llm_call", llm_call)
    b.add_node("tool_node", tool_node)
    b.add_edge(START, "llm_call")
    b.add_conditional_edges("llm_call", should_continue, ["tool_node", END])
    b.add_edge("tool_node", "llm_call")
    return b.compile()
`,
          validationCode: `from course_harness import check_eq, get_llm_calls

agent = build_agent()
result = agent.invoke({"messages": [{"role": "human", "content": "What is 6 times 7?"}]})
messages = result["messages"]

check_eq(
    "cycle_message_count",
    "el hilo final tiene human + AI(tool_call) + tool + AI(final) = 4 mensajes",
    len(messages),
    4,
)

ai_with_tool_call = messages[1]
check_eq(
    "tool_call_name",
    "la primera respuesta del modelo llama a multiply",
    ai_with_tool_call.tool_calls[0]["name"],
    "multiply",
)
check_eq(
    "tool_call_args",
    "los argumentos del tool_call son los del double configurado",
    ai_with_tool_call.tool_calls[0]["args"],
    {"a": 6, "b": 7},
)

tool_message = messages[2]
check_eq(
    "tool_message_content",
    "el ToolMessage contiene el resultado de multiply(6, 7)",
    tool_message.content,
    "42",
)
check_eq(
    "tool_message_call_id",
    "el ToolMessage referencia el mismo tool_call_id",
    tool_message.tool_call_id,
    ai_with_tool_call.tool_calls[0]["id"],
)

final_ai = messages[3]
check_eq(
    "final_answer",
    "la respuesta final es la del segundo double (sin tool_calls)",
    final_ai.content,
    "6 times 7 is 42.",
)
check_eq("final_no_tool_calls", "la respuesta final no trae tool_calls", final_ai.tool_calls, [])

calls = get_llm_calls()
check_eq(
    "llm_invoked_twice",
    "el modelo fue invocado 2 veces: una para decidir la tool, otra para la respuesta final",
    len(calls),
    2,
)
`,
          llmDoubles: [
            { respuesta: "", toolCalls: [{ name: "multiply", args: { a: 6, b: 7 } }] },
            { respuesta: "6 times 7 is 42.", toolCalls: [] },
          ],
        },
      ],
      pasos: [
        {
          id: "mod12-paso1",
          titulo: "El modelo pide usar una tool",
          explicacionMd:
            "Antes del ciclo completo, practica lo mínimo: un nodo que invoca al modelo " +
            "YA aumentado con `bind_tools` y devuelve su respuesta (que puede traer " +
            "`tool_calls`).",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod12-paso1-reto",
              titulo: "Completa el nodo que invoca al modelo con tools",
              enunciadoMd:
                "Completa `llm_call` para que devuelva `{\"messages\": " +
                '[llm_with_tools.invoke(state["messages"])]}`.',
              starterCode: `from langchain.tools import tool
from langgraph.graph import StateGraph, MessagesState, START, END
from course_harness import FakeChatModel

@tool
def sumar(a: int, b: int) -> int:
    """Add a and b."""
    return a + b

tools = [sumar]
model = FakeChatModel()
llm_with_tools = model.bind_tools(tools)

def llm_call(state: MessagesState):
    # TODO: devuelve {"messages": [llm_with_tools.invoke(state["messages"])]}
    ...

graph = (
    StateGraph(MessagesState)
    .add_node("llm_call", llm_call)
    .add_edge(START, "llm_call")
    .add_edge("llm_call", END)
    .compile()
)
`,
              solutionCode: `from langchain.tools import tool
from langgraph.graph import StateGraph, MessagesState, START, END
from course_harness import FakeChatModel

@tool
def sumar(a: int, b: int) -> int:
    """Add a and b."""
    return a + b

tools = [sumar]
model = FakeChatModel()
llm_with_tools = model.bind_tools(tools)

def llm_call(state: MessagesState):
    return {"messages": [llm_with_tools.invoke(state["messages"])]}

graph = (
    StateGraph(MessagesState)
    .add_node("llm_call", llm_call)
    .add_edge(START, "llm_call")
    .add_edge("llm_call", END)
    .compile()
)
`,
              validationCode: `from course_harness import check_eq

result = graph.invoke({"messages": [{"role": "human", "content": "Cuánto es 2 más 3?"}]})
ai = result["messages"][-1]
check_eq("paso1_tool_call_name", "el modelo pide usar la tool sumar", ai.tool_calls[0]["name"], "sumar")
check_eq("paso1_tool_call_args", "los argumentos del tool_call son los del double", ai.tool_calls[0]["args"], {"a": 2, "b": 3})
`,
              llmDoubles: [{ respuesta: "", toolCalls: [{ name: "sumar", args: { a: 2, b: 3 } }] }],
            },
          },
        },
        {
          id: "mod12-paso2",
          titulo: "Lee el ciclo manual completo",
          explicacionMd:
            "Lee el ciclo modelo→tool→modelo completo antes de tocar código: `llm_call`, " +
            "`tool_node` y `should_continue` conectados con un edge de vuelta.",
          accion: {
            kind: "lectura",
            bloqueMd: `\`\`\`python
def tool_node(state: MessagesState):
    result = []
    for tool_call in state["messages"][-1].tool_calls:
        t = tools_by_name[tool_call["name"]]
        observation = t.invoke(tool_call["args"])
        result.append(ToolMessage(content=str(observation), tool_call_id=tool_call["id"]))
    return {"messages": result}

def should_continue(state: MessagesState):
    return "tool_node" if state["messages"][-1].tool_calls else END
\`\`\`
Este fragmento ya está completo: solo léelo, no hace falta ejecutarlo ni completar nada todavía.`,
          },
        },
        {
          id: "mod12-paso3",
          titulo: "Completa el nodo de tools manual",
          explicacionMd:
            "Practica el nodo que ejecuta la tool solicitada y empaqueta el resultado en " +
            "un `ToolMessage`, referenciando el `tool_call_id` correcto.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod12-paso3-reto",
              titulo: "Completa tool_node",
              enunciadoMd:
                "Completa `tool_node`: por cada `tool_call`, ejecuta la tool con " +
                "`tools_by_name[tool_call[\"name\"]].invoke(tool_call[\"args\"])` y añade el " +
                "`ToolMessage` correspondiente.",
              starterCode: `from langchain.tools import tool
from langchain.messages import ToolMessage
from langgraph.graph import MessagesState

@tool
def sumar(a: int, b: int) -> int:
    """Add a and b."""
    return a + b

tools = [sumar]
tools_by_name = {t.name: t for t in tools}

def tool_node(state: MessagesState):
    result = []
    for tool_call in state["messages"][-1].tool_calls:
        # TODO: obtén la tool en tools_by_name[tool_call["name"]] y ejecútala con .invoke(tool_call["args"])
        observation = None
        # TODO: agrega ToolMessage(content=str(observation), tool_call_id=tool_call["id"]) a result
    return {"messages": result}
`,
              solutionCode: `from langchain.tools import tool
from langchain.messages import ToolMessage
from langgraph.graph import MessagesState

@tool
def sumar(a: int, b: int) -> int:
    """Add a and b."""
    return a + b

tools = [sumar]
tools_by_name = {t.name: t for t in tools}

def tool_node(state: MessagesState):
    result = []
    for tool_call in state["messages"][-1].tool_calls:
        t = tools_by_name[tool_call["name"]]
        observation = t.invoke(tool_call["args"])
        result.append(ToolMessage(content=str(observation), tool_call_id=tool_call["id"]))
    return {"messages": result}
`,
              validationCode: `from course_harness import check_eq

class FakeAI:
    def __init__(self, tool_calls):
        self.tool_calls = tool_calls

state = {"messages": [FakeAI([{"name": "sumar", "args": {"a": 4, "b": 5}, "id": "call_1"}])]}
result = tool_node(state)
check_eq("paso3_tool_result", "el ToolMessage contiene el resultado de sumar(4, 5)", result["messages"][0].content, "9")
check_eq("paso3_tool_call_id", "el ToolMessage referencia el mismo tool_call_id", result["messages"][0].tool_call_id, "call_1")
`,
            },
          },
        },
        {
          id: "mod12-paso4",
          titulo: "Predicción: ¿a dónde enruta should_continue?",
          explicacionMd:
            "Antes de cerrar el ciclo, predice a dónde enruta `should_continue` cuando el " +
            "último mensaje NO trae `tool_calls`.",
          accion: {
            kind: "quiz",
            quiz: {
              id: "mod12-paso4-quiz",
              titulo: "¿END o tool_node?",
              preguntas: [
                {
                  id: "mod12-paso4-quiz-p1",
                  kind: "single",
                  enunciadoMd:
                    "`should_continue` hace `return \"tool_node\" if last.tool_calls else END`. " +
                    "El último mensaje NO trae `tool_calls`. ¿A dónde enruta?",
                  opciones: ["A END", "A tool_node", "Lanza un error", "Se queda en el mismo nodo"],
                  correcta: 0,
                  explicacionMd:
                    "Sin `tool_calls` pendientes, la respuesta del modelo ya es la final: " +
                    "`should_continue` devuelve `END`.",
                },
              ],
            },
          },
        },
        {
          id: "mod12-paso5",
          titulo: "Cierra el ciclo con ToolNode prebuilt",
          explicacionMd:
            "Combina todo: `should_continue`, el nodo `ToolNode(tools)` y los edges " +
            "necesarios para cerrar el ciclo modelo→tool→modelo.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod12-paso5-reto",
              titulo: "Completa el grafo con ToolNode",
              enunciadoMd:
                "Completa `should_continue`, registra el nodo `\"tools\"` con `ToolNode(tools)` " +
                "y añade el `add_conditional_edges` que falta.",
              starterCode: `from langchain.tools import tool
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.prebuilt import ToolNode
from course_harness import FakeChatModel

@tool
def restar(a: int, b: int) -> int:
    """Subtract b from a."""
    return a - b

tools = [restar]

def build_agent():
    model = FakeChatModel()
    llm_with_tools = model.bind_tools(tools)

    def llm_call(state: MessagesState):
        return {"messages": [llm_with_tools.invoke(state["messages"])]}

    def should_continue(state: MessagesState):
        # TODO: devuelve "tools" si el último mensaje tiene tool_calls, si no END
        ...

    builder = StateGraph(MessagesState)
    builder.add_node("llm_call", llm_call)
    # TODO: registra el nodo "tools" con ToolNode(tools)
    builder.add_edge(START, "llm_call")
    # TODO: añade add_conditional_edges("llm_call", should_continue, ["tools", END])
    builder.add_edge("tools", "llm_call")
    return builder.compile()
`,
              solutionCode: `from langchain.tools import tool
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.prebuilt import ToolNode
from course_harness import FakeChatModel

@tool
def restar(a: int, b: int) -> int:
    """Subtract b from a."""
    return a - b

tools = [restar]

def build_agent():
    model = FakeChatModel()
    llm_with_tools = model.bind_tools(tools)

    def llm_call(state: MessagesState):
        return {"messages": [llm_with_tools.invoke(state["messages"])]}

    def should_continue(state: MessagesState):
        return "tools" if state["messages"][-1].tool_calls else END

    builder = StateGraph(MessagesState)
    builder.add_node("llm_call", llm_call)
    builder.add_node("tools", ToolNode(tools))
    builder.add_edge(START, "llm_call")
    builder.add_conditional_edges("llm_call", should_continue, ["tools", END])
    builder.add_edge("tools", "llm_call")
    return builder.compile()
`,
              validationCode: `from course_harness import check_eq, get_llm_calls

agent = build_agent()
result = agent.invoke({"messages": [{"role": "human", "content": "What is 9 minus 4?"}]})
check_eq("paso5_final_answer", "la respuesta final llega tras ejecutar la tool", result["messages"][-1].content, "9 minus 4 is 5.")

calls = get_llm_calls()
check_eq("paso5_llm_invoked_twice", "el modelo se invoca 2 veces: decidir la tool y responder", len(calls), 2)
`,
              llmDoubles: [
                { respuesta: "", toolCalls: [{ name: "restar", args: { a: 9, b: 4 } }] },
                { respuesta: "9 minus 4 is 5.", toolCalls: [] },
              ],
            },
          },
        },
      ],
    },
    refinaSimplifica: {
      resumenBullets: [
        "El modelo solo PIDE usar una tool (`tool_calls`); tu código es quien la ejecuta de verdad.",
        "`@tool` convierte una función con docstring en una tool con `.name`/`.description`/`.invoke(args)`.",
        "`model.bind_tools(tools)` da a conocer al modelo qué herramientas puede pedir.",
        "`AIMessage.tool_calls` es una lista de dicts `{name, args, id}`.",
        "El ciclo completo es modelo -> tool -> modelo: tras ejecutar la tool, hay que volver a llamar al modelo con el `ToolMessage` para obtener la respuesta final.",
        "`ToolNode(tools)` hace exactamente lo mismo que el `tool_node` manual, con menos código.",
        "`ToolMessage(content=..., tool_call_id=...)` debe referenciar el `id` del tool_call, no el `name`.",
      ],
      sintesis: {
        kind: "code",
        reto: {
          id: "mod12-reto-sintesis",
          titulo: "Síntesis: el mismo ciclo con ToolNode prebuilt",
          enunciadoMd:
            "Reconstruye el ciclo modelo→tool→modelo usando `ToolNode(tools)` en vez del " +
            "nodo manual, para la tool `add(a, b)`.",
          starterCode: `from langchain.tools import tool
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.prebuilt import ToolNode
from course_harness import FakeChatModel

@tool
def add(a: int, b: int) -> int:
    """Add a and b."""
    return a + b

tools = [add]

def build_agent():
    model = FakeChatModel()
    llm_with_tools = model.bind_tools(tools)

    def llm_call(state: MessagesState):
        return {"messages": [llm_with_tools.invoke(state["messages"])]}

    def should_continue(state: MessagesState):
        return "tools" if state["messages"][-1].tool_calls else END

    # TODO — construye el StateGraph(MessagesState) con nodos "llm_call" y
    # "tools" (usando ToolNode(tools)), edges START->llm_call,
    # add_conditional_edges(llm_call, should_continue, ["tools", END]),
    # y "tools"->"llm_call". Devuelve el grafo compilado.
    ...
`,
          solutionCode: `from langchain.tools import tool
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.prebuilt import ToolNode
from course_harness import FakeChatModel

@tool
def add(a: int, b: int) -> int:
    """Add a and b."""
    return a + b

tools = [add]

def build_agent():
    model = FakeChatModel()
    llm_with_tools = model.bind_tools(tools)

    def llm_call(state: MessagesState):
        return {"messages": [llm_with_tools.invoke(state["messages"])]}

    def should_continue(state: MessagesState):
        return "tools" if state["messages"][-1].tool_calls else END

    builder = StateGraph(MessagesState)
    builder.add_node("llm_call", llm_call)
    builder.add_node("tools", ToolNode(tools))
    builder.add_edge(START, "llm_call")
    builder.add_conditional_edges("llm_call", should_continue, ["tools", END])
    builder.add_edge("tools", "llm_call")
    return builder.compile()
`,
          validationCode: `from course_harness import check_eq, get_llm_calls

agent = build_agent()
result = agent.invoke({"messages": [{"role": "human", "content": "What is 2 plus 3?"}]})

tool_message = result["messages"][2]
check_eq(
    "toolnode_result_content",
    "ToolNode ejecuta la tool y produce un ToolMessage con el resultado",
    tool_message.content,
    "5",
)
check_eq(
    "toolnode_final_answer",
    "la respuesta final llega tras devolver el resultado de la tool al modelo",
    result["messages"][-1].content,
    "2 plus 3 is 5.",
)

calls = get_llm_calls()
check_eq(
    "sintesis_llm_invoked_twice",
    "el modelo fue invocado 2 veces: una para decidir la tool, otra para la respuesta final",
    len(calls),
    2,
)
`,
          llmDoubles: [
            { respuesta: "", toolCalls: [{ name: "add", args: { a: 2, b: 3 } }] },
            { respuesta: "2 plus 3 is 5.", toolCalls: [] },
          ],
        },
      },
    },
  },
  usaLaIa: [
    {
      id: "mod12-ia1",
      titulo: "Usa la IA para depurar un tool_call que no ejecuta o que no cierra el ciclo",
      promptsSugeridos: [
        "Mi grafo se queda esperando o lanza un error al ejecutar una tool. Aquí está mi " +
          "`tool_node` y el `tool_call` que recibí: ¿qué me falta para ejecutarla y " +
          "devolver el `ToolMessage` correcto?",
        "Explícame con una tool distinta a la del curso por qué hace falta volver a " +
          "invocar al modelo DESPUÉS de ejecutar la tool, en vez de terminar ahí.",
      ],
      comoVerificar: [
        "¿La respuesta referencia `tool_call[\"id\"]` (no `tool_call[\"name\"]`) al crear " +
          "el `ToolMessage`?",
        "¿Al pegar el código sugerido, el mini-ejercicio pasa con el resultado EXACTO " +
          "esperado (no solo 'ya no lanza error')?",
        "¿La IA distingue con claridad quién PIDE la tool (el modelo) de quién la " +
          "EJECUTA (tu código)?",
      ],
      comoIterar:
        "Si el ciclo no cierra, imprime `state[\"messages\"]` completo tras cada paso y " +
        "pregunta específicamente si falta el edge de vuelta `tools -> llm_call`, en vez " +
        "de pedir el grafo reescrito entero.",
      queNoDelegar: [
        "No le pidas que 'arme todo el agente con tools': completa tú la línea del " +
          "`tools_by_name[...].invoke(...)` una vez que entiendas el patrón.",
        "No copies una respuesta que use `ChatOllama` dentro de un reto ejecutable: el " +
          "runner de la app SOLO admite `FakeChatModel` (regla dura §8.4); `ChatOllama` " +
          "es exclusivamente para tu máquina, en el tutorial local.",
      ],
    },
  ],
  tutorialLocal: {
    introMd:
      "Este tramo añade tool calling REAL al proyecto: `ChatOllama` decide si necesita " +
      "una tool (`contar_palabras`) antes de responder, y `ToolNode` la ejecuta.",
    setup: [
      {
        titulo: "Reactiva el entorno virtual (si cerraste la terminal)",
        descripcionMd: "No hay dependencias nuevas en este módulo (langchain ya incluye `langchain.tools`).",
        powershell: ".venv\\Scripts\\Activate.ps1",
        bash: "source .venv/bin/activate",
      },
      {
        titulo: "Ejecuta el grafo con el ciclo de tool calling",
        descripcionMd: "",
        powershell: "python src\\main.py",
        bash: "python src/main.py",
      },
    ],
    codigo: [
      {
        archivo: "src/graph.py",
        descripcionMd:
          "`conversar` se aumenta con `bind_tools([contar_palabras])`; si el modelo pide " +
          "la tool, el nuevo nodo `\"tools\"` (`ToolNode`) la ejecuta y el grafo vuelve a " +
          "`conversar` para que el modelo dé la respuesta final con el resultado.",
        codigo: `# ... contar_visitas, construir_saludo, agradecer, route_agradecer, despedir
# (sin cambios respecto del módulo 11) ...

from langchain.tools import tool
from langchain.messages import ToolMessage
from langchain_ollama import ChatOllama
from langgraph.prebuilt import ToolNode

@tool
def contar_palabras(texto: str) -> int:
    """Cuenta cuántas palabras tiene un texto."""
    return len(texto.split())


tools = [contar_palabras]
model = ChatOllama(model="qwen2.5-coder:14b")
model_with_tools = model.bind_tools(tools)


def conversar(state: OverallState) -> OutputState:
    mensajes = state.get("messages", [])
    if mensajes and isinstance(mensajes[-1], ToolMessage):
        respuesta = model_with_tools.invoke(mensajes)
        return {"messages": [respuesta]}
    pregunta = {
        "role": "human",
        "content": f"¿Cuántas palabras tiene el saludo '{state['saludo']}'? Usa la herramienta si la necesitas.",
    }
    respuesta = model_with_tools.invoke([pregunta])
    return {"messages": [pregunta, respuesta]}


def should_continue(state: OverallState):
    return "tools" if state["messages"][-1].tool_calls else END


builder = StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)
builder.add_node("contar_visitas", contar_visitas)
builder.add_node("construir_saludo", construir_saludo)
builder.add_node("agradecer", agradecer)
builder.add_node("despedir", despedir)
builder.add_node("conversar", conversar)
builder.add_node("tools", ToolNode(tools))
builder.add_edge(START, "contar_visitas")
builder.add_edge("contar_visitas", "construir_saludo")
builder.add_edge("construir_saludo", "agradecer")
builder.add_conditional_edges("agradecer", route_agradecer)
builder.add_edge("despedir", "conversar")
builder.add_conditional_edges("conversar", should_continue, ["tools", END])
builder.add_edge("tools", "conversar")

graph = builder.compile(...)  # mismos argumentos (checkpointer + store) que el módulo 11
`,
      },
    ],
    salidaEsperada:
      "(el modelo decide si llama a contar_palabras antes de responder cuántas palabras " +
      "tiene el saludo — el texto exacto varía porque qwen genera lenguaje natural)",
    spine: {
      crea: [],
      modifica: ["src/graph.py"],
    },
  },
};
