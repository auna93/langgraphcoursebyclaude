import type { CourseModule } from "../types";

/**
 * Módulo 06 — Estado conversacional: add_messages.
 * Contenido completo (slice S13). Código: API del grounding §1 y §3 exclusivamente
 * (add_messages, langchain.messages). Sin checkpointer/threads (llegan en módulo 07).
 * §12 (ADR-15, SE2): formato enriquecido — pasos guiados, "Usa la IA" y
 * tutorial local (continúa el project spine desde mod05). Solo shim core.
 */
export const mod06: CourseModule = {
  id: "mod06",
  numero: 6,
  titulo: "Estado conversacional: add_messages",
  objetivo:
    "Modelar conversaciones con messages: Annotated[list[AnyMessage], add_messages] y " +
    "explicar su semántica (append + update por id).",
  enriquecido: true,
  secciones: {
    explicaSimple: {
      contenidoMd: `## Un chat de mensajería, no una hoja que se borra

Piensa en el historial de una conversación de chat: cada mensaje nuevo se **añade**
debajo de los anteriores, nunca borra los que ya estaban. Si en el módulo 03 viste que
\`operator.add\` sirve para "acumular" listas en general, una conversación tiene una
necesidad más específica: además de **añadir** mensajes nuevos, a veces necesitas
**corregir o reemplazar un mensaje que ya existe** (por ejemplo, si el modelo edita su
propia respuesta antes de que el usuario la vea). Eso ya no es un simple "pegar al
final" — es "si ya existe un mensaje con este identificador, reemplázalo; si no existe,
añádelo al final".

## \`add_messages\`: el reducer hecho a medida para chats

LangGraph trae un reducer especializado para exactamente ese caso: \`add_messages\`. Se
usa igual que \`operator.add\` (con \`Annotated\`), pero en vez de simplemente concatenar,
entiende de mensajes: cada mensaje tiene un identificador (\`id\`); si un nodo devuelve un
mensaje con un \`id\` que ya existe en el historial, lo **actualiza** en su sitio; si el
\`id\` es nuevo, lo **añade** al final. Así puedes modelar tanto "el usuario mandó un
mensaje nuevo" como "el asistente corrigió su última respuesta" con la misma pieza.`,
      consignaExplicacion:
        "Explícale a alguien que no programa, usando la metáfora del historial de un chat " +
        "que nunca se borra, la diferencia entre 'añadir un mensaje nuevo' y 'corregir un " +
        "mensaje que ya existe', y por qué un chat necesita las dos cosas.",
    },
    detectaGaps: {
      contenidoMd:
        "Comprueba si distingues cuándo `add_messages` añade un mensaje y cuándo lo " +
        "actualiza en su sitio.",
      quiz: {
        id: "mod06-quiz1",
        titulo: "El reducer add_messages",
        preguntas: [
          {
            id: "mod06-quiz1-p1",
            kind: "single",
            enunciadoMd:
              "Un nodo devuelve `{'messages': [nuevo_mensaje]}` donde `nuevo_mensaje.id` NO " +
              "existe todavía en el historial. ¿Qué hace `add_messages`?",
            opciones: [
              "Añade `nuevo_mensaje` al final del historial existente.",
              "Reemplaza todo el historial por `[nuevo_mensaje]`.",
              "Ignora el mensaje porque falta un `id` conocido.",
              "Lanza un error porque el `id` no existe.",
            ],
            correcta: 0,
            explicacionMd:
              "Con un `id` nuevo, `add_messages` se comporta como append: añade el mensaje " +
              "al final, igual que `operator.add` con una lista de un elemento.",
          },
          {
            id: "mod06-quiz1-p2",
            kind: "boolean",
            enunciadoMd:
              "Si un nodo devuelve un mensaje cuyo `id` YA existe en el historial, " +
              "`add_messages` reemplaza ese mensaje en su posición original en vez de " +
              "añadir uno duplicado.",
            correcta: true,
            explicacionMd:
              "Correcto: esa es la diferencia clave frente a `operator.add` — " +
              "`add_messages` actualiza por `id` en vez de acumular ciegamente.",
          },
          {
            id: "mod06-quiz1-p3",
            kind: "multi",
            enunciadoMd: "¿Cuáles de estas afirmaciones sobre `messages: Annotated[list[AnyMessage], add_messages]` son correctas?",
            opciones: [
              "`add_messages` acepta tanto dicts `{'role': ..., 'content': ...}` como objetos de mensaje del shim.",
              "Es el reducer recomendado para modelar el historial de una conversación.",
              "Sin `Annotated[..., add_messages]`, la clave `messages` también acumularía mensajes automáticamente.",
              "`AnyMessage` es el tipo que agrupa los distintos tipos de mensaje (System/Human/AI/Tool).",
            ],
            correctas: [0, 1, 3],
            explicacionMd:
              "Sin el reducer `add_messages`, `messages` se comporta como cualquier clave " +
              "sin `Annotated`: se SOBRESCRIBE, no se acumula (regla del módulo 03).",
          },
          {
            id: "mod06-quiz1-p4",
            kind: "output",
            enunciadoMd:
              "Un nodo tiene el historial `[HumanMessage('hola', id='1')]` y devuelve " +
              "`{'messages': [AIMessage('¡hola!', id='2')]}`. ¿Cuántos mensajes hay tras " +
              "aplicar `add_messages`?",
            codigo:
              "historial = [HumanMessage('hola', id='1')]\n" +
              "update = {'messages': [AIMessage('¡hola!', id='2')]}\n",
            opciones: ["2 mensajes: el humano y el del asistente", "1 mensaje: solo el del asistente", "0 mensajes", "Error: falta un 'id' repetido"],
            correcta: 0,
            explicacionMd:
              "El `id='2'` es nuevo (no existía como `'1'`), así que `add_messages` lo " +
              "AÑADE al final: el historial queda con los dos mensajes.",
          },
          {
            id: "mod06-quiz1-p5",
            kind: "single",
            enunciadoMd: "¿De dónde se importa `add_messages` y qué se importa junto a él para tipar el historial de mensajes?",
            opciones: [
              "`from langgraph.graph.message import add_messages` y `from langchain.messages import AnyMessage`",
              "`from langgraph.checkpoint.memory import add_messages`",
              "`from langgraph.types import add_messages`",
              "`import add_messages` (built-in de Python)",
            ],
            correcta: 0,
            explicacionMd:
              "`add_messages` vive en `langgraph.graph.message`; `AnyMessage` (el tipo para " +
              "el historial) se importa de `langchain.messages`.",
          },
        ],
      },
    },
    llenaGaps: {
      contenidoMd: `## Estado conversacional en código real

\`\`\`python
from typing import Annotated
from typing_extensions import TypedDict
from langchain.messages import AnyMessage, HumanMessage, AIMessage
from langgraph.graph.message import add_messages
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]

def responder(state: State):
    ultimo = state["messages"][-1]
    return {"messages": [AIMessage(f"Recibido: {ultimo.content}")]}

builder = StateGraph(State)
builder.add_node(responder)
builder.add_edge(START, "responder")
builder.add_edge("responder", END)
graph = builder.compile()

resultado = graph.invoke({"messages": [HumanMessage("hola")]})
# resultado["messages"] tiene 2 mensajes: el HumanMessage original + el AIMessage nuevo
\`\`\`

**Cómo leerlo:** \`messages: Annotated[list[AnyMessage], add_messages]\` declara la clave
de historial con su reducer especializado. El nodo \`responder\` lee el último mensaje
(\`state["messages"][-1]\`) y devuelve un mensaje nuevo; como su \`id\` no coincide con
ninguno existente (se genera uno automáticamente si no se especifica), \`add_messages\` lo
**añade** al final. El resultado de \`invoke\` incluye TODO el historial acumulado, no solo
lo que devolvió el último nodo.

## Actualizar un mensaje existente (mismo id)

\`\`\`python
def corregir(state: State):
    ultimo_ai = state["messages"][-1]
    # Mismo id => add_messages REEMPLAZA el mensaje en su posición, no lo duplica.
    return {"messages": [AIMessage("Versión corregida", id=ultimo_ai.id)]}
\`\`\`

Al reutilizar el mismo \`id\` de un mensaje que ya está en el historial, \`add_messages\`
sustituye ese mensaje en su sitio en vez de añadir uno nuevo — así el historial no crece
con "versiones" duplicadas de la misma respuesta.

**Errores comunes:**
- Olvidar \`Annotated[..., add_messages]\` en la clave \`messages\`: sin el reducer, cada
  nodo que devuelva mensajes SOBRESCRIBE el historial completo (pierdes toda la
  conversación anterior).
- Confundir \`add_messages\` con \`operator.add\`: \`operator.add\` no sabe de \`id\`s, así que
  siempre añadiría duplicados en vez de actualizar.
- Pasar dicts \`{"role": "user", "content": "..."}\` mezclados con objetos \`HumanMessage\`
  sin problema: \`add_messages\` acepta ambas formas, pero conviene ser consistente dentro
  de un mismo proyecto para legibilidad.`,
      retos: [
        {
          id: "mod06-reto1",
          titulo: "Completa el nodo que responde en la conversación",
          enunciadoMd:
            "Completa `responder` para que añada un `AIMessage` cuyo contenido sea " +
            "`'Eco: ' + <contenido del último mensaje>`. El reducer `add_messages` ya está " +
            "declarado en `State`.",
          starterCode: `from typing import Annotated
from typing_extensions import TypedDict
from langchain.messages import AnyMessage, AIMessage
from langgraph.graph.message import add_messages
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]

def responder(state: State):
    ultimo = state["messages"][-1]
    # TODO — devuelve {"messages": [AIMessage("Eco: " + ultimo.content)]}
    ...

builder = StateGraph(State)
builder.add_node(responder)
builder.add_edge(START, "responder")
builder.add_edge("responder", END)
graph = builder.compile()
`,
          solutionCode: `from typing import Annotated
from typing_extensions import TypedDict
from langchain.messages import AnyMessage, AIMessage
from langgraph.graph.message import add_messages
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]

def responder(state: State):
    ultimo = state["messages"][-1]
    return {"messages": [AIMessage("Eco: " + ultimo.content)]}

builder = StateGraph(State)
builder.add_node(responder)
builder.add_edge(START, "responder")
builder.add_edge("responder", END)
graph = builder.compile()
`,
          validationCode: `from course_harness import check, check_eq
from langchain.messages import HumanMessage

resultado = graph.invoke({"messages": [HumanMessage("hola")]})
check_eq(
    "historial_tiene_los_dos_mensajes",
    "El historial debe tener el mensaje humano original más la respuesta del asistente",
    len(resultado["messages"]),
    2,
)
check_eq(
    "respuesta_es_eco_del_ultimo_mensaje",
    "El último mensaje debe ser 'Eco: hola'",
    resultado["messages"][-1].content,
    "Eco: hola",
)
check(
    "primer_mensaje_se_conserva",
    "El primer mensaje del historial debe seguir siendo el mensaje humano original",
    resultado["messages"][0].content == "hola",
)
`,
        },
      ],
      pasos: [
        {
          id: "mod06-paso1",
          titulo: "Un nodo que responde con un mensaje fijo",
          explicacionMd:
            "Antes de tocar el reducer, practica lo mínimo: un nodo que devuelve un " +
            "`AIMessage` dentro de la clave `messages`. Completa `responder_fijo`.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod06-paso1-reto",
              titulo: "Completa el nodo que responde con un mensaje fijo",
              enunciadoMd:
                'Completa `responder_fijo` para que devuelva `{"messages": ' +
                '[AIMessage("Hola, humano")]}`.',
              starterCode: `from langchain.messages import AIMessage

def responder_fijo(state):
    # TODO: devuelve {"messages": [AIMessage("Hola, humano")]}
    ...
`,
              solutionCode: `from langchain.messages import AIMessage

def responder_fijo(state):
    return {"messages": [AIMessage("Hola, humano")]}
`,
              validationCode: `from course_harness import check_eq

resultado = responder_fijo({})
check_eq(
    "responder_fijo_devuelve_un_mensaje",
    "responder_fijo debe devolver exactamente un mensaje",
    len(resultado["messages"]),
    1,
)
check_eq(
    "responder_fijo_contenido_correcto",
    "El contenido del mensaje debe ser 'Hola, humano'",
    resultado["messages"][0].content,
    "Hola, humano",
)
`,
            },
          },
        },
        {
          id: "mod06-paso2",
          titulo: "add_messages en un grafo completo",
          explicacionMd:
            "`Annotated[list[AnyMessage], add_messages]` declara el historial con su " +
            "reducer especializado. Lee el grafo completo (nodo que lee el último mensaje " +
            "y responde) antes de tocar código.",
          accion: {
            kind: "lectura",
            bloqueMd: `\`\`\`python
from typing import Annotated
from typing_extensions import TypedDict
from langchain.messages import AnyMessage, HumanMessage, AIMessage
from langgraph.graph.message import add_messages
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]

def responder(state: State):
    ultimo = state["messages"][-1]
    return {"messages": [AIMessage(f"Recibido: {ultimo.content}")]}

builder = StateGraph(State)
builder.add_node(responder)
builder.add_edge(START, "responder")
builder.add_edge("responder", END)
graph = builder.compile()

graph.invoke({"messages": [HumanMessage("hola")]})
# el historial resultante tiene 2 mensajes: el humano original + la respuesta
\`\`\`
Este fragmento ya está completo: solo léelo, no hace falta ejecutarlo ni completar nada todavía.`,
          },
        },
        {
          id: "mod06-paso3",
          titulo: "Lee el historial sin romper el reducer",
          explicacionMd:
            "Un nodo puede leer `len(state[\"messages\"])` para saber cuántos mensajes hay " +
            "hasta ahora, y devolver un mensaje nuevo basado en ese conteo — el reducer se " +
            "encarga de añadirlo, el nodo no toca la lista directamente.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod06-paso3-reto",
              titulo: "Completa el nodo que cuenta mensajes",
              enunciadoMd:
                "Completa `contar_mensajes` para que devuelva un `AIMessage` con el texto " +
                '`f"Tienes {len(state[\'messages\'])} mensajes"`.',
              starterCode: `from typing import Annotated
from typing_extensions import TypedDict
from langchain.messages import AnyMessage, AIMessage
from langgraph.graph.message import add_messages
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]

def contar_mensajes(state: State):
    # TODO: devuelve {"messages": [AIMessage(f"Mensajes en el historial: {len(state['messages'])}")]}
    ...

builder = StateGraph(State)
builder.add_node(contar_mensajes)
builder.add_edge(START, "contar_mensajes")
builder.add_edge("contar_mensajes", END)
graph = builder.compile()
`,
              solutionCode: `from typing import Annotated
from typing_extensions import TypedDict
from langchain.messages import AnyMessage, AIMessage
from langgraph.graph.message import add_messages
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]

def contar_mensajes(state: State):
    return {"messages": [AIMessage(f"Mensajes en el historial: {len(state['messages'])}")]}

builder = StateGraph(State)
builder.add_node(contar_mensajes)
builder.add_edge(START, "contar_mensajes")
builder.add_edge("contar_mensajes", END)
graph = builder.compile()
`,
              validationCode: `from course_harness import check_eq
from langchain.messages import HumanMessage

resultado = graph.invoke({"messages": [HumanMessage("hola")]})
check_eq(
    "contar_mensajes_anade_al_historial",
    "El historial debe tener el mensaje humano original más la respuesta",
    len(resultado["messages"]),
    2,
)
check_eq(
    "contar_mensajes_cuenta_correctamente",
    "El nodo debe contar 1 mensaje (el humano) antes de responder",
    resultado["messages"][-1].content,
    "Mensajes en el historial: 1",
)
`,
            },
          },
        },
        {
          id: "mod06-paso4",
          titulo: "Predicción: mismo id, ¿se actualiza o se duplica?",
          explicacionMd:
            "Antes del reto de síntesis, predice qué pasa cuando un nodo devuelve un " +
            "mensaje reutilizando el `id` de uno que YA está en el historial.",
          accion: {
            kind: "quiz",
            quiz: {
              id: "mod06-paso4-quiz",
              titulo: "¿Cuántos mensajes hay tras reutilizar un id?",
              preguntas: [
                {
                  id: "mod06-paso4-quiz-p1",
                  kind: "output",
                  enunciadoMd:
                    'Un historial tiene `[AIMessage("borrador", id="x")]`. Un nodo devuelve ' +
                    '`{"messages": [AIMessage("versión final", id="x")]}`. ¿Cuántos mensajes ' +
                    "hay tras aplicar `add_messages`, y con qué contenido queda el último?",
                  codigo:
                    'historial = [AIMessage("borrador", id="x")]\n' +
                    'update = {"messages": [AIMessage("versión final", id="x")]}\n',
                  opciones: [
                    "1 mensaje, con contenido 'versión final' (se actualiza en su sitio)",
                    "2 mensajes: 'borrador' y 'versión final'",
                    "1 mensaje, con contenido 'borrador' (el update se ignora)",
                    "Error: no se puede reutilizar un id",
                  ],
                  correcta: 0,
                  explicacionMd:
                    "Como el `id='x'` ya existe, `add_messages` REEMPLAZA ese mensaje en su " +
                    "posición: el historial sigue teniendo 1 mensaje, ahora con el contenido " +
                    "'versión final'.",
                },
              ],
            },
          },
        },
        {
          id: "mod06-paso5",
          titulo: "Responde y luego marca como urgente (sin duplicar)",
          explicacionMd:
            "Practica la combinación completa antes de la síntesis de la sección: un nodo " +
            "añade una respuesta nueva, y otro la actualiza reutilizando su `id`, sin " +
            "añadir un mensaje duplicado.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod06-paso5-reto",
              titulo: "Completa responder y marcar_urgente",
              enunciadoMd:
                'Completa `responder` para que devuelva `{"messages": [AIMessage("resumen: " ' +
                '+ ultimo.content)]}`, y `marcar_urgente` para que reemplace ESE mismo ' +
                'mensaje (mismo `id`) por `"[URGENTE] " + <su contenido>`.',
              starterCode: `from typing import Annotated
from typing_extensions import TypedDict
from langchain.messages import AnyMessage, AIMessage
from langgraph.graph.message import add_messages
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]

def responder(state: State):
    ultimo = state["messages"][-1]
    # TODO: devuelve {"messages": [AIMessage("resumen: " + ultimo.content)]}
    ...

def marcar_urgente(state: State):
    ultima_respuesta = state["messages"][-1]
    # TODO: devuelve {"messages": [AIMessage("[URGENTE] " + ultima_respuesta.content, id=ultima_respuesta.id)]}
    ...

builder = StateGraph(State)
builder.add_node(responder)
builder.add_node(marcar_urgente)
builder.add_edge(START, "responder")
builder.add_edge("responder", "marcar_urgente")
builder.add_edge("marcar_urgente", END)
graph = builder.compile()
`,
              solutionCode: `from typing import Annotated
from typing_extensions import TypedDict
from langchain.messages import AnyMessage, AIMessage
from langgraph.graph.message import add_messages
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]

def responder(state: State):
    ultimo = state["messages"][-1]
    return {"messages": [AIMessage("resumen: " + ultimo.content)]}

def marcar_urgente(state: State):
    ultima_respuesta = state["messages"][-1]
    return {"messages": [AIMessage("[URGENTE] " + ultima_respuesta.content, id=ultima_respuesta.id)]}

builder = StateGraph(State)
builder.add_node(responder)
builder.add_node(marcar_urgente)
builder.add_edge(START, "responder")
builder.add_edge("responder", "marcar_urgente")
builder.add_edge("marcar_urgente", END)
graph = builder.compile()
`,
              validationCode: `from course_harness import check, check_eq
from langchain.messages import HumanMessage

resultado = graph.invoke({"messages": [HumanMessage("hola")]})
check_eq(
    "marcar_urgente_no_duplica",
    "marcar_urgente debe REEMPLAZAR el mensaje, no añadir uno nuevo (total 2 mensajes)",
    len(resultado["messages"]),
    2,
)
check_eq(
    "marcar_urgente_contenido_final",
    "El último mensaje debe llevar el prefijo [URGENTE]",
    resultado["messages"][-1].content,
    "[URGENTE] resumen: hola",
)
check(
    "marcar_urgente_conserva_mensaje_humano",
    "El primer mensaje (humano) no debe haberse modificado",
    resultado["messages"][0].content == "hola",
)
`,
            },
          },
        },
      ],
    },
    refinaSimplifica: {
      resumenBullets: [
        "`add_messages` es el reducer especializado para historiales de conversación.",
        "Con un `id` nuevo, `add_messages` AÑADE el mensaje al final (como `operator.add`).",
        "Con un `id` ya existente en el historial, `add_messages` ACTUALIZA ese mensaje en su sitio.",
        "Se declara `messages: Annotated[list[AnyMessage], add_messages]`.",
        "`AnyMessage` (de `langchain.messages`) agrupa System/Human/AI/Tool message.",
        "Sin el reducer, cada update a `messages` sobrescribiría todo el historial (regla del módulo 03).",
        "`add_messages` acepta tanto dicts `{role, content}` como objetos de mensaje del shim.",
      ],
      sintesis: {
        kind: "code",
        reto: {
          id: "mod06-reto-sintesis",
          titulo: "Síntesis: conversación de dos turnos con corrección",
          enunciadoMd:
            "Construye un grafo de dos nodos: `responder` añade un `AIMessage` nuevo con " +
            "el eco del último mensaje humano; `corregir` reemplaza ESE MISMO mensaje " +
            "(mismo `id`) por una versión en mayúsculas. Completa `corregir` reutilizando " +
            "el `id` del último mensaje.",
          starterCode: `from typing import Annotated
from typing_extensions import TypedDict
from langchain.messages import AnyMessage, AIMessage
from langgraph.graph.message import add_messages
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]

def responder(state: State):
    ultimo = state["messages"][-1]
    return {"messages": [AIMessage("eco: " + ultimo.content)]}

def corregir(state: State):
    ultima_respuesta = state["messages"][-1]
    # TODO — devuelve {"messages": [AIMessage(ultima_respuesta.content.upper(), id=ultima_respuesta.id)]}
    ...

builder = StateGraph(State)
builder.add_node(responder)
builder.add_node(corregir)
builder.add_edge(START, "responder")
builder.add_edge("responder", "corregir")
builder.add_edge("corregir", END)
graph = builder.compile()
`,
          solutionCode: `from typing import Annotated
from typing_extensions import TypedDict
from langchain.messages import AnyMessage, AIMessage
from langgraph.graph.message import add_messages
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]

def responder(state: State):
    ultimo = state["messages"][-1]
    return {"messages": [AIMessage("eco: " + ultimo.content)]}

def corregir(state: State):
    ultima_respuesta = state["messages"][-1]
    return {"messages": [AIMessage(ultima_respuesta.content.upper(), id=ultima_respuesta.id)]}

builder = StateGraph(State)
builder.add_node(responder)
builder.add_node(corregir)
builder.add_edge(START, "responder")
builder.add_edge("responder", "corregir")
builder.add_edge("corregir", END)
graph = builder.compile()
`,
          validationCode: `from course_harness import check, check_eq
from langchain.messages import HumanMessage

resultado = graph.invoke({"messages": [HumanMessage("hola")]})
check_eq(
    "corregir_no_añade_mensaje_nuevo",
    "corregir debe REEMPLAZAR el mensaje del asistente, no añadir uno nuevo (total 2 mensajes)",
    len(resultado["messages"]),
    2,
)
check_eq(
    "mensaje_final_esta_en_mayusculas",
    "El último mensaje debe ser la versión en mayúsculas del eco",
    resultado["messages"][-1].content,
    "ECO: HOLA",
)
check(
    "mensaje_humano_original_intacto",
    "El primer mensaje (humano) no debe haberse modificado",
    resultado["messages"][0].content == "hola",
)
`,
        },
      },
    },
  },
  usaLaIa: [
    {
      id: "mod06-ia1",
      titulo: "Usa la IA para depurar un historial que se duplica o se pierde",
      promptsSugeridos: [
        "Mi grafo devuelve mensajes duplicados en vez de actualizar uno existente (o al " +
          "revés: pierde mensajes anteriores). Aquí está mi declaración de `State` y el " +
          "nodo que devuelve el mensaje. ¿Qué me falta para que `add_messages` se comporte " +
          "como espero?",
        "Explícame con un ejemplo distinto al del curso cuándo `add_messages` decide " +
          "'añadir' un mensaje y cuándo decide 'reemplazar' uno existente.",
      ],
      comoVerificar: [
        "¿La respuesta usa `Annotated[list[AnyMessage], add_messages]` exactamente como en " +
          "el grounding, o inventa otro reducer?",
        "¿Al pegar el código sugerido, `check_eq` del mini-ejercicio pasa con el NÚMERO " +
          "exacto de mensajes esperado (ni de más ni de menos)?",
        "¿La IA distingue con claridad cuándo hace falta reutilizar el mismo `id` (para " +
          "actualizar) de cuándo hace falta omitirlo (para añadir uno nuevo)?",
      ],
      comoIterar:
        "Si el historial tiene más o menos mensajes de los esperados, pega la longitud " +
        "real (`len(resultado['messages'])`) y pregunta específicamente si el `id` del " +
        "mensaje nuevo coincide o no con uno existente, en vez de pedir el nodo reescrito.",
      queNoDelegar: [
        "No le pidas que resuelva ambos nodos del mini-ejercicio de una vez: complétalos " +
          "uno por uno para distinguir 'añadir' de 'actualizar'.",
        "No copies una respuesta que manipule `state['messages']` directamente (mutación en " +
          "el propio nodo): el patrón correcto es siempre devolver la actualización y dejar " +
          "que `add_messages` la combine.",
      ],
    },
  ],
  tutorialLocal: {
    introMd:
      "Este tramo añade estado conversacional real al proyecto: un nuevo campo " +
      "`messages` con el reducer `add_messages`, y un nodo que conversa sobre lo que ya " +
      "hizo el grafo.",
    setup: [
      {
        titulo: "Reactiva el entorno virtual (si cerraste la terminal)",
        descripcionMd: "No hay dependencias nuevas en este módulo.",
        powershell: ".venv\\Scripts\\Activate.ps1",
        bash: "source .venv/bin/activate",
      },
      {
        titulo: "Ejecuta el grafo tras los cambios",
        descripcionMd: "",
        powershell: "python src\\main.py",
        bash: "python src/main.py",
      },
    ],
    codigo: [
      {
        archivo: "src/state.py",
        descripcionMd:
          "`OverallState` y `OutputState` ganan el campo `messages` con el reducer " +
          "`add_messages` (distinto de `historial`, que usa `operator.add` sin entender " +
          "de ids).",
        codigo: `import operator
from typing import Annotated
from typing_extensions import TypedDict

from langchain.messages import AnyMessage
from langgraph.graph.message import add_messages


class InputState(TypedDict):
    nombre: str


class OutputState(TypedDict):
    saludo: str
    historial: list[str]
    messages: list[AnyMessage]


class OverallState(TypedDict):
    nombre: str
    saludo: str
    historial: Annotated[list[str], operator.add]
    vueltas: int
    messages: Annotated[list[AnyMessage], add_messages]
`,
      },
      {
        archivo: "src/graph.py",
        descripcionMd:
          "Se añade el nodo `conversar` tras `despedir`: construye una pregunta y una " +
          "respuesta sobre lo que ya hizo el grafo, usando `HumanMessage`/`AIMessage`.",
        codigo: `from typing import Literal

from langchain.messages import AIMessage, HumanMessage
from langgraph.graph import END, START, StateGraph

from state import InputState, OutputState, OverallState


def construir_saludo(state: OverallState) -> OverallState:
    saludo = "Hola, " + state["nombre"]
    return {"saludo": saludo, "historial": [saludo], "vueltas": 0}


def agradecer(state: OverallState) -> OverallState:
    agradecimiento = "Gracias, " + state["nombre"]
    return {
        "saludo": agradecimiento,
        "historial": [agradecimiento],
        "vueltas": state["vueltas"] + 1,
    }


def route_agradecer(state: OverallState) -> Literal["agradecer", "despedir"]:
    return "agradecer" if state["vueltas"] < 3 else "despedir"


def despedir(state: OverallState) -> OverallState:
    despedida = "Hasta luego, " + state["nombre"]
    return {"saludo": despedida, "historial": [despedida]}


def conversar(state: OverallState) -> OutputState:
    pregunta = HumanMessage(f"¿Qué le dijiste a {state['nombre']}?")
    respuesta = AIMessage("Le dije: " + state["saludo"])
    return {"messages": [pregunta, respuesta]}


builder = StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)
builder.add_node("construir_saludo", construir_saludo)
builder.add_node("agradecer", agradecer)
builder.add_node("despedir", despedir)
builder.add_node("conversar", conversar)
builder.add_edge(START, "construir_saludo")
builder.add_edge("construir_saludo", "agradecer")
builder.add_conditional_edges("agradecer", route_agradecer)
builder.add_edge("despedir", "conversar")
builder.add_edge("conversar", END)

graph = builder.compile()
`,
      },
      {
        archivo: "src/main.py",
        descripcionMd: "Imprime el saludo final y el contenido de la mini-conversación.",
        codigo: `from graph import graph


if __name__ == "__main__":
    resultado = graph.invoke({"nombre": "Ana"})
    print(resultado["saludo"])
    print([m.content for m in resultado["messages"]])
`,
      },
    ],
    salidaEsperada:
      "Hasta luego, Ana\n['¿Qué le dijiste a Ana?', 'Le dije: Hasta luego, Ana']",
    spine: {
      crea: [],
      modifica: ["src/state.py", "src/graph.py", "src/main.py"],
    },
  },
};
