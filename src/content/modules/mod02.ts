import type { CourseModule } from "../types";

/**
 * Módulo 02 — El estado: TypedDict y esquemas.
 * Contenido completo (slice S1). Código: API del grounding §2 exclusivamente.
 */
export const mod02: CourseModule = {
  id: "mod02",
  numero: 2,
  titulo: "El estado: TypedDict y esquemas",
  objetivo: "Definir estados tipados con `TypedDict`; usar esquemas input/output/private de un grafo.",
  // §12 (ADR-15, piloto SE1): formato enriquecido — pasos guiados, "Usa la IA" y
  // tutorial local (continúa el project spine desde mod01).
  enriquecido: true,
  secciones: {
    explicaSimple: {
      contenidoMd: `## El estado es un formulario compartido

Piensa en el estado de un grafo como un **formulario en papel** que va pasando de mesa
en mesa (de nodo en nodo). Cada mesa (nodo) puede leer algunos campos del formulario y
rellenar otros. Para que nadie escriba datos con el formato equivocado, el formulario
tiene una **plantilla**: en LangGraph, esa plantilla es un \`TypedDict\` — le dice a
Python (y a ti) qué campos existen y de qué tipo es cada uno.

## No todo el mundo ve el formulario completo

En una oficina real, recepción solo ve el campo "nombre del cliente" (lo que entra),
el cliente final solo recibe el campo "resultado" (lo que sale), y hay notas internas
que solo ven los empleados (privadas, no llegan ni a la entrada ni a la salida). LangGraph
permite lo mismo con **esquemas separados**:

- **Esquema de entrada (input)**: lo mínimo que el que llama al grafo debe proporcionar.
- **Esquema de salida (output)**: lo único que se devuelve al terminar.
- **Esquema general (overall)**: la plantilla completa con TODOS los campos, usada
  internamente por los nodos según lo que necesiten leer/escribir.
- **Esquema privado**: campos internos que ni entran ni salen, solo se usan de nodo a
  nodo dentro del grafo.

Esto evita que quien use el grafo tenga que conocer detalles internos, y evita que datos
internos "se filtren" hacia afuera sin querer.`,
      consignaExplicacion:
        "Explícale a alguien que no programa, usando la metáfora de un formulario que " +
        "pasa de mesa en mesa, por qué puede ser útil que 'quien entrega el formulario' " +
        "no vea los mismos campos que 'quien lo recibe al final'.",
    },
    detectaGaps: {
      contenidoMd:
        "Comprueba si distingues bien para qué sirve cada esquema (input/output/overall/private) " +
        "y qué hace `TypedDict`.",
      quiz: {
        id: "mod02-quiz1",
        titulo: "TypedDict y esquemas",
        preguntas: [
          {
            id: "mod02-quiz1-p1",
            kind: "single",
            enunciadoMd: "¿Qué es un `TypedDict` en el contexto del estado de un grafo?",
            opciones: [
              "Una clase que define la forma (campos y tipos) de un diccionario, para tipado estático.",
              "Una base de datos persistente.",
              "Un decorador que ejecuta el nodo en paralelo.",
              "Un tipo de reducer exclusivo de mensajes.",
            ],
            correcta: 0,
            explicacionMd:
              "`TypedDict` (de `typing_extensions`) define qué claves y tipos tiene un diccionario, sin crear una clase con comportamiento propio: es pura anotación de tipos.",
          },
          {
            id: "mod02-quiz1-p2",
            kind: "boolean",
            enunciadoMd:
              "Si un grafo se compila con `input_schema` y `output_schema` distintos del esquema general, el resultado de `invoke()` solo expone las claves del `output_schema`.",
            correcta: true,
            explicacionMd:
              "Correcto: el `output_schema` filtra qué claves del estado general se devuelven al llamador, aunque internamente el grafo haya usado más claves.",
          },
          {
            id: "mod02-quiz1-p3",
            kind: "multi",
            enunciadoMd: "¿Cuáles de estos son tipos de esquema que puede usar un `StateGraph`?",
            opciones: ["Esquema de entrada (input)", "Esquema de salida (output)", "Esquema privado", "Esquema de facturación"],
            correctas: [0, 1, 2],
            explicacionMd:
              "Input, output, overall (general) y private son los esquemas que soporta `StateGraph`. 'Esquema de facturación' no existe en LangGraph.",
          },
          {
            id: "mod02-quiz1-p4",
            kind: "output",
            enunciadoMd:
              "Dado el ejemplo de la sección siguiente, ¿qué devuelve `graph.invoke({\"user_input\": \"My\"})`?",
            codigo:
              'def node_1(state): return {"foo": state["user_input"] + " name"}\n' +
              'def node_2(state): return {"bar": state["foo"] + " is"}\n' +
              'def node_3(state): return {"graph_output": state["bar"] + " Lance"}\n',
            opciones: [
              "{'graph_output': 'My name is Lance'}",
              "{'foo': 'My name', 'bar': 'My name is', 'graph_output': 'My name is Lance'}",
              "{'user_input': 'My'}",
              "Lanza un error porque falta 'user_input' en la salida",
            ],
            correcta: 0,
            explicacionMd:
              "El `output_schema` solo define `graph_output`, así que aunque internamente se calculan `foo` y `bar`, `invoke()` únicamente expone `graph_output`.",
          },
          {
            id: "mod02-quiz1-p5",
            kind: "single",
            enunciadoMd: "¿Para qué sirve un esquema privado (`private_state` / `PrivateState`)?",
            opciones: [
              "Para campos internos que se pasan entre nodos pero nunca entran ni salen del grafo.",
              "Para cifrar el estado en disco.",
              "Para declarar qué usuarios pueden ejecutar el grafo.",
              "Para definir el modelo de LLM que usará el grafo.",
            ],
            correcta: 0,
            explicacionMd:
              "El esquema privado modela datos intermedios que solo importan a un subconjunto de nodos, sin exponerlos como entrada ni como salida del grafo.",
          },
        ],
      },
    },
    llenaGaps: {
      contenidoMd: `## Esquemas input / output / overall / private en código real

\`\`\`python
from typing import TypedDict
from langgraph.graph import END, START, StateGraph

class InputState(TypedDict):
    user_input: str
class OutputState(TypedDict):
    graph_output: str
class OverallState(TypedDict):
    foo: str; user_input: str; graph_output: str
class PrivateState(TypedDict):
    bar: str

def node_1(state: InputState) -> OverallState:
    return {"foo": state["user_input"] + " name"}
def node_2(state: OverallState) -> PrivateState:
    return {"bar": state["foo"] + " is"}
def node_3(state: PrivateState) -> OutputState:
    return {"graph_output": state["bar"] + " Lance"}

builder = StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)
builder.add_node("node_1", node_1); builder.add_node("node_2", node_2); builder.add_node("node_3", node_3)
builder.add_edge(START, "node_1"); builder.add_edge("node_1", "node_2")
builder.add_edge("node_2", "node_3"); builder.add_edge("node_3", END)
graph = builder.compile()
graph.invoke({"user_input": "My"})  # {'graph_output': 'My name is Lance'}
\`\`\`

**Cómo leerlo:** \`StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)\`
declara la plantilla completa (\`OverallState\`) y recorta lo que se ve desde fuera:
\`invoke()\` solo exige las claves de \`InputState\` y solo devuelve las de \`OutputState\`.
Cada nodo anota qué porción del estado espera leer (su parámetro) y qué porción
devuelve (su tipo de retorno); no necesita conocer el estado completo.

**Errores comunes:**
- Anotar un nodo con \`OverallState\` cuando en realidad solo necesita un subconjunto:
  funciona, pero acopla el nodo a más campos de los que usa.
- Olvidar que \`invoke()\` filtra por \`output_schema\`: si esperas ver \`foo\` o \`bar\` en el
  resultado y no los declaraste en el esquema de salida, no aparecerán — no es un bug,
  es el comportamiento documentado.
- Confundir \`PrivateState\` con \`OutputState\`: lo privado nunca sale del grafo.`,
      retos: [
        {
          id: "mod02-reto1",
          titulo: "Completa el primer nodo de la cadena de esquemas",
          enunciadoMd:
            "Completa `node_1` para que construya `foo` concatenando `state[\"user_input\"]` " +
            "con `\" nombre\"` (con espacio antes). El resto del grafo ya combina los " +
            "esquemas input/overall/private/output como en el ejemplo de la sección anterior.",
          starterCode: `from typing import TypedDict
from langgraph.graph import END, START, StateGraph

class InputState(TypedDict):
    user_input: str

class OutputState(TypedDict):
    graph_output: str

class OverallState(TypedDict):
    foo: str
    user_input: str
    graph_output: str

class PrivateState(TypedDict):
    bar: str

def node_1(state: InputState) -> OverallState:
    # TODO: devuelve {"foo": state["user_input"] + " nombre"}
    ...

def node_2(state: OverallState) -> PrivateState:
    return {"bar": state["foo"] + " es"}

def node_3(state: PrivateState) -> OutputState:
    return {"graph_output": state["bar"] + " Ana"}

builder = StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)
builder.add_node("node_1", node_1)
builder.add_node("node_2", node_2)
builder.add_node("node_3", node_3)
builder.add_edge(START, "node_1")
builder.add_edge("node_1", "node_2")
builder.add_edge("node_2", "node_3")
builder.add_edge("node_3", END)
graph = builder.compile()
`,
          solutionCode: `from typing import TypedDict
from langgraph.graph import END, START, StateGraph

class InputState(TypedDict):
    user_input: str

class OutputState(TypedDict):
    graph_output: str

class OverallState(TypedDict):
    foo: str
    user_input: str
    graph_output: str

class PrivateState(TypedDict):
    bar: str

def node_1(state: InputState) -> OverallState:
    return {"foo": state["user_input"] + " nombre"}

def node_2(state: OverallState) -> PrivateState:
    return {"bar": state["foo"] + " es"}

def node_3(state: PrivateState) -> OutputState:
    return {"graph_output": state["bar"] + " Ana"}

builder = StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)
builder.add_node("node_1", node_1)
builder.add_node("node_2", node_2)
builder.add_node("node_3", node_3)
builder.add_edge(START, "node_1")
builder.add_edge("node_1", "node_2")
builder.add_edge("node_2", "node_3")
builder.add_edge("node_3", END)
graph = builder.compile()
`,
          validationCode: `from course_harness import check, check_eq

resultado = graph.invoke({"user_input": "Mi"})
check_eq(
    "esquema_output_expone_solo_graph_output",
    "El resultado debe exponer únicamente la clave del esquema de salida ('graph_output')",
    set(resultado.keys()),
    {"graph_output"},
)
check_eq(
    "cadena_de_nodos_concatena_correctamente",
    "graph_output debe encadenar los tres nodos: 'Mi nombre es Ana'",
    resultado.get("graph_output"),
    "Mi nombre es Ana",
)
`,
        },
      ],
      pasos: [
        {
          id: "mod02-paso1",
          titulo: "Declara un esquema con TypedDict",
          explicacionMd:
            "Un `TypedDict` es solo una anotación de tipos: declara qué campos existe y de " +
            "qué tipo es cada uno, sin ninguna lógica propia. Completa `OutputState` para que " +
            "declare el campo `resultado` de tipo `str`.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod02-paso1-reto",
              titulo: "Completa el esquema de salida",
              enunciadoMd: "Agrega a `OutputState` el campo `resultado` de tipo `str`.",
              starterCode: `from typing_extensions import TypedDict


class OutputState(TypedDict):
    # TODO: agrega el campo 'resultado' de tipo str
    ...
`,
              solutionCode: `from typing_extensions import TypedDict


class OutputState(TypedDict):
    resultado: str
`,
              validationCode: `from typing import get_type_hints

from course_harness import check, check_eq

check(
    "outputstate_tiene_campo_resultado",
    "OutputState debe declarar el campo 'resultado'",
    "resultado" in OutputState.__annotations__,
)
check_eq(
    "outputstate_resultado_es_str",
    "El campo 'resultado' debe ser de tipo str",
    get_type_hints(OutputState).get("resultado"),
    str,
)
`,
            },
          },
        },
        {
          id: "mod02-paso2",
          titulo: "Los cuatro roles de un esquema",
          explicacionMd:
            "Recapitulando: `input_schema` es lo mínimo que debe dar quien llama al grafo; " +
            "`output_schema` es lo único que se devuelve; el esquema general (overall) es la " +
            "plantilla completa que usan los nodos; el privado modela datos intermedios que " +
            "nunca entran ni salen. Lee el fragmento antes de programar tu propio grafo.",
          accion: {
            kind: "lectura",
            bloqueMd: `\`\`\`python
from typing import TypedDict
from langgraph.graph import END, START, StateGraph

class InputState(TypedDict):
    nombre: str
class OutputState(TypedDict):
    saludo: str
class OverallState(TypedDict):
    nombre: str
    saludo: str

def construir_saludo(state: OverallState) -> OutputState:
    return {"saludo": "Hola, " + state["nombre"]}

builder = StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)
builder.add_node(construir_saludo)
builder.add_edge(START, "construir_saludo")
builder.add_edge("construir_saludo", END)
graph = builder.compile()
graph.invoke({"nombre": "Ana"})  # {'saludo': 'Hola, Ana'}
\`\`\`
Este fragmento ya está completo: solo léelo, no hace falta ejecutarlo ni completar nada todavía.`,
          },
        },
        {
          id: "mod02-paso3",
          titulo: "Un grafo con entrada y salida distintas",
          explicacionMd:
            "Ahora constrúyelo tú: un grafo de un solo nodo cuyo `input_schema` exige solo " +
            "`nombre` y cuyo `output_schema` solo expone `saludo`, aunque el esquema general " +
            "tenga ambos campos.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod02-paso3-reto",
              titulo: "Completa el nodo y la conexión final",
              enunciadoMd:
                "Completa `construir_saludo` para que devuelva `{\"saludo\": \"Hola, \" + " +
                'state["nombre"]}` y conecta el nodo con `END`.',
              starterCode: `from typing_extensions import TypedDict
from langgraph.graph import END, START, StateGraph


class InputState(TypedDict):
    nombre: str


class OutputState(TypedDict):
    saludo: str


class OverallState(TypedDict):
    nombre: str
    saludo: str


def construir_saludo(state: OverallState) -> OutputState:
    # TODO: devuelve {"saludo": "Hola, " + state["nombre"]}
    ...


builder = StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)
builder.add_node(construir_saludo)
builder.add_edge(START, "construir_saludo")
# TODO: conecta "construir_saludo" con END
graph = builder.compile()
`,
              solutionCode: `from typing_extensions import TypedDict
from langgraph.graph import END, START, StateGraph


class InputState(TypedDict):
    nombre: str


class OutputState(TypedDict):
    saludo: str


class OverallState(TypedDict):
    nombre: str
    saludo: str


def construir_saludo(state: OverallState) -> OutputState:
    return {"saludo": "Hola, " + state["nombre"]}


builder = StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)
builder.add_node(construir_saludo)
builder.add_edge(START, "construir_saludo")
builder.add_edge("construir_saludo", END)
graph = builder.compile()
`,
              validationCode: `from course_harness import check_eq

resultado = graph.invoke({"nombre": "Ana"})
check_eq(
    "output_schema_filtra_solo_saludo",
    "El resultado debe exponer únicamente la clave 'saludo' (output_schema)",
    set(resultado.keys()),
    {"saludo"},
)
check_eq(
    "saludo_construido_correctamente",
    "saludo debe ser 'Hola, Ana'",
    resultado["saludo"],
    "Hola, Ana",
)
`,
            },
          },
        },
        {
          id: "mod02-paso4",
          titulo: "Predicción: campos fuera del esquema de salida",
          explicacionMd:
            "El esquema general puede tener más campos de los que expone `output_schema`. " +
            "Antes de seguir, predice qué pasa con un campo calculado internamente que NO " +
            "está en `OutputState`.",
          accion: {
            kind: "quiz",
            quiz: {
              id: "mod02-paso4-quiz",
              titulo: "¿Qué devuelve invoke() con un campo fuera del output_schema?",
              preguntas: [
                {
                  id: "mod02-paso4-quiz-p1",
                  kind: "output",
                  enunciadoMd:
                    "`OverallState` tiene los campos `nombre`, `saludo` y `pasos_internos`, " +
                    "pero `OutputState` solo declara `saludo`. Un nodo escribe los tres. " +
                    "¿Qué devuelve `graph.invoke({\"nombre\": \"Ana\"})`?",
                  codigo:
                    'class OutputState(TypedDict):\n    saludo: str\n\ndef nodo(state):\n    return {"saludo": "Hola, Ana", "pasos_internos": ["a", "b"]}\n',
                  opciones: [
                    "{'saludo': 'Hola, Ana'}",
                    "{'saludo': 'Hola, Ana', 'pasos_internos': ['a', 'b']}",
                    "{'nombre': 'Ana', 'saludo': 'Hola, Ana', 'pasos_internos': ['a', 'b']}",
                    "Lanza un error porque 'pasos_internos' no está en OutputState",
                  ],
                  correcta: 0,
                  explicacionMd:
                    "`invoke()` filtra estrictamente por `output_schema`: aunque el nodo " +
                    "calcule `pasos_internos`, esa clave no está en `OutputState` y por tanto " +
                    "no se expone; tampoco es un error, simplemente no aparece.",
                },
              ],
            },
          },
        },
        {
          id: "mod02-paso5",
          titulo: "Cadena completa: input, private y output",
          explicacionMd:
            "Practica la cadena completa de 3 nodos con los 4 esquemas antes del reto de la " +
            "sección: `paso_1` lee `InputState`, `paso_2` pasa por `PrivateState`, y `paso_3` " +
            "entrega `OutputState`.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod02-paso5-reto",
              titulo: "Completa los tres nodos de la cadena",
              enunciadoMd:
                "Completa `paso_1`, `paso_2` y `paso_3` para construir la frase de " +
                "bienvenida: `\"Bienvenido a \" + ciudad`, luego añadir `\"!\"`, y finalmente " +
                "exponerla como `bienvenida`.",
              starterCode: `from typing_extensions import TypedDict
from langgraph.graph import END, START, StateGraph


class InputState(TypedDict):
    ciudad: str


class OutputState(TypedDict):
    bienvenida: str


class OverallState(TypedDict):
    ciudad: str
    frase: str
    bienvenida: str


class PrivateState(TypedDict):
    frase: str


def paso_1(state: InputState) -> OverallState:
    # TODO: devuelve {"frase": "Bienvenido a " + state["ciudad"]}
    ...


def paso_2(state: OverallState) -> PrivateState:
    # TODO: devuelve {"frase": state["frase"] + "!"}
    ...


def paso_3(state: PrivateState) -> OutputState:
    # TODO: devuelve {"bienvenida": state["frase"]}
    ...


builder = StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)
builder.add_node("paso_1", paso_1)
builder.add_node("paso_2", paso_2)
builder.add_node("paso_3", paso_3)
builder.add_edge(START, "paso_1")
builder.add_edge("paso_1", "paso_2")
builder.add_edge("paso_2", "paso_3")
builder.add_edge("paso_3", END)
graph = builder.compile()
`,
              solutionCode: `from typing_extensions import TypedDict
from langgraph.graph import END, START, StateGraph


class InputState(TypedDict):
    ciudad: str


class OutputState(TypedDict):
    bienvenida: str


class OverallState(TypedDict):
    ciudad: str
    frase: str
    bienvenida: str


class PrivateState(TypedDict):
    frase: str


def paso_1(state: InputState) -> OverallState:
    return {"frase": "Bienvenido a " + state["ciudad"]}


def paso_2(state: OverallState) -> PrivateState:
    return {"frase": state["frase"] + "!"}


def paso_3(state: PrivateState) -> OutputState:
    return {"bienvenida": state["frase"]}


builder = StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)
builder.add_node("paso_1", paso_1)
builder.add_node("paso_2", paso_2)
builder.add_node("paso_3", paso_3)
builder.add_edge(START, "paso_1")
builder.add_edge("paso_1", "paso_2")
builder.add_edge("paso_2", "paso_3")
builder.add_edge("paso_3", END)
graph = builder.compile()
`,
              validationCode: `from course_harness import check_eq

resultado = graph.invoke({"ciudad": "Lima"})
check_eq(
    "cadena_output_expone_solo_bienvenida",
    "El resultado debe exponer únicamente la clave 'bienvenida' (output_schema)",
    set(resultado.keys()),
    {"bienvenida"},
)
check_eq(
    "cadena_construye_bienvenida_correctamente",
    "bienvenida debe encadenar los tres nodos: 'Bienvenido a Lima!'",
    resultado["bienvenida"],
    "Bienvenido a Lima!",
)
`,
            },
          },
        },
      ],
    },
    refinaSimplifica: {
      resumenBullets: [
        "TypedDict define la forma (campos y tipos) del estado, sin lógica propia.",
        "El esquema general (overall) es la plantilla completa que usan los nodos internamente.",
        "El esquema de entrada (input) limita lo que debe proporcionar quien llama al grafo.",
        "El esquema de salida (output) filtra qué claves se devuelven en `invoke()`.",
        "El esquema privado (private) modela datos intermedios que nunca entran ni salen del grafo.",
        "Cada nodo puede anotar solo la porción de estado que necesita leer/escribir.",
      ],
      sintesis: {
        kind: "quiz",
        quiz: {
          id: "mod02-quiz-sintesis",
          titulo: "Síntesis: esquemas y estado tipado",
          preguntas: [
            {
              id: "mod02-quiz-sintesis-p1",
              kind: "single",
              enunciadoMd:
                "Un grafo con ciclo (módulo 01) que además separa lo que recibe de lo que devuelve necesita combinar…",
              opciones: [
                "Edges condicionales + esquemas input/output",
                "Solo una cadena lineal sin estado",
                "Ningún TypedDict",
                "Solo el esquema privado, sin overall",
              ],
              correcta: 0,
              explicacionMd:
                "Los ciclos se logran con `add_conditional_edges` (módulo 01) y la separación de lo que entra/sale se logra con `input_schema`/`output_schema` (este módulo); ambos se combinan libremente en el mismo `StateGraph`.",
            },
            {
              id: "mod02-quiz-sintesis-p2",
              kind: "boolean",
              enunciadoMd: "Un campo declarado solo en `PrivateState` puede aparecer en el resultado de `invoke()` si algún nodo lo devuelve.",
              correcta: false,
              explicacionMd: "Falso: `invoke()` filtra estrictamente por `output_schema`; lo privado nunca se expone al llamador.",
            },
            {
              id: "mod02-quiz-sintesis-p3",
              kind: "multi",
              enunciadoMd: "¿Qué necesitas declarar como mínimo para compilar un `StateGraph` con esquemas separados?",
              opciones: [
                "El esquema general (overall) al construir `StateGraph(...)`",
                "Opcionalmente `input_schema` y `output_schema`",
                "Un `checkpointer` obligatorio",
                "Un modelo de LLM obligatorio",
              ],
              correctas: [0, 1],
              explicacionMd:
                "Solo el esquema general es obligatorio al construir `StateGraph`; `input_schema`/`output_schema` son opcionales. Checkpointer y LLM no son necesarios para esto.",
            },
          ],
        },
      },
    },
  },
  usaLaIa: [
    {
      id: "mod02-ia1",
      titulo: "Usa la IA para distinguir los 4 esquemas",
      promptsSugeridos: [
        "Tengo cuatro clases TypedDict en LangGraph: InputState, OutputState, OverallState y " +
          "PrivateState. Explícame, con un ejemplo distinto al del curso, por qué NO alcanza " +
          "con una sola clase para todo el estado.",
        "Estoy completando un TODO donde un nodo recibe `PrivateState` y debe devolver " +
          "`OutputState`. Sin darme el código completo, dame una pista sobre qué campo debo " +
          "leer y cuál debo escribir.",
      ],
      comoVerificar: [
        "¿La respuesta sigue usando `TypedDict` y " +
          "`StateGraph(Overall, input_schema=..., output_schema=...)` — los mismos símbolos " +
          "del grounding — o inventa un decorador nuevo?",
        "¿El código sugerido, al pegarlo, hace que `invoke()` devuelva EXACTAMENTE las claves " +
          "del `output_schema` (ninguna de más)?",
        "¿La explicación distingue bien 'lo que entra' de 'lo que sale', o los mezcla?",
      ],
      comoIterar:
        "Si el resultado de `invoke()` te devuelve una clave de más o de menos, pega el " +
        "resultado real y pregunta a la IA cuál de los 4 esquemas está mal declarado, en vez " +
        "de pedirle que reescriba todo el grafo.",
      queNoDelegar: [
        "No le pidas que 'adivine' los nombres de tus campos: tú decides qué representa cada " +
          "clave del estado; la IA solo te ayuda con la sintaxis de `TypedDict`.",
        "No copies un `StateGraph(...)` con argumentos que no reconoces del grounding (por " +
          "ejemplo `schema=` en vez de `input_schema=`): revisa que coincida con la API real.",
      ],
    },
  ],
  tutorialLocal: {
    introMd:
      "Este tramo continúa el proyecto del módulo 01: separa lo que tu grafo recibe de lo " +
      "que devuelve.",
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
          "Reemplaza la clase `State` única del módulo 01 por esquemas separados de " +
          "entrada/salida/general.",
        codigo: `from typing_extensions import TypedDict


class InputState(TypedDict):
    nombre: str


class OutputState(TypedDict):
    saludo: str


class OverallState(TypedDict):
    nombre: str
    saludo: str
`,
      },
      {
        archivo: "src/graph.py",
        descripcionMd: "El nodo ahora lee InputState y devuelve OutputState vía OverallState.",
        codigo: `from langgraph.graph import END, START, StateGraph

from state import InputState, OutputState, OverallState


def construir_saludo(state: OverallState) -> OutputState:
    return {"saludo": "Hola, " + state["nombre"]}


builder = StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)
builder.add_node(construir_saludo)
builder.add_edge(START, "construir_saludo")
builder.add_edge("construir_saludo", END)

graph = builder.compile()
`,
      },
      {
        archivo: "src/main.py",
        descripcionMd: "El invoke ahora envía 'nombre' en vez de 'mensaje'.",
        codigo: `from graph import graph


if __name__ == "__main__":
    resultado = graph.invoke({"nombre": "Ana"})
    print(resultado)
`,
      },
    ],
    salidaEsperada: "{'saludo': 'Hola, Ana'}",
    spine: {
      crea: [],
      modifica: ["src/state.py", "src/graph.py", "src/main.py"],
    },
  },
};
