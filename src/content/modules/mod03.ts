import type { CourseModule } from "../types";

/**
 * Módulo 03 — Reducers: cómo se fusiona el estado.
 * Contenido completo (slice S13). Código: API del grounding §1 y §3 exclusivamente.
 * Regla M3 (SLICES.md §S13): sin fan-out real (eso llega tras S12); los ejemplos
 * demuestran reducers con updates SECUENCIALES entre supersteps (varios `invoke`
 * o varios nodos en cadena, nunca dos nodos del mismo superstep escribiendo la
 * misma clave).
 */
export const mod03: CourseModule = {
  id: "mod03",
  numero: 3,
  titulo: "Reducers: cómo se fusiona el estado",
  objetivo:
    "Usar Annotated con reducers (operator.add, add_messages) y predecir el estado " +
    "resultante tras varias actualizaciones.",
  // §12 (ADR-15, piloto SE1): formato enriquecido — pasos guiados, "Usa la IA" y
  // tutorial local (continúa el project spine desde mod02).
  enriquecido: true,
  secciones: {
    explicaSimple: {
      contenidoMd: `## Un cajón compartido, ¿se vacía o se acumula?

Imagina un **cajón compartido** de una oficina donde varias personas van dejando notas
a lo largo del día. Hay dos formas de organizarlo:

- **Cajón "última nota gana"**: cada vez que alguien mete una nota nueva, tira la
  anterior. Al final del día solo queda la última nota que alguien dejó.
- **Cajón "se acumulan las notas"**: cada nota nueva se apila sobre las anteriores. Al
  final del día tienes el historial completo de todas las notas del día.

En LangGraph, cuando un nodo devuelve un cambio para una clave del estado, por defecto
pasa lo mismo que el cajón "última nota gana": el valor nuevo **reemplaza** al anterior.
Pero para muchas claves —una lista de mensajes de un chat, un registro de pasos
ejecutados, un contador que crece— tú quieres el cajón "se acumulan las notas". Ese
comportamiento se llama **reducer**: una función que dice CÓMO combinar el valor
anterior del estado con el valor nuevo que aporta un nodo, en vez de simplemente
sobrescribir.

## \`Annotated\` es la etiqueta del cajón

Para decirle a LangGraph "esta clave concreta usa el cajón que acumula", se etiqueta el
tipo de esa clave con \`Annotated[tipo, reducer]\`. El reducer más simple es
\`operator.add\`: para listas, "sumar" dos listas es concatenarlas (igual que
\`[1, 2] + [3]\` da \`[1, 2, 3]\`). Sin esa etiqueta, la clave se comporta como el cajón
por defecto: el último valor devuelto sobrescribe al anterior.`,
      consignaExplicacion:
        "Explícale a alguien que no programa, usando la metáfora del cajón compartido " +
        "('última nota gana' contra 'se acumulan las notas'), qué decide si el estado de " +
        "un grafo se sobrescribe o se acumula cuando varios pasos actualizan el mismo campo.",
    },
    detectaGaps: {
      contenidoMd:
        "Antes de ver más código, comprueba si predices bien cuándo el estado se " +
        "sobrescribe y cuándo se acumula.",
      quiz: {
        id: "mod03-quiz1",
        titulo: "¿Sobrescribe o acumula?",
        preguntas: [
          {
            id: "mod03-quiz1-p1",
            kind: "single",
            enunciadoMd:
              "Una clave del estado se declara `pasos: list[str]` (SIN `Annotated`). Un " +
              "nodo A devuelve `{'pasos': ['inicio']}` y, en una ejecución posterior, un " +
              "nodo B devuelve `{'pasos': ['fin']}`. ¿Qué valor final tiene `pasos`?",
            opciones: ["`['inicio', 'fin']`", "`['fin']`", "`['inicio']`", "Lanza un error"],
            correcta: 1,
            explicacionMd:
              "Sin reducer, cada actualización SOBRESCRIBE el valor anterior: el último " +
              "nodo que escribe la clave 'gana', igual que el cajón 'última nota gana'.",
          },
          {
            id: "mod03-quiz1-p2",
            kind: "boolean",
            enunciadoMd:
              "`Annotated[list, operator.add]` hace que cada valor devuelto por un nodo se " +
              "concatene a la lista existente en vez de reemplazarla.",
            correcta: true,
            explicacionMd:
              "Correcto: `operator.add` sobre listas es concatenación; es el reducer " +
              "'append-only' más usado en LangGraph.",
          },
          {
            id: "mod03-quiz1-p3",
            kind: "multi",
            enunciadoMd: "¿Cuáles de estas afirmaciones sobre los reducers son correctas?",
            opciones: [
              "Un reducer decide cómo se combina el valor anterior del estado con el nuevo.",
              "`add_messages` es un reducer pensado específicamente para listas de mensajes de chat.",
              "Sin `Annotated`, toda clave del estado se acumula automáticamente.",
              "El reducer se declara con `Annotated[tipo, reducer]` en el `TypedDict` del estado.",
            ],
            correctas: [0, 1, 3],
            explicacionMd:
              "Sin `Annotated` la clave se SOBRESCRIBE, no se acumula (comportamiento por " +
              "defecto). Las demás afirmaciones son correctas.",
          },
          {
            id: "mod03-quiz1-p4",
            kind: "output",
            enunciadoMd:
              "Dado este estado y estos nodos, ¿qué vale `aggregate` tras ejecutar primero " +
              "`a` y luego `b` (cada uno en su propio superstep, sin `Annotated`)?",
            codigo:
              'class State(TypedDict):\n    aggregate: list\n\ndef a(state):\n    return {"aggregate": ["A"]}\n\ndef b(state):\n    return {"aggregate": state["aggregate"] + ["B"]}\n',
            opciones: [
              "`['A', 'B']`, porque `b` construye la lista a mano leyendo el estado anterior",
              "`['A']`, porque `b` sobrescribe con solo `['B']`",
              "`['B']`, porque no hay reducer y `b` gana",
              "Lanza un error porque falta `Annotated`",
            ],
            correcta: 0,
            explicacionMd:
              "Sin reducer, la clave se sobrescribe con lo que el nodo devuelva — pero aquí " +
              "`b` lee `state['aggregate']` y construye la lista completa a mano " +
              "(`state['aggregate'] + ['B']`), así que el resultado final es `['A', 'B']` " +
              "aunque no haya `Annotated`. La acumulación 'gratis' solo llega con un reducer.",
          },
          {
            id: "mod03-quiz1-p5",
            kind: "single",
            enunciadoMd:
              "¿Qué reducer usa típicamente la clave `messages` de una conversación en " +
              "LangGraph?",
            opciones: ["`operator.add`", "`add_messages`", "`operator.mul`", "Ninguno: siempre se sobrescribe"],
            correcta: 1,
            explicacionMd:
              "`add_messages` (de `langgraph.graph.message`) es el reducer especializado " +
              "para mensajes: además de anexar, actualiza por id (lo vemos en el módulo 06).",
          },
        ],
      },
    },
    llenaGaps: {
      contenidoMd: `## Reducers en código real

\`\`\`python
import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    # Sin reducer: cada update SOBRESCRIBE el valor anterior.
    ultimo_paso: str
    # Con reducer operator.add: cada update se CONCATENA a la lista existente.
    historial: Annotated[list[str], operator.add]

def paso_1(state: State):
    return {"ultimo_paso": "paso_1", "historial": ["paso_1"]}

def paso_2(state: State):
    return {"ultimo_paso": "paso_2", "historial": ["paso_2"]}

builder = StateGraph(State)
builder.add_node(paso_1)
builder.add_node(paso_2)
builder.add_edge(START, "paso_1")
builder.add_edge("paso_1", "paso_2")
builder.add_edge("paso_2", END)
graph = builder.compile()

resultado = graph.invoke({"ultimo_paso": "", "historial": []})
# resultado == {"ultimo_paso": "paso_2", "historial": ["paso_1", "paso_2"]}
\`\`\`

**Cómo leerlo:** \`ultimo_paso\` no tiene \`Annotated\`, así que cada nodo que la escribe
sobrescribe el valor anterior: al final solo queda \`"paso_2"\`. \`historial\` sí tiene
\`Annotated[list[str], operator.add]\`, así que cada valor que un nodo devuelve para esa
clave se **concatena** al histórico: al final tiene los dos pasos, en el orden en que se
ejecutaron los nodos (\`paso_1\` antes que \`paso_2\`, porque \`add_edge\` los conecta en ese
orden — no hay fan-out en este ejemplo).

## Reducers y ejecuciones separadas (varios \`invoke\`)

Un reducer también combina valores entre **invocaciones distintas** cuando reutilizas el
mismo diccionario de estado como entrada de la siguiente llamada:

\`\`\`python
estado_1 = graph.invoke({"ultimo_paso": "", "historial": []})
# estado_1["historial"] == ["paso_1", "paso_2"]

estado_2 = graph.invoke(estado_1)
# El reducer vuelve a concatenar sobre el historial que ya traía estado_1:
# estado_2["historial"] == ["paso_1", "paso_2", "paso_1", "paso_2"]
\`\`\`

**Errores comunes:**
- Olvidar \`Annotated\` en una clave que necesitas que acumule: el segundo nodo que la
  escriba sobrescribirá silenciosamente al primero (no hay ningún error, solo pierdes
  datos sin darte cuenta).
- Confundir "reducer" con "el nodo construye la lista a mano leyendo el estado
  anterior" (como en el quiz): ambas cosas pueden dar el mismo resultado en un grafo
  puramente secuencial, pero solo el reducer protege cuando dos nodos del **mismo**
  superstep escriben la misma clave (eso requiere el executor avanzado del módulo de
  checkpointing/streaming; aquí basta con saber predecir la fusión secuencial).
- Usar \`operator.add\` sobre tipos que no soportan \`+\` (p. ej. mezclar \`str\` y \`list\`)
  produce un error de tipo en tiempo de ejecución.`,
      retos: [
        {
          id: "mod03-reto1",
          titulo: "Predice y verifica: historial con reducer",
          enunciadoMd:
            "Declara la clave `historial` con el reducer correcto (`operator.add`) para " +
            "que, tras ejecutar `registrar_a` y luego `registrar_b` en el mismo grafo " +
            "secuencial, `historial` termine con los dos valores, en orden. Completa la " +
            "declaración de `State`.",
          starterCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    # TODO — declara 'historial' como list[str] con reducer operator.add
    historial: list[str]

def registrar_a(state: State):
    return {"historial": ["A"]}

def registrar_b(state: State):
    return {"historial": ["B"]}

builder = StateGraph(State)
builder.add_node(registrar_a)
builder.add_node(registrar_b)
builder.add_edge(START, "registrar_a")
builder.add_edge("registrar_a", "registrar_b")
builder.add_edge("registrar_b", END)
graph = builder.compile()
`,
          solutionCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    historial: Annotated[list[str], operator.add]

def registrar_a(state: State):
    return {"historial": ["A"]}

def registrar_b(state: State):
    return {"historial": ["B"]}

builder = StateGraph(State)
builder.add_node(registrar_a)
builder.add_node(registrar_b)
builder.add_edge(START, "registrar_a")
builder.add_edge("registrar_a", "registrar_b")
builder.add_edge("registrar_b", END)
graph = builder.compile()
`,
          validationCode: `from course_harness import check, check_eq

resultado = graph.invoke({"historial": []})
check_eq(
    "historial_acumula_ambos_valores",
    "Con el reducer operator.add, 'historial' debe acumular ambos valores en orden",
    resultado["historial"],
    ["A", "B"],
)

resultado_2 = graph.invoke(resultado)
check_eq(
    "reducer_sigue_acumulando_entre_invokes",
    "Un segundo invoke() reutilizando el estado anterior debe seguir acumulando",
    resultado_2["historial"],
    ["A", "B", "A", "B"],
)
check(
    "no_es_solo_ultimo_valor",
    "El resultado no debe ser solo el último valor devuelto (eso indicaría ausencia de reducer)",
    resultado["historial"] != ["B"],
)
`,
        },
      ],
      pasos: [
        {
          id: "mod03-paso1",
          titulo: "Sin reducer: el último valor gana",
          explicacionMd:
            "Sin `Annotated`, cada nodo que escribe una clave del estado SOBRESCRIBE lo que " +
            "había antes: no hay ningún error, solo se pierde el valor anterior. Completa el " +
            "segundo nodo para comprobarlo.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod03-paso1-reto",
              titulo: "Completa el nodo que sobrescribe",
              enunciadoMd:
                'Completa `paso_b` para que devuelva `{"ultimo": "b"}`. Como `ultimo` no ' +
                "tiene reducer, su valor final debe ser 'b', no 'a'.",
              starterCode: `from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END


class State(TypedDict):
    ultimo: str


def paso_a(state: State):
    return {"ultimo": "a"}


def paso_b(state: State):
    # TODO: devuelve {"ultimo": "b"}
    ...


builder = StateGraph(State)
builder.add_node(paso_a)
builder.add_node(paso_b)
builder.add_edge(START, "paso_a")
builder.add_edge("paso_a", "paso_b")
builder.add_edge("paso_b", END)
graph = builder.compile()
`,
              solutionCode: `from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END


class State(TypedDict):
    ultimo: str


def paso_a(state: State):
    return {"ultimo": "a"}


def paso_b(state: State):
    return {"ultimo": "b"}


builder = StateGraph(State)
builder.add_node(paso_a)
builder.add_node(paso_b)
builder.add_edge(START, "paso_a")
builder.add_edge("paso_a", "paso_b")
builder.add_edge("paso_b", END)
graph = builder.compile()
`,
              validationCode: `from course_harness import check_eq

resultado = graph.invoke({"ultimo": ""})
check_eq(
    "sin_reducer_sobrescribe",
    "Sin Annotated, 'ultimo' debe quedar con el último valor escrito ('b')",
    resultado["ultimo"],
    "b",
)
`,
            },
          },
        },
        {
          id: "mod03-paso2",
          titulo: "La sintaxis de Annotated",
          explicacionMd:
            "Para que una clave acumule en vez de sobrescribir, se etiqueta su tipo con " +
            "`Annotated[tipo, reducer]`. `operator.add` sobre listas es concatenación — " +
            "\"sumar\" dos listas es unirlas. Lee el fragmento antes de tocar código.",
          accion: {
            kind: "lectura",
            bloqueMd: `\`\`\`python
import operator
from typing import Annotated
from typing_extensions import TypedDict

class State(TypedDict):
    # Sin reducer: cada update SOBRESCRIBE.
    ultimo_paso: str
    # Con reducer: cada update se CONCATENA.
    historial: Annotated[list[str], operator.add]
\`\`\`
Este fragmento ya está completo: solo léelo, no hace falta ejecutarlo ni completar nada todavía.`,
          },
        },
        {
          id: "mod03-paso3",
          titulo: "Etiqueta la clave para que acumule",
          explicacionMd:
            "Ahora te toca declarar el reducer tú mismo: etiqueta `notas` para que acumule, y " +
            "completa el segundo nodo para comprobar que ambos valores quedan en la lista.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod03-paso3-reto",
              titulo: "Declara el reducer y completa el nodo",
              enunciadoMd:
                "Declara `notas` como `list[str]` con reducer `operator.add`, y completa " +
                '`paso_b` para que devuelva `{"notas": ["b"]}`.',
              starterCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END


class State(TypedDict):
    # TODO: declara 'notas' como list[str] con reducer operator.add
    notas: list[str]


def paso_a(state: State):
    return {"notas": ["a"]}


def paso_b(state: State):
    # TODO: devuelve {"notas": ["b"]}
    ...


builder = StateGraph(State)
builder.add_node(paso_a)
builder.add_node(paso_b)
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
    notas: Annotated[list[str], operator.add]


def paso_a(state: State):
    return {"notas": ["a"]}


def paso_b(state: State):
    return {"notas": ["b"]}


builder = StateGraph(State)
builder.add_node(paso_a)
builder.add_node(paso_b)
builder.add_edge(START, "paso_a")
builder.add_edge("paso_a", "paso_b")
builder.add_edge("paso_b", END)
graph = builder.compile()
`,
              validationCode: `from course_harness import check_eq

resultado = graph.invoke({"notas": []})
check_eq(
    "reducer_acumula_ambos_valores",
    "Con operator.add, 'notas' debe acumular ambos valores en orden",
    resultado["notas"],
    ["a", "b"],
)
`,
            },
          },
        },
        {
          id: "mod03-paso4",
          titulo: "Predicción: acumular entre invokes",
          explicacionMd:
            "Un reducer también combina valores entre invocaciones distintas si reutilizas el " +
            "estado de salida como entrada de la siguiente. Antes de seguir, predice qué pasa " +
            "al invocar el grafo dos veces seguidas.",
          accion: {
            kind: "quiz",
            quiz: {
              id: "mod03-paso4-quiz",
              titulo: "¿Qué acumula un segundo invoke()?",
              preguntas: [
                {
                  id: "mod03-paso4-quiz-p1",
                  kind: "output",
                  enunciadoMd:
                    'Dado que `historial` usa `Annotated[list[str], operator.add]` y ' +
                    '`estado_1["historial"] == ["paso_1", "paso_2"]`, ¿qué vale ' +
                    '`estado_2["historial"]` tras `estado_2 = graph.invoke(estado_1)`?',
                  codigo:
                    'estado_1 = graph.invoke({"historial": []})\n' +
                    '# estado_1["historial"] == ["paso_1", "paso_2"]\n' +
                    "estado_2 = graph.invoke(estado_1)\n",
                  opciones: [
                    '["paso_1", "paso_2"]',
                    '["paso_1", "paso_2", "paso_1", "paso_2"]',
                    "[]",
                    "Lanza un error",
                  ],
                  correcta: 1,
                  explicacionMd:
                    "El reducer también combina entre invokes distintos si reutilizas el " +
                    "estado de salida como entrada: el segundo invoke vuelve a concatenar " +
                    "sobre lo que ya traía, dando 4 elementos.",
                },
              ],
            },
          },
        },
        {
          id: "mod03-paso5",
          titulo: "Combina clave con reducer y clave sin reducer",
          explicacionMd:
            "Practica ambos comportamientos en el mismo grafo: una clave que sobrescribe " +
            "(`estado_actual`) y otra que acumula (`registro`), actualizadas por dos nodos " +
            "distintos.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod03-paso5-reto",
              titulo: "Completa ambas claves en los dos nodos",
              enunciadoMd:
                "Declara `registro` con reducer `operator.add` y completa `paso_x`/`paso_y` " +
                "para que cada uno actualice `estado_actual` con su propio nombre y añada ese " +
                "mismo nombre a `registro`.",
              starterCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END


class State(TypedDict):
    estado_actual: str
    # TODO: declara 'registro' como list[str] con reducer operator.add
    registro: list[str]


def paso_x(state: State):
    # TODO: devuelve {"estado_actual": "x", "registro": ["x"]}
    ...


def paso_y(state: State):
    # TODO: devuelve {"estado_actual": "y", "registro": ["y"]}
    ...


builder = StateGraph(State)
builder.add_node(paso_x)
builder.add_node(paso_y)
builder.add_edge(START, "paso_x")
builder.add_edge("paso_x", "paso_y")
builder.add_edge("paso_y", END)
graph = builder.compile()
`,
              solutionCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END


class State(TypedDict):
    estado_actual: str
    registro: Annotated[list[str], operator.add]


def paso_x(state: State):
    return {"estado_actual": "x", "registro": ["x"]}


def paso_y(state: State):
    return {"estado_actual": "y", "registro": ["y"]}


builder = StateGraph(State)
builder.add_node(paso_x)
builder.add_node(paso_y)
builder.add_edge(START, "paso_x")
builder.add_edge("paso_x", "paso_y")
builder.add_edge("paso_y", END)
graph = builder.compile()
`,
              validationCode: `from course_harness import check_eq

resultado = graph.invoke({"estado_actual": "", "registro": []})
check_eq(
    "estado_actual_sobrescrito",
    "'estado_actual' no tiene reducer: debe quedar con el último valor ('y')",
    resultado["estado_actual"],
    "y",
)
check_eq(
    "registro_acumula_ambos",
    "'registro' tiene reducer operator.add: debe acumular ambos valores en orden",
    resultado["registro"],
    ["x", "y"],
)
`,
            },
          },
        },
      ],
    },
    refinaSimplifica: {
      resumenBullets: [
        "Sin `Annotated`, una clave del estado se SOBRESCRIBE: el último nodo que la escribe gana.",
        "`Annotated[tipo, reducer]` declara cómo se combina el valor anterior con el nuevo.",
        "`operator.add` sobre listas concatena (append-only); es el reducer más común.",
        "`add_messages` es el reducer especializado para conversaciones (módulo 06).",
        "Los reducers también se aplican entre invocaciones separadas si reutilizas el estado de salida como entrada.",
        "Olvidar `Annotated` en una clave que debería acumular pierde datos sin lanzar ningún error.",
        "Un nodo puede simular acumulación leyendo el estado y construyendo la lista a mano, pero eso no es lo mismo que declarar un reducer.",
      ],
      sintesis: {
        kind: "code",
        reto: {
          id: "mod03-reto-sintesis",
          titulo: "Síntesis: combinar clave con reducer y clave sin reducer",
          enunciadoMd:
            "Construye un grafo con DOS claves de estado: `resumen` (sin reducer, guarda " +
            "solo el último resumen) e `historial` (con reducer `operator.add`, acumula " +
            "todos los pasos). Completa los nodos `paso_a` y `paso_b` para que cada uno " +
            "actualice ambas claves: `resumen` con su propio nombre de paso, e `historial` " +
            "añadiendo ese mismo nombre a la lista.",
          starterCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    resumen: str
    historial: Annotated[list[str], operator.add]

def paso_a(state: State):
    # TODO — devuelve {"resumen": "a", "historial": ["a"]}
    ...

def paso_b(state: State):
    # TODO — devuelve {"resumen": "b", "historial": ["b"]}
    ...

builder = StateGraph(State)
builder.add_node(paso_a)
builder.add_node(paso_b)
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
    resumen: str
    historial: Annotated[list[str], operator.add]

def paso_a(state: State):
    return {"resumen": "a", "historial": ["a"]}

def paso_b(state: State):
    return {"resumen": "b", "historial": ["b"]}

builder = StateGraph(State)
builder.add_node(paso_a)
builder.add_node(paso_b)
builder.add_edge(START, "paso_a")
builder.add_edge("paso_a", "paso_b")
builder.add_edge("paso_b", END)
graph = builder.compile()
`,
          validationCode: `from course_harness import check_eq

resultado = graph.invoke({"resumen": "", "historial": []})
check_eq(
    "resumen_sobrescrito_con_ultimo_paso",
    "'resumen' no tiene reducer: debe quedarse con el último valor escrito ('b')",
    resultado["resumen"],
    "b",
)
check_eq(
    "historial_acumula_ambos_pasos",
    "'historial' tiene reducer operator.add: debe acumular ambos pasos en orden",
    resultado["historial"],
    ["a", "b"],
)
`,
        },
      },
    },
  },
  usaLaIa: [
    {
      id: "mod03-ia1",
      titulo: "Usa la IA para depurar un reducer",
      promptsSugeridos: [
        "Mi clave `historial` no está acumulando: cada ejecución solo me deja el último " +
          "valor. Aquí está mi clase `State` con la declaración del campo. ¿Qué me falta para " +
          "que se comporte como una lista que se acumula?",
        "Explícame la diferencia entre que un nodo 'construya la lista a mano leyendo el " +
          "estado' y que declare `Annotated[list, operator.add]`: ¿en qué casos dan el mismo " +
          "resultado y en cuáles no?",
      ],
      comoVerificar: [
        "¿La respuesta usa `Annotated[tipo, reducer]` exactamente como en el grounding, o " +
          "inventa una sintaxis distinta?",
        "¿Al pegar el código sugerido, `check_eq` del mini-ejercicio pasa con la lista " +
          "completa esperada (no solo el último valor)?",
        "¿La IA explica que sin `Annotated` la clave se SOBRESCRIBE, o dice (incorrectamente) " +
          "que 'siempre se acumula'?",
      ],
      comoIterar:
        "Si sigue sobrescribiendo, pega el valor real que obtuviste (`resultado['historial']`) " +
        "y pregunta específicamente qué línea de la declaración de `State` falta, en vez de " +
        "pedir el ejercicio resuelto completo.",
      queNoDelegar: [
        "No le pidas que resuelva los TODO de una vez: complétalos uno por uno para entender " +
          "por qué CADA clave se comporta distinto.",
        "No aceptes una respuesta que use `Send` o ejecución paralela para 'forzar' la " +
          "acumulación: ese tema es de un módulo posterior y no lo cubre este entorno todavía.",
      ],
    },
  ],
  tutorialLocal: {
    introMd:
      "Este tramo añade un reducer al proyecto: una clave que sobrescribe y otra que " +
      "acumula, en el mismo grafo.",
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
          "EXTIENDE (no reemplaza) los esquemas del módulo 02: `OverallState` gana el " +
          "campo `historial` con reducer `operator.add`; `OutputState` gana el mismo " +
          "campo (sin reducer propio: el reducer se aplica sobre `OverallState`, " +
          "`OutputState` solo decide qué claves se exponen) para poder verlo en la salida.",
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
`,
      },
      {
        archivo: "src/graph.py",
        descripcionMd:
          "Dos nodos sobre los mismos esquemas input/output del módulo 02: 'saludo' se " +
          "sobrescribe (sin reducer) y 'historial' se acumula (operator.add).",
        codigo: `from langgraph.graph import END, START, StateGraph

from state import InputState, OutputState, OverallState


def construir_saludo(state: OverallState) -> OverallState:
    saludo = "Hola, " + state["nombre"]
    return {"saludo": saludo, "historial": [saludo]}


def despedir(state: OverallState) -> OutputState:
    despedida = "Hasta luego, " + state["nombre"]
    return {"saludo": despedida, "historial": [despedida]}


builder = StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)
builder.add_node("construir_saludo", construir_saludo)
builder.add_node("despedir", despedir)
builder.add_edge(START, "construir_saludo")
builder.add_edge("construir_saludo", "despedir")
builder.add_edge("despedir", END)

graph = builder.compile()
`,
      },
      {
        archivo: "src/main.py",
        descripcionMd: "El invoke solo exige 'nombre' (input_schema); el resultado ya trae 'historial'.",
        codigo: `from graph import graph


if __name__ == "__main__":
    resultado = graph.invoke({"nombre": "Ana"})
    print(resultado)
`,
      },
    ],
    salidaEsperada:
      "{'saludo': 'Hasta luego, Ana', 'historial': ['Hola, Ana', 'Hasta luego, Ana']}",
    spine: {
      crea: [],
      modifica: ["src/state.py", "src/graph.py", "src/main.py"],
    },
  },
};
