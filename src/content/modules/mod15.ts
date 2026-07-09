import type { CourseModule } from "../types";

/**
 * Módulo 15 — Subgraphs: composición de grafos.
 * Contenido completo (slice S15). ADR-11 / regla 6 de C-CONTENT: los retos
 * EJECUTABLES usan EXCLUSIVAMENTE subgraph-como-nodo (grounding base §6,
 * superficie core, S6). `graph.stream(..., subgraphs=True)`/prefijo `ns`
 * aparece SOLO en un bloque de código ILUSTRATIVO (con "copiar"), nunca en
 * starterCode/solutionCode/validationCode ni en un quiz "output" que exija
 * ejecutarlo — el quiz puede evaluarlo conceptualmente (mod15-quiz1-p5).
 * §12 (ADR-15, SE4): formato enriquecido — pasos guiados, "Usa la IA" y
 * tutorial local (continúa el project spine desde mod14). El tutorial
 * refactoriza la parte de "preparar el saludo" (contar_visitas +
 * construir_saludo) del proyecto en un subgraph-como-nodo, sin introducir
 * `subgraphs=True`/`ns` (ilustrativo solo en contenidoMd, ADR-11).
 */
export const mod15: CourseModule = {
  id: "mod15",
  numero: 15,
  titulo: "Subgraphs: composición de grafos",
  objetivo:
    "Usar un grafo compilado como nodo de otro; compartir claves de estado " +
    "padre/hijo; streamear con subgraphs=True distinguiendo por ns.",
  enriquecido: true,
  secciones: {
    explicaSimple: {
      contenidoMd: `## Una pieza de LEGO hecha de piezas de LEGO más pequeñas

Hasta ahora cada nodo de un grafo era una función simple. Pero un nodo también puede
ser **otro grafo entero, ya compilado**. Es como construir una pieza de LEGO grande
ensamblando piezas más pequeñas ya montadas: el grafo "padre" no necesita saber CÓMO
funciona por dentro el grafo "hijo" (el subgraph) — solo lo trata como una caja negra
que recibe un estado y devuelve un estado.

Esto se llama **subgraph-como-nodo**: compilas un grafo normal (con sus propios nodos y
edges) y luego lo registras con \`add_node("nombre", subgrafo_compilado)\` en el grafo
padre, exactamente igual que registrarías una función.

## El requisito: compartir al menos una clave de estado

Para que el subgraph pueda "hablar" con el padre, ambos estados deben compartir al
menos una clave (por ejemplo, \`foo\`). El subgraph lee y escribe esa clave compartida;
el resto de su estado interno (claves privadas del subgraph) es invisible para el
padre.`,
      consignaExplicacion:
        "Explícale a alguien que no programa, con la metáfora de 'una pieza de LEGO " +
        "hecha de piezas de LEGO más pequeñas ya montadas', qué es un subgraph-como-nodo " +
        "y por qué necesita compartir al menos una clave de estado con el grafo padre.",
    },
    detectaGaps: {
      contenidoMd: "Comprueba si entiendes bien la composición padre/hijo.",
      quiz: {
        id: "mod15-quiz1",
        titulo: "¿Cómo se compone un subgraph?",
        preguntas: [
          {
            id: "mod15-quiz1-p1",
            kind: "single",
            enunciadoMd: "¿Cómo se registra un subgraph como nodo del grafo padre?",
            opciones: [
              "`builder.add_node(\"nombre\", subgraph_compilado)`, igual que con una función",
              "Con una API especial `add_subgraph(...)`",
              "Copiando manualmente los nodos del subgraph dentro del padre",
              "No es posible: un grafo compilado no puede usarse como nodo",
            ],
            correcta: 0,
            explicacionMd:
              "`add_node` acepta un grafo YA COMPILADO exactamente igual que aceptaría una " +
              "función: no hay una API especial para subgraphs.",
          },
          {
            id: "mod15-quiz1-p2",
            kind: "boolean",
            enunciadoMd:
              "Para que el grafo padre y el subgraph se comuniquen, sus esquemas de " +
              "estado deben compartir AL MENOS una clave.",
            correcta: true,
            explicacionMd:
              "Correcto: sin al menos una clave compartida, el subgraph no podría leer " +
              "ni aportar nada visible al padre.",
          },
          {
            id: "mod15-quiz1-p3",
            kind: "multi",
            enunciadoMd: "¿Qué es cierto sobre las claves PRIVADAS del subgraph (no compartidas con el padre)?",
            opciones: [
              "No son visibles en el estado que ve el grafo padre",
              "Se usan libremente dentro del subgraph, como cualquier estado interno",
              "Deben declararse también en el estado del padre",
              "Rompen la composición si el padre no las conoce",
            ],
            correctas: [0, 1],
            explicacionMd:
              "El padre solo ve las claves compartidas; las privadas del subgraph son " +
              "invisibles fuera de él, y eso es justamente la ventaja de encapsular.",
          },
          {
            id: "mod15-quiz1-p4",
            kind: "output",
            enunciadoMd:
              "`node_1` (padre) devuelve `{'foo': 'hi! ' + state['foo']}`. Luego el subgraph " +
              "(registrado como `node_2`) hace `bar = 'bar'` y `foo = foo + bar`. Invocando " +
              "`graph.invoke({'foo': 'foo'})`, ¿qué vale `graph_output['foo']` al final?",
            codigo: "graph.invoke({'foo': 'foo'})\n# ¿result['foo']?",
            opciones: [
              "`'hi! foobar'`",
              "`'foobar'`",
              "`'hi! foo'`",
              "Lanza un error porque el subgraph no puede leer 'foo' del padre",
            ],
            correcta: 0,
            explicacionMd:
              "`node_1` produce `'hi! foo'`; el subgraph lo recibe como su `foo`, añade " +
              "`'bar'` y devuelve `'hi! foo' + 'bar'` = `'hi! foobar'`.",
          },
          {
            id: "mod15-quiz1-p5",
            kind: "single",
            enunciadoMd:
              "Conceptualmente (sin necesidad de ejecutarlo): al streamear con " +
              "`graph.stream(..., subgraphs=True)`, ¿para qué sirve el campo `ns` de cada " +
              "chunk?",
            opciones: [
              "Identifica de qué namespace (grafo raíz o qué subgraph) viene ese evento",
              "Indica el nombre de la variable de estado que cambió",
              "Es el número de superstep",
              "Sustituye a `stream_mode`",
            ],
            correcta: 0,
            explicacionMd:
              "`ns` (namespace) permite distinguir si un evento del stream viene del grafo " +
              "raíz o de un subgraph concreto — útil para UIs que muestran progreso " +
              "anidado. Esta pregunta se evalúa conceptualmente: no forma parte de los " +
              "retos ejecutables del módulo.",
          },
        ],
      },
    },
    llenaGaps: {
      contenidoMd: `## Subgraph-como-nodo (grounding base §6) — código EJECUTABLE

\`\`\`python
from typing_extensions import TypedDict
from langgraph.graph import START, StateGraph

class SubgraphState(TypedDict):
    foo: str  # clave COMPARTIDA con el padre
    bar: str  # clave PRIVADA del subgraph

def subgraph_node_1(state: SubgraphState):
    return {"bar": "bar"}

def subgraph_node_2(state: SubgraphState):
    return {"foo": state["foo"] + state["bar"]}

subgraph_builder = StateGraph(SubgraphState)
subgraph_builder.add_node("subgraph_node_1", subgraph_node_1)
subgraph_builder.add_node("subgraph_node_2", subgraph_node_2)
subgraph_builder.add_edge(START, "subgraph_node_1")
subgraph_builder.add_edge("subgraph_node_1", "subgraph_node_2")
subgraph = subgraph_builder.compile()

class ParentState(TypedDict):
    foo: str

def node_1(state: ParentState):
    return {"foo": "hi! " + state["foo"]}

builder = StateGraph(ParentState)
builder.add_node("node_1", node_1)
builder.add_node("node_2", subgraph)   # subgraph COMPILADO usado como nodo
builder.add_edge(START, "node_1")
builder.add_edge("node_1", "node_2")
graph = builder.compile()

graph.invoke({"foo": "foo"})
# {"foo": "hi! foobar"}
\`\`\`

**Cómo leerlo:** \`node_2\` no es una función: es \`subgraph\`, un grafo ya compilado. El
padre lo invoca como cualquier nodo, pasándole su estado; el subgraph solo ve/escribe
la clave compartida \`foo\` (y usa \`bar\` internamente, invisible para el padre).

## SOLO ILUSTRATIVO — streaming con subgraphs=True y el prefijo ns

> **Este bloque NO es ejecutable en el entorno del curso**: el shim, si
> recibe \`subgraphs=True\`, lanza un error claro en español. Se muestra aquí SOLO como
> referencia de formato — cópialo si quieres probarlo con LangGraph real fuera del
> curso.

\`\`\`python
for chunk in graph.stream(
    {"foo": "foo"},
    stream_mode="updates",
    subgraphs=True,
    version="v2",
):
    # chunk trae (ns, data): ns identifica si el evento viene del grafo raíz
    # (ns == ()) o de un subgraph concreto (ns == ("node_2:<id>",), por ejemplo).
    ns, data = chunk
    print(f"namespace={ns} data={data}")
\`\`\`

**Errores comunes:**
- Olvidar que el subgraph DEBE compartir al menos una clave con el padre: sin eso, el
  padre nunca ve nada de lo que hace el subgraph.
- Intentar ejecutar \`subgraphs=True\` en el runner del curso: no es superficie
  ejecutable del shim (usa el bloque ilustrativo solo como referencia).
- Confundir "estado privado del subgraph" con "estado global": las claves privadas del
  subgraph solo existen dentro de él.`,
      retos: [
        {
          id: "mod15-reto1",
          titulo: "Componer un subgraph como nodo del grafo padre",
          enunciadoMd:
            "Completa `subgraph_node_2` para que el subgraph combine `foo` (compartido " +
            "con el padre) con `bar` (privado), y regístralo como nodo del grafo padre.",
          starterCode: `from typing_extensions import TypedDict
from langgraph.graph import START, StateGraph

class SubgraphState(TypedDict):
    foo: str
    bar: str

def subgraph_node_1(state: SubgraphState):
    return {"bar": "bar"}

def subgraph_node_2(state: SubgraphState):
    # TODO — devuelve {"foo": state["foo"] + state["bar"]}
    ...

subgraph_builder = StateGraph(SubgraphState)
subgraph_builder.add_node("subgraph_node_1", subgraph_node_1)
subgraph_builder.add_node("subgraph_node_2", subgraph_node_2)
subgraph_builder.add_edge(START, "subgraph_node_1")
subgraph_builder.add_edge("subgraph_node_1", "subgraph_node_2")
subgraph = subgraph_builder.compile()

class ParentState(TypedDict):
    foo: str

def node_1(state: ParentState):
    return {"foo": "hi! " + state["foo"]}

builder = StateGraph(ParentState)
builder.add_node("node_1", node_1)
# TODO — registra el subgraph compilado como "node_2" con builder.add_node
builder.add_edge(START, "node_1")
builder.add_edge("node_1", "node_2")
graph = builder.compile()
`,
          solutionCode: `from typing_extensions import TypedDict
from langgraph.graph import START, StateGraph

class SubgraphState(TypedDict):
    foo: str
    bar: str

def subgraph_node_1(state: SubgraphState):
    return {"bar": "bar"}

def subgraph_node_2(state: SubgraphState):
    return {"foo": state["foo"] + state["bar"]}

subgraph_builder = StateGraph(SubgraphState)
subgraph_builder.add_node("subgraph_node_1", subgraph_node_1)
subgraph_builder.add_node("subgraph_node_2", subgraph_node_2)
subgraph_builder.add_edge(START, "subgraph_node_1")
subgraph_builder.add_edge("subgraph_node_1", "subgraph_node_2")
subgraph = subgraph_builder.compile()

class ParentState(TypedDict):
    foo: str

def node_1(state: ParentState):
    return {"foo": "hi! " + state["foo"]}

builder = StateGraph(ParentState)
builder.add_node("node_1", node_1)
builder.add_node("node_2", subgraph)
builder.add_edge(START, "node_1")
builder.add_edge("node_1", "node_2")
graph = builder.compile()
`,
          validationCode: `from course_harness import check_eq

result = graph.invoke({"foo": "foo"})
check_eq(
    "subgraph_composes_with_parent",
    "el subgraph combina la clave compartida foo (del padre) con la privada bar",
    result["foo"],
    "hi! foobar",
)
`,
        },
      ],
      pasos: [
        {
          id: "mod15-paso1",
          titulo: "Un subgraph de un solo nodo",
          explicacionMd:
            "Antes de componer padre + hijo, practica lo mínimo: un grafo de UN nodo, " +
            "compilado por separado, registrado como nodo de otro grafo.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod15-paso1-reto",
              titulo: "Registra el subgraph como nodo",
              enunciadoMd:
                "Completa `builder.add_node(\"saludo\", subgraph)` para registrar el " +
                "subgraph YA COMPILADO como nodo del grafo padre.",
              starterCode: `from typing_extensions import TypedDict
from langgraph.graph import START, StateGraph

class State(TypedDict):
    texto: str

def anadir_hola(state: State):
    return {"texto": "hola " + state["texto"]}

sub_builder = StateGraph(State)
sub_builder.add_node("anadir_hola", anadir_hola)
sub_builder.add_edge(START, "anadir_hola")
subgraph = sub_builder.compile()

builder = StateGraph(State)
# TODO: registra el subgraph compilado como nodo "saludo" con builder.add_node
builder.add_edge(START, "saludo")
graph = builder.compile()
`,
              solutionCode: `from typing_extensions import TypedDict
from langgraph.graph import START, StateGraph

class State(TypedDict):
    texto: str

def anadir_hola(state: State):
    return {"texto": "hola " + state["texto"]}

sub_builder = StateGraph(State)
sub_builder.add_node("anadir_hola", anadir_hola)
sub_builder.add_edge(START, "anadir_hola")
subgraph = sub_builder.compile()

builder = StateGraph(State)
builder.add_node("saludo", subgraph)
builder.add_edge(START, "saludo")
graph = builder.compile()
`,
              validationCode: `from course_harness import check_eq

result = graph.invoke({"texto": "mundo"})
check_eq("paso1_subgraph_como_nodo", "el subgraph compilado corre como nodo del padre", result["texto"], "hola mundo")
`,
            },
          },
        },
        {
          id: "mod15-paso2",
          titulo: "Lee la composición padre/hijo completa",
          explicacionMd:
            "Lee el ejemplo completo: el subgraph tiene una clave compartida (`foo`) y " +
            "una privada (`bar`), y se registra como nodo del padre.",
          accion: {
            kind: "lectura",
            bloqueMd: `\`\`\`python
subgraph_builder = StateGraph(SubgraphState)
subgraph_builder.add_node("subgraph_node_1", subgraph_node_1)
subgraph_builder.add_node("subgraph_node_2", subgraph_node_2)
subgraph_builder.add_edge(START, "subgraph_node_1")
subgraph_builder.add_edge("subgraph_node_1", "subgraph_node_2")
subgraph = subgraph_builder.compile()

builder = StateGraph(ParentState)
builder.add_node("node_1", node_1)
builder.add_node("node_2", subgraph)
\`\`\`
Este fragmento ya está completo: solo léelo, no hace falta ejecutarlo ni completar nada todavía.`,
          },
        },
        {
          id: "mod15-paso3",
          titulo: "Un subgraph de dos nodos con clave privada",
          explicacionMd:
            "Practica un subgraph de DOS nodos internos que combina la clave compartida " +
            "con una privada, antes de registrarlo en el padre.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod15-paso3-reto",
              titulo: "Completa el subgraph de dos nodos",
              enunciadoMd:
                "Completa `paso_2` para que combine `contador` (compartido) con `extra` " +
                "(privado), y registra el subgraph en el padre.",
              starterCode: `from typing_extensions import TypedDict
from langgraph.graph import START, StateGraph

class SubState(TypedDict):
    contador: int
    extra: int

def paso_1(state: SubState):
    return {"extra": 10}

def paso_2(state: SubState):
    # TODO: devuelve {"contador": state["contador"] + state["extra"]}
    ...

sub_builder = StateGraph(SubState)
sub_builder.add_node("paso_1", paso_1)
sub_builder.add_node("paso_2", paso_2)
sub_builder.add_edge(START, "paso_1")
sub_builder.add_edge("paso_1", "paso_2")
subgraph = sub_builder.compile()

class ParentState(TypedDict):
    contador: int

builder = StateGraph(ParentState)
# TODO: registra el subgraph compilado como nodo "sub" con builder.add_node
builder.add_edge(START, "sub")
graph = builder.compile()
`,
              solutionCode: `from typing_extensions import TypedDict
from langgraph.graph import START, StateGraph

class SubState(TypedDict):
    contador: int
    extra: int

def paso_1(state: SubState):
    return {"extra": 10}

def paso_2(state: SubState):
    return {"contador": state["contador"] + state["extra"]}

sub_builder = StateGraph(SubState)
sub_builder.add_node("paso_1", paso_1)
sub_builder.add_node("paso_2", paso_2)
sub_builder.add_edge(START, "paso_1")
sub_builder.add_edge("paso_1", "paso_2")
subgraph = sub_builder.compile()

class ParentState(TypedDict):
    contador: int

builder = StateGraph(ParentState)
builder.add_node("sub", subgraph)
builder.add_edge(START, "sub")
graph = builder.compile()
`,
              validationCode: `from course_harness import check_eq

result = graph.invoke({"contador": 5})
check_eq("paso3_subgraph_combina_privada", "el subgraph suma su clave privada extra a contador", result["contador"], 15)
`,
            },
          },
        },
        {
          id: "mod15-paso4",
          titulo: "Predicción: ¿qué ve el padre de las claves privadas?",
          explicacionMd:
            "Antes de la síntesis, predice si el padre puede ver una clave privada del " +
            "subgraph que nunca declaró en su propio esquema de estado.",
          accion: {
            kind: "quiz",
            quiz: {
              id: "mod15-paso4-quiz",
              titulo: "¿Ve el padre las claves privadas del subgraph?",
              preguntas: [
                {
                  id: "mod15-paso4-quiz-p1",
                  kind: "boolean",
                  enunciadoMd:
                    "El subgraph usa una clave `extra` que NO existe en el esquema de " +
                    "estado del grafo padre. ¿El resultado final que ve el padre incluye " +
                    "`extra`?",
                  correcta: false,
                  explicacionMd:
                    "No: las claves privadas del subgraph son invisibles fuera de él; solo " +
                    "la(s) clave(s) COMPARTIDA(s) con el padre se propagan.",
                },
              ],
            },
          },
        },
        {
          id: "mod15-paso5",
          titulo: "Un paso previo del padre, antes de invocar el subgraph",
          explicacionMd:
            "Combina lo practicado: un nodo del padre corre ANTES del subgraph, y luego " +
            "el subgraph aporta su propia clave compartida acumulada con reducer.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod15-paso5-reto",
              titulo: "Compón un paso previo con el subgraph",
              enunciadoMd:
                "Completa `sub_paso_b` para que el subgraph acumule su `log` con reducer, " +
                "y registra el subgraph tras el nodo `preparar` en el padre.",
              starterCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph import START, StateGraph

class SubState(TypedDict):
    log: Annotated[list[str], operator.add]

def sub_paso_a(state: SubState):
    return {"log": ["inicio"]}

def sub_paso_b(state: SubState):
    # TODO: devuelve {"log": ["fin"]}
    ...

sub_builder = StateGraph(SubState)
sub_builder.add_node("sub_paso_a", sub_paso_a)
sub_builder.add_node("sub_paso_b", sub_paso_b)
sub_builder.add_edge(START, "sub_paso_a")
sub_builder.add_edge("sub_paso_a", "sub_paso_b")
subgraph = sub_builder.compile()

class ParentState(TypedDict):
    etiqueta: str
    log: Annotated[list[str], operator.add]

def preparar(state: ParentState):
    # TODO: devuelve {"etiqueta": "preparado"}
    ...

builder = StateGraph(ParentState)
builder.add_node("preparar", preparar)
# TODO: registra el subgraph compilado como nodo "sub" con builder.add_node
builder.add_edge(START, "preparar")
builder.add_edge("preparar", "sub")
graph = builder.compile()
`,
              solutionCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph import START, StateGraph

class SubState(TypedDict):
    log: Annotated[list[str], operator.add]

def sub_paso_a(state: SubState):
    return {"log": ["inicio"]}

def sub_paso_b(state: SubState):
    return {"log": ["fin"]}

sub_builder = StateGraph(SubState)
sub_builder.add_node("sub_paso_a", sub_paso_a)
sub_builder.add_node("sub_paso_b", sub_paso_b)
sub_builder.add_edge(START, "sub_paso_a")
sub_builder.add_edge("sub_paso_a", "sub_paso_b")
subgraph = sub_builder.compile()

class ParentState(TypedDict):
    etiqueta: str
    log: Annotated[list[str], operator.add]

def preparar(state: ParentState):
    return {"etiqueta": "preparado"}

builder = StateGraph(ParentState)
builder.add_node("preparar", preparar)
builder.add_node("sub", subgraph)
builder.add_edge(START, "preparar")
builder.add_edge("preparar", "sub")
graph = builder.compile()
`,
              validationCode: `from course_harness import check_eq

result = graph.invoke({"etiqueta": "", "log": []})
check_eq("paso5_preparar_antes_del_subgraph", "preparar corre antes del subgraph", result["etiqueta"], "preparado")
check_eq("paso5_subgraph_acumula_log", "el subgraph acumula su log con reducer explícito", result["log"], ["inicio", "fin"])
`,
            },
          },
        },
      ],
    },
    refinaSimplifica: {
      resumenBullets: [
        "Un grafo compilado se puede usar como nodo de otro grafo (`add_node(\"nombre\", subgrafo_compilado)`).",
        "El subgraph y el padre deben compartir AL MENOS una clave de estado para comunicarse.",
        "Las claves privadas del subgraph son invisibles fuera de él.",
        "El padre trata al subgraph como una caja negra: no necesita conocer sus nodos internos.",
        "`graph.stream(..., subgraphs=True)`/el prefijo `ns` son SOLO contenido ilustrativo: no ejecutables en el curso.",
        "Los retos ejecutables de subgraphs usan `invoke`/`stream` normales sobre el grafo padre, nunca `subgraphs=True`.",
      ],
      sintesis: {
        kind: "code",
        reto: {
          id: "mod15-reto-sintesis",
          titulo: "Síntesis: subgraph con reducer compartido",
          enunciadoMd:
            "Construye un subgraph de DOS pasos que acumula la clave compartida `log` " +
            "(reducer `operator.add`) internamente, y compón el grafo padre con un nodo " +
            "previo que escribe en OTRA clave (`greeting`), antes de invocar el subgraph.",
          starterCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph import START, StateGraph

class SubState(TypedDict):
    log: Annotated[list[str], operator.add]

def sub_step_a(state: SubState):
    return {"log": ["a"]}

def sub_step_b(state: SubState):
    # TODO — devuelve {"log": ["b"]}
    ...

sub_builder = StateGraph(SubState)
sub_builder.add_node("sub_step_a", sub_step_a)
sub_builder.add_node("sub_step_b", sub_step_b)
sub_builder.add_edge(START, "sub_step_a")
sub_builder.add_edge("sub_step_a", "sub_step_b")
subgraph = sub_builder.compile()

class ParentState(TypedDict):
    greeting: str
    log: Annotated[list[str], operator.add]

def parent_step(state: ParentState):
    return {"greeting": "hola"}

builder = StateGraph(ParentState)
builder.add_node("parent_step", parent_step)
builder.add_node("sub_node", subgraph)
builder.add_edge(START, "parent_step")
builder.add_edge("parent_step", "sub_node")
graph = builder.compile()
`,
          solutionCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph import START, StateGraph

class SubState(TypedDict):
    log: Annotated[list[str], operator.add]

def sub_step_a(state: SubState):
    return {"log": ["a"]}

def sub_step_b(state: SubState):
    return {"log": ["b"]}

sub_builder = StateGraph(SubState)
sub_builder.add_node("sub_step_a", sub_step_a)
sub_builder.add_node("sub_step_b", sub_step_b)
sub_builder.add_edge(START, "sub_step_a")
sub_builder.add_edge("sub_step_a", "sub_step_b")
subgraph = sub_builder.compile()

class ParentState(TypedDict):
    greeting: str
    log: Annotated[list[str], operator.add]

def parent_step(state: ParentState):
    return {"greeting": "hola"}

builder = StateGraph(ParentState)
builder.add_node("parent_step", parent_step)
builder.add_node("sub_node", subgraph)
builder.add_edge(START, "parent_step")
builder.add_edge("parent_step", "sub_node")
graph = builder.compile()
`,
          validationCode: `from course_harness import check_eq

result = graph.invoke({"greeting": "", "log": []})
check_eq(
    "subgraph_internal_reducer_accumulates",
    "el subgraph acumula su propio log internamente (sub_step_a + sub_step_b), con reducer explícito",
    result["log"],
    ["a", "b"],
)
check_eq(
    "parent_key_untouched_by_subgraph",
    "la clave greeting, privada del padre, no la toca el subgraph",
    result["greeting"],
    "hola",
)
`,
        },
      },
    },
  },
  usaLaIa: [
    {
      id: "mod15-ia1",
      titulo: "Usa la IA para decidir qué extraer a un subgraph",
      promptsSugeridos: [
        "Tengo este grafo con varios nodos relacionados entre sí (pego el código). " +
          "¿Qué parte tendría sentido extraer como subgraph-como-nodo, y qué clave(s) " +
          "debería compartir con el padre?",
        "Explícame con un ejemplo distinto al del curso por qué las claves PRIVADAS de " +
          "un subgraph no son visibles para el grafo padre.",
      ],
      comoVerificar: [
        "¿La respuesta usa `add_node(\"nombre\", subgrafo_compilado)` — la MISMA API que " +
          "para registrar una función, sin inventar un `add_subgraph`?",
        "¿Al pegar el código sugerido, el mini-ejercicio pasa comprobando que el padre " +
          "solo ve la(s) clave(s) compartida(s)?",
        "¿La IA aclara que el subgraph debe compilarse POR SEPARADO antes de registrarse " +
          "en el padre?",
      ],
      comoIterar:
        "Si el padre no ve el cambio esperado, imprime el resultado completo del " +
        "`invoke` y pregunta específicamente qué clave falta compartir entre los dos " +
        "esquemas de estado, en vez de pedir el grafo reescrito entero.",
      queNoDelegar: [
        "No le pidas que 'reorganice todo el proyecto en subgraphs': completa tú la " +
          "línea de `add_node` que registra el subgraph una vez que entiendas el patrón.",
        "No copies una respuesta que use `graph.stream(..., subgraphs=True)` en un reto " +
          "ejecutable: el shim del curso no lo soporta (ADR-11); es SOLO ilustrativo.",
      ],
    },
  ],
  tutorialLocal: {
    introMd:
      "Este tramo refactoriza el proyecto SIN cambiar su comportamiento: la parte de " +
      "\"preparar el saludo\" (`contar_visitas` + `construir_saludo`) se compone ahora " +
      "como un subgraph-como-nodo, en vez de dos nodos sueltos en el grafo principal.",
    setup: [
      {
        titulo: "Reactiva el entorno virtual (si cerraste la terminal)",
        descripcionMd: "No hay dependencias nuevas en este módulo.",
        powershell: ".venv\\Scripts\\Activate.ps1",
        bash: "source .venv/bin/activate",
      },
      {
        titulo: "Ejecuta el grafo tras el refactor a subgraph",
        descripcionMd: "",
        powershell: "python src\\main.py",
        bash: "python src/main.py",
      },
    ],
    codigo: [
      {
        archivo: "src/graph.py",
        descripcionMd:
          "`construir_saludo` se compila aparte como `preparar_saludo` (un subgraph de " +
          "un solo nodo) y se registra como UN nodo del grafo principal, junto a " +
          "`contar_visitas`. El comportamiento observable no cambia.",
        codigo: `# ... contar_visitas, agradecer, route_agradecer, despedir, conversar, should_continue, tools
# (sin cambios respecto del módulo 12) ...


def construir_saludo(state: OverallState) -> OverallState:
    saludo = "Hola, " + state["nombre"]
    return {"saludo": saludo, "historial": [saludo], "vueltas": 0}


saludo_builder = StateGraph(OverallState, input_schema=InputState, output_schema=OverallState)
saludo_builder.add_node("construir_saludo", construir_saludo)
saludo_builder.add_edge(START, "construir_saludo")
preparar_saludo = saludo_builder.compile()


builder = StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)
builder.add_node("contar_visitas", contar_visitas)
builder.add_node("preparar_saludo", preparar_saludo)
# ... resto de nodos y edges (agradecer, despedir, conversar, tools) sin cambios respecto del módulo 12 ...
builder.add_edge(START, "contar_visitas")
builder.add_edge("contar_visitas", "preparar_saludo")
builder.add_edge("preparar_saludo", "agradecer")

graph = builder.compile(...)  # mismos argumentos (checkpointer + store) que el módulo 12
`,
      },
      {
        archivo: "src/main.py (referencia, NO ejecutable en el curso)",
        descripcionMd:
          "SOLO ILUSTRATIVO (ADR-11): así se vería el streaming namespaced con " +
          "`subgraphs=True` sobre el grafo del proyecto, ya con `preparar_saludo` como " +
          "subgraph. El shim del curso NO lo soporta (lanza un error claro); esto es " +
          "referencia para fuera del entorno del curso.",
        codigo: `for chunk in graph.stream(
    {"nombre": "Ana"},
    stream_mode="updates",
    subgraphs=True,
    version="v2",
):
    ns, data = chunk
    print(f"namespace={ns} data={data}")
`,
      },
    ],
    salidaEsperada: "Hasta luego, Ana\n(el resto del comportamiento no cambia: el refactor es interno)",
    spine: {
      crea: [],
      modifica: ["src/graph.py"],
    },
  },
};
