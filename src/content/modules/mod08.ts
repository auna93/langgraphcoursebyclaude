import type { CourseModule } from "../types";

/**
 * Módulo 08 — Memoria de corto y largo plazo (Store).
 * Contenido completo (slice S14). Código: API AVANZADA del grounding-adv §2 y
 * C-RUNNER §tabla "Avanzado" (InMemoryStore: put/get/search, namespace tupla,
 * inyección vía compile(store=)).
 * §12 (ADR-15, SE3): formato enriquecido — pasos guiados, "Usa la IA" y
 * tutorial local (continúa el project spine desde mod07). Shim avanzado (S12).
 */
export const mod08: CourseModule = {
  id: "mod08",
  numero: 8,
  titulo: "Memoria de corto y largo plazo (Store)",
  objetivo:
    "Distinguir memoria de hilo (checkpointer) de memoria entre hilos (Store); guardar " +
    "y recuperar memorias de largo plazo.",
  enriquecido: true,
  secciones: {
    explicaSimple: {
      contenidoMd: `## La libreta personal y el tablón de anuncios

En el módulo anterior viste el **checkpointer**: la libreta con tu nombre, una por
conversación (\`thread_id\`), que nadie más lee. Pero a veces quieres algo distinto: un
**tablón de anuncios** en la sala común, donde CUALQUIER conversación (cualquier hilo)
puede escribir una nota y CUALQUIER otra puede leerla después. Eso es el **Store**: una
memoria compartida ENTRE hilos, pensada para guardar cosas que no dependen de una
conversación concreta — preferencias del usuario, hechos aprendidos, notas para el
futuro — y que quieres recuperar aunque sea otra conversación (otro \`thread_id\`) la que
pregunte.

- **Checkpointer** = memoria de UN hilo (la libreta personal de esa conversación).
- **Store** = memoria compartida ENTRE hilos (el tablón de anuncios de la sala).

Ambos pueden convivir en el mismo grafo: \`compile(checkpointer=..., store=...)\`.

## Carpetas del tablón: los \`namespace\`

El tablón no es un montón de notas sueltas: está organizado en **carpetas** (el
\`namespace\`, una tupla como \`("user-1", "memories")\`). Guardas con \`put(namespace, key,
value)\` y buscas con \`search(namespace, query=...)\`: solo dentro de esa carpeta.`,
      consignaExplicacion:
        "Explícale a alguien que no programa, usando la metáfora de 'libreta personal " +
        "por conversación' contra 'tablón de anuncios compartido', la diferencia entre " +
        "el checkpointer (memoria de un hilo) y el Store (memoria entre hilos).",
    },
    detectaGaps: {
      contenidoMd:
        "Comprueba si distingues bien cuándo algo debería vivir en el checkpointer y " +
        "cuándo en el Store.",
      quiz: {
        id: "mod08-quiz1",
        titulo: "¿Checkpointer o Store?",
        preguntas: [
          {
            id: "mod08-quiz1-p1",
            kind: "single",
            enunciadoMd:
              "Quieres recordar el idioma preferido de un usuario para que CUALQUIER " +
              "conversación futura con ese usuario (distintos `thread_id`) lo tenga en cuenta. " +
              "¿Qué mecanismo usas?",
            opciones: [
              "Store, con un namespace por usuario",
              "Checkpointer, con el mismo thread_id siempre",
              "Ninguno: hay que pedírselo en cada mensaje",
              "`operator.add` en el estado del grafo",
            ],
            correcta: 0,
            explicacionMd:
              "Eso es memoria compartida ENTRE hilos: exactamente el caso de uso del Store, " +
              "con un namespace (p. ej. `(user_id, 'preferencias')`) por usuario.",
          },
          {
            id: "mod08-quiz1-p2",
            kind: "boolean",
            enunciadoMd:
              "`store.put(namespace, key, value)` sobrescribe el valor si ya existe un item " +
              "con esa misma `key` en ese `namespace`.",
            correcta: true,
            explicacionMd:
              "Correcto: `put` es un upsert por `key` dentro del `namespace` (misma clave ⇒ " +
              "se reemplaza el valor).",
          },
          {
            id: "mod08-quiz1-p3",
            kind: "multi",
            enunciadoMd: "¿Cuáles de estas afirmaciones sobre `InMemoryStore` son correctas?",
            opciones: [
              "`namespace` es una tupla de strings, no un string suelto",
              "`search(namespace, query=None)` devuelve todos los items de ese namespace",
              "Dos namespaces distintos pueden compartir resultados en `search`",
              "El Store se inyecta a un nodo declarando `def nodo(state, *, store):`",
            ],
            correctas: [0, 1, 3],
            explicacionMd:
              "Los namespaces están AISLADOS: `search` en un namespace nunca devuelve items de " +
              "otro namespace distinto.",
          },
          {
            id: "mod08-quiz1-p4",
            kind: "single",
            enunciadoMd:
              "¿Cómo recibe un nodo el `store` que se pasó a `compile(store=...)`?",
            opciones: [
              "Declarando un parámetro keyword-only `store` en la firma del nodo",
              "Leyendo `state['store']`",
              "Con `get_stream_writer()`",
              "El shim lo inyecta como variable global",
            ],
            correcta: 0,
            explicacionMd:
              "La firma `def nodo(state, *, store):` (keyword-only) es la señal que el " +
              "executor usa para inyectar el store — igual que LangGraph real.",
          },
          {
            id: "mod08-quiz1-p5",
            kind: "output",
            enunciadoMd:
              "Dado `store.put(ns, 'a', {'data': 'x'})` y `store.put(ns, 'b', {'data': 'y'})`, " +
              "¿qué devuelve `store.search(ns, query='z')`?",
            codigo: "hits = store.search(ns, query=\"z\")\n# ¿hits?",
            opciones: [
              "`[]` (ningún value contiene 'z')",
              "Los dos items, porque `query` es solo un filtro opcional que se ignora",
              "Lanza un error porque no hay coincidencias",
              "Solo el primer item insertado",
            ],
            correcta: 0,
            explicacionMd:
              "`search` filtra léxicamente por `query` sobre el contenido del `value`: si " +
              "ningún item lo contiene, la lista de resultados está vacía.",
          },
        ],
      },
    },
    llenaGaps: {
      contenidoMd: `## Store en código real

\`\`\`python
from langgraph.store.memory import InMemoryStore
from langgraph.graph import StateGraph, MessagesState, START, END

store = InMemoryStore()

def call_model(state: MessagesState, *, store):
    namespace = ("user-1", "memories")
    store.put(namespace, "pref-1", {"data": "User prefers dark mode"})
    hits = store.search(namespace, query="dark mode")
    content = "; ".join(h.value["data"] for h in hits)
    return {"messages": [{"role": "ai", "content": content}]}

builder = StateGraph(MessagesState)
builder.add_node(call_model)
builder.add_edge(START, "call_model")
builder.add_edge("call_model", END)
graph = builder.compile(store=store)   # el store se inyecta al nodo que lo declare
\`\`\`

**Cómo leerlo:** \`call_model\` declara \`*, store\` en su firma: el executor le inyecta el
\`InMemoryStore\` que pasaste a \`compile(store=...)\`. \`put\`/\`search\` operan siempre dentro
de un \`namespace\` (tupla): dos namespaces distintos son "carpetas" separadas.

## Store compartido entre hilos (a diferencia del checkpointer)

\`\`\`python
from langgraph.checkpoint.memory import InMemorySaver

shared_store = InMemoryStore()

def writer(state: MessagesState, *, store):
    store.put(("shared",), "note", {"data": "written by writer"})
    return {"messages": []}

def reader(state: MessagesState, *, store):
    hits = store.search(("shared",))
    content = hits[0].value["data"] if hits else "none"
    return {"messages": [{"role": "ai", "content": content}]}

graph_w = StateGraph(MessagesState).add_node("writer", writer) \\
    .add_edge(START, "writer").add_edge("writer", END) \\
    .compile(checkpointer=InMemorySaver(), store=shared_store)
graph_r = StateGraph(MessagesState).add_node("reader", reader) \\
    .add_edge(START, "reader").add_edge("reader", END) \\
    .compile(checkpointer=InMemorySaver(), store=shared_store)

graph_w.invoke({"messages": []}, {"configurable": {"thread_id": "thread-w"}})
graph_r.invoke({"messages": []}, {"configurable": {"thread_id": "thread-r"}})
# graph_r lee "written by writer" aunque sea un THREAD_ID distinto: el Store no
# distingue hilos, solo namespaces.
\`\`\`

**Errores comunes:**
- Confundir "memoria compartida" con "memoria global sin estructura": el Store SIEMPRE
  se organiza por \`namespace\`; dos namespaces distintos no se ven entre sí.
- Olvidar el parámetro keyword-only \`store\` en la firma del nodo: sin él, el executor no
  inyecta nada y el nodo no tiene acceso al Store.
- Usar el Store para datos que en realidad son de UNA conversación concreta (eso es
  trabajo del checkpointer, módulo 07): mezclar ambos roles complica el diseño sin
  necesidad.`,
      retos: [
        {
          id: "mod08-reto1",
          titulo: "Store: guardar y buscar por namespace",
          enunciadoMd:
            "Completa el nodo `call_model` para que guarde DOS preferencias en el " +
            "namespace `(\"user-1\", \"memories\")` y luego busque por `query=\"concise\"`, " +
            "devolviendo el contenido del primer resultado como respuesta.",
          starterCode: `from langgraph.store.memory import InMemoryStore
from langgraph.graph import StateGraph, MessagesState, START, END

store = InMemoryStore()

def call_model(state: MessagesState, *, store):
    namespace = ("user-1", "memories")
    # TODO — guarda "pref-1": {"data": "User prefers dark mode"}
    # TODO — guarda "pref-2": {"data": "User prefers concise answers"}
    # TODO — busca en namespace con query="concise" y usa el primer resultado
    ...

builder = StateGraph(MessagesState)
builder.add_node(call_model)
builder.add_edge(START, "call_model")
builder.add_edge("call_model", END)
graph = builder.compile(store=store)
`,
          solutionCode: `from langgraph.store.memory import InMemoryStore
from langgraph.graph import StateGraph, MessagesState, START, END

store = InMemoryStore()

def call_model(state: MessagesState, *, store):
    namespace = ("user-1", "memories")
    store.put(namespace, "pref-1", {"data": "User prefers dark mode"})
    store.put(namespace, "pref-2", {"data": "User prefers concise answers"})
    hits = store.search(namespace, query="concise")
    content = hits[0].value["data"] if hits else "none"
    return {"messages": [{"role": "ai", "content": content}]}

builder = StateGraph(MessagesState)
builder.add_node(call_model)
builder.add_edge(START, "call_model")
builder.add_edge("call_model", END)
graph = builder.compile(store=store)
`,
          validationCode: `from course_harness import check_eq

result = graph.invoke({"messages": [{"role": "human", "content": "hola"}]})
last = result["messages"][-1]
check_eq(
    "store_search_filters_by_query",
    "search(namespace, query=) filtra por coincidencia léxica",
    last.content,
    "User prefers concise answers",
)

all_items = store.search(("user-1", "memories"))
check_eq("store_search_all_count", "query=None devuelve todos los items", len(all_items), 2)
check_eq(
    "store_search_all_order",
    "el orden es el de inserción (determinista)",
    [item.key for item in all_items],
    ["pref-1", "pref-2"],
)

other_namespace_items = store.search(("user-2", "memories"))
check_eq(
    "store_namespace_isolated",
    "un namespace distinto no ve los items de otro",
    other_namespace_items,
    [],
)
`,
        },
      ],
      pasos: [
        {
          id: "mod08-paso1",
          titulo: "Guarda un item y léelo de vuelta",
          explicacionMd:
            "Antes de conectar el Store a un nodo, practica lo mínimo: `put` guarda, " +
            "`search` recupera, ambos dentro del mismo `namespace`.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod08-paso1-reto",
              titulo: "put y search en el mismo namespace",
              enunciadoMd:
                'Completa el código para guardar `{"data": "hola"}` bajo la key `"nota-1"` ' +
                'en el namespace `("demo",)`.',
              starterCode: `from langgraph.store.memory import InMemoryStore

store = InMemoryStore()
namespace = ("demo",)

# TODO: guarda {"data": "hola"} bajo la key "nota-1" en namespace
`,
              solutionCode: `from langgraph.store.memory import InMemoryStore

store = InMemoryStore()
namespace = ("demo",)

store.put(namespace, "nota-1", {"data": "hola"})
`,
              validationCode: `from course_harness import check_eq

hits = store.search(namespace)
check_eq("paso1_put_search", "search debe devolver el item guardado con put", hits[0].value["data"], "hola")
`,
            },
          },
        },
        {
          id: "mod08-paso2",
          titulo: "Checkpointer y Store conviven",
          explicacionMd:
            "Lee el ejemplo completo de un nodo que recibe el Store vía " +
            "`compile(store=...)` y lo usa para guardar y buscar preferencias.",
          accion: {
            kind: "lectura",
            bloqueMd: `\`\`\`python
store = InMemoryStore()

def call_model(state: MessagesState, *, store):
    namespace = ("user-1", "memories")
    store.put(namespace, "pref-1", {"data": "User prefers dark mode"})
    hits = store.search(namespace, query="dark mode")
    content = "; ".join(h.value["data"] for h in hits)
    return {"messages": [{"role": "ai", "content": content}]}

graph = builder.compile(store=store)   # se inyecta al nodo que declare *, store
\`\`\`
Este fragmento ya está completo: solo léelo, no hace falta ejecutarlo ni completar nada todavía.`,
          },
        },
        {
          id: "mod08-paso3",
          titulo: "Un nodo que recibe el Store",
          explicacionMd:
            "Declara `*, store` en la firma del nodo: el executor te inyecta el " +
            "`InMemoryStore` que pasaste a `compile(store=...)`.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod08-paso3-reto",
              titulo: "Completa el nodo que guarda y recupera",
              enunciadoMd:
                'Completa `recordar` para guardar `{"data": "visitó el módulo 08"}` bajo la ' +
                'key `"visita"` en namespace `("bitacora",)`, y devolver ese contenido como ' +
                "mensaje.",
              starterCode: `from langgraph.store.memory import InMemoryStore
from langgraph.graph import StateGraph, MessagesState, START, END

def recordar(state: MessagesState, *, store):
    namespace = ("bitacora",)
    # TODO: guarda {"data": "visitó el módulo 08"} bajo key "visita" en namespace
    hits = store.search(namespace)
    return {"messages": [{"role": "ai", "content": hits[0].value["data"]}]}

builder = StateGraph(MessagesState)
builder.add_node(recordar)
builder.add_edge(START, "recordar")
builder.add_edge("recordar", END)
graph = builder.compile(store=InMemoryStore())
`,
              solutionCode: `from langgraph.store.memory import InMemoryStore
from langgraph.graph import StateGraph, MessagesState, START, END

def recordar(state: MessagesState, *, store):
    namespace = ("bitacora",)
    store.put(namespace, "visita", {"data": "visitó el módulo 08"})
    hits = store.search(namespace)
    return {"messages": [{"role": "ai", "content": hits[0].value["data"]}]}

builder = StateGraph(MessagesState)
builder.add_node(recordar)
builder.add_edge(START, "recordar")
builder.add_edge("recordar", END)
graph = builder.compile(store=InMemoryStore())
`,
              validationCode: `from course_harness import check_eq

resultado = graph.invoke({"messages": [{"role": "human", "content": "hola"}]})
check_eq(
    "paso3_store_inyectado",
    "el nodo debe poder guardar y recuperar usando el store inyectado",
    resultado["messages"][-1].content,
    "visitó el módulo 08",
)
`,
            },
          },
        },
        {
          id: "mod08-paso4",
          titulo: "Predicción: ¿un namespace ve al otro?",
          explicacionMd:
            "Antes del reto de síntesis, predice qué devuelve `search` en un namespace " +
            "distinto al que se usó para guardar.",
          accion: {
            kind: "quiz",
            quiz: {
              id: "mod08-paso4-quiz",
              titulo: "¿Namespaces aislados o compartidos?",
              preguntas: [
                {
                  id: "mod08-paso4-quiz-p1",
                  kind: "output",
                  enunciadoMd:
                    'Con `store.put(("a",), "k", {"data": "x"})`, ¿qué devuelve ' +
                    '`store.search(("b",))`?',
                  codigo: 'store.put(("a",), "k", {"data": "x"})\nstore.search(("b",))\n',
                  opciones: [
                    "`[]` (namespace distinto, ningún item visible)",
                    "El item guardado en `(\"a\",)`",
                    "Lanza un error: namespaces incompatibles",
                    "Todos los items de todos los namespaces",
                  ],
                  correcta: 0,
                  explicacionMd:
                    "Los namespaces están AISLADOS: `search` nunca cruza a otro namespace " +
                    "distinto del que se le pasó.",
                },
              ],
            },
          },
        },
        {
          id: "mod08-paso5",
          titulo: "Dos preferencias, un filtro por query",
          explicacionMd:
            "Practica el patrón completo antes de la síntesis: guardar dos items y " +
            "filtrar con `query` para quedarte solo con el que coincide.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod08-paso5-reto",
              titulo: "Guarda dos preferencias y filtra por query",
              enunciadoMd:
                'Completa `call_model` para guardar `"pref-a": {"data": "prefiere temas oscuros"}` ' +
                'y `"pref-b": {"data": "prefiere respuestas breves"}`, y luego busca con ' +
                '`query="breves"`, devolviendo el primer resultado como mensaje.',
              starterCode: `from langgraph.store.memory import InMemoryStore
from langgraph.graph import StateGraph, MessagesState, START, END

def call_model(state: MessagesState, *, store):
    namespace = ("user-2", "memories")
    # TODO: guarda "pref-a": {"data": "prefiere temas oscuros"}
    # TODO: guarda "pref-b": {"data": "prefiere respuestas breves"}
    hits = store.search(namespace, query="breves")
    return {"messages": [{"role": "ai", "content": hits[0].value["data"]}]}

builder = StateGraph(MessagesState)
builder.add_node(call_model)
builder.add_edge(START, "call_model")
builder.add_edge("call_model", END)
graph = builder.compile(store=InMemoryStore())
`,
              solutionCode: `from langgraph.store.memory import InMemoryStore
from langgraph.graph import StateGraph, MessagesState, START, END

def call_model(state: MessagesState, *, store):
    namespace = ("user-2", "memories")
    store.put(namespace, "pref-a", {"data": "prefiere temas oscuros"})
    store.put(namespace, "pref-b", {"data": "prefiere respuestas breves"})
    hits = store.search(namespace, query="breves")
    return {"messages": [{"role": "ai", "content": hits[0].value["data"]}]}

builder = StateGraph(MessagesState)
builder.add_node(call_model)
builder.add_edge(START, "call_model")
builder.add_edge("call_model", END)
graph = builder.compile(store=InMemoryStore())
`,
              validationCode: `from course_harness import check, check_eq

resultado = graph.invoke({"messages": [{"role": "human", "content": "hola"}]})
check_eq(
    "paso5_query_filtra",
    "search con query='breves' debe devolver la preferencia que la contiene",
    resultado["messages"][-1].content,
    "prefiere respuestas breves",
)
`,
            },
          },
        },
      ],
    },
    refinaSimplifica: {
      resumenBullets: [
        "Checkpointer = memoria de UN hilo (`thread_id`); Store = memoria compartida ENTRE hilos.",
        "El Store se organiza por `namespace` (tupla): dos namespaces no se ven entre sí.",
        "`put(namespace, key, value)` es un upsert; `search(namespace, query=, limit=)` filtra léxicamente, en orden de inserción.",
        "`query=None` en `search` devuelve todos los items del namespace (hasta `limit`).",
        "Un nodo recibe el Store declarando `def nodo(state, *, store):` (keyword-only); se inyecta vía `compile(store=...)`.",
        "Checkpointer y Store pueden convivir: `compile(checkpointer=..., store=...)`.",
        "El Store no distingue `thread_id`: dos hilos distintos leen el mismo namespace si comparten el mismo `store`.",
      ],
      sintesis: {
        kind: "code",
        reto: {
          id: "mod08-reto-sintesis",
          titulo: "Síntesis: el Store cruza hilos, el checkpointer no",
          enunciadoMd:
            "Construye dos grafos (`graph_w` y `graph_r`) que comparten el mismo " +
            "`InMemoryStore` pero usan checkpointers y `thread_id` DISTINTOS. " +
            "`writer` guarda una nota en el namespace `(\"shared\",)`; `reader` la busca y " +
            "la devuelve como mensaje. Completa los dos nodos.",
          starterCode: `from langgraph.checkpoint.memory import InMemorySaver
from langgraph.store.memory import InMemoryStore
from langgraph.graph import StateGraph, MessagesState, START, END

shared_store = InMemoryStore()

def writer(state: MessagesState, *, store):
    # TODO — guarda {"data": "written by writer"} bajo key "note" en namespace ("shared",)
    return {"messages": []}

def reader(state: MessagesState, *, store):
    # TODO — busca en namespace ("shared",) y devuelve un mensaje ai con el contenido
    # (usa "none" si no hay resultados)
    ...

builder_w = StateGraph(MessagesState)
builder_w.add_node("writer", writer)
builder_w.add_edge(START, "writer")
builder_w.add_edge("writer", END)
graph_w = builder_w.compile(checkpointer=InMemorySaver(), store=shared_store)

builder_r = StateGraph(MessagesState)
builder_r.add_node("reader", reader)
builder_r.add_edge(START, "reader")
builder_r.add_edge("reader", END)
graph_r = builder_r.compile(checkpointer=InMemorySaver(), store=shared_store)
`,
          solutionCode: `from langgraph.checkpoint.memory import InMemorySaver
from langgraph.store.memory import InMemoryStore
from langgraph.graph import StateGraph, MessagesState, START, END

shared_store = InMemoryStore()

def writer(state: MessagesState, *, store):
    store.put(("shared",), "note", {"data": "written by writer"})
    return {"messages": []}

def reader(state: MessagesState, *, store):
    hits = store.search(("shared",))
    content = hits[0].value["data"] if hits else "none"
    return {"messages": [{"role": "ai", "content": content}]}

builder_w = StateGraph(MessagesState)
builder_w.add_node("writer", writer)
builder_w.add_edge(START, "writer")
builder_w.add_edge("writer", END)
graph_w = builder_w.compile(checkpointer=InMemorySaver(), store=shared_store)

builder_r = StateGraph(MessagesState)
builder_r.add_node("reader", reader)
builder_r.add_edge(START, "reader")
builder_r.add_edge("reader", END)
graph_r = builder_r.compile(checkpointer=InMemorySaver(), store=shared_store)
`,
          validationCode: `from course_harness import check_eq

graph_w.invoke({"messages": []}, {"configurable": {"thread_id": "thread-w"}})
result = graph_r.invoke({"messages": []}, {"configurable": {"thread_id": "thread-r"}})

check_eq(
    "store_shared_across_threads",
    "el Store es memoria compartida ENTRE hilos: un hilo distinto ve lo escrito por otro",
    result["messages"][-1].content,
    "written by writer",
)
`,
        },
      },
    },
  },
  usaLaIa: [
    {
      id: "mod08-ia1",
      titulo: "Usa la IA para decidir Store vs. checkpointer",
      promptsSugeridos: [
        "Tengo este dato que quiero recordar: [describe tu caso]. ¿Debería vivir en el " +
          "checkpointer (memoria de un hilo) o en el Store (memoria entre hilos)? " +
          "Explícame por qué con la metáfora libreta/tablón.",
        "Mi `search(namespace, query=...)` no encuentra el item que guardé con `put`. Aquí " +
          "está mi namespace de escritura y el de búsqueda: ¿son EXACTAMENTE la misma tupla?",
      ],
      comoVerificar: [
        "¿La respuesta usa `put(namespace, key, value)` / `search(namespace, query=)` " +
          "exactamente como el grounding, sin inventar métodos como `store.get()`?",
        "¿Al pegar el código sugerido, el mini-ejercicio pasa devolviendo el CONTENIDO " +
          "exacto esperado (no solo 'ya no lanza error')?",
        "¿La IA distingue con claridad que dos namespaces distintos (aunque parezcan " +
          "similares, ej. `('user-1',)` vs `('user-2',)`) NUNCA comparten resultados?",
      ],
      comoIterar:
        "Si `search` sigue vacío, pega el namespace EXACTO usado en `put` y en `search` " +
        "(imprímelos) y pregunta específicamente si son la misma tupla, en vez de pedir " +
        "el nodo reescrito completo.",
      queNoDelegar: [
        "No le pidas que 'diseñe toda la memoria del proyecto': decide tú qué campo va en " +
          "el Store y cuál en el estado del grafo antes de pedir código.",
        "No copies una respuesta que use el Store para datos que en realidad son de UNA " +
          "conversación concreta: eso es trabajo del checkpointer (módulo 07).",
      ],
    },
  ],
  tutorialLocal: {
    introMd:
      "Este tramo añade memoria compartida real al proyecto: un `InMemoryStore` que " +
      "recuerda cuántas veces se ha saludado a cada nombre, aunque sea en ejecuciones " +
      "de `thread_id` distintos.",
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
        archivo: "src/graph.py",
        descripcionMd:
          "Nuevo nodo `contar_visitas`, que recibe el Store inyectado (`*, store`) y " +
          "acumula cuántas veces se ha saludado a este nombre, en el namespace " +
          "`(\"visitas\",)`. Se añade justo antes de `construir_saludo`.",
        codigo: `# ... construir_saludo, agradecer, route_agradecer, despedir, conversar
# (sin cambios respecto del módulo 07) ...

from langgraph.store.memory import InMemoryStore


def contar_visitas(state: OverallState, *, store):
    namespace = ("visitas",)
    hits = store.search(namespace, query=state["nombre"])
    veces = len(hits) + 1
    store.put(namespace, f"{state['nombre']}-{veces}", {"data": state["nombre"]})
    return {}


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

graph = builder.compile(checkpointer=InMemorySaver(), store=InMemoryStore())
`,
      },
      {
        archivo: "src/main.py",
        descripcionMd:
          "El Store es compartido: aunque cambies el `thread_id`, la cuenta de visitas " +
          "por nombre sigue viva porque el Store no distingue hilos.",
        codigo: `from graph import graph

config = {"configurable": {"thread_id": "sesion-2"}}

if __name__ == "__main__":
    resultado = graph.invoke({"nombre": "Ana"}, config)
    print(resultado["saludo"])
`,
      },
    ],
    salidaEsperada: "Hasta luego, Ana",
    spine: {
      crea: [],
      modifica: ["src/graph.py", "src/main.py"],
    },
  },
};
