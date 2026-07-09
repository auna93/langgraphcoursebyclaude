import type { CourseModule } from "../types";

/**
 * Módulo 07 — Checkpointing y persistencia.
 * Contenido completo (slice S14). Código: API AVANZADA del grounding-adv §1 y
 * C-RUNNER §tabla "Avanzado" (InMemorySaver, thread_id, get_state/get_state_history).
 * §12 (ADR-15, SE3): formato enriquecido — pasos guiados, "Usa la IA" y
 * tutorial local (continúa el project spine desde mod06). Shim avanzado (S12).
 */
export const mod07: CourseModule = {
  id: "mod07",
  numero: 7,
  titulo: "Checkpointing y persistencia",
  objetivo:
    "Compilar con InMemorySaver, usar thread_id en config, y demostrar que el estado " +
    "sobrevive entre invocaciones del mismo hilo.",
  enriquecido: true,
  secciones: {
    explicaSimple: {
      contenidoMd: `## Una libreta por conversación

Imagina que cada vez que hablas con alguien por teléfono, esa persona anota todo en una
**libreta con tu nombre en la portada**. Si la llamas mañana, la persona saca TU libreta
y sigue justo donde lo dejasteis: no tiene que preguntarte todo de nuevo. Si otra persona
distinta llama, esa persona usa SU PROPIA libreta: nunca se mezclan los apuntes de dos
conversaciones distintas.

En LangGraph, esa "libreta con nombre" es el **checkpoint** de un **hilo** (\`thread_id\`).
Un grafo compilado, por defecto, no recuerda nada entre una llamada (\`invoke\`) y la
siguiente: cada \`invoke\` empieza desde cero, como si la persona no tuviera libreta y
tuvieras que repetirle todo. Si compilas el grafo con un **checkpointer** (por ejemplo
\`InMemorySaver\`) y le pasas un \`thread_id\` en la configuración, el grafo guarda el
estado al final de cada paso y lo recupera automáticamente la próxima vez que invoques
ese MISMO \`thread_id\`. Hilos distintos tienen libretas distintas: nunca se leen entre sí.

## ¿Para qué sirve esto?

Sin persistencia, un asistente conversacional "olvidaría" todo lo que dijiste en el
turno anterior. Con un checkpointer y un \`thread_id\` por conversación, el grafo recuerda
el hilo de esa conversación concreta indefinidamente (o hasta que decidas borrarla),
mientras sigue sin mezclar los datos de conversaciones de otras personas.`,
      consignaExplicacion:
        "Explícale a alguien que no programa, usando la metáfora de 'una libreta con " +
        "nombre por conversación telefónica', qué hace que un programa recuerde lo que " +
        "hablasteis la última vez y por qué dos conversaciones distintas no se mezclan.",
    },
    detectaGaps: {
      contenidoMd:
        "Antes de ver el código, comprueba si predices bien cuándo un grafo recuerda su " +
        "estado y cuándo no.",
      quiz: {
        id: "mod07-quiz1",
        titulo: "¿Recuerda o empieza de cero?",
        preguntas: [
          {
            id: "mod07-quiz1-p1",
            kind: "single",
            enunciadoMd:
              "Un grafo se compila con `builder.compile()` (SIN `checkpointer`). ¿Qué pasa " +
              "si lo invocas dos veces seguidas?",
            opciones: [
              "Cada `invoke` empieza desde el estado de entrada que le pases; no hay memoria entre llamadas",
              "El grafo recuerda automáticamente el estado del invoke anterior",
              "Lanza un error porque falta el checkpointer",
              "Solo recuerda si le pasas un `thread_id`",
            ],
            correcta: 0,
            explicacionMd:
              "Sin `checkpointer`, no hay persistencia: cada `invoke` parte únicamente del " +
              "diccionario de estado que le pasas explícitamente, como cualquier función normal.",
          },
          {
            id: "mod07-quiz1-p2",
            kind: "boolean",
            enunciadoMd:
              "Con `compile(checkpointer=InMemorySaver())` y el MISMO `thread_id` en " +
              "`config`, un segundo `invoke()` continúa desde el estado guardado por el primero.",
            correcta: true,
            explicacionMd:
              "Correcto: el checkpointer guarda el estado al cierre de cada superstep bajo ese " +
              "`thread_id`; el siguiente `invoke` con el mismo `thread_id` parte de ahí.",
          },
          {
            id: "mod07-quiz1-p3",
            kind: "multi",
            enunciadoMd: "¿Cuáles de estas afirmaciones sobre `thread_id` son correctas?",
            opciones: [
              "Se pasa dentro de `config={'configurable': {'thread_id': ...}}`",
              "Dos `thread_id` distintos comparten el mismo estado guardado",
              "`graph.get_state(config)` usa el `thread_id` de ese `config` para buscar el snapshot",
              "Un `thread_id` identifica una conversación/ejecución aislada de las demás",
            ],
            correctas: [0, 2, 3],
            explicacionMd:
              "Hilos distintos están AISLADOS: cada uno tiene su propio historial de checkpoints " +
              "y no ve el estado de otro `thread_id`.",
          },
          {
            id: "mod07-quiz1-p4",
            kind: "single",
            enunciadoMd: "¿Qué expone `graph.get_state(config).next` cuando el grafo ya terminó?",
            opciones: [
              "Una tupla vacía `()`",
              "El nombre del último nodo ejecutado",
              "`None`",
              "Lanza una excepción",
            ],
            correcta: 0,
            explicacionMd:
              "`.next` lista los próximos nodos a ejecutar. Si el grafo llegó a `END`, no queda " +
              "ningún nodo por ejecutar: la tupla está vacía.",
          },
          {
            id: "mod07-quiz1-p5",
            kind: "output",
            enunciadoMd:
              "Con `count: Annotated[list, operator.add]` y un checkpointer, invocas dos veces " +
              "seguidas con el MISMO `thread_id` un grafo cuyo único nodo devuelve " +
              "`{'count': [1]}`. ¿Qué vale `count` tras el SEGUNDO `invoke`?",
            codigo:
              'r1 = graph.invoke({"count": []}, config)\nr2 = graph.invoke({"count": []}, config)\n# ¿r2["count"]?',
            opciones: ["`[1]`", "`[1, 1]`", "`[]`", "Lanza un error"],
            correcta: 1,
            explicacionMd:
              "El checkpointer restaura `count = [1]` (guardado tras el primer invoke) y el " +
              "reducer `operator.add` concatena el nuevo `[1]`: el resultado es `[1, 1]`.",
          },
          {
            id: "mod07-quiz1-p6",
            kind: "boolean",
            enunciadoMd:
              "`get_state_history(config)` devuelve los snapshots del hilo ordenados del más " +
              "ANTIGUO al más RECIENTE.",
            correcta: false,
            explicacionMd:
              "Al revés: `get_state_history` devuelve el snapshot más RECIENTE primero (útil " +
              "para inspeccionar rápido el último estado o recorrer hacia atrás en el tiempo).",
          },
        ],
      },
    },
    llenaGaps: {
      contenidoMd: `## Checkpointing en código real

\`\`\`python
import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph

class State(TypedDict):
    count: Annotated[list, operator.add]

def increment(state: State):
    return {"count": [1]}

graph = (
    StateGraph(State)
    .add_node("increment", increment)
    .add_edge(START, "increment")
    .add_edge("increment", END)
    .compile(checkpointer=InMemorySaver())
)

config_a = {"configurable": {"thread_id": "thread-a"}}
config_b = {"configurable": {"thread_id": "thread-b"}}

graph.invoke({"count": []}, config_a)   # {"count": [1]}
graph.invoke({"count": []}, config_a)   # {"count": [1, 1]}  (continúa el hilo A)
graph.invoke({"count": []}, config_b)   # {"count": [1]}     (hilo B, aislado)

snapshot = graph.get_state(config_a)
snapshot.values["count"]   # [1, 1]
snapshot.next              # ()  (el grafo terminó)

history = graph.get_state_history(config_a)
history[0].values["count"]   # [1, 1]  (más reciente primero)
\`\`\`

**Cómo leerlo:** cada nodo devuelve solo su aportación (\`{"count": [1]}\`); el reducer
\`operator.add\` se encarga de acumular sobre lo que el checkpointer restauró del hilo.
Sin \`Annotated[list, operator.add]\`, el segundo \`invoke\` en el mismo hilo SOBRESCRIBIRÍA
\`count\` con \`[1]\` en vez de acumular — la persistencia entre hilos y la fusión dentro de
un mismo estado son dos mecanismos separados (regla del módulo 03).

## Reanudar SIN \`thread_id\` no persiste nada

\`\`\`python
graph.invoke({"count": []})   # sin config: cada invoke arranca de cero, siempre [1]
\`\`\`

Sin \`configurable.thread_id\` en el \`config\`, el checkpointer no tiene bajo qué clave
guardar ni recuperar el estado: el comportamiento es como si no hubiera checkpointer.

**Errores comunes:**
- Reutilizar el mismo \`thread_id\` para conversaciones que deberían estar aisladas:
  el estado de una "contamina" a la otra.
- Olvidar el reducer en una clave que necesitas que acumule ENTRE invokes del mismo
  hilo: el checkpointer sí restaura el valor anterior, pero sin \`Annotated\` el nuevo
  valor lo sobrescribe: la acumulación exige un reducer explícito (ver módulo 03).
- Llamar a \`get_state\`/\`get_state_history\` sin haber compilado con \`checkpointer\`: el
  shim (igual que LangGraph real) exige checkpointer + \`thread_id\` para estas llamadas.`,
      retos: [
        {
          id: "mod07-reto1",
          titulo: "Checkpoint entre invokes: persiste en el hilo, aísla entre hilos",
          enunciadoMd:
            "Completa la compilación del grafo para que use `InMemorySaver` como " +
            "checkpointer. El nodo `increment` ya está definido y `count` ya tiene el " +
            "reducer `operator.add`: solo falta activar la persistencia.",
          starterCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph

class State(TypedDict):
    count: Annotated[list, operator.add]

def increment(state: State):
    return {"count": [1]}

builder = StateGraph(State)
builder.add_node("increment", increment)
builder.add_edge(START, "increment")
builder.add_edge("increment", END)
# TODO — compila el grafo con InMemorySaver() como checkpointer
graph = builder.compile()
`,
          solutionCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph

class State(TypedDict):
    count: Annotated[list, operator.add]

def increment(state: State):
    return {"count": [1]}

builder = StateGraph(State)
builder.add_node("increment", increment)
builder.add_edge(START, "increment")
builder.add_edge("increment", END)
graph = builder.compile(checkpointer=InMemorySaver())
`,
          validationCode: `from course_harness import check, check_eq

config_a = {"configurable": {"thread_id": "thread-a"}}
config_b = {"configurable": {"thread_id": "thread-b"}}

r1 = graph.invoke({"count": []}, config_a)
check_eq("thread_a_first", "primer invoke en thread-a", r1["count"], [1])

r2 = graph.invoke({"count": []}, config_a)
check_eq(
    "thread_a_second",
    "segundo invoke en thread-a acumula (el checkpoint persiste entre invokes)",
    r2["count"],
    [1, 1],
)

r3 = graph.invoke({"count": []}, config_b)
check_eq(
    "thread_b_isolated",
    "thread-b arranca aislado: no ve el estado de thread-a",
    r3["count"],
    [1],
)

snapshot = graph.get_state(config_a)
check_eq(
    "snapshot_values",
    "get_state(config).values refleja el estado actual del hilo",
    snapshot.values["count"],
    [1, 1],
)
check_eq(
    "snapshot_next_empty",
    "get_state(config).next está vacío cuando el grafo terminó",
    tuple(snapshot.next),
    (),
)

history = list(graph.get_state_history(config_a))
check(
    "history_has_entries",
    "get_state_history devuelve al menos un snapshot por invoke del hilo",
    len(history) >= 2,
)
check_eq(
    "history_most_recent_first",
    "el snapshot más reciente aparece primero",
    history[0].values["count"],
    [1, 1],
)
`,
        },
      ],
      pasos: [
        {
          id: "mod07-paso1",
          titulo: "Compila con checkpointer",
          explicacionMd:
            "Antes de tocar `thread_id`, practica lo mínimo: compilar un grafo con " +
            "`InMemorySaver()` como checkpointer. El nodo ya está completo.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod07-paso1-reto",
              titulo: "Compila con InMemorySaver",
              enunciadoMd:
                "Completa la compilación para que use `InMemorySaver()` como checkpointer.",
              starterCode: `from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from typing_extensions import TypedDict

class State(TypedDict):
    mensaje: str

def saludar(state: State):
    return {"mensaje": "hola"}

builder = StateGraph(State)
builder.add_node("saludar", saludar)
builder.add_edge(START, "saludar")
builder.add_edge("saludar", END)
# TODO — compila con checkpointer=InMemorySaver()
graph = builder.compile()
`,
              solutionCode: `from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from typing_extensions import TypedDict

class State(TypedDict):
    mensaje: str

def saludar(state: State):
    return {"mensaje": "hola"}

builder = StateGraph(State)
builder.add_node("saludar", saludar)
builder.add_edge(START, "saludar")
builder.add_edge("saludar", END)
graph = builder.compile(checkpointer=InMemorySaver())
`,
              validationCode: `from course_harness import check_eq

config = {"configurable": {"thread_id": "t1"}}
resultado = graph.invoke({"mensaje": ""}, config)
check_eq(
    "compila_con_checkpointer",
    "El grafo debe seguir invocando normalmente tras compilar con checkpointer",
    resultado["mensaje"],
    "hola",
)
snapshot = graph.get_state(config)
check_eq(
    "get_state_disponible",
    "get_state(config) debe funcionar tras compilar con checkpointer",
    snapshot.values["mensaje"],
    "hola",
)
`,
            },
          },
        },
        {
          id: "mod07-paso2",
          titulo: "Dos hilos, dos libretas",
          explicacionMd:
            "Lee el ejemplo completo de dos hilos aislados antes de escribir código: " +
            "`thread-a` y `thread-b` nunca comparten estado, aunque usen el mismo grafo " +
            "compilado con el mismo checkpointer.",
          accion: {
            kind: "lectura",
            bloqueMd: `\`\`\`python
config_a = {"configurable": {"thread_id": "thread-a"}}
config_b = {"configurable": {"thread_id": "thread-b"}}

graph.invoke({"count": []}, config_a)   # {"count": [1]}
graph.invoke({"count": []}, config_a)   # {"count": [1, 1]}  (continúa el hilo A)
graph.invoke({"count": []}, config_b)   # {"count": [1]}     (hilo B, aislado)
\`\`\`
Este fragmento ya está completo: solo léelo, no hace falta ejecutarlo ni completar nada todavía.`,
          },
        },
        {
          id: "mod07-paso3",
          titulo: "El nodo que acumula por hilo",
          explicacionMd:
            "Completa el nodo que aporta al reducer; la persistencia entre invokes del " +
            "mismo hilo la da el checkpointer, la acumulación dentro del estado la da " +
            "`operator.add` (módulo 03).",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod07-paso3-reto",
              titulo: "Completa el nodo increment",
              enunciadoMd: 'Completa `increment` para que devuelva `{"count": [1]}`.',
              starterCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph

class State(TypedDict):
    count: Annotated[list, operator.add]

def increment(state: State):
    # TODO: devuelve {"count": [1]}
    ...

graph = (
    StateGraph(State)
    .add_node("increment", increment)
    .add_edge(START, "increment")
    .add_edge("increment", END)
    .compile(checkpointer=InMemorySaver())
)
`,
              solutionCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph

class State(TypedDict):
    count: Annotated[list, operator.add]

def increment(state: State):
    return {"count": [1]}

graph = (
    StateGraph(State)
    .add_node("increment", increment)
    .add_edge(START, "increment")
    .add_edge("increment", END)
    .compile(checkpointer=InMemorySaver())
)
`,
              validationCode: `from course_harness import check_eq

config = {"configurable": {"thread_id": "t-paso3"}}
r1 = graph.invoke({"count": []}, config)
check_eq("paso3_primer_invoke", "primer invoke del hilo", r1["count"], [1])

r2 = graph.invoke({"count": []}, config)
check_eq(
    "paso3_segundo_invoke_acumula",
    "el segundo invoke del MISMO hilo acumula sobre lo guardado",
    r2["count"],
    [1, 1],
)
`,
            },
          },
        },
        {
          id: "mod07-paso4",
          titulo: "Predicción: get_state_history, ¿en qué orden?",
          explicacionMd:
            "Antes del reto de síntesis, predice el orden de los snapshots que devuelve " +
            "`get_state_history(config)`.",
          accion: {
            kind: "quiz",
            quiz: {
              id: "mod07-paso4-quiz",
              titulo: "¿Más reciente primero o más antiguo primero?",
              preguntas: [
                {
                  id: "mod07-paso4-quiz-p1",
                  kind: "single",
                  enunciadoMd:
                    "Tras 3 invokes del mismo hilo, `history = list(graph.get_state_history(config))`. " +
                    "¿Qué snapshot es `history[0]`?",
                  opciones: [
                    "El más RECIENTE (el del tercer invoke)",
                    "El más ANTIGUO (el del primer invoke)",
                    "Uno aleatorio",
                    "El del segundo invoke siempre",
                  ],
                  correcta: 0,
                  explicacionMd:
                    "`get_state_history` devuelve los snapshots del más reciente al más antiguo: " +
                    "`history[0]` es siempre el último estado guardado.",
                },
              ],
            },
          },
        },
        {
          id: "mod07-paso5",
          titulo: "Snapshot completo: values, next e historia",
          explicacionMd:
            "Practica el patrón completo antes de la síntesis: acumular en un hilo, leer " +
            "`get_state` (values y next) y confirmar el orden de `get_state_history`.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod07-paso5-reto",
              titulo: "Completa el nodo y compila con checkpointer",
              enunciadoMd:
                'Completa `sumar` para que devuelva `{"total": [state["paso"]]}` y compila ' +
                "el grafo con `InMemorySaver()`.",
              starterCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph

class State(TypedDict):
    paso: int
    total: Annotated[list, operator.add]

def sumar(state: State):
    # TODO: devuelve {"total": [state["paso"]]}
    ...

builder = StateGraph(State)
builder.add_node("sumar", sumar)
builder.add_edge(START, "sumar")
builder.add_edge("sumar", END)
# TODO: compila con checkpointer=InMemorySaver()
graph = builder.compile()
`,
              solutionCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph

class State(TypedDict):
    paso: int
    total: Annotated[list, operator.add]

def sumar(state: State):
    return {"total": [state["paso"]]}

builder = StateGraph(State)
builder.add_node("sumar", sumar)
builder.add_edge(START, "sumar")
builder.add_edge("sumar", END)
graph = builder.compile(checkpointer=InMemorySaver())
`,
              validationCode: `from course_harness import check, check_eq

config = {"configurable": {"thread_id": "t-paso5"}}
graph.invoke({"paso": 1, "total": []}, config)
r2 = graph.invoke({"paso": 2, "total": []}, config)
check_eq("paso5_acumula", "el total acumula entre invokes del hilo", r2["total"], [1, 2])

snapshot = graph.get_state(config)
check_eq("paso5_values", "get_state().values refleja el estado actual", snapshot.values["total"], [1, 2])
check_eq("paso5_next_vacio", "get_state().next está vacío cuando el grafo terminó", tuple(snapshot.next), ())

history = list(graph.get_state_history(config))
check(
    "paso5_history_reciente_primero",
    "el snapshot más reciente aparece primero en get_state_history",
    history[0].values["total"] == [1, 2],
)
`,
            },
          },
        },
      ],
    },
    refinaSimplifica: {
      resumenBullets: [
        "Sin checkpointer, cada `invoke()` arranca de cero: no hay memoria entre llamadas.",
        "`compile(checkpointer=InMemorySaver())` + `config={'configurable': {'thread_id': ...}}` activa la persistencia.",
        "El estado sobrevive entre invokes del MISMO `thread_id`; hilos distintos están aislados entre sí.",
        "`get_state(config)` expone `.values` (estado actual) y `.next` (próximos nodos, vacío si terminó).",
        "`get_state_history(config)` lista los snapshots del hilo, el más reciente primero.",
        "La persistencia entre invokes NO sustituye al reducer: sin `Annotated`, el checkpoint restaura el valor pero el nuevo update lo sobrescribe igualmente.",
        "Invocar sin `thread_id` deja el grafo sin memoria, aunque tenga un checkpointer compilado.",
      ],
      sintesis: {
        kind: "code",
        reto: {
          id: "mod07-reto-sintesis",
          titulo: "Síntesis: sin thread_id no hay persistencia",
          enunciadoMd:
            "Usando el mismo grafo con checkpointer, demuestra que invocarlo SIN " +
            "`config` (sin `thread_id`) no acumula nada entre llamadas: cada invoke debe " +
            "devolver `['visita']` siempre, nunca `['visita', 'visita']`.",
          starterCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph

class State(TypedDict):
    seen: Annotated[list, operator.add]

def mark(state: State):
    # TODO — devuelve {"seen": ["visita"]}
    ...

builder = StateGraph(State)
builder.add_node("mark", mark)
builder.add_edge(START, "mark")
builder.add_edge("mark", END)
graph = builder.compile(checkpointer=InMemorySaver())
`,
          solutionCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph

class State(TypedDict):
    seen: Annotated[list, operator.add]

def mark(state: State):
    return {"seen": ["visita"]}

builder = StateGraph(State)
builder.add_node("mark", mark)
builder.add_edge(START, "mark")
builder.add_edge("mark", END)
graph = builder.compile(checkpointer=InMemorySaver())
`,
          validationCode: `from course_harness import check_eq

r1 = graph.invoke({"seen": []})
check_eq("sin_thread_primera", "primer invoke sin config", r1["seen"], ["visita"])

r2 = graph.invoke({"seen": []})
check_eq(
    "sin_thread_no_acumula",
    "sin thread_id, el segundo invoke NO continúa ningún hilo previo",
    r2["seen"],
    ["visita"],
)
`,
        },
      },
    },
  },
  usaLaIa: [
    {
      id: "mod07-ia1",
      titulo: "Usa la IA para depurar un hilo que 'olvida' o que 'contamina' otro",
      promptsSugeridos: [
        "Compilé mi grafo con `InMemorySaver()` pero el segundo `invoke()` no recuerda nada " +
          "del primero (o al revés: dos `thread_id` distintos parecen compartir estado). " +
          "Aquí está mi `config` y mi `State`. ¿Qué me falta?",
        "Explícame con un ejemplo distinto al del curso la diferencia entre lo que hace el " +
          "checkpointer (persistencia entre invokes de UN hilo) y lo que hace el reducer " +
          "`operator.add` (fusión dentro de un mismo update).",
      ],
      comoVerificar: [
        "¿La respuesta usa `config={'configurable': {'thread_id': ...}}` exactamente como " +
          "en el grounding, o inventa otra forma de pasar el hilo?",
        "¿Al pegar el código sugerido, el mini-ejercicio pasa comprobando el NÚMERO exacto " +
          "de elementos acumulados (no solo 'ya no falla')?",
        "¿La IA distingue con claridad que sin `Annotated[..., operator.add]` el checkpoint " +
          "restaura el valor pero el nuevo update lo SOBRESCRIBE igual (regla del módulo 03)?",
      ],
      comoIterar:
        "Si el hilo sigue sin recordar, pega el `config` completo de ambos invokes y " +
        "pregunta específicamente si el `thread_id` es EXACTAMENTE el mismo string en los " +
        "dos, en vez de pedir el grafo reescrito entero.",
      queNoDelegar: [
        "No le pidas que 'arregle toda la persistencia': completa tú la línea del `compile(` " +
          "una vez que entiendas qué parámetro falta.",
        "No copies una respuesta que reutilice el mismo `thread_id` para conversaciones que " +
          "deberían estar aisladas: eso rompe el propósito de checkpointing por hilo.",
      ],
    },
  ],
  tutorialLocal: {
    introMd:
      "Este tramo añade persistencia real al proyecto: el grafo se compila con " +
      "`InMemorySaver()` y `main.py` invoca dos veces con el mismo `thread_id` para " +
      "demostrar que el saludo recuerda cuántas veces se ha ejecutado.",
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
          "Único cambio de este módulo: la última línea. El resto del archivo (nodos " +
          "`construir_saludo`/`agradecer`/`despedir`/`conversar` del módulo 06) sigue " +
          "IGUAL — se omite aquí para enfocar el cambio real.",
        codigo: `# ... construir_saludo, agradecer, route_agradecer, despedir, conversar
# (sin cambios respecto del módulo 06) ...

from langgraph.checkpoint.memory import InMemorySaver

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

# ANTES: graph = builder.compile()
graph = builder.compile(checkpointer=InMemorySaver())
`,
      },
      {
        archivo: "src/main.py",
        descripcionMd:
          "Invoca el grafo dos veces con el MISMO `thread_id`: la segunda vez, " +
          "`get_state` confirma que el checkpoint recuerda el estado de la primera.",
        codigo: `from graph import graph

config = {"configurable": {"thread_id": "sesion-1"}}

if __name__ == "__main__":
    resultado = graph.invoke({"nombre": "Ana"}, config)
    print(resultado["saludo"])

    snapshot = graph.get_state(config)
    print("vueltas registradas en el checkpoint:", snapshot.values["vueltas"])
`,
      },
    ],
    salidaEsperada: "Hasta luego, Ana\nvueltas registradas en el checkpoint: 3",
    spine: {
      crea: [],
      modifica: ["src/graph.py", "src/main.py"],
    },
  },
};
