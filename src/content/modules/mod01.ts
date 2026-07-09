import type { CourseModule } from "../types";

/**
 * Módulo 01 — ¿Qué es LangGraph? Grafos vs. cadenas.
 * Contenido completo (slice S1). Código: API del grounding §1 exclusivamente.
 */
export const mod01: CourseModule = {
  id: "mod01",
  numero: 1,
  titulo: "¿Qué es LangGraph? Grafos vs. cadenas",
  objetivo:
    "Explicar cuándo un problema necesita un grafo (ciclos, estado, control) y no una " +
    "cadena lineal; identificar los componentes: state, nodes, edges.",
  // §12 (ADR-15, piloto SE1): formato enriquecido — pasos guiados, "Usa la IA" y
  // tutorial local (project spine, scaffolding).
  enriquecido: true,
  secciones: {
    explicaSimple: {
      contenidoMd: `## Una receta contra un tablero de juego

Imagina dos formas de organizar un proceso:

- Una **receta de cocina**: paso 1, paso 2, paso 3… siempre en el mismo orden, sin vuelta
  atrás. Eso es una **cadena** (chain): A → B → C.
- Un **tablero de juego de mesa** (tipo "oca"): a veces avanzas, a veces retrocedes,
  a veces tiras el dado otra vez porque no cumpliste una condición, y el tablero entero
  (fichas, puntos, turnos) es información compartida que cualquier casilla puede leer o
  modificar. Eso es un **grafo**.

LangGraph existe porque muchos procesos con IA se parecen más al tablero que a la
receta: un agente puede necesitar "pensar otra vez" (ciclo), pedir ayuda a un humano y
esperar (pausa), o decidir un camino distinto según lo que pasó antes (routing). Una
cadena lineal no puede volver sobre sus pasos ni ramificarse con condiciones; un grafo sí.

## Las tres piezas de un grafo

- **State (estado)**: la "hoja de puntuación" compartida. Todos los nodos la leen y
  pueden proponer cambios sobre ella.
- **Nodes (nodos)**: las "casillas" del tablero — funciones normales de Python que
  reciben el estado y devuelven los cambios que quieren aplicar.
- **Edges (aristas)**: las "flechas" que dicen a qué casilla se va después; pueden ser
  fijas o **condicionales** (según el estado, se decide el siguiente nodo — incluyendo
  volver a una casilla ya visitada, es decir, un ciclo).

Cuando tu problema necesita recordar cosas entre pasos, repetir pasos hasta cumplir una
condición, o ramificarse según el resultado anterior, necesitas un grafo. Si solo
necesitas "hacer A, luego B, luego C, siempre igual", una cadena simple basta.`,
      consignaExplicacion:
        "Explícale a alguien que no programa, con tus propias palabras y sin usar la " +
        "palabra 'grafo' más de una vez, cuándo un proceso necesita 'poder volver atrás " +
        "o repetirse' y por qué eso no encaja en una simple lista de pasos.",
    },
    detectaGaps: {
      contenidoMd:
        "Antes de ver código, comprueba si distingues cuándo hace falta un grafo y qué " +
        "papel juega cada pieza (state, nodes, edges).",
      quiz: {
        id: "mod01-quiz1",
        titulo: "¿Grafo o cadena?",
        preguntas: [
          {
            id: "mod01-quiz1-p1",
            kind: "single",
            enunciadoMd:
              "¿Cuál de estos procesos describe MEJOR un caso donde conviene un grafo (y no una simple cadena de pasos)?",
            opciones: [
              "Traducir un texto: recibir texto → llamar al traductor → devolver resultado.",
              "Un agente que redacta una respuesta, la revisa contra unas reglas y, si falla, vuelve a redactar hasta que la revisión pase.",
              "Convertir una fecha de un formato a otro.",
              "Sumar dos números y mostrar el resultado.",
            ],
            correcta: 1,
            explicacionMd:
              "El caso del agente que 'redacta → revisa → si falla, vuelve a redactar' es un ciclo con condición de parada: exactamente lo que una cadena lineal no puede expresar y un grafo sí.",
          },
          {
            id: "mod01-quiz1-p2",
            kind: "boolean",
            enunciadoMd:
              "En LangGraph, el estado (state) es una estructura de datos compartida que cualquier nodo del grafo puede leer y actualizar.",
            correcta: true,
            explicacionMd:
              "Correcto: el estado es la pieza central compartida; cada nodo recibe el estado actual y devuelve los cambios que propone.",
          },
          {
            id: "mod01-quiz1-p3",
            kind: "multi",
            enunciadoMd: "¿Cuáles de las siguientes son piezas fundamentales de un grafo en LangGraph?",
            opciones: ["State", "Nodes", "Edges", "Componentes CSS"],
            correctas: [0, 1, 2],
            explicacionMd:
              "State, Nodes y Edges son las tres piezas fundamentales. Los componentes CSS no tienen relación con LangGraph.",
          },
          {
            id: "mod01-quiz1-p4",
            kind: "output",
            enunciadoMd:
              "Dado este fragmento, ¿qué devuelve `route(state)` si `state['aggregate']` tiene 3 elementos?",
            codigo:
              'def route(state):\n    return "b" if len(state["aggregate"]) < 7 else END\n',
            opciones: ['"b"', "END", '"a"', "Lanza un error"],
            correcta: 0,
            explicacionMd:
              "3 < 7 es verdadero, así que la función de ruta devuelve \"b\": el grafo continúa hacia el nodo 'b'.",
          },
          {
            id: "mod01-quiz1-p5",
            kind: "single",
            enunciadoMd: "¿Qué representan `START` y `END` en un grafo de LangGraph?",
            opciones: [
              "Nodos especiales que marcan el punto de entrada y el punto de salida del grafo.",
              "Funciones que imprimen mensajes de depuración.",
              "Variables de entorno para configurar el modelo.",
              "Un tipo de reducer para el estado.",
            ],
            correcta: 0,
            explicacionMd:
              "START marca por dónde entra la ejecución al grafo y END marca dónde termina; se conectan con `add_edge` como cualquier otro nodo.",
          },
        ],
      },
    },
    llenaGaps: {
      contenidoMd: `## Un grafo con ciclo, en código real

Este es el ejemplo canónico de un grafo con un ciclo controlado por una condición de
parada (API real, sin inventar símbolos):

\`\`\`python
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
\`\`\`

**Cómo leerlo:** \`add_node\` registra funciones normales de Python como nodos (el nombre
del nodo es el nombre de la función, salvo que se indique otro). \`add_edge\` conecta dos
nodos con una flecha fija. \`add_conditional_edges("a", route)\` dice: "tras ejecutar el
nodo 'a', llama a \`route(estado)\` para decidir el siguiente nodo (o terminar en \`END\`)".
El reducer \`operator.add\` sobre \`aggregate\` hace que cada valor devuelto por un nodo se
**añada** a la lista existente en vez de reemplazarla — así el estado "recuerda" el
histórico entre vueltas del ciclo.

**Errores comunes:**
- Olvidar que sin \`Annotated[..., operator.add]\` el segundo nodo que escriba \`aggregate\`
  **sobrescribiría** el valor anterior en vez de acumularlo.
- Confundir la función de ruta con un nodo: \`route\` no aparece en \`add_node\`, solo decide
  a dónde ir.
- No definir una condición de parada: un ciclo sin salida hacia \`END\` recorre el límite
  de recursión (por defecto 25) y falla con un error claro.`,
      retos: [
        {
          id: "mod01-reto1",
          titulo: "Completa la condición de parada del ciclo",
          enunciadoMd:
            "Completa la función `route` para que el ciclo `a → b → a → …` continúe " +
            "mientras `aggregate` tenga menos de 7 elementos, y termine (`END`) cuando " +
            "llegue a 7 o más — igual que el ejemplo de la sección anterior.",
          starterCode: `import operator
from typing import Annotated, Literal
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    aggregate: Annotated[list, operator.add]

def a(state: State):
    return {"aggregate": ["A"]}

def b(state: State):
    return {"aggregate": ["B"]}

def route(state: State) -> Literal["b", END]:
    # TODO: devuelve "b" si len(state["aggregate"]) < 7, si no devuelve END
    ...

builder = StateGraph(State)
builder.add_node(a)
builder.add_node(b)
builder.add_edge(START, "a")
builder.add_conditional_edges("a", route)
builder.add_edge("b", "a")
graph = builder.compile()
`,
          solutionCode: `import operator
from typing import Annotated, Literal
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    aggregate: Annotated[list, operator.add]

def a(state: State):
    return {"aggregate": ["A"]}

def b(state: State):
    return {"aggregate": ["B"]}

def route(state: State) -> Literal["b", END]:
    return "b" if len(state["aggregate"]) < 7 else END

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
    "ciclo_termina_en_longitud_7",
    "Tras completar el ciclo, 'aggregate' debe tener exactamente 7 elementos",
    len(resultado["aggregate"]),
    7,
)
check(
    "ciclo_alterna_a_b",
    "El ciclo debe alternar los nodos 'a' y 'b': los dos primeros elementos son 'A' y 'B'",
    resultado["aggregate"][:2] == ["A", "B"],
)
`,
        },
      ],
      pasos: [
        {
          id: "mod01-paso1",
          titulo: "Un nodo es solo una función",
          explicacionMd:
            "Antes de armar un grafo completo, mira un nodo aislado: es una función normal " +
            "de Python que recibe el estado y devuelve los cambios que propone, sin heredar " +
            "de ninguna clase ni importar nada de LangGraph todavía. Completa `saludar` para " +
            "que devuelva el cambio de estado indicado.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod01-paso1-reto",
              titulo: "Completa tu primer nodo",
              enunciadoMd:
                'Completa la función `saludar(state)` para que devuelva `{"mensaje": "hola"}` ' +
                "(todavía sin `StateGraph`).",
              starterCode: `def saludar(state):
    # TODO: devuelve {"mensaje": "hola"}
    ...
`,
              solutionCode: `def saludar(state):
    return {"mensaje": "hola"}
`,
              validationCode: `from course_harness import check_eq

resultado = saludar({})
check_eq(
    "nodo_devuelve_mensaje_hola",
    "saludar(state) debe devolver {'mensaje': 'hola'}",
    resultado,
    {"mensaje": "hola"},
)
`,
            },
          },
        },
        {
          id: "mod01-paso2",
          titulo: "Cómo se registra un nodo en un grafo",
          explicacionMd:
            "Un nodo aislado no hace nada hasta que lo registras. `StateGraph(State)` crea el " +
            "constructor del grafo; `add_node` añade la función como nodo (con el nombre de " +
            "la función, salvo que le des otro); `add_edge` traza flechas fijas entre nodos, " +
            "incluyendo desde `START` y hacia `END`. Lee el fragmento antes de tocar código.",
          accion: {
            kind: "lectura",
            bloqueMd: `\`\`\`python
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    mensaje: str

def saludar(state: State):
    return {"mensaje": "hola"}

builder = StateGraph(State)
builder.add_node(saludar)
builder.add_edge(START, "saludar")
builder.add_edge("saludar", END)
graph = builder.compile()
\`\`\`
Este fragmento ya está completo: solo léelo, no hace falta ejecutarlo ni completar nada todavía.`,
          },
        },
        {
          id: "mod01-paso3",
          titulo: "Construye tu primer grafo mínimo",
          explicacionMd:
            "Ahora te toca a ti: registra el nodo `saludar` en un `StateGraph` y conéctalo " +
            "entre `START` y `END`. Con un solo nodo ya tienes un grafo ejecutable de verdad " +
            "— el mismo patrón que usarás para grafos mucho más grandes.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod01-paso3-reto",
              titulo: "Conecta el nodo entre START y END",
              enunciadoMd:
                "Completa el cuerpo de `saludar` y la conexión que falta para que el grafo " +
                "tenga exactamente un camino: START → saludar → END.",
              starterCode: `from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    mensaje: str

def saludar(state: State):
    # TODO: devuelve {"mensaje": "hola"}
    ...

builder = StateGraph(State)
builder.add_node(saludar)
builder.add_edge(START, "saludar")
# TODO: conecta "saludar" con END
graph = builder.compile()
`,
              solutionCode: `from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    mensaje: str

def saludar(state: State):
    return {"mensaje": "hola"}

builder = StateGraph(State)
builder.add_node(saludar)
builder.add_edge(START, "saludar")
builder.add_edge("saludar", END)
graph = builder.compile()
`,
              validationCode: `from course_harness import check_eq

resultado = graph.invoke({"mensaje": ""})
check_eq(
    "grafo_minimo_invoca_saludar",
    "invoke() debe devolver {'mensaje': 'hola'} tras pasar por el nodo saludar",
    resultado,
    {"mensaje": "hola"},
)
`,
            },
          },
        },
        {
          id: "mod01-paso4",
          titulo: "Predicción: ¿qué pasa sin condición de parada?",
          explicacionMd:
            "Un ciclo (`add_conditional_edges` que vuelve a un nodo anterior) necesita una " +
            "condición que en algún momento devuelva `END`. Si esa condición nunca se cumple, " +
            "el grafo no se cuelga para siempre: LangGraph tiene un límite de recursión (25 " +
            "por defecto) y lanza un error claro. Antes de programar, predice qué pasaría.",
          accion: {
            kind: "quiz",
            quiz: {
              id: "mod01-paso4-quiz",
              titulo: "¿Qué pasa sin condición de parada?",
              preguntas: [
                {
                  id: "mod01-paso4-quiz-p1",
                  kind: "boolean",
                  enunciadoMd:
                    "Un ciclo cuya función de ruta NUNCA devuelve `END` provoca un error de " +
                    "límite de recursión en vez de colgar el proceso para siempre.",
                  correcta: true,
                  explicacionMd:
                    "Correcto: LangGraph limita la recursión (25 por defecto) y lanza un " +
                    "error claro en vez de ejecutar un ciclo infinito silencioso.",
                },
                {
                  id: "mod01-paso4-quiz-p2",
                  kind: "single",
                  enunciadoMd: "¿Qué parte del grafo decide si el ciclo continúa o termina?",
                  opciones: [
                    "La función pasada a `add_conditional_edges`",
                    "El nombre del nodo",
                    "El orden de `add_node`",
                    "El tipo de `State`",
                  ],
                  correcta: 0,
                  explicacionMd:
                    "La función de ruta (la que se pasa a `add_conditional_edges`) es la que " +
                    "decide, en cada vuelta, si el grafo continúa hacia otro nodo o termina " +
                    "en `END`.",
                },
              ],
            },
          },
        },
        {
          id: "mod01-paso5",
          titulo: "Practica un ciclo con condición de parada (versión corta)",
          explicacionMd:
            "Practica un ciclo más corto antes del reto completo de la sección: dos nodos " +
            "que se alternan y una condición que corta el ciclo apenas la lista acumulada " +
            "llega a 5 elementos.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod01-paso5-reto",
              titulo: "Ciclo corto: corta en 5 elementos",
              enunciadoMd:
                "Completa `paso_a`, `paso_b` y `route` para que el ciclo " +
                "`paso_a → paso_b → paso_a → …` continúe mientras `aggregate` tenga menos de " +
                "5 elementos, y termine (`END`) al llegar a 5.",
              starterCode: `import operator
from typing import Annotated, Literal
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    aggregate: Annotated[list, operator.add]

def paso_a(state: State):
    # TODO: devuelve {"aggregate": ["A"]}
    ...

def paso_b(state: State):
    # TODO: devuelve {"aggregate": ["B"]}
    ...

def route(state: State) -> Literal["paso_b", END]:
    # TODO: devuelve "paso_b" si len(state["aggregate"]) < 5, si no END
    ...

builder = StateGraph(State)
builder.add_node(paso_a)
builder.add_node(paso_b)
builder.add_edge(START, "paso_a")
builder.add_conditional_edges("paso_a", route)
builder.add_edge("paso_b", "paso_a")
graph = builder.compile()
`,
              solutionCode: `import operator
from typing import Annotated, Literal
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    aggregate: Annotated[list, operator.add]

def paso_a(state: State):
    return {"aggregate": ["A"]}

def paso_b(state: State):
    return {"aggregate": ["B"]}

def route(state: State) -> Literal["paso_b", END]:
    return "paso_b" if len(state["aggregate"]) < 5 else END

builder = StateGraph(State)
builder.add_node(paso_a)
builder.add_node(paso_b)
builder.add_edge(START, "paso_a")
builder.add_conditional_edges("paso_a", route)
builder.add_edge("paso_b", "paso_a")
graph = builder.compile()
`,
              validationCode: `from course_harness import check, check_eq

resultado = graph.invoke({"aggregate": []})
check_eq(
    "ciclo_corto_termina_en_longitud_5",
    "Tras completar el ciclo, 'aggregate' debe tener exactamente 5 elementos",
    len(resultado["aggregate"]),
    5,
)
check(
    "ciclo_corto_alterna_a_b",
    "El ciclo debe alternar los nodos 'paso_a' y 'paso_b': los dos primeros elementos son 'A' y 'B'",
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
        "Una cadena ejecuta pasos fijos en orden; un grafo permite ciclos, ramificación y estado compartido.",
        "State: la estructura de datos que todos los nodos leen y pueden actualizar.",
        "Nodes: funciones de Python normales que reciben el estado y devuelven cambios.",
        "Edges: conexiones fijas (`add_edge`) o condicionales (`add_conditional_edges`) entre nodos.",
        "START y END marcan la entrada y la salida del grafo.",
        "Los reducers (p. ej. `operator.add`) controlan cómo se combinan las actualizaciones al estado.",
        "Un ciclo sin condición de parada agota el límite de recursión (25 por defecto) y falla con error claro.",
      ],
      sintesis: {
        kind: "quiz",
        quiz: {
          id: "mod01-quiz-sintesis",
          titulo: "Síntesis: grafos vs. cadenas",
          preguntas: [
            {
              id: "mod01-quiz-sintesis-p1",
              kind: "single",
              enunciadoMd:
                "Un chatbot que, tras responder, siempre debe revisar su propia respuesta y corregirla hasta que pase un chequeo de calidad, ¿qué patrón necesita?",
              opciones: ["Una cadena lineal simple", "Un ciclo con condición de parada", "Ningún estado compartido", "Solo funciones puras sin grafo"],
              correcta: 1,
              explicacionMd:
                "Necesita repetir el paso de 'responder + revisar' hasta cumplir una condición: eso es un ciclo con `add_conditional_edges`.",
            },
            {
              id: "mod01-quiz-sintesis-p2",
              kind: "boolean",
              enunciadoMd: "`add_conditional_edges` puede hacer que el flujo vuelva a un nodo ya ejecutado antes.",
              correcta: true,
              explicacionMd: "Sí: la función de ruta puede devolver el nombre de cualquier nodo, incluyendo uno ya visitado, formando un ciclo.",
            },
            {
              id: "mod01-quiz-sintesis-p3",
              kind: "multi",
              enunciadoMd: "¿Cuáles de estas afirmaciones sobre el estado (state) son correctas?",
              opciones: [
                "Es compartido entre todos los nodos del grafo.",
                "Cada nodo debe declarar el tipo completo del estado global, siempre.",
                "Los reducers determinan cómo se combinan las actualizaciones concurrentes o repetidas.",
                "El estado nunca puede ser una lista.",
              ],
              correctas: [0, 2],
              explicacionMd:
                "El estado es compartido y los reducers controlan la fusión de actualizaciones; los nodos pueden tipar solo la porción del estado que usan, y sí puede contener listas.",
            },
          ],
        },
      },
    },
  },
  usaLaIa: [
    {
      id: "mod01-ia1",
      titulo: "Usa la IA para entender la sintaxis de un nodo",
      promptsSugeridos: [
        "Tengo esta función de Python que uso como nodo de LangGraph: `def saludar(state): ...`. " +
          "Explícame línea por línea qué es `state` aquí y por qué la función devuelve un " +
          "diccionario en vez de modificar `state` directamente.",
        "Estoy completando un TODO en un ejercicio de LangGraph sobre `add_conditional_edges`. " +
          "Aquí está mi código con el TODO sin resolver. Sin darme la solución completa, dame " +
          "una pista sobre qué debería comparar la función `route`.",
      ],
      comoVerificar: [
        "¿La respuesta usa exactamente `StateGraph`, `add_node`, `add_edge`, " +
          "`add_conditional_edges` — los mismos símbolos del grounding — o inventa otra API?",
        "¿Al pegar el código sugerido en el editor, pasa la validación (`check`/`check_eq`) del " +
          "mini-ejercicio?",
        "¿La explicación coincide con lo que dice la sección 'Cómo leerlo' del módulo, o " +
          "contradice algo?",
      ],
      comoIterar:
        "Si el código no pasa la validación, pega el mensaje de error EXACTO del check que " +
        "falló (por ejemplo 'ciclo_corto_termina_en_longitud_5') y pregunta a la IA qué " +
        "condición del `route` produce ese resultado incorrecto, en vez de pedir 'la solución " +
        "completa'.",
      queNoDelegar: [
        "No le pidas a la IA que 'resuelva todo el reto': escribe tú la línea del TODO una vez " +
          "que entiendas la pista, para que la sintaxis de Python (dict, comparaciones, " +
          "`Literal`) quede en tu memoria.",
        "No copies una respuesta que use símbolos que no reconoces del grounding (por ejemplo " +
          "`Send` o `checkpointer`): este módulo aún no los cubre.",
      ],
    },
  ],
  tutorialLocal: {
    introMd:
      "Este es el arranque del proyecto que crecerá módulo a módulo (project spine): un " +
      "grafo de un solo nodo, ejecutado con LangGraph REAL en tu máquina.",
    setup: [
      {
        titulo: "1. Crea la carpeta del proyecto y el entorno virtual",
        descripcionMd: "Python 3.11+ (grounding oficial de instalación).",
        powershell:
          "mkdir mi-proyecto-langgraph\ncd mi-proyecto-langgraph\npython -m venv .venv\n" +
          ".venv\\Scripts\\Activate.ps1",
        bash:
          "mkdir mi-proyecto-langgraph && cd mi-proyecto-langgraph && python -m venv .venv && " +
          "source .venv/bin/activate",
      },
      {
        titulo: "2. Instala las dependencias",
        descripcionMd: "Con el entorno activado, instala desde `requirements.txt` (más abajo).",
        powershell: "pip install -r requirements.txt",
        bash: "pip install -r requirements.txt",
      },
      {
        titulo: "3. Ejecuta el grafo",
        descripcionMd: "",
        powershell: "python src\\main.py",
        bash: "python src/main.py",
      },
    ],
    codigo: [
      {
        archivo: "requirements.txt",
        descripcionMd:
          "Dependencia mínima del proyecto: solo `langgraph`. mod01–03 no usan LLM " +
          "todavía, así que `langchain`/`langchain-ollama` se añaden recién en el " +
          "módulo que primero los necesite (estrictamente incremental).",
        codigo: "langgraph\n",
      },
      {
        archivo: "src/state.py",
        descripcionMd: "El esquema del estado: un único campo `mensaje`.",
        codigo: `from typing_extensions import TypedDict


class State(TypedDict):
    mensaje: str
`,
      },
      {
        archivo: "src/graph.py",
        descripcionMd: "Un solo nodo entre START y END — el mismo patrón del reto guiado.",
        codigo: `from langgraph.graph import START, END, StateGraph

from state import State


def saludar(state: State):
    return {"mensaje": "hola"}


builder = StateGraph(State)
builder.add_node(saludar)
builder.add_edge(START, "saludar")
builder.add_edge("saludar", END)

graph = builder.compile()
`,
      },
      {
        archivo: "src/main.py",
        descripcionMd: "Invoca el grafo y muestra el resultado.",
        codigo: `from graph import graph


if __name__ == "__main__":
    resultado = graph.invoke({"mensaje": ""})
    print(resultado)
`,
      },
    ],
    salidaEsperada: "{'mensaje': 'hola'}",
    spine: {
      crea: ["requirements.txt", "src/state.py", "src/graph.py", "src/main.py"],
      modifica: [],
      scaffolding: true,
    },
  },
};
