import type { CourseModule } from "../types";

/**
 * Módulo 09 — Human-in-the-loop: interrupt y Command.
 * Contenido completo (slice S14). Código: API AVANZADA del grounding-adv §1 y
 * C-RUNNER §tabla "Avanzado" (interrupt, Command resume/goto/update).
 * Regla M3.1 (C-CONTENT regla 5): la acumulación del ejemplo canónico depende
 * del reducer explícito `Annotated[list[str], operator.add]`, NO de interrupt/resume.
 * §12 (ADR-15, SE3): formato enriquecido — pasos guiados, "Usa la IA" y
 * tutorial local (continúa el project spine desde mod08). Shim avanzado (S12).
 */
export const mod09: CourseModule = {
  id: "mod09",
  numero: 9,
  titulo: "Human-in-the-loop: interrupt y Command",
  objetivo:
    "Pausar un grafo con interrupt(...) dentro de un nodo y reanudarlo con " +
    "Command(resume=...).",
  enriquecido: true,
  secciones: {
    explicaSimple: {
      contenidoMd: `## Un formulario que espera tu firma

Imagina un trámite administrativo que llega hasta el paso "falta tu firma" y se
**detiene ahí, indefinidamente**, sin perder ni un solo dato de lo que ya se rellenó.
Cuando por fin firmas, el trámite **continúa exactamente desde donde se quedó**, usando
tu firma como el dato que faltaba.

Eso es \`interrupt(...)\` en LangGraph: dentro de un nodo, pausa el grafo entero y expone
un valor (la "pregunta sin responder") en el resultado. El grafo se queda esperando. Cuando
decides responder, usas \`Command(resume=<tu respuesta>)\` para reanudarlo: el nodo que
se había pausado se **vuelve a ejecutar desde el principio**, pero esta vez
\`interrupt(...)\` no vuelve a pausar — directamente devuelve tu respuesta, y el nodo
sigue su curso con ese valor.

## Requisito: necesitas una "carpeta" donde guardar el trámite a medias

Para que el grafo pueda quedarse "a medias" y luego continuar, necesita un
**checkpointer** y un **\`thread_id\`** (módulo 07): sin ellos no hay dónde guardar el
trámite pausado, así que \`interrupt\` sin esos dos requisitos lanza un error claro en vez
de fallar en silencio.`,
      consignaExplicacion:
        "Explícale a alguien que no programa, con la metáfora del 'trámite que espera tu " +
        "firma y luego continúa exactamente donde se quedó', qué hacen `interrupt(...)` y " +
        "`Command(resume=...)` y por qué hace falta un checkpointer para que funcione.",
    },
    detectaGaps: {
      contenidoMd:
        "Antes de ver el código, comprueba si predices bien qué pasa al pausar y " +
        "reanudar un grafo.",
      quiz: {
        id: "mod09-quiz1",
        titulo: "¿Qué hace interrupt/Command?",
        preguntas: [
          {
            id: "mod09-quiz1-p1",
            kind: "single",
            enunciadoMd:
              "Un nodo llama a `interrupt(\"¿Cuál es tu nombre?\")`. ¿Qué aparece en el " +
              "resultado del `invoke()` que ejecutó ese nodo?",
            opciones: [
              "La clave `\"__interrupt__\"` con una lista de objetos cuyo `.value` es el payload pasado a interrupt()",
              "Una excepción sin capturar que rompe el programa",
              "El grafo sigue ejecutándose ignorando el interrupt",
              "El valor `None`",
            ],
            correcta: 0,
            explicacionMd:
              "El `invoke()` que topa con un `interrupt()` sin resume disponible NO lanza: " +
              "devuelve normalmente, con `\"__interrupt__\"` en el resultado.",
          },
          {
            id: "mod09-quiz1-p2",
            kind: "boolean",
            enunciadoMd:
              "Al reanudar con `Command(resume=\"Alice\")`, el nodo que se había pausado se " +
              "re-ejecuta DESDE EL PRINCIPIO (no continúa a mitad de función).",
            correcta: true,
            explicacionMd:
              "Correcto: la re-ejecución completa del nodo es la semántica real de LangGraph. " +
              "Cualquier efecto ANTES del `interrupt()` dentro de ese nodo se repite.",
          },
          {
            id: "mod09-quiz1-p3",
            kind: "multi",
            enunciadoMd: "¿Qué requiere `interrupt(...)` para funcionar sin lanzar un error?",
            opciones: [
              "Un `checkpointer` compilado con el grafo",
              "Un `thread_id` en el `config`",
              "Que el estado no tenga ningún reducer",
              "Nada de lo anterior: funciona siempre",
            ],
            correctas: [0, 1],
            explicacionMd:
              "Sin checkpointer + thread_id no hay dónde guardar el punto de pausa: el shim " +
              "(igual que LangGraph real) lanza un error claro en vez de fallar en silencio.",
          },
          {
            id: "mod09-quiz1-p4",
            kind: "output",
            enunciadoMd:
              "State declara `value: Annotated[list[str], operator.add]`. `ask_human` hace " +
              "`answer = interrupt(...)` y devuelve `{'value': [f'Hello, {answer}!']}`; " +
              "`final_step` devuelve `{'value': ['Done']}` y se ejecuta después. Tras pausar " +
              "y reanudar con `Command(resume='Alice')`, ¿qué vale `value` en el resultado final?",
            codigo:
              'graph.invoke({"value": []}, config)\nresult = graph.invoke(Command(resume="Alice"), config)\n# ¿result["value"]?',
            opciones: [
              "`['Hello, Alice!', 'Done']`",
              "`['Done']`",
              "`['Hello, Alice!']`",
              "Lanza un error porque no se puede reanudar dos veces",
            ],
            correcta: 0,
            explicacionMd:
              "El reducer `operator.add` acumula la contribución de `ask_human` (tras el " +
              "resume) y la de `final_step`. Sin ese `Annotated`, el resultado sería solo " +
              "`['Done']` (sobrescritura) — la acumulación viene del reducer explícito " +
              "(ver módulo 03), no de interrupt/resume.",
          },
          {
            id: "mod09-quiz1-p5",
            kind: "single",
            enunciadoMd:
              "¿Qué hace `Command(goto=\"nodo_x\", update={...})` cuando lo devuelve un nodo?",
            opciones: [
              "Aplica `update` al estado (con reducers) y enruta a `nodo_x`, ignorando los edges declarados",
              "Solo actualiza el estado, sin cambiar el routing",
              "Solo cambia el routing, ignorando `update`",
              "Pausa el grafo como `interrupt`",
            ],
            correcta: 0,
            explicacionMd:
              "`Command(goto=, update=)` combina actualización de estado + routing explícito, " +
              "ignorando las aristas (`add_edge`) que hubiera declaradas para ese nodo.",
          },
        ],
      },
    },
    llenaGaps: {
      contenidoMd: `## interrupt + Command(resume) — el ejemplo canónico

\`\`\`python
import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

class State(TypedDict):
    # Reducer append-only EXPLÍCITO: sin él, final_step sobrescribiría y el
    # resultado sería solo ["Done"] (ver módulo 03).
    value: Annotated[list[str], operator.add]

def ask_human(state: State):
    answer = interrupt("What is your name?")   # pausa aquí la PRIMERA vez
    return {"value": [f"Hello, {answer}!"]}

def final_step(state: State):
    return {"value": ["Done"]}

graph = (
    StateGraph(State)
    .add_node("ask_human", ask_human)
    .add_node("final_step", final_step)
    .add_edge(START, "ask_human")
    .add_edge("ask_human", "final_step")
    .compile(checkpointer=InMemorySaver())
)

config = {"configurable": {"thread_id": "1"}}
first = graph.invoke({"value": []}, config)
# first == {"value": [], "__interrupt__": [Interrupt(value="What is your name?")]}

second = graph.invoke(Command(resume="Alice"), config)
# second == {"value": ["Hello, Alice!", "Done"]}
\`\`\`

**Cómo leerlo:** la primera llamada corre \`ask_human\`, que llama a \`interrupt(...)\` y
pausa: el resultado trae \`"__interrupt__"\` con el payload que le pasaste. La segunda
llamada, con \`Command(resume="Alice")\` y el MISMO \`config\` (mismo \`thread_id\`),
re-ejecuta \`ask_human\` desde el principio — esta vez \`interrupt(...)\` devuelve
\`"Alice"\` en vez de pausar — y el grafo continúa hasta \`final_step\`.

## Command(goto=, update=): routing explícito

\`\`\`python
def start_node(state: State):
    return Command(goto="end_node", update={"log": ["from-start"]})
\`\`\`

Un nodo puede devolver un \`Command\` en vez de un dict: aplica \`update\` (con reducers,
como cualquier update normal) y enruta al nodo indicado en \`goto\`, **ignorando** los
\`add_edge\` que hubiera declarado ese nodo. \`goto=END\` termina el grafo. Este patrón es
la base de los handoffs multi-agente (módulo 14): un agente decide a mano a qué otro
agente pasar el control.

**Errores comunes:**
- Llamar a \`interrupt\`/\`Command(resume=...)\` sin \`checkpointer\`+\`thread_id\`: el shim
  lanza un error claro citando ambos requisitos.
- Olvidar que el nodo se RE-EJECUTA completo al reanudar: si antes del \`interrupt()\` el
  nodo hacía algo con efectos (p. ej. incrementar un contador aparte), ese efecto se
  repite en cada reanudación.
- Esperar que la acumulación entre \`ask_human\` y \`final_step\` "venga gratis" de
  interrupt/resume: viene del reducer \`operator.add\` explícito del \`State\`, ni más
  ni menos (ver módulo 03).`,
      retos: [
        {
          id: "mod09-reto1",
          titulo: "Pausar con interrupt y reanudar con Command(resume=...)",
          enunciadoMd:
            "Reproduce el ejemplo canónico: `ask_human` pide el nombre con `interrupt(...)` " +
            "y `final_step` añade `\"Done\"`. Completa el cuerpo de `ask_human` y la " +
            "declaración del reducer de `value` para que, tras reanudar con " +
            "`Command(resume=\"Alice\")`, el resultado sea " +
            "`{\"value\": [\"Hello, Alice!\", \"Done\"]}`.",
          starterCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

class State(TypedDict):
    # TODO — declara 'value' como list[str] con reducer operator.add
    value: list[str]

def ask_human(state: State):
    # TODO — pausa con interrupt("What is your name?") y devuelve
    # {"value": [f"Hello, {answer}!"]} usando la respuesta del resume
    ...

def final_step(state: State):
    return {"value": ["Done"]}

graph = (
    StateGraph(State)
    .add_node("ask_human", ask_human)
    .add_node("final_step", final_step)
    .add_edge(START, "ask_human")
    .add_edge("ask_human", "final_step")
    .compile(checkpointer=InMemorySaver())
)
`,
          solutionCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

class State(TypedDict):
    value: Annotated[list[str], operator.add]

def ask_human(state: State):
    answer = interrupt("What is your name?")
    return {"value": [f"Hello, {answer}!"]}

def final_step(state: State):
    return {"value": ["Done"]}

graph = (
    StateGraph(State)
    .add_node("ask_human", ask_human)
    .add_node("final_step", final_step)
    .add_edge(START, "ask_human")
    .add_edge("ask_human", "final_step")
    .compile(checkpointer=InMemorySaver())
)
`,
          validationCode: `from course_harness import check, check_eq
from langgraph.types import Command

config = {"configurable": {"thread_id": "1"}}
first = graph.invoke({"value": []}, config)

check(
    "first_invoke_returns_interrupt",
    "el primer invoke pausa y expone __interrupt__",
    "__interrupt__" in first,
    f"resultado obtenido: {first!r}",
)
interrupts = first.get("__interrupt__", [])
check(
    "interrupt_list_nonempty",
    "__interrupt__ trae al menos un objeto de interrupción",
    len(interrupts) >= 1,
)
check_eq(
    "interrupt_value",
    "el valor del interrupt es el payload pasado a interrupt()",
    interrupts[0].value,
    "What is your name?",
)

second = graph.invoke(Command(resume="Alice"), config)
check_eq(
    "resume_result",
    "el resume reanuda el nodo interrumpido y produce la salida documentada del ejemplo canónico de interrupt/resume",
    second,
    {"value": ["Hello, Alice!", "Done"]},
)
`,
        },
      ],
      pasos: [
        {
          id: "mod09-paso1",
          titulo: "Un nodo que pausa con interrupt",
          explicacionMd:
            "Antes del ejemplo canónico completo, practica lo mínimo: un nodo que llama a " +
            "`interrupt(...)` y devuelve la respuesta bajo una clave SIN reducer (se " +
            "sobrescribe, no acumula).",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod09-paso1-reto",
              titulo: "Completa el nodo que pregunta el color favorito",
              enunciadoMd:
                'Completa `preguntar` para que pause con `interrupt("¿Cuál es tu color ' +
                'favorito?")` y devuelva `{"color": answer}`.',
              starterCode: `from typing_extensions import TypedDict
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

class State(TypedDict):
    color: str

def preguntar(state: State):
    # TODO: pausa con interrupt("¿Cuál es tu color favorito?") y devuelve {"color": answer}
    ...

graph = (
    StateGraph(State)
    .add_node("preguntar", preguntar)
    .add_edge(START, "preguntar")
    .add_edge("preguntar", END)
    .compile(checkpointer=InMemorySaver())
)
`,
              solutionCode: `from typing_extensions import TypedDict
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

class State(TypedDict):
    color: str

def preguntar(state: State):
    answer = interrupt("¿Cuál es tu color favorito?")
    return {"color": answer}

graph = (
    StateGraph(State)
    .add_node("preguntar", preguntar)
    .add_edge(START, "preguntar")
    .add_edge("preguntar", END)
    .compile(checkpointer=InMemorySaver())
)
`,
              validationCode: `from course_harness import check, check_eq
from langgraph.types import Command

config = {"configurable": {"thread_id": "paso1"}}
first = graph.invoke({"color": ""}, config)
check("paso1_pausa", "el primer invoke debe pausar y exponer __interrupt__", "__interrupt__" in first)

second = graph.invoke(Command(resume="azul"), config)
check_eq("paso1_resume", "tras el resume, color debe ser la respuesta dada", second["color"], "azul")
`,
            },
          },
        },
        {
          id: "mod09-paso2",
          titulo: "El ejemplo canónico completo",
          explicacionMd:
            "Lee el ejemplo canónico completo antes de tocar código: `ask_human` pausa, " +
            "`final_step` corre después, y `value` acumula gracias al reducer explícito.",
          accion: {
            kind: "lectura",
            bloqueMd: `\`\`\`python
config = {"configurable": {"thread_id": "1"}}
first = graph.invoke({"value": []}, config)
# first == {"value": [], "__interrupt__": [Interrupt(value="What is your name?")]}

second = graph.invoke(Command(resume="Alice"), config)
# second == {"value": ["Hello, Alice!", "Done"]}
\`\`\`
Este fragmento ya está completo: solo léelo, no hace falta ejecutarlo ni completar nada todavía.`,
          },
        },
        {
          id: "mod09-paso3",
          titulo: "Command(goto=, update=) aislado",
          explicacionMd:
            "Practica `Command` sin `interrupt`: un nodo puede devolver un `Command` para " +
            "actualizar el estado Y decidir el siguiente nodo en un solo paso.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod09-paso3-reto",
              titulo: "Completa el nodo que devuelve Command",
              enunciadoMd:
                'Completa `decidir` para que devuelva `Command(goto="fin", update={"nota": ' +
                '"listo"})`.',
              starterCode: `from typing_extensions import TypedDict
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command

class State(TypedDict):
    nota: str

def decidir(state: State):
    # TODO: devuelve Command(goto="fin", update={"nota": "listo"})
    ...

def fin(state: State):
    return {"nota": state["nota"] + "!"}

graph = (
    StateGraph(State)
    .add_node("decidir", decidir)
    .add_node("fin", fin)
    .add_edge(START, "decidir")
    .add_edge("fin", END)
    .compile()
)
`,
              solutionCode: `from typing_extensions import TypedDict
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command

class State(TypedDict):
    nota: str

def decidir(state: State):
    return Command(goto="fin", update={"nota": "listo"})

def fin(state: State):
    return {"nota": state["nota"] + "!"}

graph = (
    StateGraph(State)
    .add_node("decidir", decidir)
    .add_node("fin", fin)
    .add_edge(START, "decidir")
    .add_edge("fin", END)
    .compile()
)
`,
              validationCode: `from course_harness import check_eq

resultado = graph.invoke({"nota": ""})
check_eq("paso3_command_update_y_goto", "Command debe actualizar y enrutar a fin", resultado["nota"], "listo!")
`,
            },
          },
        },
        {
          id: "mod09-paso4",
          titulo: "Predicción: ¿se repite el efecto antes del interrupt?",
          explicacionMd:
            "Antes de la síntesis, predice qué pasa con un contador que se incrementa " +
            "ANTES de llamar a `interrupt(...)` dentro del mismo nodo.",
          accion: {
            kind: "quiz",
            quiz: {
              id: "mod09-paso4-quiz",
              titulo: "¿El contador se repite al reanudar?",
              preguntas: [
                {
                  id: "mod09-paso4-quiz-p1",
                  kind: "boolean",
                  enunciadoMd:
                    "Un nodo hace `contador += 1` (variable local) ANTES de `interrupt(...)`. " +
                    "Al reanudar con `Command(resume=...)`, ¿ese incremento se ejecuta de nuevo?",
                  correcta: true,
                  explicacionMd:
                    "Sí: el nodo se RE-EJECUTA desde el principio al reanudar, así que " +
                    "cualquier código ANTES del `interrupt()` se repite (incluidos efectos).",
                },
              ],
            },
          },
        },
        {
          id: "mod09-paso5",
          titulo: "Pausar, aprobar o rechazar",
          explicacionMd:
            "Combina lo practicado: un nodo pausa pidiendo aprobación; según la respuesta, " +
            "la clave `estado` (sin reducer) refleja 'aprobado' o 'rechazado'.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod09-paso5-reto",
              titulo: "Completa el nodo de aprobación",
              enunciadoMd:
                'Completa `pedir_aprobacion` para pausar con `interrupt("¿Apruebas el ' +
                'cambio?")` y devolver `{"estado": "aprobado" if answer else "rechazado"}`.',
              starterCode: `from typing_extensions import TypedDict
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

class State(TypedDict):
    estado: str

def pedir_aprobacion(state: State):
    answer = interrupt("¿Apruebas el cambio?")
    # TODO: devuelve {"estado": "aprobado" if answer else "rechazado"}
    ...

graph = (
    StateGraph(State)
    .add_node("pedir_aprobacion", pedir_aprobacion)
    .add_edge(START, "pedir_aprobacion")
    .add_edge("pedir_aprobacion", END)
    # TODO: compila con checkpointer=InMemorySaver()
    .compile()
)
`,
              solutionCode: `from typing_extensions import TypedDict
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

class State(TypedDict):
    estado: str

def pedir_aprobacion(state: State):
    answer = interrupt("¿Apruebas el cambio?")
    return {"estado": "aprobado" if answer else "rechazado"}

graph = (
    StateGraph(State)
    .add_node("pedir_aprobacion", pedir_aprobacion)
    .add_edge(START, "pedir_aprobacion")
    .add_edge("pedir_aprobacion", END)
    .compile(checkpointer=InMemorySaver())
)
`,
              validationCode: `from course_harness import check_eq
from langgraph.types import Command

config_ok = {"configurable": {"thread_id": "aprobado"}}
graph.invoke({"estado": ""}, config_ok)
r_ok = graph.invoke(Command(resume=True), config_ok)
check_eq("paso5_aprobado", "resume=True debe dar estado 'aprobado'", r_ok["estado"], "aprobado")

config_no = {"configurable": {"thread_id": "rechazado"}}
graph.invoke({"estado": ""}, config_no)
r_no = graph.invoke(Command(resume=False), config_no)
check_eq("paso5_rechazado", "resume=False debe dar estado 'rechazado'", r_no["estado"], "rechazado")
`,
            },
          },
        },
      ],
    },
    refinaSimplifica: {
      resumenBullets: [
        "`interrupt(value)` dentro de un nodo pausa el grafo; el resultado trae `\"__interrupt__\"` con el payload.",
        "`interrupt`/`Command(resume=...)` requieren checkpointer + thread_id: sin ellos, error claro.",
        "`Command(resume=x)` reanuda: el nodo interrumpido se RE-EJECUTA desde el principio y `interrupt()` devuelve `x`.",
        "La acumulación entre el resume y los nodos siguientes depende del reducer explícito del `State`, no de interrupt/resume.",
        "`Command(goto=, update=)` enruta + actualiza estado ignorando los edges declarados; es la base de los handoffs multi-agente (módulo 14).",
        "Efectos dentro de un nodo ANTES del `interrupt()` se repiten en cada reanudación (re-ejecución completa).",
      ],
      sintesis: {
        kind: "code",
        reto: {
          id: "mod09-reto-sintesis",
          titulo: "Síntesis: Command(goto=, update=) ignora los edges declarados",
          enunciadoMd:
            "Completa `start_node` para que devuelva un `Command` que enrute a " +
            "`end_node` actualizando `log` con `\"from-start\"`, saltándose el edge hacia " +
            "`unreachable_node`.",
          starterCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command

class State(TypedDict):
    log: Annotated[list, operator.add]

def start_node(state: State):
    # TODO — devuelve Command(goto="end_node", update={"log": ["from-start"]})
    ...

def end_node(state: State):
    return {"log": ["from-end"]}

def unreachable_node(state: State):
    return {"log": ["should-not-run"]}

graph = (
    StateGraph(State)
    .add_node("start_node", start_node)
    .add_node("end_node", end_node)
    .add_node("unreachable_node", unreachable_node)
    .add_edge(START, "start_node")
    .add_edge("start_node", "unreachable_node")
    .add_edge("end_node", END)
    .add_edge("unreachable_node", END)
    .compile()
)
`,
          solutionCode: `import operator
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command

class State(TypedDict):
    log: Annotated[list, operator.add]

def start_node(state: State):
    return Command(goto="end_node", update={"log": ["from-start"]})

def end_node(state: State):
    return {"log": ["from-end"]}

def unreachable_node(state: State):
    return {"log": ["should-not-run"]}

graph = (
    StateGraph(State)
    .add_node("start_node", start_node)
    .add_node("end_node", end_node)
    .add_node("unreachable_node", unreachable_node)
    .add_edge(START, "start_node")
    .add_edge("start_node", "unreachable_node")
    .add_edge("end_node", END)
    .add_edge("unreachable_node", END)
    .compile()
)
`,
          validationCode: `from course_harness import check_eq

result = graph.invoke({"log": []})
check_eq(
    "command_goto_ignores_edges",
    "Command(goto=) enruta a end_node ignorando el edge declarado hacia unreachable_node",
    result["log"],
    ["from-start", "from-end"],
)
`,
        },
      },
    },
  },
  usaLaIa: [
    {
      id: "mod09-ia1",
      titulo: "Usa la IA para depurar un interrupt que no pausa o que repite efectos",
      promptsSugeridos: [
        "Mi `interrupt(...)` no parece pausar el grafo (o el `Command(resume=...)` no " +
          "reanuda con el valor esperado). Aquí está mi nodo y mi `config`. ¿Qué requisito " +
          "me falta (checkpointer, thread_id)?",
        "Explícame con un ejemplo distinto al del curso por qué un efecto ANTES del " +
          "`interrupt()` dentro del mismo nodo se repite al reanudar.",
      ],
      comoVerificar: [
        "¿La respuesta usa `Command(resume=...)` con el MISMO `config`/`thread_id` del " +
          "primer invoke, o inventa otra forma de reanudar?",
        "¿Al pegar el código sugerido, el mini-ejercicio pasa comprobando el valor EXACTO " +
          "tras el resume (no solo 'ya no lanza error')?",
        "¿La IA explica que el nodo se RE-EJECUTA completo al reanudar (no continúa a " +
          "mitad de función)?",
      ],
      comoIterar:
        "Si el resume no da el valor esperado, pega el resultado completo del primer " +
        "invoke (con `__interrupt__`) y pregunta específicamente qué payload trae, en vez " +
        "de pedir el nodo reescrito entero.",
      queNoDelegar: [
        "No le pidas que 'implemente todo el flujo de aprobación': completa tú la línea " +
          "del `interrupt(...)` una vez que entiendas qué pregunta debe hacer.",
        "No copies una respuesta que use `Command(goto=)` para simular una pausa: eso NO " +
          "detiene el grafo, solo `interrupt(...)` lo hace.",
      ],
    },
  ],
  tutorialLocal: {
    introMd:
      "Este tramo demuestra HITL sobre un grafo pequeño aparte, dentro del mismo " +
      "proyecto: el pipeline principal (`graph.py`) sigue igual que en el módulo 08; " +
      "`main.py` gana una función de demostración con `interrupt`/`Command(resume=...)`.",
    setup: [
      {
        titulo: "Reactiva el entorno virtual (si cerraste la terminal)",
        descripcionMd: "No hay dependencias nuevas en este módulo.",
        powershell: ".venv\\Scripts\\Activate.ps1",
        bash: "source .venv/bin/activate",
      },
      {
        titulo: "Ejecuta el proyecto: primero el pipeline, luego la demo de HITL",
        descripcionMd: "",
        powershell: "python src\\main.py",
        bash: "python src/main.py",
      },
    ],
    codigo: [
      {
        archivo: "src/main.py",
        descripcionMd:
          "Se añade `demo_aprobacion()`: un grafo pequeño e independiente (no altera " +
          "`graph.py`) que pausa con `interrupt(...)` pidiendo aprobación, y reanuda con " +
          "`Command(resume=...)` — el mismo patrón de los mini-ejercicios de este módulo.",
        codigo: `from typing_extensions import TypedDict
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

from graph import graph

config = {"configurable": {"thread_id": "sesion-3"}}


class AprobacionState(TypedDict):
    estado: str


def pedir_aprobacion(state: AprobacionState):
    answer = interrupt("¿Apruebas publicar el saludo generado?")
    return {"estado": "aprobado" if answer else "rechazado"}


def demo_aprobacion():
    demo_graph = (
        StateGraph(AprobacionState)
        .add_node("pedir_aprobacion", pedir_aprobacion)
        .add_edge(START, "pedir_aprobacion")
        .add_edge("pedir_aprobacion", END)
        .compile(checkpointer=InMemorySaver())
    )
    demo_config = {"configurable": {"thread_id": "demo-hitl"}}
    demo_graph.invoke({"estado": ""}, demo_config)
    resultado = demo_graph.invoke(Command(resume=True), demo_config)
    print("aprobación:", resultado["estado"])


if __name__ == "__main__":
    resultado = graph.invoke({"nombre": "Ana"}, config)
    print(resultado["saludo"])
    demo_aprobacion()
`,
      },
    ],
    salidaEsperada: "Hasta luego, Ana\naprobación: aprobado",
    spine: {
      crea: [],
      modifica: ["src/main.py"],
    },
  },
};
