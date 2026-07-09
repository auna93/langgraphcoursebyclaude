import type { CourseModule } from "../types";

/**
 * Módulo 05 — Conditional edges y ciclos.
 * Contenido completo (slice S13). Código: API del grounding §1 exclusivamente
 * (add_conditional_edges, funciones de ruta con Literal, ciclos con condición de
 * parada). Sin fan-out real (regla M3 de S13): el ciclo se recorre nodo a nodo.
 * §12 (ADR-15, SE2): formato enriquecido — pasos guiados, "Usa la IA" y
 * tutorial local (continúa el project spine desde mod04). Solo shim core.
 */
export const mod05: CourseModule = {
  id: "mod05",
  numero: 5,
  titulo: "Conditional edges y ciclos",
  objetivo:
    "Implementar routing con add_conditional_edges y funciones de ruta (Literal), " +
    "incluyendo loops con condición de parada.",
  enriquecido: true,
  secciones: {
    explicaSimple: {
      contenidoMd: `## Un guardia de tráfico, no una cinta fija

En el módulo 04 viste cintas transportadoras fijas: la pieza SIEMPRE va de la estación
A a la estación B. Pero muchos procesos reales necesitan un **guardia de tráfico** en
alguna estación: alguien que mira la pieza (el estado) y decide, en ese momento, a qué
estación va después. A veces la manda de vuelta a una estación anterior — eso es un
**ciclo**: el flujo pasa otra vez por un nodo ya visitado.

Ejemplos de la vida real que necesitan guardia de tráfico:
- Un corrector que revisa un texto y, si encuentra errores, lo manda de vuelta a
  reescritura; si no, lo deja pasar.
- Un juego de "tira el dado otra vez si no sacas un 6"; solo avanzas cuando se cumple
  la condición.

Sin guardia de tráfico (cinta fija) no puedes expresar "depende" ni "repite hasta que".
Con guardia de tráfico (edge condicional), sí.

## El guardia necesita una condición de parada

Un guardia de tráfico que manda de vuelta a la pieza para siempre, sin condición para
dejarla pasar, crea un **ciclo infinito**. Por eso toda función de ruta debe tener una
condición clara que, tarde o temprano, decida "ya está, sigue adelante" (o termina el
proceso, en \`END\`).`,
      consignaExplicacion:
        "Explícale a alguien que no programa, usando la metáfora del guardia de tráfico " +
        "que decide a dónde va la pieza según su estado, qué es un 'ciclo' en un grafo y " +
        "por qué siempre necesita una condición para parar.",
    },
    detectaGaps: {
      contenidoMd:
        "Comprueba si distingues bien un edge fijo (`add_edge`) de uno condicional " +
        "(`add_conditional_edges`), y si sabes predecir cuántas vueltas dará un ciclo.",
      quiz: {
        id: "mod05-quiz1",
        titulo: "Routing condicional y ciclos",
        preguntas: [
          {
            id: "mod05-quiz1-p1",
            kind: "single",
            enunciadoMd: "¿Qué recibe y qué devuelve una función de ruta usada con `add_conditional_edges`?",
            opciones: [
              "Recibe el estado actual y devuelve el nombre del siguiente nodo (o `END`).",
              "Recibe el nombre del nodo anterior y devuelve un booleano.",
              "Recibe la lista de todos los nodos y devuelve un diccionario.",
              "No recibe nada: siempre devuelve el mismo nodo fijo.",
            ],
            correcta: 0,
            explicacionMd:
              "La función de ruta recibe el estado (como cualquier nodo) y devuelve el " +
              "nombre del siguiente nodo a ejecutar, o `END` para terminar el grafo.",
          },
          {
            id: "mod05-quiz1-p2",
            kind: "boolean",
            enunciadoMd:
              "Una función de ruta usada en `add_conditional_edges` puede devolver el " +
              "nombre de un nodo que ya se ejecutó antes, creando un ciclo.",
            correcta: true,
            explicacionMd:
              "Sí: no hay restricción sobre qué nodo puede devolver la función de ruta, " +
              "incluyendo uno ya visitado — eso es exactamente un ciclo.",
          },
          {
            id: "mod05-quiz1-p3",
            kind: "multi",
            enunciadoMd: "¿Qué necesita, como mínimo, un ciclo bien construido para no colgarse?",
            opciones: [
              "Una condición de parada clara en la función de ruta.",
              "Que el estado cambie de forma que la condición de parada eventualmente se cumpla.",
              "Que el ciclo tenga exactamente un solo nodo.",
              "Nada especial: LangGraph detecta ciclos infinitos y los corta solo.",
            ],
            correctas: [0, 1],
            explicacionMd:
              "Hace falta una condición de parada Y que el estado avance hacia ella; " +
              "LangGraph no 'adivina' cuándo parar — si no se cumple la condición, sigue " +
              "hasta el límite de recursión y falla con un error.",
          },
          {
            id: "mod05-quiz1-p4",
            kind: "output",
            enunciadoMd:
              "Dado este ciclo (`a` → `route` → `b` o `END`; `b` → `a`), ¿cuántas veces se " +
              "ejecuta el nodo `a` si empieza con `contador=0` y la condición de parada es " +
              "`contador >= 3`?",
            codigo:
              'def a(state):\n    return {"contador": state["contador"] + 1}\n\ndef route(state) -> Literal["b", END]:\n    return END if state["contador"] >= 3 else "b"\n\ndef b(state):\n    return state\n',
            opciones: ["3 veces", "2 veces", "4 veces", "Infinitas veces"],
            correcta: 0,
            explicacionMd:
              "`a` se ejecuta con contador 0→1, 1→2, 2→3; en la tercera vez `contador` llega " +
              "a 3 y `route` decide `END` en vez de volver a `b`. En total `a` se ejecuta 3 veces.",
          },
          {
            id: "mod05-quiz1-p5",
            kind: "single",
            enunciadoMd:
              "¿Qué pasa si un ciclo nunca cumple su condición de parada?",
            opciones: [
              "El grafo alcanza el límite de recursión (25 por defecto) y falla con un error claro.",
              "El grafo se ejecuta para siempre sin ningún aviso.",
              "LangGraph lo convierte automáticamente en un edge fijo hacia `END`.",
              "El grafo ignora el ciclo y continúa como si no existiera.",
            ],
            correcta: 0,
            explicacionMd:
              "LangGraph tiene un límite de recursión (25 pasos por defecto); superarlo " +
              "produce un error explícito en vez de colgarse indefinidamente.",
          },
        ],
      },
    },
    llenaGaps: {
      contenidoMd: `## Conditional edges y ciclo, en código real

\`\`\`python
from typing import Literal
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    contador: int

def incrementar(state: State):
    return {"contador": state["contador"] + 1}

def route(state: State) -> Literal["incrementar", END]:
    return "incrementar" if state["contador"] < 3 else END

builder = StateGraph(State)
builder.add_node(incrementar)
builder.add_edge(START, "incrementar")
builder.add_conditional_edges("incrementar", route)
graph = builder.compile()

graph.invoke({"contador": 0})  # {'contador': 3}
\`\`\`

**Cómo leerlo:** \`add_conditional_edges("incrementar", route)\` dice "tras ejecutar
\`incrementar\`, llama a \`route(estado)\` para decidir el siguiente paso". Como \`route\`
devuelve el nombre del propio nodo \`"incrementar"\` mientras \`contador < 3\`, el grafo
vuelve a ejecutarlo — eso es el ciclo. Cuando \`contador\` llega a 3, \`route\` devuelve
\`END\` y el grafo termina.

El tipo de retorno \`Literal["incrementar", END]\` es documentación útil para quien lee
el código: enumera los posibles destinos que la función de ruta puede devolver.

## Un ciclo entre DOS nodos distintos

\`\`\`python
def a(state: State):
    return {"aggregate": state["aggregate"] + ["A"]}

def b(state: State):
    return {"aggregate": state["aggregate"] + ["B"]}

def route(state: State) -> Literal["b", END]:
    return "b" if len(state["aggregate"]) < 4 else END

builder = StateGraph(State)
builder.add_node(a)
builder.add_node(b)
builder.add_edge(START, "a")
builder.add_conditional_edges("a", route)
builder.add_edge("b", "a")  # b siempre vuelve a a (edge fijo)
graph = builder.compile()
\`\`\`

El ciclo puede mezclar edges fijos (\`b\` siempre vuelve a \`a\`) con un edge condicional
(\`a\` decide entre \`b\` o \`END\`).

**Errores comunes:**
- Que la función de ruta nunca devuelva \`END\` (o el nombre de un nodo fuera del ciclo):
  el grafo agota el límite de recursión.
- Que la condición de parada dependa de una clave que ningún nodo del ciclo actualiza:
  el estado nunca cambia y la condición nunca se cumple.
- Confundir \`add_conditional_edges("a", route)\` (routing DESPUÉS de "a") con
  \`add_edge("a", "b")\` (conexión fija): solo uno de los dos decide dinámicamente.`,
      retos: [
        {
          id: "mod05-reto1",
          titulo: "Completa la función de ruta del ciclo",
          enunciadoMd:
            "Completa `route` para que el ciclo `incrementar → route → incrementar` " +
            "continúe mientras `contador` sea menor que 5, y termine (`END`) cuando " +
            "llegue a 5 o más.",
          starterCode: `from typing import Literal
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    contador: int

def incrementar(state: State):
    return {"contador": state["contador"] + 1}

def route(state: State) -> Literal["incrementar", END]:
    # TODO — devuelve "incrementar" si state["contador"] < 5, si no devuelve END
    ...

builder = StateGraph(State)
builder.add_node(incrementar)
builder.add_edge(START, "incrementar")
builder.add_conditional_edges("incrementar", route)
graph = builder.compile()
`,
          solutionCode: `from typing import Literal
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    contador: int

def incrementar(state: State):
    return {"contador": state["contador"] + 1}

def route(state: State) -> Literal["incrementar", END]:
    return "incrementar" if state["contador"] < 5 else END

builder = StateGraph(State)
builder.add_node(incrementar)
builder.add_edge(START, "incrementar")
builder.add_conditional_edges("incrementar", route)
graph = builder.compile()
`,
          validationCode: `from course_harness import check, check_eq

resultado = graph.invoke({"contador": 0})
check_eq(
    "ciclo_termina_en_contador_5",
    "El ciclo debe terminar exactamente cuando contador llega a 5",
    resultado["contador"],
    5,
)

resultado_2 = graph.invoke({"contador": 3})
check_eq(
    "ciclo_respeta_contador_inicial",
    "Empezando en 3, el ciclo debe seguir hasta llegar a 5",
    resultado_2["contador"],
    5,
)
check(
    "no_pasa_de_5",
    "El contador no debe superar 5 (la condición debe cortar exactamente en el límite)",
    resultado["contador"] <= 5,
)
`,
        },
      ],
      pasos: [
        {
          id: "mod05-paso1",
          titulo: "Una función de ruta aislada",
          explicacionMd:
            "Antes de montar el ciclo completo, practica solo la función de ruta: recibe " +
            "el estado y decide el destino. Completa `route` para un caso simple de " +
            "vender/cerrar según quedan tickets.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod05-paso1-reto",
              titulo: "Completa la función de ruta vender/cerrar",
              enunciadoMd:
                'Completa `route` para que devuelva `"vender"` si `state["tickets"] > 0`, y ' +
                '`"cerrar"` en caso contrario.',
              starterCode: `from typing import Literal
from typing_extensions import TypedDict

class State(TypedDict):
    tickets: int

def route(state: State) -> Literal["vender", "cerrar"]:
    # TODO: devuelve "vender" si state["tickets"] > 0, si no "cerrar"
    ...
`,
              solutionCode: `from typing import Literal
from typing_extensions import TypedDict

class State(TypedDict):
    tickets: int

def route(state: State) -> Literal["vender", "cerrar"]:
    return "vender" if state["tickets"] > 0 else "cerrar"
`,
              validationCode: `from course_harness import check_eq

check_eq(
    "route_vende_con_tickets_disponibles",
    "Con tickets > 0, route debe devolver 'vender'",
    route({"tickets": 3}),
    "vender",
)
check_eq(
    "route_cierra_sin_tickets",
    "Con tickets == 0, route debe devolver 'cerrar'",
    route({"tickets": 0}),
    "cerrar",
)
`,
            },
          },
        },
        {
          id: "mod05-paso2",
          titulo: "add_conditional_edges, en contexto",
          explicacionMd:
            "`add_conditional_edges(nodo, route)` dice: tras ejecutar `nodo`, llama a " +
            "`route(estado)` para decidir el siguiente destino. Lee el fragmento del ciclo " +
            "completo antes de tocar código.",
          accion: {
            kind: "lectura",
            bloqueMd: `\`\`\`python
from typing import Literal
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    contador: int

def incrementar(state: State):
    return {"contador": state["contador"] + 1}

def route(state: State) -> Literal["incrementar", END]:
    return "incrementar" if state["contador"] < 3 else END

builder = StateGraph(State)
builder.add_node(incrementar)
builder.add_edge(START, "incrementar")
builder.add_conditional_edges("incrementar", route)
graph = builder.compile()
\`\`\`
Este fragmento ya está completo: solo léelo, no hace falta ejecutarlo ni completar nada todavía.`,
          },
        },
        {
          id: "mod05-paso3",
          titulo: "Conecta el ciclo con add_conditional_edges",
          explicacionMd:
            "El nodo y la función de ruta ya están completos; solo falta conectar el " +
            "ciclo con `add_conditional_edges`.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod05-paso3-reto",
              titulo: "Añade la conexión condicional",
              enunciadoMd:
                'Añade `builder.add_conditional_edges("incrementar", route)` para cerrar el ciclo.',
              starterCode: `from typing import Literal
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    contador: int

def incrementar(state: State):
    return {"contador": state["contador"] + 1}

def route(state: State) -> Literal["incrementar", END]:
    return "incrementar" if state["contador"] < 3 else END

builder = StateGraph(State)
builder.add_node(incrementar)
builder.add_edge(START, "incrementar")
# TODO: conecta el ciclo con add_conditional_edges("incrementar", route)
graph = builder.compile()
`,
              solutionCode: `from typing import Literal
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    contador: int

def incrementar(state: State):
    return {"contador": state["contador"] + 1}

def route(state: State) -> Literal["incrementar", END]:
    return "incrementar" if state["contador"] < 3 else END

builder = StateGraph(State)
builder.add_node(incrementar)
builder.add_edge(START, "incrementar")
builder.add_conditional_edges("incrementar", route)
graph = builder.compile()
`,
              validationCode: `from course_harness import check_eq

resultado = graph.invoke({"contador": 0})
check_eq(
    "ciclo_conectado_termina_en_3",
    "El ciclo debe terminar exactamente cuando contador llega a 3",
    resultado["contador"],
    3,
)
`,
            },
          },
        },
        {
          id: "mod05-paso4",
          titulo: "Predicción: cuenta las vueltas del ciclo",
          explicacionMd:
            "Antes del reto de la sección, predice cuántas veces se ejecuta un nodo en un " +
            "ciclo de dos nodos con una condición de parada distinta.",
          accion: {
            kind: "quiz",
            quiz: {
              id: "mod05-paso4-quiz",
              titulo: "¿Cuántas veces se ejecuta el nodo a?",
              preguntas: [
                {
                  id: "mod05-paso4-quiz-p1",
                  kind: "output",
                  enunciadoMd:
                    "Dado el ciclo `a -> route -> (b o END)`, `b -> a`, con condición de " +
                    "parada `route` devuelve `END` cuando `len(aggregate)` ya NO es menor " +
                    "que 4, ¿cuántas veces se ejecuta `a`? (la condición se evalúa siempre " +
                    "justo después de `a`, nunca después de `b`)",
                  codigo:
                    'def a(state):\n    return {"aggregate": state["aggregate"] + ["A"]}\n\n' +
                    'def b(state):\n    return {"aggregate": state["aggregate"] + ["B"]}\n\n' +
                    'def route(state) -> Literal["b", END]:\n    return "b" if len(state["aggregate"]) < 4 else END\n',
                  opciones: ["3 veces", "2 veces", "1 vez", "Infinitas veces"],
                  correcta: 0,
                  explicacionMd:
                    "La condición se revisa justo después de `a`, en las longitudes 1, 3, 5… " +
                    "(nunca después de `b`, porque `b -> a` es un edge fijo sin chequeo). Con " +
                    "`< 4`: en longitud 1 continúa, en longitud 3 continúa, en longitud 5 ya " +
                    "no es menor que 4 y termina. `a` se ejecutó 3 veces (una de más de lo " +
                    "que parece a primera vista, porque el chequeo nunca ocurre en longitudes " +
                    "pares).",
                },
              ],
            },
          },
        },
        {
          id: "mod05-paso5",
          titulo: "Arma un ciclo de dos nodos con condición propia",
          explicacionMd:
            "Practica el patrón completo antes del reto de la sección: dos nodos que se " +
            "alternan (`a`/`b`) y una función de ruta que corta el ciclo cuando `aggregate` " +
            "ya no es menor que 5 elementos (el chequeo ocurre justo después de `a`, como " +
            "en el paso anterior).",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod05-paso5-reto",
              titulo: "Completa b y la condición de parada",
              enunciadoMd:
                "Completa `b` para que añada `\"B\"` a `aggregate`, y `route` para que " +
                'continúe el ciclo (`"b"`) mientras `aggregate` tenga menos de 5 elementos, ' +
                "y termine (`END`) en cuanto ya no sea menor que 5.",
              starterCode: `from typing import Literal
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    aggregate: list

def a(state: State):
    return {"aggregate": state["aggregate"] + ["A"]}

def b(state: State):
    # TODO: devuelve {"aggregate": state["aggregate"] + ["B"]}
    ...

def route(state: State) -> Literal["b", END]:
    # TODO: devuelve "b" si len(state["aggregate"]) < 5, si no END
    ...

builder = StateGraph(State)
builder.add_node(a)
builder.add_node(b)
builder.add_edge(START, "a")
builder.add_conditional_edges("a", route)
builder.add_edge("b", "a")
graph = builder.compile()
`,
              solutionCode: `from typing import Literal
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    aggregate: list

def a(state: State):
    return {"aggregate": state["aggregate"] + ["A"]}

def b(state: State):
    return {"aggregate": state["aggregate"] + ["B"]}

def route(state: State) -> Literal["b", END]:
    return "b" if len(state["aggregate"]) < 5 else END

builder = StateGraph(State)
builder.add_node(a)
builder.add_node(b)
builder.add_edge(START, "a")
builder.add_conditional_edges("a", route)
builder.add_edge("b", "a")
graph = builder.compile()
`,
              validationCode: `from course_harness import check, check_eq

resultado = graph.invoke({"aggregate": []})
check_eq(
    "ciclo_propio_termina_con_5_elementos",
    "El ciclo debe terminar con exactamente 5 elementos en aggregate",
    len(resultado["aggregate"]),
    5,
)
check(
    "ciclo_propio_alterna_a_b",
    "aggregate debe alternar A y B empezando por A",
    resultado["aggregate"][:2] == ["A", "B"],
)
`,
            },
          },
        },
      ],
    },
    refinaSimplifica: {
      resumenBullets: [
        "`add_conditional_edges(nodo, route)` decide dinámicamente el siguiente destino tras `nodo`.",
        "La función de ruta recibe el estado y devuelve el nombre del siguiente nodo, o `END`.",
        "Un ciclo ocurre cuando la función de ruta devuelve el nombre de un nodo ya ejecutado antes.",
        "Todo ciclo necesita una condición de parada Y que el estado avance hacia ella.",
        "Sin condición de parada alcanzable, el grafo agota el límite de recursión (25 por defecto) y falla con error claro.",
        "Edges fijos (`add_edge`) y condicionales (`add_conditional_edges`) se combinan libremente en el mismo grafo.",
        "`Literal[...]` en el tipo de retorno de la función de ruta documenta los destinos posibles.",
      ],
      sintesis: {
        kind: "code",
        reto: {
          id: "mod05-reto-sintesis",
          titulo: "Síntesis: ciclo de dos nodos con historial acumulado",
          enunciadoMd:
            "Combina reducers (módulo 03) con ciclos (este módulo): construye el ciclo " +
            "`a → b → route → (a o END)`, donde `historial` acumula (`operator.add`) " +
            "los pasos ejecutados, y el ciclo termina cuando `historial` tiene 4 o más " +
            "elementos (justo después de que `b` complete el par).",
          starterCode: `import operator
from typing import Annotated, Literal
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    historial: Annotated[list[str], operator.add]

def a(state: State):
    return {"historial": ["A"]}

def b(state: State):
    return {"historial": ["B"]}

def route(state: State) -> Literal["a", END]:
    # TODO — devuelve "a" si len(state["historial"]) < 4, si no devuelve END
    ...

builder = StateGraph(State)
builder.add_node(a)
builder.add_node(b)
builder.add_edge(START, "a")
builder.add_edge("a", "b")
builder.add_conditional_edges("b", route)
graph = builder.compile()
`,
          solutionCode: `import operator
from typing import Annotated, Literal
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    historial: Annotated[list[str], operator.add]

def a(state: State):
    return {"historial": ["A"]}

def b(state: State):
    return {"historial": ["B"]}

def route(state: State) -> Literal["a", END]:
    return "a" if len(state["historial"]) < 4 else END

builder = StateGraph(State)
builder.add_node(a)
builder.add_node(b)
builder.add_edge(START, "a")
builder.add_edge("a", "b")
builder.add_conditional_edges("b", route)
graph = builder.compile()
`,
          validationCode: `from course_harness import check, check_eq

resultado = graph.invoke({"historial": []})
check_eq(
    "ciclo_termina_con_4_elementos",
    "El ciclo debe terminar con exactamente 4 elementos en historial",
    len(resultado["historial"]),
    4,
)
check_eq(
    "ciclo_alterna_a_b",
    "El historial debe alternar A y B empezando por A",
    resultado["historial"][:2],
    ["A", "B"],
)
`,
        },
      },
    },
  },
  usaLaIa: [
    {
      id: "mod05-ia1",
      titulo: "Usa la IA para depurar un ciclo que no termina",
      promptsSugeridos: [
        "Mi grafo con `add_conditional_edges` parece colgarse o lanza un error de límite " +
          "de recursión. Aquí está mi función de ruta y los nodos del ciclo. ¿Qué condición " +
          "de parada me falta o está mal escrita?",
        "Explícame la diferencia entre `add_edge('b', 'a')` (fijo) y " +
          "`add_conditional_edges('a', route)` (condicional) usando mi propio grafo como " +
          "ejemplo: ¿cuál de los dos decide dinámicamente?",
      ],
      comoVerificar: [
        "¿La respuesta usa `add_conditional_edges(nodo, route)` con la función de ruta " +
          "devolviendo un nombre de nodo o `END` — igual que el grounding — o inventa otra " +
          "firma?",
        "¿Al pegar el código sugerido, el mini-ejercicio pasa con el número EXACTO de " +
          "vueltas esperado (no solo 'ya no se cuelga')?",
        "¿La IA explica que la condición de parada debe depender de una clave que el " +
          "propio ciclo actualiza, o sugiere una condición que nunca cambia?",
      ],
      comoIterar:
        "Si el ciclo sigue sin terminar, pega el error de límite de recursión completo y " +
        "pregunta específicamente qué comparación de `route` falla, en vez de pedir el " +
        "ciclo reescrito entero.",
      queNoDelegar: [
        "No le pidas que 'arregle todo el ciclo': completa tú la comparación de `route` " +
          "una vez que entiendas por qué la condición actual no corta el ciclo.",
        "No aceptes una respuesta que use `Send` o fan-out paralelo para 'evitar' el " +
          "ciclo: ese tema no lo cubre este módulo (llega con el executor avanzado).",
      ],
    },
  ],
  tutorialLocal: {
    introMd:
      "Este tramo introduce un ciclo real en el proyecto: el nodo `agradecer` se repite " +
      "varias veces antes de despedirse, controlado por `add_conditional_edges`.",
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
          "`OverallState` gana el campo `vueltas` (sin reducer: se sobrescribe) para " +
          "contar cuántas veces se ha ejecutado el ciclo.",
        codigo: `import operator
from typing import Annotated
from typing_extensions import TypedDict


class InputState(TypedDict):
    nombre: str


class OutputState(TypedDict):
    saludo: str
    historial: list[str]


class OverallState(TypedDict):
    nombre: str
    saludo: str
    historial: Annotated[list[str], operator.add]
    vueltas: int
`,
      },
      {
        archivo: "src/graph.py",
        descripcionMd:
          "`agradecer` ahora se repite en un ciclo (`add_conditional_edges`) hasta " +
          "completar 3 vueltas, y solo entonces el grafo pasa a `despedir`.",
        codigo: `from typing import Literal

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


def despedir(state: OverallState) -> OutputState:
    despedida = "Hasta luego, " + state["nombre"]
    return {"saludo": despedida, "historial": [despedida]}


builder = StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)
builder.add_node("construir_saludo", construir_saludo)
builder.add_node("agradecer", agradecer)
builder.add_node("despedir", despedir)
builder.add_edge(START, "construir_saludo")
builder.add_edge("construir_saludo", "agradecer")
builder.add_conditional_edges("agradecer", route_agradecer)
builder.add_edge("despedir", END)

graph = builder.compile()
`,
      },
    ],
    salidaEsperada:
      "{'saludo': 'Hasta luego, Ana', 'historial': ['Hola, Ana', 'Gracias, Ana', " +
      "'Gracias, Ana', 'Gracias, Ana', 'Hasta luego, Ana']}",
    spine: {
      crea: [],
      modifica: ["src/state.py", "src/graph.py"],
    },
  },
};
