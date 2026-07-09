import type { CourseModule } from "../types";

/**
 * Módulo 10 — Streaming I: values y updates.
 * Contenido completo (slice S14). Código: API del grounding base §5 y C-RUNNER
 * §tabla del shim (`graph.stream(..., stream_mode=...)`, modos "values"/"updates").
 * §12 (ADR-15, SE3): formato enriquecido — pasos guiados, "Usa la IA" y
 * tutorial local (continúa el project spine desde mod09). Shim avanzado (S12).
 */
export const mod10: CourseModule = {
  id: "mod10",
  numero: 10,
  titulo: "Streaming I: values y updates",
  objetivo:
    'Consumir graph.stream(...) con stream_mode="values" y "updates" y explicar qué ' +
    "emite cada modo.",
  enriquecido: true,
  secciones: {
    explicaSimple: {
      contenidoMd: `## Foto completa contra nota del cambio

Imagina que sigues una partida de ajedrez de dos formas distintas:

- **Modo "foto completa"**: después de cada jugada, alguien te enseña una FOTO del
  tablero ENTERO tal y como queda. Siempre ves todo, aunque solo haya cambiado una
  pieza.
- **Modo "nota del cambio"**: después de cada jugada, alguien te dice solo QUÉ MOVIÓ
  ese jugador concreto ("el jugador blanco movió el alfil"). No ves el tablero completo,
  solo el cambio puntual.

\`graph.stream(..., stream_mode="values")\` es la "foto completa": tras cada superstep te
da el **estado ENTERO** del grafo en ese momento. \`stream_mode="updates"\` es la "nota del
cambio": tras cada superstep te da SOLO lo que cada nodo aportó, como
\`{"nombre_del_nodo": {...lo que devolvió...}}\`.

Ninguno es "mejor": \`values\` es cómodo si necesitas el estado completo en cada paso;
\`updates\` es más ligero y te dice exactamente QUÉ nodo hizo QUÉ.`,
      consignaExplicacion:
        "Explícale a alguien que no programa, con la metáfora de 'foto completa del " +
        "tablero' contra 'nota de qué movió cada jugador', la diferencia entre " +
        "stream_mode='values' y stream_mode='updates'.",
    },
    detectaGaps: {
      contenidoMd: "Comprueba si distingues bien qué emite cada modo de streaming.",
      quiz: {
        id: "mod10-quiz1",
        titulo: "¿values o updates?",
        preguntas: [
          {
            id: "mod10-quiz1-p1",
            kind: "single",
            enunciadoMd:
              'Con `stream_mode="values"`, ¿qué recibes en cada elemento que produce ' +
              "`graph.stream(...)`?",
            opciones: [
              "El estado completo del grafo tras ese superstep",
              "Solo el nombre del último nodo ejecutado",
              "Un diccionario `{nodo: update}` con lo que aportó cada nodo",
              "Nada: `values` no está en la superficie del shim",
            ],
            correcta: 0,
            explicacionMd:
              '`"values"` emite el estado COMPLETO (todas las claves) tal y como queda al ' +
              "cierre de cada superstep.",
          },
          {
            id: "mod10-quiz1-p2",
            kind: "boolean",
            enunciadoMd:
              'Con `stream_mode="updates"`, cada elemento tiene forma `{nombre_del_nodo: ' +
              "update_que_devolvió_ese_nodo}`.",
            correcta: true,
            explicacionMd:
              "Correcto: `updates` te da, por superstep, qué nodo escribió y exactamente qué " +
              "devolvió (antes de aplicar reducers al estado global).",
          },
          {
            id: "mod10-quiz1-p3",
            kind: "multi",
            enunciadoMd: "¿Cuáles de estas afirmaciones sobre `graph.stream(...)` son correctas?",
            opciones: [
              "`stream_mode` puede ser un string único o una lista de modos combinados",
              "Con una lista de modos, cada elemento emitido es una tupla `(modo, evento)`",
              "`stream()` bloquea hasta el final y solo entonces empieza a emitir todo junto",
              "Con un solo modo (string), cada elemento emitido es directamente el payload de ese modo (sin envoltorio)",
            ],
            correctas: [0, 1, 3],
            explicacionMd:
              "El streaming emite un elemento por cada evento (superstep) a medida que ocurre, " +
              "no todo junto al final; con un modo combinado en lista, cada evento se etiqueta " +
              "con su modo en una tupla `(modo, evento)`.",
          },
          {
            id: "mod10-quiz1-p4",
            kind: "output",
            enunciadoMd:
              "Un grafo tiene dos nodos en cadena: `a` devuelve `{'x': 'A'}`, luego `b` " +
              "devuelve `{'x': 'B'}` (sin reducer en `x`). Iterando " +
              "`graph.stream({'x': ''}, stream_mode='values')`, ¿cuántos elementos produce " +
              "y qué valor de `x` tiene el ÚLTIMO?",
            codigo:
              "for chunk in graph.stream({'x': ''}, stream_mode='values'):\n    print(chunk)",
            opciones: [
              "2 elementos; el último tiene `x == 'B'`",
              "1 elemento; tiene `x == 'B'`",
              "2 elementos; el último tiene `x == 'A'`",
              "0 elementos: `values` no emite nada hasta el final",
            ],
            correcta: 0,
            explicacionMd:
              "`values` emite un elemento por superstep: uno tras el superstep de `a` " +
              "(`x=='A'`) y otro tras el de `b` (`x=='B'`, el último, porque `x` no tiene " +
              "reducer y `b` sobrescribe).",
          },
          {
            id: "mod10-quiz1-p5",
            kind: "single",
            enunciadoMd:
              "¿Qué produce `graph.stream(input, stream_mode=['values', 'updates'])` para " +
              "un superstep donde el nodo `a` corrió?",
            opciones: [
              "Dos elementos: `('values', <estado completo>)` y `('updates', {'a': <lo que devolvió a>})`",
              "Un único elemento combinado con ambas cosas mezcladas",
              "Solo `('values', ...)`: `updates` se ignora si se combina con `values`",
              "Un error: no se pueden combinar `values` y `updates`",
            ],
            correcta: 0,
            explicacionMd:
              "Cada modo pedido produce su propio evento, etiquetado con su nombre en una " +
              "tupla `(modo, evento)`.",
          },
        ],
      },
    },
    llenaGaps: {
      contenidoMd: `## values y updates en código real

\`\`\`python
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    topic: str
    joke: str

def generate_joke(state: State):
    return {"joke": f"Why did the {state['topic']} go to school?"}

graph = (
    StateGraph(State)
    .add_node("generate_joke", generate_joke)
    .add_edge(START, "generate_joke")
    .add_edge("generate_joke", END)
    .compile()
)

for chunk in graph.stream({"topic": "ice cream", "joke": ""}, stream_mode="values"):
    print(chunk)
# {"topic": "ice cream", "joke": "Why did the ice cream go to school?"}
# (estado COMPLETO tras el único superstep)

for chunk in graph.stream({"topic": "ice cream", "joke": ""}, stream_mode="updates"):
    print(chunk)
# {"generate_joke": {"joke": "Why did the ice cream go to school?"}}
# (solo lo que el nodo generate_joke devolvió)
\`\`\`

## Combinando modos

\`\`\`python
for mode, event in graph.stream(
    {"topic": "ice cream", "joke": ""},
    stream_mode=["values", "updates"],
):
    if mode == "values":
        print("estado completo:", event)
    elif mode == "updates":
        for node_name, update in event.items():
            print(f"Node {node_name} updated: {update}")
\`\`\`

**Cómo leerlo:** con un solo modo (string), cada elemento del stream ES directamente el
payload de ese modo. Con una LISTA de modos, cada elemento es una tupla
\`(modo, evento)\`: hay que desempaquetarla para saber a qué modo pertenece.

**Errores comunes:**
- Esperar que \`updates\` te dé el estado completo: solo trae lo que el nodo devolvió,
  ANTES de fusionarse con el resto del estado.
- Olvidar que con modos combinados cada elemento es \`(modo, evento)\`, no el evento suelto.
- Confundir "streaming" con "tokens del LLM": \`values\`/\`updates\` emiten por SUPERSTEP,
  no por token — el streaming token a token del modelo se ve en el módulo 11.`,
      retos: [
        {
          id: "mod10-reto1",
          titulo: "Recolectar values y updates de un grafo de dos nodos",
          enunciadoMd:
            "Completa el grafo con dos nodos en cadena (`paso_a`, `paso_b`) que " +
            "escriben `historial` con el reducer `operator.add`. Luego, en la " +
            "validación, se recolectan los eventos de `stream_mode=\"values\"` y " +
            "`stream_mode=\"updates\"` por separado.",
          starterCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    historial: Annotated[list[str], operator.add]

def paso_a(state: State):
    # TODO — devuelve {"historial": ["a"]}
    ...

def paso_b(state: State):
    # TODO — devuelve {"historial": ["b"]}
    ...

builder = StateGraph(State)
builder.add_node("paso_a", paso_a)
builder.add_node("paso_b", paso_b)
builder.add_edge(START, "paso_a")
builder.add_edge("paso_a", "paso_b")
builder.add_edge("paso_b", END)
graph = builder.compile()
`,
          solutionCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    historial: Annotated[list[str], operator.add]

def paso_a(state: State):
    return {"historial": ["a"]}

def paso_b(state: State):
    return {"historial": ["b"]}

builder = StateGraph(State)
builder.add_node("paso_a", paso_a)
builder.add_node("paso_b", paso_b)
builder.add_edge(START, "paso_a")
builder.add_edge("paso_a", "paso_b")
builder.add_edge("paso_b", END)
graph = builder.compile()
`,
          validationCode: `from course_harness import check, check_eq

values_events = list(graph.stream({"historial": []}, stream_mode="values"))
check_eq(
    "values_emits_one_per_superstep",
    "values emite un elemento por superstep (dos nodos en cadena => 2 elementos)",
    len(values_events),
    2,
)
check_eq(
    "values_last_is_full_state",
    "el último elemento de values trae el estado completo tras ambos pasos",
    values_events[-1]["historial"],
    ["a", "b"],
)
check_eq(
    "values_first_is_partial",
    "el primer elemento de values solo refleja el primer superstep",
    values_events[0]["historial"],
    ["a"],
)

updates_events = list(graph.stream({"historial": []}, stream_mode="updates"))
check_eq(
    "updates_count",
    "updates emite un elemento por superstep",
    len(updates_events),
    2,
)
check(
    "updates_shape_is_node_to_update",
    "cada elemento de updates es {nombre_del_nodo: lo_que_devolvió}",
    all(isinstance(e, dict) and len(e) == 1 for e in updates_events),
)
check_eq(
    "updates_first_node",
    "el primer update viene de paso_a con su propia contribución (no el estado completo)",
    updates_events[0],
    {"paso_a": {"historial": ["a"]}},
)
check_eq(
    "updates_second_node",
    "el segundo update viene de paso_b",
    updates_events[1],
    {"paso_b": {"historial": ["b"]}},
)
`,
        },
      ],
      pasos: [
        {
          id: "mod10-paso1",
          titulo: "Recolecta values de un grafo de un solo nodo",
          explicacionMd:
            "Antes de comparar `values` con `updates`, practica lo mínimo: iterar " +
            "`graph.stream(..., stream_mode=\"values\")` y quedarte con el último elemento.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod10-paso1-reto",
              titulo: "Completa el nodo y recolecta values",
              enunciadoMd:
                'Completa `duplicar` para que devuelva `{"n": state["n"] * 2}`.',
              starterCode: `from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    n: int

def duplicar(state: State):
    # TODO: devuelve {"n": state["n"] * 2}
    ...

graph = (
    StateGraph(State)
    .add_node("duplicar", duplicar)
    .add_edge(START, "duplicar")
    .add_edge("duplicar", END)
    .compile()
)
`,
              solutionCode: `from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    n: int

def duplicar(state: State):
    return {"n": state["n"] * 2}

graph = (
    StateGraph(State)
    .add_node("duplicar", duplicar)
    .add_edge(START, "duplicar")
    .add_edge("duplicar", END)
    .compile()
)
`,
              validationCode: `from course_harness import check_eq

eventos = list(graph.stream({"n": 3}, stream_mode="values"))
check_eq("paso1_values_ultimo", "el último evento de values trae el estado final", eventos[-1]["n"], 6)
`,
            },
          },
        },
        {
          id: "mod10-paso2",
          titulo: "El mismo grafo, en modo updates",
          explicacionMd:
            "Lee el ejemplo completo comparando `values` y `updates` sobre el mismo grafo " +
            "de un nodo antes de tocar código.",
          accion: {
            kind: "lectura",
            bloqueMd: `\`\`\`python
for chunk in graph.stream({"topic": "ice cream", "joke": ""}, stream_mode="values"):
    print(chunk)
# {"topic": "ice cream", "joke": "Why did the ice cream go to school?"}

for chunk in graph.stream({"topic": "ice cream", "joke": ""}, stream_mode="updates"):
    print(chunk)
# {"generate_joke": {"joke": "Why did the ice cream go to school?"}}
\`\`\`
Este fragmento ya está completo: solo léelo, no hace falta ejecutarlo ni completar nada todavía.`,
          },
        },
        {
          id: "mod10-paso3",
          titulo: "Recolecta updates del mismo grafo",
          explicacionMd:
            "Completa el mismo grafo del paso 1, pero ahora recolecta " +
            "`stream_mode=\"updates\"` y confirma la forma `{nodo: update}`.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod10-paso3-reto",
              titulo: "Recolecta updates de duplicar",
              enunciadoMd:
                'Completa `duplicar` para que devuelva `{"n": state["n"] * 2}` (igual que ' +
                "el paso 1); esta vez la validación revisa `stream_mode=\"updates\"`.",
              starterCode: `from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    n: int

def duplicar(state: State):
    # TODO: devuelve {"n": state["n"] * 2}
    ...

graph = (
    StateGraph(State)
    .add_node("duplicar", duplicar)
    .add_edge(START, "duplicar")
    .add_edge("duplicar", END)
    .compile()
)
`,
              solutionCode: `from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    n: int

def duplicar(state: State):
    return {"n": state["n"] * 2}

graph = (
    StateGraph(State)
    .add_node("duplicar", duplicar)
    .add_edge(START, "duplicar")
    .add_edge("duplicar", END)
    .compile()
)
`,
              validationCode: `from course_harness import check_eq

eventos = list(graph.stream({"n": 3}, stream_mode="updates"))
check_eq(
    "paso3_updates_forma",
    "updates debe ser {nodo: lo_que_devolvió}",
    eventos[0],
    {"duplicar": {"n": 6}},
)
`,
            },
          },
        },
        {
          id: "mod10-paso4",
          titulo: "Predicción: ¿cuántos eventos en un grafo de 3 nodos?",
          explicacionMd:
            "Antes de la síntesis, predice cuántos elementos emite `values`/`updates` en " +
            "un grafo de tres nodos en cadena, sin ciclos.",
          accion: {
            kind: "quiz",
            quiz: {
              id: "mod10-paso4-quiz",
              titulo: "¿Cuántos eventos emite un grafo de 3 nodos?",
              preguntas: [
                {
                  id: "mod10-paso4-quiz-p1",
                  kind: "output",
                  enunciadoMd:
                    "Un grafo tiene 3 nodos en cadena (`a -> b -> c -> END`), sin ciclos. " +
                    "¿Cuántos elementos produce `graph.stream(input, stream_mode='updates')`?",
                  codigo:
                    'builder.add_edge(START, "a")\nbuilder.add_edge("a", "b")\n' +
                    'builder.add_edge("b", "c")\nbuilder.add_edge("c", END)\n',
                  opciones: ["3 elementos (uno por nodo)", "1 elemento", "0 elementos", "Depende del contenido del estado"],
                  correcta: 0,
                  explicacionMd:
                    "Cada superstep (uno por nodo en una cadena lineal sin fan-out) produce " +
                    "exactamente un elemento: 3 nodos ⇒ 3 elementos.",
                },
              ],
            },
          },
        },
        {
          id: "mod10-paso5",
          titulo: "Combina values y updates en una sola pasada",
          explicacionMd:
            "Practica el patrón completo de la síntesis: itera `stream_mode=[\"values\", " +
            '"updates"]` UNA sola vez y separa los eventos por modo.',
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod10-paso5-reto",
              titulo: "Separa values y updates de una sola iteración",
              enunciadoMd:
                "Completa `duplicar` (igual que antes) y `clasificar`, que itera " +
                '`stream_mode=["values", "updates"]` y separa cada `(modo, evento)` en su lista.',
              starterCode: `from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    n: int

def duplicar(state: State):
    return {"n": state["n"] * 2}

graph = (
    StateGraph(State)
    .add_node("duplicar", duplicar)
    .add_edge(START, "duplicar")
    .add_edge("duplicar", END)
    .compile()
)

def clasificar(input_state):
    values_seen = []
    updates_seen = []
    for mode, event in graph.stream(input_state, stream_mode=["values", "updates"]):
        # TODO: reparte cada (modo, evento) en values_seen o updates_seen
        ...
    return values_seen, updates_seen
`,
              solutionCode: `from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    n: int

def duplicar(state: State):
    return {"n": state["n"] * 2}

graph = (
    StateGraph(State)
    .add_node("duplicar", duplicar)
    .add_edge(START, "duplicar")
    .add_edge("duplicar", END)
    .compile()
)

def clasificar(input_state):
    values_seen = []
    updates_seen = []
    for mode, event in graph.stream(input_state, stream_mode=["values", "updates"]):
        if mode == "values":
            values_seen.append(event)
        elif mode == "updates":
            updates_seen.append(event)
    return values_seen, updates_seen
`,
              validationCode: `from course_harness import check_eq

values_seen, updates_seen = clasificar({"n": 3})
check_eq("paso5_values_final", "el último value trae el estado final", values_seen[-1]["n"], 6)
check_eq("paso5_updates_forma", "el update de duplicar trae su propia contribución", updates_seen[0], {"duplicar": {"n": 6}})
`,
            },
          },
        },
      ],
    },
    refinaSimplifica: {
      resumenBullets: [
        '`stream_mode="values"` emite el ESTADO COMPLETO tras cada superstep (la "foto entera").',
        '`stream_mode="updates"` emite `{nodo: lo_que_devolvió}` tras cada superstep (la "nota del cambio").',
        "Ambos emiten un elemento por superstep, no por token del LLM.",
        "Con un modo único (string), cada elemento del stream ES el payload directamente.",
        "Con una lista de modos, cada elemento es una tupla `(modo, evento)` que hay que desempaquetar.",
        "`updates` refleja lo que el nodo devolvió, ANTES de fusionarse (vía reducer) con el resto del estado.",
      ],
      sintesis: {
        kind: "code",
        reto: {
          id: "mod10-reto-sintesis",
          titulo: "Síntesis: combinar values + updates en una sola pasada",
          enunciadoMd:
            "Usando el mismo grafo de dos pasos, itera " +
            "`graph.stream(input, stream_mode=[\"values\", \"updates\"])` UNA sola vez y " +
            "separa los eventos por modo en dos listas: `values_seen` y `updates_seen`.",
          starterCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    historial: Annotated[list[str], operator.add]

def paso_a(state: State):
    return {"historial": ["a"]}

def paso_b(state: State):
    return {"historial": ["b"]}

builder = StateGraph(State)
builder.add_node("paso_a", paso_a)
builder.add_node("paso_b", paso_b)
builder.add_edge(START, "paso_a")
builder.add_edge("paso_a", "paso_b")
builder.add_edge("paso_b", END)
graph = builder.compile()

def clasificar_eventos(input_state):
    values_seen = []
    updates_seen = []
    # TODO — itera graph.stream(input_state, stream_mode=["values", "updates"])
    # y reparte cada (modo, evento) en la lista correspondiente
    return values_seen, updates_seen
`,
          solutionCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    historial: Annotated[list[str], operator.add]

def paso_a(state: State):
    return {"historial": ["a"]}

def paso_b(state: State):
    return {"historial": ["b"]}

builder = StateGraph(State)
builder.add_node("paso_a", paso_a)
builder.add_node("paso_b", paso_b)
builder.add_edge(START, "paso_a")
builder.add_edge("paso_a", "paso_b")
builder.add_edge("paso_b", END)
graph = builder.compile()

def clasificar_eventos(input_state):
    values_seen = []
    updates_seen = []
    for mode, event in graph.stream(input_state, stream_mode=["values", "updates"]):
        if mode == "values":
            values_seen.append(event)
        elif mode == "updates":
            updates_seen.append(event)
    return values_seen, updates_seen
`,
          validationCode: `from course_harness import check_eq

values_seen, updates_seen = clasificar_eventos({"historial": []})

check_eq("combined_values_count", "2 eventos values (uno por superstep)", len(values_seen), 2)
check_eq("combined_updates_count", "2 eventos updates (uno por superstep)", len(updates_seen), 2)
check_eq(
    "combined_values_final",
    "el último evento de values trae el estado completo",
    values_seen[-1]["historial"],
    ["a", "b"],
)
check_eq(
    "combined_updates_nodes",
    "los updates identifican qué nodo aportó qué, en orden",
    updates_seen,
    [{"paso_a": {"historial": ["a"]}}, {"paso_b": {"historial": ["b"]}}],
)
`,
        },
      },
    },
  },
  usaLaIa: [
    {
      id: "mod10-ia1",
      titulo: "Usa la IA para elegir el modo de streaming correcto",
      promptsSugeridos: [
        "Quiero mostrar en mi terminal [describe qué necesitas: el estado completo tras " +
          "cada paso, o solo qué nodo cambió qué]. ¿Debería usar `stream_mode='values'` o " +
          "`'updates'`? Explica con mi propio grafo.",
        "Mi `for chunk in graph.stream(...)` con una lista de modos me da un error al " +
          "desempaquetar. Aquí está mi código: ¿olvidé que cada elemento es `(modo, evento)`?",
      ],
      comoVerificar: [
        "¿La respuesta distingue con claridad que `values` da el ESTADO COMPLETO y " +
          "`updates` da SOLO lo que aportó cada nodo?",
        "¿Al pegar el código sugerido, el mini-ejercicio pasa con el número EXACTO de " +
          "eventos esperado (uno por superstep, ni más ni menos)?",
        "¿La IA aclara que con un modo único el elemento es el payload directo, y con una " +
          "lista de modos es una tupla `(modo, evento)`?",
      ],
      comoIterar:
        "Si el número de eventos no coincide con lo esperado, cuenta tú mismo cuántos " +
        "supersteps tiene el grafo (nº de nodos en la cadena, sin ciclos) y pregunta a la " +
        "IA si tu conteo manual coincide con el suyo, en vez de pedir el código reescrito.",
      queNoDelegar: [
        "No le pidas que 'imprima bonito el streaming completo': decide tú qué modo " +
          "necesitas antes de pedir el bucle `for`.",
        "No copies una respuesta que mezcle `values`/`updates` con `messages` (streaming " +
          "de tokens del módulo 11) si tu caso no involucra un LLM.",
      ],
    },
  ],
  tutorialLocal: {
    introMd:
      "Este tramo hace visible en tiempo real lo que el proyecto ya hacía: `main.py` " +
      "ahora imprime cada superstep del grafo con `stream_mode=['values', 'updates']`, " +
      "en vez de esperar al resultado final de `invoke`.",
    setup: [
      {
        titulo: "Reactiva el entorno virtual (si cerraste la terminal)",
        descripcionMd: "No hay dependencias nuevas en este módulo.",
        powershell: ".venv\\Scripts\\Activate.ps1",
        bash: "source .venv/bin/activate",
      },
      {
        titulo: "Ejecuta el grafo y observa el streaming paso a paso",
        descripcionMd: "",
        powershell: "python src\\main.py",
        bash: "python src/main.py",
      },
    ],
    codigo: [
      {
        archivo: "src/main.py",
        descripcionMd:
          "En vez de un único `graph.invoke(...)`, se itera `graph.stream(...)` con ambos " +
          "modos combinados: `values` imprime el estado completo tras cada paso, " +
          "`updates` identifica qué nodo aportó qué.",
        codigo: `from graph import graph

config = {"configurable": {"thread_id": "sesion-4"}}

if __name__ == "__main__":
    for mode, event in graph.stream({"nombre": "Ana"}, config, stream_mode=["values", "updates"]):
        if mode == "values":
            print("estado completo:", event.get("saludo"))
        elif mode == "updates":
            for nodo, update in event.items():
                print(f"nodo {nodo} aportó:", update)
`,
      },
    ],
    salidaEsperada:
      "estado completo: Hola, Ana\nnodo construir_saludo aportó: {'saludo': 'Hola, Ana', " +
      "'historial': ['Hola, Ana'], 'vueltas': 0}\n... (una línea por superstep hasta la " +
      "despedida final, incluyendo conversar)",
    spine: {
      crea: [],
      modifica: ["src/main.py"],
    },
  },
};
