import type { CourseModule } from "../types";

/**
 * Módulo 11 — Streaming II: messages y custom.
 * Contenido completo (slice S14). Código: API del grounding base §5 (custom +
 * get_stream_writer) y grounding-adv §5 (stream_mode="messages"), C-RUNNER
 * §tabla del shim (avanzado: `messages`; core: `custom`/`get_stream_writer`).
 * §12 (ADR-15, SE3): formato enriquecido — pasos guiados, "Usa la IA" y
 * tutorial local (continúa el project spine desde mod10). Este es el primer
 * módulo del lote 07–11 que usa un LLM real: el tutorial introduce
 * `ChatOllama` (langchain-ollama, qwen2.5-coder:14b) SOLO en el tutorial
 * (ilustrativo, NG-12) — los retos siguen usando FakeChatModel (regla §8.4).
 */
export const mod11: CourseModule = {
  id: "mod11",
  numero: 11,
  titulo: "Streaming II: messages y custom",
  objetivo:
    "Streamear tokens (messages) y eventos propios con get_stream_writer() (custom), " +
    "combinando modos.",
  enriquecido: true,
  secciones: {
    explicaSimple: {
      contenidoMd: `## Palabra por palabra, y un narrador aparte

En el módulo anterior viste "foto completa" (\`values\`) y "nota del cambio"
(\`updates\`): ambas emiten por **superstep** (por paso del grafo). Pero cuando un modelo
de lenguaje está generando texto, quieres verlo aparecer **palabra por palabra**, como
cuando alguien te habla en tiempo real en vez de entregarte la frase entera de golpe.
Eso es \`stream_mode="messages"\`: emite trocitos (\`chunks\`) del mensaje del modelo a
medida que se "generan", junto con metadatos de qué nodo los está emitiendo.

Además, a veces quieres que el propio código del grafo cuente algo que NO es parte del
estado — como un **narrador aparte** que va comentando "estoy pensando...",
"consultando la base de datos...". Eso es el canal \`custom\`: cualquier nodo puede
publicar eventos propios con \`get_stream_writer()\`, sin que formen parte del estado del
grafo.

## Puedes pedir varios canales a la vez

Igual que en el módulo anterior podías combinar \`values\` + \`updates\`, puedes combinar
CUALQUIER conjunto de modos —\`values\`, \`updates\`, \`messages\`, \`custom\`— en una sola
llamada a \`stream(...)\`, y cada evento llega etiquetado con su modo.`,
      consignaExplicacion:
        "Explícale a alguien que no programa la diferencia entre 'ver el texto del " +
        "modelo aparecer palabra por palabra' (messages) y 'un narrador aparte que " +
        "comenta lo que está pasando' (custom, con get_stream_writer).",
    },
    detectaGaps: {
      contenidoMd: "Comprueba si distingues bien `messages` de `custom`.",
      quiz: {
        id: "mod11-quiz1",
        titulo: "¿messages o custom?",
        preguntas: [
          {
            id: "mod11-quiz1-p1",
            kind: "single",
            enunciadoMd: 'Con `stream_mode="messages"`, ¿qué forma tiene cada elemento emitido?',
            opciones: [
              "Una tupla `(message_chunk, metadata)`, con `metadata['langgraph_node']` indicando el nodo emisor",
              "Un diccionario `{nodo: update}`",
              "El estado completo del grafo",
              "Un string plano con el token",
            ],
            correcta: 0,
            explicacionMd:
              "`messages` emite tuplas `(chunk, metadata)`: el chunk es un trozo del mensaje " +
              "del modelo, y `metadata['langgraph_node']` identifica qué nodo lo generó.",
          },
          {
            id: "mod11-quiz1-p2",
            kind: "boolean",
            enunciadoMd:
              "`get_stream_writer()` devuelve una función que, al llamarla dentro de un " +
              'nodo, publica un evento en el canal `custom` de `stream(..., stream_mode="custom")`.',
            correcta: true,
            explicacionMd:
              "Correcto: el `writer(payload)` que devuelve `get_stream_writer()` es el canal " +
              "para eventos propios, fuera del estado del grafo.",
          },
          {
            id: "mod11-quiz1-p3",
            kind: "multi",
            enunciadoMd: "¿Cuáles de estas afirmaciones son correctas?",
            opciones: [
              "`messages` y `custom` se pueden combinar entre sí y con `values`/`updates` en una lista de modos",
              "Concatenar todos los chunks de `messages` de un mismo mensaje reconstruye su contenido completo",
              "`custom` solo puede usarse si el grafo tiene un checkpointer",
              "El troceo de `messages` con `FakeChatModel` es determinista (mismos inputs, mismos chunks)",
            ],
            correctas: [0, 1, 3],
            explicacionMd:
              "`custom` no depende de checkpointer: es un canal de eventos separado del " +
              "estado y de la persistencia.",
          },
          {
            id: "mod11-quiz1-p4",
            kind: "output",
            enunciadoMd:
              "Un nodo hace `writer = get_stream_writer(); writer({'status': 'pensando'})` y " +
              "luego devuelve `{'joke': '...'}`. Si iteras " +
              "`graph.stream(input, stream_mode='updates')` (SIN pedir `custom`), " +
              "¿ves el evento `{'status': 'pensando'}`?",
            codigo:
              "for chunk in graph.stream(input, stream_mode=\"updates\"):\n    print(chunk)",
            opciones: [
              "No: solo se emite si `custom` está entre los modos pedidos",
              "Sí: siempre se emite junto a cualquier modo",
              "Sí, pero solo la primera vez",
              "Lanza un error porque falta pedir `custom`",
            ],
            correcta: 0,
            explicacionMd:
              "Cada evento del `writer` solo aparece si el modo `\"custom\"` está entre los " +
              "modos solicitados en `stream_mode`; si no, se descarta silenciosamente.",
          },
          {
            id: "mod11-quiz1-p5",
            kind: "single",
            enunciadoMd:
              "¿Qué diferencia principal hay entre `stream_mode='messages'` y " +
              "`stream_mode='updates'`?",
            opciones: [
              "`messages` emite trozos de texto del modelo token a token; `updates` emite por superstep completo del grafo",
              "Son exactamente lo mismo con distinto nombre",
              "`updates` es solo para LLMs; `messages` es solo para nodos normales",
              "`messages` requiere checkpointer; `updates` no",
            ],
            correcta: 0,
            explicacionMd:
              "`messages` opera a granularidad de TOKEN del mensaje del modelo; `updates` " +
              "opera a granularidad de SUPERSTEP del grafo.",
          },
          {
            id: "mod11-quiz1-p6",
            kind: "boolean",
            enunciadoMd:
              "Al combinar modos con una lista, `stream_mode=['messages', 'custom']`, cada " +
              "elemento emitido es una tupla `(modo, evento)`.",
            correcta: true,
            explicacionMd:
              "Correcto: con una lista de modos, TODOS los eventos —incluidos los de " +
              "`messages`— se etiquetan como `(modo, evento)`.",
          },
        ],
      },
    },
    llenaGaps: {
      contenidoMd: `## custom + get_stream_writer en código real

\`\`\`python
from typing_extensions import TypedDict
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

for chunk in graph.stream({"topic": "ice cream", "joke": ""}, stream_mode=["updates", "custom"]):
    mode, event = chunk
    if mode == "updates":
        for node_name, update in event.items():
            print(f"Node {node_name} updated: {update}")
    elif mode == "custom":
        print(f"Status: {event['status']}")
\`\`\`

## messages: tokens del modelo, deterministas con FakeChatModel

\`\`\`python
from langgraph.graph import StateGraph, MessagesState, START, END
from course_harness import FakeChatModel

model = FakeChatModel()

def call_model(state: MessagesState):
    return {"messages": [model.invoke(state["messages"])]}

graph = (StateGraph(MessagesState).add_node("call_model", call_model)
         .add_edge(START, "call_model").add_edge("call_model", END).compile())

for chunk, metadata in graph.stream({"messages": [{"role": "human", "content": "hi"}]}, stream_mode="messages"):
    print(metadata["langgraph_node"], repr(chunk.content))
# call_model 'Hello '
# call_model 'world '
# call_model ...
\`\`\`

**Cómo leerlo:** \`get_stream_writer()\` da un \`writer(payload)\` que publica en el canal
\`custom\` — solo visible si pides \`"custom"\` en \`stream_mode\`. \`"messages"\` trocea el
\`content\` de cada mensaje que un nodo añade a \`state["messages"]\`; con
\`FakeChatModel\`, el troceo es determinista (por palabras), así que reconstruir todos
los \`chunk.content\` en orden te devuelve el mensaje completo.

**Errores comunes:**
- Llamar al \`writer\` esperando verlo en cualquier stream: solo aparece si \`"custom"\`
  está en los modos pedidos.
- Olvidar que con una lista de modos TODO —incluido \`messages\`— llega como
  \`(modo, evento)\`; con un modo único (string), llega el payload directo (para
  \`messages\` en modo único: directamente la tupla \`(chunk, metadata)\`).
- Confundir "reconstruir el mensaje completo" con "cada chunk ya es el mensaje": hay
  que concatenar \`chunk.content\` de TODOS los chunks emitidos por ese nodo.`,
      retos: [
        {
          id: "mod11-reto1",
          titulo: "Combinar custom + updates con get_stream_writer",
          enunciadoMd:
            "Completa `generate_joke` para que publique `{\"status\": \"thinking\"}` por el " +
            "canal `custom` ANTES de devolver el chiste. Luego, en validación, se " +
            "recolectan por separado los eventos `custom` y `updates`.",
          starterCode: `from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.config import get_stream_writer

class State(TypedDict):
    topic: str
    joke: str

def generate_joke(state: State):
    # TODO — obtén el writer con get_stream_writer() y publica {"status": "thinking"}
    return {"joke": f"Why did the {state['topic']} go to school?"}

builder = StateGraph(State)
builder.add_node("generate_joke", generate_joke)
builder.add_edge(START, "generate_joke")
builder.add_edge("generate_joke", END)
graph = builder.compile()
`,
          solutionCode: `from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.config import get_stream_writer

class State(TypedDict):
    topic: str
    joke: str

def generate_joke(state: State):
    writer = get_stream_writer()
    writer({"status": "thinking"})
    return {"joke": f"Why did the {state['topic']} go to school?"}

builder = StateGraph(State)
builder.add_node("generate_joke", generate_joke)
builder.add_edge(START, "generate_joke")
builder.add_edge("generate_joke", END)
graph = builder.compile()
`,
          validationCode: `from course_harness import check, check_eq

custom_events = []
updates_events = []
for mode, event in graph.stream(
    {"topic": "ice cream", "joke": ""}, stream_mode=["updates", "custom"]
):
    if mode == "custom":
        custom_events.append(event)
    elif mode == "updates":
        updates_events.append(event)

check_eq(
    "custom_event_emitted",
    "el writer publica el status por el canal custom",
    custom_events,
    [{"status": "thinking"}],
)
check_eq(
    "updates_event_still_present",
    "el canal updates sigue funcionando igual que en el módulo 10",
    updates_events,
    [{"generate_joke": {"joke": "Why did the ice cream go to school?"}}],
)

no_custom_events = list(graph.stream({"topic": "ice cream", "joke": ""}, stream_mode="updates"))
check(
    "custom_hidden_when_not_requested",
    "si no se pide 'custom' en stream_mode, el evento del writer no aparece",
    all(not (isinstance(e, dict) and "status" in e) for e in no_custom_events),
)
`,
        },
      ],
      pasos: [
        {
          id: "mod11-paso1",
          titulo: "Publica un evento custom",
          explicacionMd:
            "Antes de combinarlo con `messages`, practica lo mínimo: `get_stream_writer()` " +
            "da un `writer(payload)` que publica en el canal `custom`.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod11-paso1-reto",
              titulo: "Completa el nodo que publica un status",
              enunciadoMd:
                'Completa `avisar` para que publique `{"status": "empezando"}` con el writer ' +
                "antes de devolver el estado sin cambios.",
              starterCode: `from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.config import get_stream_writer

class State(TypedDict):
    n: int

def avisar(state: State):
    writer = get_stream_writer()
    # TODO: publica {"status": "empezando"} con el writer
    return {"n": state["n"]}

graph = (
    StateGraph(State)
    .add_node("avisar", avisar)
    .add_edge(START, "avisar")
    .add_edge("avisar", END)
    .compile()
)
`,
              solutionCode: `from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.config import get_stream_writer

class State(TypedDict):
    n: int

def avisar(state: State):
    writer = get_stream_writer()
    writer({"status": "empezando"})
    return {"n": state["n"]}

graph = (
    StateGraph(State)
    .add_node("avisar", avisar)
    .add_edge(START, "avisar")
    .add_edge("avisar", END)
    .compile()
)
`,
              validationCode: `from course_harness import check_eq

eventos = list(graph.stream({"n": 1}, stream_mode="custom"))
check_eq("paso1_custom_publicado", "el writer debe publicar el status por el canal custom", eventos, [{"status": "empezando"}])
`,
            },
          },
        },
        {
          id: "mod11-paso2",
          titulo: "custom + updates combinados",
          explicacionMd:
            "Lee el ejemplo completo que combina `updates` y `custom` en una sola pasada, " +
            "desempaquetando cada `(modo, evento)`.",
          accion: {
            kind: "lectura",
            bloqueMd: `\`\`\`python
for chunk in graph.stream({"topic": "ice cream", "joke": ""}, stream_mode=["updates", "custom"]):
    mode, event = chunk
    if mode == "updates":
        for node_name, update in event.items():
            print(f"Node {node_name} updated: {update}")
    elif mode == "custom":
        print(f"Status: {event['status']}")
\`\`\`
Este fragmento ya está completo: solo léelo, no hace falta ejecutarlo ni completar nada todavía.`,
          },
        },
        {
          id: "mod11-paso3",
          titulo: "Streaming de tokens con FakeChatModel",
          explicacionMd:
            "Practica `stream_mode=\"messages\"`: cada elemento es `(chunk, metadata)`; " +
            "concatenar los `chunk.content` reconstruye el mensaje completo.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod11-paso3-reto",
              titulo: "Reconstruye el mensaje a partir de los chunks",
              enunciadoMd:
                "Completa `call_model` para que devuelva la respuesta del modelo. Luego " +
                "completa `reconstruir` para concatenar el `.content` de todos los chunks.",
              starterCode: `from langgraph.graph import StateGraph, MessagesState, START, END
from course_harness import FakeChatModel

model = FakeChatModel()

def call_model(state: MessagesState):
    # TODO: devuelve {"messages": [model.invoke(state["messages"])]}
    ...

builder = StateGraph(MessagesState)
builder.add_node("call_model", call_model)
builder.add_edge(START, "call_model")
builder.add_edge("call_model", END)
graph = builder.compile()

def reconstruir(input_msg):
    chunks = list(graph.stream(input_msg, stream_mode="messages"))
    return "".join(chunk.content for chunk, _ in chunks)
`,
              solutionCode: `from langgraph.graph import StateGraph, MessagesState, START, END
from course_harness import FakeChatModel

model = FakeChatModel()

def call_model(state: MessagesState):
    return {"messages": [model.invoke(state["messages"])]}

builder = StateGraph(MessagesState)
builder.add_node("call_model", call_model)
builder.add_edge(START, "call_model")
builder.add_edge("call_model", END)
graph = builder.compile()

def reconstruir(input_msg):
    chunks = list(graph.stream(input_msg, stream_mode="messages"))
    return "".join(chunk.content for chunk, _ in chunks)
`,
              validationCode: `from course_harness import check_eq

texto = reconstruir({"messages": [{"role": "human", "content": "hi"}]})
check_eq("paso3_reconstruye", "concatenar los chunks reconstruye el mensaje completo", texto, "Hi there")
`,
              llmDoubles: [{ respuesta: "Hi there" }],
            },
          },
        },
        {
          id: "mod11-paso4",
          titulo: "Predicción: ¿el custom aparece sin pedirlo?",
          explicacionMd:
            "Antes de la síntesis, predice si un evento `custom` aparece cuando NO se " +
            "pide `\"custom\"` en `stream_mode`.",
          accion: {
            kind: "quiz",
            quiz: {
              id: "mod11-paso4-quiz",
              titulo: "¿Se ve el evento custom sin pedirlo?",
              preguntas: [
                {
                  id: "mod11-paso4-quiz-p1",
                  kind: "boolean",
                  enunciadoMd:
                    "Un nodo publica un evento con `writer(...)`. Si iteras " +
                    "`graph.stream(input, stream_mode='values')` (sin pedir `custom`), " +
                    "¿ves ese evento?",
                  correcta: false,
                  explicacionMd:
                    "No: cada evento del writer solo aparece si `\"custom\"` está entre los " +
                    "modos pedidos en `stream_mode`; si no, se descarta.",
                },
              ],
            },
          },
        },
        {
          id: "mod11-paso5",
          titulo: "messages + custom en una sola pasada",
          explicacionMd:
            "Combina lo practicado: un nodo publica un evento `custom` y luego invoca al " +
            "modelo; recolecta ambos canales combinando modos.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod11-paso5-reto",
              titulo: "Publica un status y streamea el mensaje del modelo",
              enunciadoMd:
                'Completa `call_model` para publicar `{"status": "pensando"}` ANTES de ' +
                "invocar al modelo, y completa `recolectar` para separar `messages` y " +
                "`custom` de una sola pasada.",
              starterCode: `from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.config import get_stream_writer
from course_harness import FakeChatModel

model = FakeChatModel()

def call_model(state: MessagesState):
    writer = get_stream_writer()
    # TODO: publica {"status": "pensando"} con el writer
    return {"messages": [model.invoke(state["messages"])]}

builder = StateGraph(MessagesState)
builder.add_node("call_model", call_model)
builder.add_edge(START, "call_model")
builder.add_edge("call_model", END)
graph = builder.compile()

def recolectar(input_msg):
    message_chunks = []
    custom_events = []
    # TODO: itera graph.stream(input_msg, stream_mode=["messages", "custom"])
    # y reparte cada (modo, evento) en la lista correspondiente
    return message_chunks, custom_events
`,
              solutionCode: `from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.config import get_stream_writer
from course_harness import FakeChatModel

model = FakeChatModel()

def call_model(state: MessagesState):
    writer = get_stream_writer()
    writer({"status": "pensando"})
    return {"messages": [model.invoke(state["messages"])]}

builder = StateGraph(MessagesState)
builder.add_node("call_model", call_model)
builder.add_edge(START, "call_model")
builder.add_edge("call_model", END)
graph = builder.compile()

def recolectar(input_msg):
    message_chunks = []
    custom_events = []
    for mode, event in graph.stream(input_msg, stream_mode=["messages", "custom"]):
        if mode == "messages":
            message_chunks.append(event)
        elif mode == "custom":
            custom_events.append(event)
    return message_chunks, custom_events
`,
              validationCode: `from course_harness import check, check_eq

message_chunks, custom_events = recolectar({"messages": [{"role": "human", "content": "hi"}]})
check_eq("paso5_custom", "el status se publica antes de invocar al modelo", custom_events, [{"status": "pensando"}])
check("paso5_messages_nonempty", "se reciben chunks de messages", len(message_chunks) > 0)
`,
              llmDoubles: [{ respuesta: "Hi there" }],
            },
          },
        },
      ],
    },
    refinaSimplifica: {
      resumenBullets: [
        '`stream_mode="messages"` emite tuplas `(chunk, metadata)` token a token; `metadata["langgraph_node"]` identifica el nodo emisor.',
        "Con `FakeChatModel`, el troceo de `messages` es determinista (por palabras): mismos inputs, mismos chunks.",
        "`get_stream_writer()` devuelve un `writer(payload)`: publica eventos propios en el canal `custom`, fuera del estado del grafo.",
        'Un evento `custom` solo es visible si `"custom"` está entre los modos pedidos en `stream_mode`.',
        "Todos los modos —`values`, `updates`, `messages`, `custom`— se pueden combinar en una lista; cada evento llega como `(modo, evento)`.",
        "Concatenar `chunk.content` de todos los chunks de `messages` de un nodo reconstruye el mensaje completo.",
      ],
      sintesis: {
        kind: "code",
        reto: {
          id: "mod11-reto-sintesis",
          titulo: "Síntesis: messages + custom combinados con FakeChatModel",
          enunciadoMd:
            "Construye un grafo con un nodo `call_model` que publique un evento " +
            "`custom` `{\"status\": \"llamando al modelo\"}` ANTES de invocar al modelo, y " +
            "luego devuelva el mensaje del modelo. Combina " +
            "`stream_mode=[\"messages\", \"custom\"]` para recolectar ambos canales en una " +
            "sola pasada.",
          starterCode: `from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.config import get_stream_writer
from course_harness import FakeChatModel

model = FakeChatModel()

def call_model(state: MessagesState):
    # TODO — publica {"status": "llamando al modelo"} por el canal custom
    return {"messages": [model.invoke(state["messages"])]}

builder = StateGraph(MessagesState)
builder.add_node("call_model", call_model)
builder.add_edge(START, "call_model")
builder.add_edge("call_model", END)
graph = builder.compile()

def recolectar(input_msg):
    message_chunks = []
    custom_events = []
    # TODO — itera graph.stream(input_msg, stream_mode=["messages", "custom"])
    # y reparte cada (modo, evento) en la lista correspondiente
    return message_chunks, custom_events
`,
          solutionCode: `from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.config import get_stream_writer
from course_harness import FakeChatModel

model = FakeChatModel()

def call_model(state: MessagesState):
    writer = get_stream_writer()
    writer({"status": "llamando al modelo"})
    return {"messages": [model.invoke(state["messages"])]}

builder = StateGraph(MessagesState)
builder.add_node("call_model", call_model)
builder.add_edge(START, "call_model")
builder.add_edge("call_model", END)
graph = builder.compile()

def recolectar(input_msg):
    message_chunks = []
    custom_events = []
    for mode, event in graph.stream(input_msg, stream_mode=["messages", "custom"]):
        if mode == "messages":
            message_chunks.append(event)
        elif mode == "custom":
            custom_events.append(event)
    return message_chunks, custom_events
`,
          validationCode: `from course_harness import check, check_eq, get_llm_calls

message_chunks, custom_events = recolectar(
    {"messages": [{"role": "human", "content": "hi"}]}
)

check_eq(
    "sintesis_custom_event",
    "el evento custom se publica antes de invocar al modelo",
    custom_events,
    [{"status": "llamando al modelo"}],
)
check(
    "sintesis_messages_nonempty",
    "se reciben chunks de messages",
    len(message_chunks) > 0,
)
check(
    "sintesis_messages_shape",
    "cada elemento de messages es (chunk, metadata)",
    all(isinstance(item, tuple) and len(item) == 2 for item in message_chunks),
)
reconstructed = "".join(chunk.content for chunk, _ in message_chunks)
check_eq(
    "sintesis_messages_reconstructs",
    "concatenar los chunks reconstruye el mensaje completo del double",
    reconstructed,
    "Hello world from LangGraph",
)

calls = get_llm_calls()
check_eq(
    "sintesis_llm_invoked_once",
    "el modelo se invoca exactamente una vez",
    len(calls),
    1,
)
`,
          llmDoubles: [{ respuesta: "Hello world from LangGraph" }],
          timeoutMs: 8000,
        },
      },
    },
  },
  usaLaIa: [
    {
      id: "mod11-ia1",
      titulo: "Usa la IA para depurar streaming que no aparece o llega incompleto",
      promptsSugeridos: [
        "Itero `graph.stream(input, stream_mode='messages')` pero no veo ningún chunk (o " +
          "veo menos de los esperados). Aquí está mi nodo que invoca al modelo: ¿qué me falta?",
        "Explícame con un ejemplo distinto al del curso por qué un evento `custom` no " +
          "aparece si no pido `'custom'` en `stream_mode`, aunque el `writer(...)` sí se " +
          "haya llamado.",
      ],
      comoVerificar: [
        "¿La respuesta trata cada chunk de `messages` como `(chunk, metadata)`, o asume " +
          "que el chunk ya es el mensaje completo?",
        "¿Al pegar el código sugerido, el mini-ejercicio pasa reconstruyendo el mensaje " +
          "EXACTO esperado (concatenando TODOS los chunks, no solo el primero)?",
        "¿La IA distingue con claridad `messages` (token a token del LLM) de `updates` " +
          "(por superstep, módulo 10)?",
      ],
      comoIterar:
        "Si el mensaje reconstruido queda incompleto, imprime `len(chunks)` y pregunta " +
        "específicamente si tu bucle está descartando chunks (por ejemplo con un `break` " +
        "prematuro), en vez de pedir el nodo reescrito entero.",
      queNoDelegar: [
        "No le pidas que 'genere todo el streaming en tiempo real': completa tú la línea " +
          "del `writer(...)` o del `for mode, event in ...` una vez que entiendas el patrón.",
        "No copies una respuesta que use `ChatOllama` dentro de un reto ejecutable: el " +
          "runner de la app SOLO admite `FakeChatModel` (regla dura §8.4); `ChatOllama` es " +
          "exclusivamente para tu máquina, en el tutorial local.",
      ],
    },
  ],
  tutorialLocal: {
    introMd:
      "Este tramo conecta el proyecto con un LLM REAL por primera vez: `ChatOllama` " +
      "(qwen2.5-coder:14b, 100% local) reemplaza al `FakeChatModel` del runner para " +
      "generar la respuesta de `conversar`, transmitida token a token.",
    setup: [
      {
        titulo: "Instala langchain-ollama y arranca Ollama",
        descripcionMd:
          "Requiere `ollama serve` corriendo y el modelo descargado " +
          "(`ollama pull qwen2.5-coder:14b`), igual que el asistente del curso.",
        powershell: "pip install langchain-ollama\nollama serve\nollama pull qwen2.5-coder:14b",
        bash: "pip install langchain-ollama && ollama serve && ollama pull qwen2.5-coder:14b",
      },
      {
        titulo: "Ejecuta el grafo con streaming de tokens",
        descripcionMd: "",
        powershell: "python src\\main.py",
        bash: "python src/main.py",
      },
    ],
    codigo: [
      {
        archivo: "requirements.txt",
        descripcionMd: "Se añade `langchain-ollama`: primera dependencia con LLM del proyecto.",
        codigo: "langgraph\nlangchain\nlangchain-ollama\n",
      },
      {
        archivo: "src/graph.py",
        descripcionMd:
          "`conversar` ahora usa `ChatOllama` en vez del texto fijo de módulos anteriores: " +
          "genera la respuesta real sobre lo que el grafo ya saludó.",
        codigo: `# ... contar_visitas, construir_saludo, agradecer, route_agradecer, despedir
# (sin cambios respecto del módulo 08) ...

from langchain_ollama import ChatOllama

model = ChatOllama(model="qwen2.5-coder:14b")


def conversar(state: OverallState) -> OutputState:
    pregunta = {"role": "human", "content": f"En una frase, comenta el mensaje: '{state['saludo']}'"}
    respuesta = model.invoke([pregunta])
    return {"messages": [pregunta, respuesta]}


builder = StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)
builder.add_node("contar_visitas", contar_visitas)
builder.add_node("construir_saludo", construir_saludo)
builder.add_node("agradecer", agradecer)
builder.add_node("despedir", despedir)
builder.add_node("conversar", conversar)
builder.add_edge(START, "contar_visitas")
builder.add_edge("contar_visitas", "construir_saludo")
builder.add_edge("construir_saludo", "agradecer")
builder.add_conditional_edges("agradecer", route_agradecer)
builder.add_edge("despedir", "conversar")
builder.add_edge("conversar", END)

graph = builder.compile(...)  # mismos argumentos (checkpointer + store) que el módulo 08
`,
      },
      {
        archivo: "src/main.py",
        descripcionMd:
          "Se streamea `stream_mode='messages'`: cada `print` muestra un trozo de la " +
          "respuesta de `ChatOllama` a medida que se genera.",
        codigo: `from graph import graph

if __name__ == "__main__":
    for chunk, metadata in graph.stream({"nombre": "Ana"}, stream_mode="messages"):
        if metadata["langgraph_node"] == "conversar":
            print(chunk.content, end="", flush=True)
`,
      },
    ],
    salidaEsperada:
      "(streaming token a token de la respuesta de qwen2.5-coder:14b comentando el " +
      "saludo — el texto exacto varía porque el modelo genera lenguaje natural)",
    spine: {
      crea: [],
      modifica: ["requirements.txt", "src/graph.py", "src/main.py"],
    },
  },
};
