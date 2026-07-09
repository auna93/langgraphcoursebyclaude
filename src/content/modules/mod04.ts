import type { CourseModule } from "../types";

/**
 * Módulo 04 — Nodes y edges: construir el primer grafo.
 * Contenido completo (slice S13). Código: API del grounding §1 exclusivamente
 * (StateGraph, add_node, add_edge, START/END, compile/invoke — sin ciclos ni
 * conditional edges, que llegan en el módulo 05).
 * §12 (ADR-15, SE2): formato enriquecido — pasos guiados, "Usa la IA" y
 * tutorial local (continúa el project spine desde mod03). Solo shim core.
 */
export const mod04: CourseModule = {
  id: "mod04",
  numero: 4,
  titulo: "Nodes y edges: construir el primer grafo",
  objetivo:
    "Construir con StateGraph, add_node, add_edge, START/END; compile() e invoke() un " +
    "grafo lineal.",
  enriquecido: true,
  secciones: {
    explicaSimple: {
      contenidoMd: `## Planos de una fábrica

Piensa en un grafo de LangGraph como los **planos de una pequeña fábrica**:

- Cada **estación de trabajo** es un **nodo**: recibe una pieza (el estado), hace algo
  con ella (una función normal de Python) y la deja lista para la siguiente estación.
- Las **cintas transportadoras** entre estaciones son los **edges** (aristas): dicen a
  qué estación va la pieza después de pasar por la anterior.
- El plano tiene un **punto de entrada** (dónde llega la materia prima) y un **punto de
  salida** (dónde sale el producto terminado). En LangGraph esos puntos se llaman
  \`START\` y \`END\`.

Construir un grafo lineal es literalmente: "coloca estas estaciones, conéctalas con
cintas en este orden, desde la entrada hasta la salida". No hace falta nada más
sofisticado que eso para tu primer grafo funcional.

## De los planos a la fábrica en marcha

Dibujar los planos (\`StateGraph\`, \`add_node\`, \`add_edge\`) no pone la fábrica a
funcionar todavía: hay un paso de **construir** la fábrica de verdad a partir del plano
(\`compile()\`), y solo entonces puedes **meter una pieza por la entrada y ver qué sale
por la salida** (\`invoke()\`).`,
      consignaExplicacion:
        "Explícale a alguien que no programa, usando la metáfora de la fábrica con " +
        "estaciones y cintas transportadoras, qué hace falta para que un grafo 'funcione' " +
        "de verdad (planos vs. fábrica construida vs. fábrica en marcha).",
    },
    detectaGaps: {
      contenidoMd:
        "Comprueba si distingues bien las piezas que hacen falta para construir y " +
        "ejecutar un grafo lineal: `add_node`, `add_edge`, `compile`, `invoke`.",
      quiz: {
        id: "mod04-quiz1",
        titulo: "Construir el primer grafo",
        preguntas: [
          {
            id: "mod04-quiz1-p1",
            kind: "single",
            enunciadoMd: "¿Qué hace `builder.add_node(mi_funcion)` sin pasar un nombre explícito?",
            opciones: [
              "Registra `mi_funcion` como nodo, usando `mi_funcion.__name__` como nombre del nodo.",
              "Ejecuta `mi_funcion` inmediatamente.",
              "Conecta `mi_funcion` con `START` automáticamente.",
              "Falla porque siempre hace falta pasar un nombre.",
            ],
            correcta: 0,
            explicacionMd:
              "Si no se pasa un nombre explícito, LangGraph usa el nombre de la función " +
              "(`__name__`) como identificador del nodo dentro del grafo.",
          },
          {
            id: "mod04-quiz1-p2",
            kind: "boolean",
            enunciadoMd:
              "Un `StateGraph` debe compilarse con `.compile()` antes de poder llamar a `.invoke()`.",
            correcta: true,
            explicacionMd:
              "Correcto: `add_node`/`add_edge` solo construyen la definición del grafo; " +
              "`compile()` produce el objeto ejecutable que expone `invoke()`/`stream()`.",
          },
          {
            id: "mod04-quiz1-p3",
            kind: "multi",
            enunciadoMd: "¿Qué conecta `add_edge(START, 'nodo_1')`?",
            opciones: [
              "El punto de entrada del grafo con el nodo 'nodo_1'.",
              "Dos nodos internos cualesquiera del grafo.",
              "Marca 'nodo_1' como el primer nodo que se ejecuta al invocar el grafo.",
              "Nada: `START` no se usa con `add_edge`.",
            ],
            correctas: [0, 2],
            explicacionMd:
              "`add_edge(START, 'nodo_1')` conecta el punto de entrada especial `START` con " +
              "'nodo_1', lo que efectivamente lo convierte en el primer nodo que se ejecuta.",
          },
          {
            id: "mod04-quiz1-p4",
            kind: "output",
            enunciadoMd:
              "Dado este grafo lineal `START -> doblar -> sumar_uno -> END`, ¿qué devuelve " +
              "`graph.invoke({'n': 3})`?",
            codigo:
              'def doblar(state):\n    return {"n": state["n"] * 2}\n\ndef sumar_uno(state):\n    return {"n": state["n"] + 1}\n',
            opciones: ["`{'n': 7}`", "`{'n': 8}`", "`{'n': 6}`", "`{'n': 4}`"],
            correcta: 0,
            explicacionMd:
              "`doblar` convierte 3 en 6 (`3 * 2`), y luego `sumar_uno` convierte 6 en 7 " +
              "(`6 + 1`): el resultado final es `{'n': 7}`.",
          },
          {
            id: "mod04-quiz1-p5",
            kind: "single",
            enunciadoMd: "¿Qué ocurre si un nodo del grafo NO tiene un `add_edge` saliente hacia otro nodo ni hacia `END`?",
            opciones: [
              "El grafo no puede terminar de forma predecible: falta definir a dónde va la ejecución tras ese nodo.",
              "LangGraph asume automáticamente que va a `END`.",
              "El nodo se ejecuta en un bucle infinito por diseño.",
              "No importa, `compile()` lo arregla solo.",
            ],
            correcta: 0,
            explicacionMd:
              "Cada nodo necesita un camino explícito hacia el siguiente nodo o hacia `END`; " +
              "LangGraph no asume un destino por defecto.",
          },
        ],
      },
    },
    llenaGaps: {
      contenidoMd: `## Un grafo lineal, en código real

\`\`\`python
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    n: int

def doblar(state: State):
    return {"n": state["n"] * 2}

def sumar_uno(state: State):
    return {"n": state["n"] + 1}

builder = StateGraph(State)
builder.add_node(doblar)
builder.add_node(sumar_uno)
builder.add_edge(START, "doblar")
builder.add_edge("doblar", "sumar_uno")
builder.add_edge("sumar_uno", END)

graph = builder.compile()
graph.invoke({"n": 3})  # {'n': 7}
\`\`\`

**Cómo leerlo:** \`StateGraph(State)\` crea el "plano" con la plantilla de estado.
\`add_node(doblar)\` registra la función como el nodo \`"doblar"\` (nombre implícito).
\`add_edge(START, "doblar")\` dice "empieza aquí"; \`add_edge("doblar", "sumar_uno")\` conecta
las dos estaciones en orden; \`add_edge("sumar_uno", END)\` marca el final. \`compile()\`
construye el objeto ejecutable; \`invoke(...)\` mete la pieza inicial por la entrada y
devuelve el estado final tras pasar por todos los nodos.

**Errores comunes:**
- Llamar a \`invoke()\` sobre el \`builder\` en vez de sobre el resultado de \`compile()\`:
  el builder no es ejecutable, solo el grafo compilado.
- Olvidar el \`add_edge(..., END)\` final: el grafo queda sin un camino claro de salida.
- Registrar un nodo con \`add_node("otro_nombre", doblar)\` y luego intentar conectarlo
  usando \`"doblar"\` en \`add_edge\`: el nombre del nodo es el que se declaró explícitamente,
  no el nombre de la función, cuando se pasan ambos argumentos.
- Confundir el orden de los argumentos de \`add_edge(origen, destino)\`: la cinta
  transportadora va DE origen A destino.`,
      retos: [
        {
          id: "mod04-reto1",
          titulo: "Completa el grafo lineal de tres nodos",
          enunciadoMd:
            "Completa `restar_dos` para que reste 2 al valor de `n`, y conecta los tres " +
            "nodos (`doblar` → `restar_dos` → `sumar_diez`) en ese orden entre `START` y " +
            "`END` usando `add_edge`.",
          starterCode: `from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    n: int

def doblar(state: State):
    return {"n": state["n"] * 2}

def restar_dos(state: State):
    # TODO — devuelve {"n": state["n"] - 2}
    ...

def sumar_diez(state: State):
    return {"n": state["n"] + 10}

builder = StateGraph(State)
builder.add_node(doblar)
builder.add_node(restar_dos)
builder.add_node(sumar_diez)
# TODO — conecta START -> doblar -> restar_dos -> sumar_diez -> END

graph = builder.compile()
`,
          solutionCode: `from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    n: int

def doblar(state: State):
    return {"n": state["n"] * 2}

def restar_dos(state: State):
    return {"n": state["n"] - 2}

def sumar_diez(state: State):
    return {"n": state["n"] + 10}

builder = StateGraph(State)
builder.add_node(doblar)
builder.add_node(restar_dos)
builder.add_node(sumar_diez)
builder.add_edge(START, "doblar")
builder.add_edge("doblar", "restar_dos")
builder.add_edge("restar_dos", "sumar_diez")
builder.add_edge("sumar_diez", END)

graph = builder.compile()
`,
          validationCode: `from course_harness import check_eq

resultado = graph.invoke({"n": 3})
# doblar: 3*2=6 ; restar_dos: 6-2=4 ; sumar_diez: 4+10=14
check_eq(
    "grafo_lineal_encadena_los_tres_nodos",
    "invoke({'n': 3}) debe pasar por doblar, restar_dos y sumar_diez en orden (resultado 14)",
    resultado["n"],
    14,
)

resultado_2 = graph.invoke({"n": 0})
check_eq(
    "grafo_lineal_funciona_con_otro_valor",
    "invoke({'n': 0}) debe dar (0*2)-2+10 = 8",
    resultado_2["n"],
    8,
)
`,
        },
      ],
      pasos: [
        {
          id: "mod04-paso1",
          titulo: "Un nodo aislado, otra vez",
          explicacionMd:
            "Como en el módulo 01, empieza por una función suelta: un nodo no necesita " +
            "`StateGraph` para existir, solo recibe el estado y devuelve los cambios que " +
            "propone. Completa `triplicar` antes de armar el grafo.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod04-paso1-reto",
              titulo: "Completa el nodo triplicar",
              enunciadoMd:
                'Completa `triplicar(state)` para que devuelva `{"n": state["n"] * 3}` ' +
                "(todavía sin `StateGraph`).",
              starterCode: `def triplicar(state):
    # TODO: devuelve {"n": state["n"] * 3}
    ...
`,
              solutionCode: `def triplicar(state):
    return {"n": state["n"] * 3}
`,
              validationCode: `from course_harness import check_eq

resultado = triplicar({"n": 4})
check_eq(
    "triplicar_multiplica_por_tres",
    "triplicar({'n': 4}) debe devolver {'n': 12}",
    resultado,
    {"n": 12},
)
`,
            },
          },
        },
        {
          id: "mod04-paso2",
          titulo: "Encadenar dos nodos con add_edge",
          explicacionMd:
            "`add_node` registra la función; `add_edge(origen, destino)` traza la cinta " +
            "transportadora entre dos estaciones, en ese orden. Lee el fragmento antes de " +
            "tocar código: ya conecta dos nodos entre `START` y `END`.",
          accion: {
            kind: "lectura",
            bloqueMd: `\`\`\`python
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    n: int

def duplicar(state: State):
    return {"n": state["n"] * 2}

def sumar_uno(state: State):
    return {"n": state["n"] + 1}

builder = StateGraph(State)
builder.add_node(duplicar)
builder.add_node(sumar_uno)
builder.add_edge(START, "duplicar")
builder.add_edge("duplicar", "sumar_uno")
builder.add_edge("sumar_uno", END)
graph = builder.compile()
\`\`\`
Este fragmento ya está completo: solo léelo, no hace falta ejecutarlo ni completar nada todavía.`,
          },
        },
        {
          id: "mod04-paso3",
          titulo: "Conecta el último tramo de cinta",
          explicacionMd:
            "Ambos nodos ya están completos; solo falta una conexión: la cinta que lleva " +
            "de `restar_uno` hacia la salida del grafo (`END`).",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod04-paso3-reto",
              titulo: "Conecta restar_uno con END",
              enunciadoMd: 'Añade el `add_edge` que falta para conectar `"restar_uno"` con `END`.',
              starterCode: `from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    n: int

def duplicar(state: State):
    return {"n": state["n"] * 2}

def restar_uno(state: State):
    return {"n": state["n"] - 1}

builder = StateGraph(State)
builder.add_node(duplicar)
builder.add_node(restar_uno)
builder.add_edge(START, "duplicar")
builder.add_edge("duplicar", "restar_uno")
# TODO: conecta "restar_uno" con END
graph = builder.compile()
`,
              solutionCode: `from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    n: int

def duplicar(state: State):
    return {"n": state["n"] * 2}

def restar_uno(state: State):
    return {"n": state["n"] - 1}

builder = StateGraph(State)
builder.add_node(duplicar)
builder.add_node(restar_uno)
builder.add_edge(START, "duplicar")
builder.add_edge("duplicar", "restar_uno")
builder.add_edge("restar_uno", END)
graph = builder.compile()
`,
              validationCode: `from course_harness import check_eq

resultado = graph.invoke({"n": 5})
check_eq(
    "cadena_de_dos_nodos_conectada",
    "invoke({'n': 5}) debe pasar por duplicar y restar_uno: (5*2)-1 = 9",
    resultado["n"],
    9,
)
`,
            },
          },
        },
        {
          id: "mod04-paso4",
          titulo: "Predicción: sigue la pieza por la fábrica",
          explicacionMd:
            "Antes del reto de la sección, predice el resultado de una cadena de tres " +
            "nodos leyendo únicamente el código, sin ejecutarlo.",
          accion: {
            kind: "quiz",
            quiz: {
              id: "mod04-paso4-quiz",
              titulo: "¿Qué devuelve la cadena de tres nodos?",
              preguntas: [
                {
                  id: "mod04-paso4-quiz-p1",
                  kind: "output",
                  enunciadoMd:
                    "Dada esta cadena `START -> doblar -> restar_tres -> sumar_dos -> END`, " +
                    "¿qué devuelve `graph.invoke({'n': 4})`?",
                  codigo:
                    'def doblar(state):\n    return {"n": state["n"] * 2}\n\n' +
                    'def restar_tres(state):\n    return {"n": state["n"] - 3}\n\n' +
                    'def sumar_dos(state):\n    return {"n": state["n"] + 2}\n',
                  opciones: ["`{'n': 7}`", "`{'n': 9}`", "`{'n': 6}`", "`{'n': 3}`"],
                  correcta: 0,
                  explicacionMd:
                    "doblar: 4*2=8; restar_tres: 8-3=5; sumar_dos: 5+2=7. El resultado final " +
                    "es `{'n': 7}`.",
                },
              ],
            },
          },
        },
        {
          id: "mod04-paso5",
          titulo: "Arma tú la cadena completa de tres nodos",
          explicacionMd:
            "Practica una cadena de tres nodos completa antes del reto de la sección: " +
            "completa el último nodo y la conexión final hacia `END`.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod04-paso5-reto",
              titulo: "Completa el nodo y la conexión final",
              enunciadoMd:
                "Completa `sumar_cinco` para que sume 5 a `n`, y conecta `sumar_cinco` con " +
                "`END` para cerrar la cadena `doblar -> restar_dos -> sumar_cinco`.",
              starterCode: `from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    n: int

def doblar(state: State):
    return {"n": state["n"] * 2}

def restar_dos(state: State):
    return {"n": state["n"] - 2}

def sumar_cinco(state: State):
    # TODO: devuelve {"n": state["n"] + 5}
    ...

builder = StateGraph(State)
builder.add_node(doblar)
builder.add_node(restar_dos)
builder.add_node(sumar_cinco)
builder.add_edge(START, "doblar")
builder.add_edge("doblar", "restar_dos")
builder.add_edge("restar_dos", "sumar_cinco")
# TODO: conecta "sumar_cinco" con END
graph = builder.compile()
`,
              solutionCode: `from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    n: int

def doblar(state: State):
    return {"n": state["n"] * 2}

def restar_dos(state: State):
    return {"n": state["n"] - 2}

def sumar_cinco(state: State):
    return {"n": state["n"] + 5}

builder = StateGraph(State)
builder.add_node(doblar)
builder.add_node(restar_dos)
builder.add_node(sumar_cinco)
builder.add_edge(START, "doblar")
builder.add_edge("doblar", "restar_dos")
builder.add_edge("restar_dos", "sumar_cinco")
builder.add_edge("sumar_cinco", END)
graph = builder.compile()
`,
              validationCode: `from course_harness import check_eq

resultado = graph.invoke({"n": 3})
check_eq(
    "cadena_de_tres_nodos_completa",
    "invoke({'n': 3}) debe dar ((3*2)-2)+5 = 9",
    resultado["n"],
    9,
)
`,
            },
          },
        },
      ],
    },
    refinaSimplifica: {
      resumenBullets: [
        "`StateGraph(State)` crea el constructor del grafo a partir de la plantilla de estado.",
        "`add_node(fn)` registra una función como nodo; sin nombre explícito, usa `fn.__name__`.",
        "`add_edge(origen, destino)` conecta dos nodos con una flecha fija, en ese orden.",
        "`START` y `END` son los puntos especiales de entrada y salida del grafo.",
        "`compile()` convierte la definición en un grafo ejecutable; `invoke()` lo corre de principio a fin.",
        "Cada nodo necesita un camino explícito hacia el siguiente nodo o hacia `END`.",
        "Reducers (módulo 03) y grafos lineales (este módulo) se combinan libremente en el mismo `StateGraph`.",
      ],
      sintesis: {
        kind: "code",
        reto: {
          id: "mod04-reto-sintesis",
          titulo: "Síntesis: grafo lineal con reducer de historial",
          enunciadoMd:
            "Combina lo del módulo 03 (reducers) con lo de este módulo: construye un grafo " +
            "lineal de dos nodos (`registrar_inicio` → `registrar_fin`) donde `historial` " +
            "usa `Annotated[list[str], operator.add]` para acumular los nombres de los " +
            "pasos ejecutados, en orden.",
          starterCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    historial: Annotated[list[str], operator.add]

def registrar_inicio(state: State):
    return {"historial": ["inicio"]}

def registrar_fin(state: State):
    # TODO — devuelve {"historial": ["fin"]}
    ...

builder = StateGraph(State)
builder.add_node(registrar_inicio)
builder.add_node(registrar_fin)
# TODO — conecta START -> registrar_inicio -> registrar_fin -> END

graph = builder.compile()
`,
          solutionCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    historial: Annotated[list[str], operator.add]

def registrar_inicio(state: State):
    return {"historial": ["inicio"]}

def registrar_fin(state: State):
    return {"historial": ["fin"]}

builder = StateGraph(State)
builder.add_node(registrar_inicio)
builder.add_node(registrar_fin)
builder.add_edge(START, "registrar_inicio")
builder.add_edge("registrar_inicio", "registrar_fin")
builder.add_edge("registrar_fin", END)

graph = builder.compile()
`,
          validationCode: `from course_harness import check_eq

resultado = graph.invoke({"historial": []})
check_eq(
    "grafo_lineal_acumula_historial_en_orden",
    "El historial debe acumular 'inicio' y luego 'fin', en ese orden",
    resultado["historial"],
    ["inicio", "fin"],
)
`,
        },
      },
    },
  },
  usaLaIa: [
    {
      id: "mod04-ia1",
      titulo: "Usa la IA para depurar la conexión de nodos",
      promptsSugeridos: [
        "Tengo un StateGraph con tres nodos (add_node) conectados con add_edge, pero " +
          "invoke() lanza un error o se queda sin llegar a END. Aquí está mi código. " +
          "¿Qué conexión me falta o está mal orientada?",
        "Explícame la diferencia entre llamar a invoke() sobre el `builder` (sin compilar) " +
          "y sobre el resultado de `builder.compile()`: ¿por qué falla el primero?",
      ],
      comoVerificar: [
        "¿La respuesta usa exactamente `add_node`, `add_edge(origen, destino)` y " +
          "`compile()` — los mismos símbolos del grounding — o inventa otro método?",
        "¿Al pegar el fragmento sugerido, `check_eq` del mini-ejercicio pasa con el valor " +
          "numérico esperado (no solo 'no lanza error')?",
        "¿La IA respeta el orden `add_edge(origen, destino)` (de origen A destino), o lo " +
          "invierte por error?",
      ],
      comoIterar:
        "Si el grafo sigue sin llegar a END, pega el mensaje de error EXACTO (o el valor " +
        "final incorrecto de 'n') y pregunta específicamente qué `add_edge` falta, en vez " +
        "de pedir que reescriba todo el grafo.",
      queNoDelegar: [
        "No le pidas que resuelva los tres nodos de una vez: complétalos uno por uno para " +
          "entender qué hace cada `add_edge`.",
        "No copies un grafo que use `add_conditional_edges` o ciclos: ese tema llega en el " +
          "módulo siguiente y aquí solo hay cintas fijas.",
      ],
    },
  ],
  tutorialLocal: {
    introMd:
      "Este tramo amplía el grafo del proyecto a TRES nodos encadenados — el tema " +
      "central de este módulo: más `add_node`/`add_edge`, sin ciclos todavía.",
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
          "Se añade un tercer nodo (`agradecer`) entre `construir_saludo` y `despedir`: " +
          "una cadena de tres estaciones conectadas con `add_edge`, sobre los mismos " +
          "esquemas input/output/overall del módulo 03.",
        codigo: `from langgraph.graph import END, START, StateGraph

from state import InputState, OutputState, OverallState


def construir_saludo(state: OverallState) -> OverallState:
    saludo = "Hola, " + state["nombre"]
    return {"saludo": saludo, "historial": [saludo]}


def agradecer(state: OverallState) -> OverallState:
    agradecimiento = "Gracias, " + state["nombre"]
    return {"saludo": agradecimiento, "historial": [agradecimiento]}


def despedir(state: OverallState) -> OutputState:
    despedida = "Hasta luego, " + state["nombre"]
    return {"saludo": despedida, "historial": [despedida]}


builder = StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)
builder.add_node("construir_saludo", construir_saludo)
builder.add_node("agradecer", agradecer)
builder.add_node("despedir", despedir)
builder.add_edge(START, "construir_saludo")
builder.add_edge("construir_saludo", "agradecer")
builder.add_edge("agradecer", "despedir")
builder.add_edge("despedir", END)

graph = builder.compile()
`,
      },
    ],
    salidaEsperada:
      "{'saludo': 'Hasta luego, Ana', 'historial': ['Hola, Ana', 'Gracias, Ana', 'Hasta luego, Ana']}",
    spine: {
      crea: [],
      modifica: ["src/graph.py"],
    },
  },
};
