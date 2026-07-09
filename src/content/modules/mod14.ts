import type { CourseModule } from "../types";

/**
 * Módulo 14 — Multi-agente: supervisor, swarm y handoffs.
 * Contenido completo (slice S15). Código: SOLO StateGraph + conditional edges +
 * Command(goto=, update=) (grounding-adv §4, C-RUNNER §tabla "Avanzado" — no hay
 * más API multi-agente en la superficie del shim). FakeChatModel decide el
 * routing con llmDoubles deterministas.
 * §12 (ADR-15, SE4): formato enriquecido — pasos guiados, "Usa la IA" y
 * tutorial local (continúa el project spine desde mod13). El tutorial añade
 * una demo de supervisor aparte en main.py, sin tocar graph.py.
 */
export const mod14: CourseModule = {
  id: "mod14",
  numero: 14,
  titulo: "Multi-agente: supervisor, swarm y handoffs",
  objetivo:
    "Diseñar sistemas multi-agente con patrón supervisor y handoffs vía Command; " +
    "comparar supervisor vs. swarm.",
  enriquecido: true,
  secciones: {
    explicaSimple: {
      contenidoMd: `## Un jefe de equipo, o compañeros que se pasan el trabajo directamente

Cuando un problema es demasiado grande para un solo agente, se reparte entre varios
agentes especializados. Hay dos formas típicas de organizarlos:

- **Supervisor**: hay un "jefe de equipo" (un nodo más) que decide, en cada turno, a
  qué especialista pasarle el trabajo (facturación, soporte técnico, ventas...) y
  recibe de vuelta el resultado antes de decidir el siguiente paso. Control
  **centralizado**: todo pasa por el supervisor.
- **Swarm / handoffs**: no hay jefe. Cada agente, cuando termina su parte, decide
  directamente A QUÉ OTRO AGENTE pasarle el control ("esto ya no es lo mío, que lo vea
  el agente de soporte"). Control **descentralizado**, de agente a agente
  (peer-to-peer).

## La misma pieza de LangGraph para ambos: Command(goto=, update=)

Ya viste en el módulo 09 que un nodo puede devolver \`Command(goto="otro_nodo",
update={...})\`: actualiza el estado Y decide a qué nodo saltar, ignorando los edges
declarados. Esa es TODA la API que hace falta para multi-agente: en el supervisor, el
nodo supervisor hace \`Command(goto=<agente_elegido>)\`; en el swarm, cada agente hace
\`Command(goto=<siguiente_agente>)\` directamente. No hay ninguna clase especial
"Supervisor" o "Swarm" en el shim: es composición de la superficie ya conocida
(\`StateGraph\` + edges condicionales + \`Command\`), organizados con un patrón u otro.`,
      consignaExplicacion:
        "Explícale a alguien que no programa la diferencia entre 'un jefe que reparte " +
        "el trabajo' (supervisor) y 'compañeros que se pasan el trabajo directamente " +
        "entre ellos' (swarm/handoffs), y por qué ambos usan la misma pieza técnica " +
        "(Command(goto=))." ,
    },
    detectaGaps: {
      contenidoMd: "Comprueba si distingues bien supervisor de swarm.",
      quiz: {
        id: "mod14-quiz1",
        titulo: "¿Supervisor o swarm?",
        preguntas: [
          {
            id: "mod14-quiz1-p1",
            kind: "single",
            enunciadoMd: "¿Qué caracteriza al patrón SUPERVISOR?",
            opciones: [
              "Un nodo centralizado decide a qué agente-nodo enrutar en cada turno",
              "Cada agente decide por su cuenta a quién pasarle el control, sin nodo central",
              "No hay ningún tipo de routing: todos los nodos corren siempre",
              "Requiere una clase especial `Supervisor` del shim",
            ],
            correcta: 0,
            explicacionMd:
              "El supervisor es control CENTRALIZADO: un nodo (el supervisor) decide el " +
              "siguiente agente en cada turno.",
          },
          {
            id: "mod14-quiz1-p2",
            kind: "boolean",
            enunciadoMd:
              "En un swarm con handoffs, un agente puede transferir el control " +
              "directamente a otro agente devolviendo `Command(goto=\"otro_agente\", update={...})`, " +
              "sin pasar por un nodo supervisor.",
            correcta: true,
            explicacionMd:
              "Correcto: esa es la esencia del swarm — routing peer-to-peer, no " +
              "centralizado.",
          },
          {
            id: "mod14-quiz1-p3",
            kind: "multi",
            enunciadoMd: "¿Qué API del shim se usa para construir supervisor Y swarm?",
            opciones: [
              "`StateGraph` + `add_conditional_edges`",
              "`Command(goto=, update=)`",
              "Una clase `MultiAgentSupervisor` dedicada",
              "`Send` para hacer fan-out dinámico de agentes",
            ],
            correctas: [0, 1],
            explicacionMd:
              "No hay clases especiales de multi-agente en el shim: es composición de la " +
              "superficie core/avanzada ya conocida. `Send` no existe en la superficie " +
              "(prohibido).",
          },
          {
            id: "mod14-quiz1-p4",
            kind: "output",
            enunciadoMd:
              "Un nodo `supervisor` hace `return Command(goto=\"billing\", update={\"routed_to\": [\"billing\"]})`. " +
              "El grafo tenía declarado `add_edge(\"supervisor\", \"support\")`. ¿A qué nodo va la ejecución?",
            codigo: 'return Command(goto="billing", update={"routed_to": ["billing"]})',
            opciones: [
              "A `billing`: `Command(goto=)` ignora los edges declarados",
              "A `support`: el edge declarado tiene prioridad",
              "A ambos, en paralelo",
              "Lanza un error porque hay conflicto entre el edge y el Command",
            ],
            correcta: 0,
            explicacionMd:
              "`Command(goto=)` SIEMPRE ignora los edges declarados de ese nodo (regla ya " +
              "vista en el módulo 09).",
          },
          {
            id: "mod14-quiz1-p5",
            kind: "single",
            enunciadoMd:
              "Comparando supervisor vs. swarm: ¿cuál tiene un único punto de decisión " +
              "sobre el routing?",
            opciones: [
              "Supervisor (control centralizado en un nodo)",
              "Swarm (cada agente decide, no hay punto único)",
              "Ninguno: ambos son igual de centralizados",
              "Ambos: la diferencia está solo en el nombre",
            ],
            correcta: 0,
            explicacionMd:
              "El supervisor concentra la decisión de routing en un nodo; el swarm la " +
              "distribuye entre los agentes.",
          },
        ],
      },
    },
    llenaGaps: {
      contenidoMd: `## Supervisor: un nodo decide, con FakeChatModel como "cerebro" del routing

\`\`\`python
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.types import Command
from course_harness import FakeChatModel

supervisor_model = FakeChatModel()

def supervisor(state: MessagesState):
    decision = supervisor_model.invoke(state["messages"]).content  # "billing" o "support" o "FINISH"
    if decision == "FINISH":
        return Command(goto=END)
    return Command(goto=decision, update={"messages": []})

def billing(state: MessagesState):
    return {"messages": [{"role": "ai", "content": "Billing: revisando tu factura..."}]}

def support(state: MessagesState):
    return {"messages": [{"role": "ai", "content": "Support: revisando el problema técnico..."}]}

builder = StateGraph(MessagesState)
builder.add_node("supervisor", supervisor)
builder.add_node("billing", billing)
builder.add_node("support", support)
builder.add_edge(START, "supervisor")
builder.add_edge("billing", END)
builder.add_edge("support", END)
graph = builder.compile()
\`\`\`

**Cómo leerlo:** el supervisor es un nodo normal que usa \`Command(goto=...)\` para
enrutar: no hace falta declarar \`add_conditional_edges\` porque \`Command\` YA lleva el
routing incorporado. \`billing\`/\`support\` son agentes-nodo especializados; tras
responder, el grafo termina (\`add_edge(..., END)\`).

## Swarm / handoffs: cada agente decide a quién pasar el control

\`\`\`python
def agent_a(state: MessagesState):
    # agent_a decide que esto lo debe resolver agent_b
    return Command(
        goto="agent_b",
        update={"messages": [{"role": "ai", "content": "Paso esto a agent_b"}]},
    )

def agent_b(state: MessagesState):
    return {"messages": [{"role": "ai", "content": "agent_b resuelve el caso"}]}

builder = StateGraph(MessagesState)
builder.add_node("agent_a", agent_a)
builder.add_node("agent_b", agent_b)
builder.add_edge(START, "agent_a")
builder.add_edge("agent_b", END)
graph = builder.compile()
\`\`\`

**Diferencia clave con supervisor:** aquí NINGÚN nodo tiene el rol de "decidir por
todos" — \`agent_a\` decide su propio siguiente paso directamente, sin pasar por un
tercero.

**Errores comunes:**
- Buscar una clase \`Supervisor\`/\`Swarm\` en el shim: no existe, es composición de
  \`StateGraph\` + \`Command\`.
- Olvidar que \`Command(goto=END)\` termina el grafo igual que cualquier otro \`goto\`.
- Usar \`Send\` para repartir trabajo dinámicamente entre agentes: \`Send\` NO está en la
  superficie del shim de este curso.`,
      retos: [
        {
          id: "mod14-reto1",
          titulo: "Supervisor que enruta con Command según la decisión del modelo",
          enunciadoMd:
            "Completa `supervisor` para que, según la respuesta del `FakeChatModel` " +
            '("billing" o "support"), devuelva `Command(goto=<esa decisión>)`.',
          starterCode: `from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.types import Command
from course_harness import FakeChatModel

def build_supervisor_graph():
    supervisor_model = FakeChatModel()

    def supervisor(state: MessagesState):
        decision = supervisor_model.invoke(state["messages"]).content
        # TODO — devuelve Command(goto=decision)
        ...

    def billing(state: MessagesState):
        return {"messages": [{"role": "ai", "content": "Billing: resuelto"}]}

    def support(state: MessagesState):
        return {"messages": [{"role": "ai", "content": "Support: resuelto"}]}

    builder = StateGraph(MessagesState)
    builder.add_node("supervisor", supervisor)
    builder.add_node("billing", billing)
    builder.add_node("support", support)
    builder.add_edge(START, "supervisor")
    builder.add_edge("billing", END)
    builder.add_edge("support", END)
    return builder.compile()
`,
          solutionCode: `from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.types import Command
from course_harness import FakeChatModel

def build_supervisor_graph():
    supervisor_model = FakeChatModel()

    def supervisor(state: MessagesState):
        decision = supervisor_model.invoke(state["messages"]).content
        return Command(goto=decision)

    def billing(state: MessagesState):
        return {"messages": [{"role": "ai", "content": "Billing: resuelto"}]}

    def support(state: MessagesState):
        return {"messages": [{"role": "ai", "content": "Support: resuelto"}]}

    builder = StateGraph(MessagesState)
    builder.add_node("supervisor", supervisor)
    builder.add_node("billing", billing)
    builder.add_node("support", support)
    builder.add_edge(START, "supervisor")
    builder.add_edge("billing", END)
    builder.add_edge("support", END)
    return builder.compile()
`,
          validationCode: `from course_harness import check_eq, get_llm_calls

graph = build_supervisor_graph()
result = graph.invoke({"messages": [{"role": "human", "content": "Tengo un problema con mi factura"}]})

check_eq(
    "supervisor_routes_to_billing",
    "el supervisor enruta a billing según la decisión del modelo",
    result["messages"][-1].content,
    "Billing: resuelto",
)

calls = get_llm_calls()
check_eq(
    "supervisor_llm_invoked_once",
    "el supervisor invoca al modelo una vez para decidir el routing",
    len(calls),
    1,
)
`,
          llmDoubles: [{ respuesta: "billing" }],
        },
      ],
      pasos: [
        {
          id: "mod14-paso1",
          titulo: "Un nodo que solo enruta",
          explicacionMd:
            "Antes del supervisor con modelo, practica lo mínimo: un nodo que devuelve " +
            '`Command(goto="fin")` SIN actualizar nada del estado.',
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod14-paso1-reto",
              titulo: "Completa el nodo que enruta a fin",
              enunciadoMd: 'Completa `enrutar` para que devuelva `Command(goto="fin")`.',
              starterCode: `from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.types import Command

def enrutar(state: MessagesState):
    # TODO: devuelve Command(goto="fin")
    ...

def fin(state: MessagesState):
    return {"messages": [{"role": "ai", "content": "listo"}]}

builder = StateGraph(MessagesState)
builder.add_node("enrutar", enrutar)
builder.add_node("fin", fin)
builder.add_edge(START, "enrutar")
builder.add_edge("fin", END)
graph = builder.compile()
`,
              solutionCode: `from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.types import Command

def enrutar(state: MessagesState):
    return Command(goto="fin")

def fin(state: MessagesState):
    return {"messages": [{"role": "ai", "content": "listo"}]}

builder = StateGraph(MessagesState)
builder.add_node("enrutar", enrutar)
builder.add_node("fin", fin)
builder.add_edge(START, "enrutar")
builder.add_edge("fin", END)
graph = builder.compile()
`,
              validationCode: `from course_harness import check_eq

result = graph.invoke({"messages": [{"role": "human", "content": "hola"}]})
check_eq("paso1_enruta_a_fin", "el nodo enruta a fin sin más lógica", result["messages"][-1].content, "listo")
`,
            },
          },
        },
        {
          id: "mod14-paso2",
          titulo: "Lee el patrón supervisor completo",
          explicacionMd:
            "Lee el supervisor completo: un nodo usa la decisión del modelo para elegir " +
            "el agente destino con `Command(goto=decision)`.",
          accion: {
            kind: "lectura",
            bloqueMd: `\`\`\`python
def supervisor(state: MessagesState):
    decision = supervisor_model.invoke(state["messages"]).content
    if decision == "FINISH":
        return Command(goto=END)
    return Command(goto=decision, update={"messages": []})
\`\`\`
Este fragmento ya está completo: solo léelo, no hace falta ejecutarlo ni completar nada todavía.`,
          },
        },
        {
          id: "mod14-paso3",
          titulo: "Un supervisor que decide entre dos agentes",
          explicacionMd:
            "Practica un supervisor propio: según la decisión del `FakeChatModel` " +
            '("ventas" o "soporte"), enruta con `Command(goto=decision)`.',
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod14-paso3-reto",
              titulo: "Completa el supervisor de ventas/soporte",
              enunciadoMd:
                "Completa `supervisor` para que invoque al modelo y devuelva " +
                "`Command(goto=decision)`, y registra los nodos `ventas`/`soporte`.",
              starterCode: `from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.types import Command
from course_harness import FakeChatModel

def build_graph():
    supervisor_model = FakeChatModel()

    def supervisor(state: MessagesState):
        decision = supervisor_model.invoke(state["messages"]).content
        # TODO: devuelve Command(goto=decision)
        ...

    def ventas(state: MessagesState):
        return {"messages": [{"role": "ai", "content": "Ventas: resuelto"}]}

    def soporte(state: MessagesState):
        return {"messages": [{"role": "ai", "content": "Soporte: resuelto"}]}

    builder = StateGraph(MessagesState)
    builder.add_node("supervisor", supervisor)
    # TODO: registra los nodos "ventas" y "soporte"
    builder.add_edge(START, "supervisor")
    builder.add_edge("ventas", END)
    builder.add_edge("soporte", END)
    return builder.compile()
`,
              solutionCode: `from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.types import Command
from course_harness import FakeChatModel

def build_graph():
    supervisor_model = FakeChatModel()

    def supervisor(state: MessagesState):
        decision = supervisor_model.invoke(state["messages"]).content
        return Command(goto=decision)

    def ventas(state: MessagesState):
        return {"messages": [{"role": "ai", "content": "Ventas: resuelto"}]}

    def soporte(state: MessagesState):
        return {"messages": [{"role": "ai", "content": "Soporte: resuelto"}]}

    builder = StateGraph(MessagesState)
    builder.add_node("supervisor", supervisor)
    builder.add_node("ventas", ventas)
    builder.add_node("soporte", soporte)
    builder.add_edge(START, "supervisor")
    builder.add_edge("ventas", END)
    builder.add_edge("soporte", END)
    return builder.compile()
`,
              validationCode: `from course_harness import check_eq

graph = build_graph()
result = graph.invoke({"messages": [{"role": "human", "content": "Quiero comprar el plan pro"}]})
check_eq("paso3_routes_to_ventas", "el supervisor enruta a ventas según la decisión del modelo", result["messages"][-1].content, "Ventas: resuelto")
`,
              llmDoubles: [{ respuesta: "ventas" }],
            },
          },
        },
        {
          id: "mod14-paso4",
          titulo: "Predicción: ¿Command ignora los edges declarados?",
          explicacionMd:
            "Antes de la síntesis, predice qué pasa cuando un nodo devuelve " +
            "`Command(goto=)` habiendo un `add_edge` declarado hacia otro destino.",
          accion: {
            kind: "quiz",
            quiz: {
              id: "mod14-paso4-quiz",
              titulo: "¿Edge o Command?",
              preguntas: [
                {
                  id: "mod14-paso4-quiz-p1",
                  kind: "boolean",
                  enunciadoMd:
                    "Un nodo `x` tiene declarado `add_edge(\"x\", \"y\")` pero devuelve " +
                    "`Command(goto=\"z\")`. ¿La ejecución va a `z` (ignorando el edge hacia `y`)?",
                  correcta: true,
                  explicacionMd:
                    "Correcto: `Command(goto=)` SIEMPRE tiene prioridad sobre los edges " +
                    "declarados de ese nodo.",
                },
              ],
            },
          },
        },
        {
          id: "mod14-paso5",
          titulo: "Handoff swarm con actualización de estado",
          explicacionMd:
            "Combina lo practicado: un agente transfiere el control a otro con " +
            "`Command(goto=, update=)`, dejando constancia del handoff en `messages`.",
          accion: {
            kind: "ejercicio",
            reto: {
              id: "mod14-paso5-reto",
              titulo: "Completa el handoff de atención a especialista",
              enunciadoMd:
                "Completa `atencion` para que transfiera el control a `especialista` con " +
                '`Command(goto="especialista", update={...})`, dejando un mensaje ai de handoff.',
              starterCode: `from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.types import Command

def build_graph():
    def atencion(state: MessagesState):
        # TODO: construye el mensaje ai "atencion: paso el caso a especialista"
        mensaje = ...
        # TODO: devuelve Command(goto="especialista", update={"messages": [mensaje]})
        ...

    def especialista(state: MessagesState):
        return {"messages": [{"role": "ai", "content": "especialista resuelve el caso"}]}

    builder = StateGraph(MessagesState)
    builder.add_node("atencion", atencion)
    builder.add_node("especialista", especialista)
    builder.add_edge(START, "atencion")
    builder.add_edge("especialista", END)
    return builder.compile()
`,
              solutionCode: `from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.types import Command

def build_graph():
    def atencion(state: MessagesState):
        return Command(
            goto="especialista",
            update={"messages": [{"role": "ai", "content": "atencion: paso el caso a especialista"}]},
        )

    def especialista(state: MessagesState):
        return {"messages": [{"role": "ai", "content": "especialista resuelve el caso"}]}

    builder = StateGraph(MessagesState)
    builder.add_node("atencion", atencion)
    builder.add_node("especialista", especialista)
    builder.add_edge(START, "atencion")
    builder.add_edge("especialista", END)
    return builder.compile()
`,
              validationCode: `from course_harness import check_eq

graph = build_graph()
result = graph.invoke({"messages": [{"role": "human", "content": "necesito ayuda"}]})
contents = [m.content for m in result["messages"]]
check_eq(
    "paso5_handoff_message",
    "atencion deja constancia del handoff antes de pasar el control",
    contents,
    ["necesito ayuda", "atencion: paso el caso a especialista", "especialista resuelve el caso"],
)
`,
            },
          },
        },
      ],
    },
    refinaSimplifica: {
      resumenBullets: [
        "Supervisor = control centralizado: un nodo decide a qué agente enrutar en cada turno.",
        "Swarm/handoffs = control descentralizado: cada agente decide a quién pasarle el control.",
        "Ambos patrones se construyen con la MISMA API: StateGraph + Command(goto=, update=).",
        "No existe una clase especial 'Supervisor' o 'Swarm' en el shim: es composición, no API nueva.",
        "`Command(goto=END)` termina el grafo igual que cualquier otro destino.",
        "`Send` (map-reduce dinámico) NO está en la superficie: prohibido en contenido multi-agente.",
      ],
      sintesis: {
        kind: "code",
        reto: {
          id: "mod14-reto-sintesis",
          titulo: "Síntesis: handoff swarm entre dos agentes",
          enunciadoMd:
            "Completa `agent_a` para que transfiera el control a `agent_b` con " +
            "`Command(goto=\"agent_b\", update={...})`, añadiendo su propio mensaje antes " +
            "del handoff.",
          starterCode: `from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.types import Command

def build_swarm_graph():
    def agent_a(state: MessagesState):
        # TODO — devuelve Command(goto="agent_b", update={"messages": [...]})
        # con un mensaje ai indicando que agent_a pasa el caso a agent_b
        ...

    def agent_b(state: MessagesState):
        return {"messages": [{"role": "ai", "content": "agent_b resuelve el caso"}]}

    builder = StateGraph(MessagesState)
    builder.add_node("agent_a", agent_a)
    builder.add_node("agent_b", agent_b)
    builder.add_edge(START, "agent_a")
    builder.add_edge("agent_b", END)
    return builder.compile()
`,
          solutionCode: `from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.types import Command

def build_swarm_graph():
    def agent_a(state: MessagesState):
        return Command(
            goto="agent_b",
            update={"messages": [{"role": "ai", "content": "agent_a: paso el caso a agent_b"}]},
        )

    def agent_b(state: MessagesState):
        return {"messages": [{"role": "ai", "content": "agent_b resuelve el caso"}]}

    builder = StateGraph(MessagesState)
    builder.add_node("agent_a", agent_a)
    builder.add_node("agent_b", agent_b)
    builder.add_edge(START, "agent_a")
    builder.add_edge("agent_b", END)
    return builder.compile()
`,
          validationCode: `from course_harness import check_eq

graph = build_swarm_graph()
result = graph.invoke({"messages": [{"role": "human", "content": "necesito ayuda"}]})
contents = [m.content for m in result["messages"]]

check_eq(
    "swarm_handoff_message",
    "agent_a deja constancia del handoff antes de pasar el control",
    contents,
    [
        "necesito ayuda",
        "agent_a: paso el caso a agent_b",
        "agent_b resuelve el caso",
    ],
)
`,
        },
      },
    },
  },
  usaLaIa: [
    {
      id: "mod14-ia1",
      titulo: "Usa la IA para diseñar tu propio equipo de agentes",
      promptsSugeridos: [
        "Quiero un sistema multi-agente para <dominio tuyo> con patrón supervisor. " +
          "¿Qué agentes especializados propondrías, y cómo definiría el supervisor la " +
          "decisión de routing?",
        "Explícame con un ejemplo distinto al del curso cuándo conviene un swarm " +
          "(handoffs peer-to-peer) en vez de un supervisor centralizado.",
      ],
      comoVerificar: [
        "¿La respuesta usa SOLO `StateGraph` + `Command(goto=, update=)` — sin inventar " +
          "una clase `Supervisor`/`Swarm` que no existe en el shim?",
        "¿Al pegar el código sugerido, el mini-ejercicio pasa con el routing EXACTO " +
          "esperado (no solo 'ya no lanza error')?",
        "¿La IA distingue con claridad control centralizado (supervisor) de " +
          "descentralizado (swarm)?",
      ],
      comoIterar:
        "Si el routing no llega al agente esperado, imprime el resultado de " +
        "`supervisor_model.invoke(...)` y pregunta específicamente por qué esa decisión " +
        "no coincide con el nombre del nodo destino, en vez de pedir el grafo reescrito entero.",
      queNoDelegar: [
        "No le pidas que 'diseñe todo el sistema multi-agente': completa tú la línea de " +
          "`Command(goto=decision)` una vez que entiendas el patrón.",
        "No copies una respuesta que use `Send` para repartir trabajo dinámicamente: " +
          "`Send` no está en la superficie del shim de este curso (prohibido).",
      ],
    },
  ],
  tutorialLocal: {
    introMd:
      "Este tramo NO toca `graph.py`: añade una demo aparte en `main.py` con un patrón " +
      "supervisor (dos agentes especializados: facturación y soporte) decidido por un " +
      "LLM real.",
    setup: [
      {
        titulo: "Reactiva el entorno virtual (si cerraste la terminal)",
        descripcionMd: "No hay dependencias nuevas en este módulo.",
        powershell: ".venv\\Scripts\\Activate.ps1",
        bash: "source .venv/bin/activate",
      },
      {
        titulo: "Ejecuta el proyecto: primero el pipeline, luego la demo de supervisor",
        descripcionMd: "",
        powershell: "python src\\main.py",
        bash: "python src/main.py",
      },
    ],
    codigo: [
      {
        archivo: "src/main.py",
        descripcionMd:
          "Se añade `demo_supervisor()`: un supervisor decide, con `ChatOllama`, si el " +
          "mensaje del usuario es de facturación o soporte, y enruta con " +
          "`Command(goto=decision)`.",
        codigo: `from langchain_ollama import ChatOllama
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.types import Command

from graph import graph

config = {"configurable": {"thread_id": "sesion-6"}}


def demo_supervisor():
    supervisor_model = ChatOllama(model="qwen2.5-coder:14b")

    def supervisor(state: MessagesState):
        pregunta = {
            "role": "human",
            "content": (
                "Responde SOLO 'facturacion' o 'soporte' según el mensaje del usuario: "
                + state["messages"][-1].content
            ),
        }
        decision = supervisor_model.invoke([pregunta]).content.strip().lower()
        return Command(goto=decision)

    def facturacion(state: MessagesState):
        return {"messages": [{"role": "ai", "content": "Facturación: revisando tu factura..."}]}

    def soporte(state: MessagesState):
        return {"messages": [{"role": "ai", "content": "Soporte: revisando el problema técnico..."}]}

    builder = StateGraph(MessagesState)
    builder.add_node("supervisor", supervisor)
    builder.add_node("facturacion", facturacion)
    builder.add_node("soporte", soporte)
    builder.add_edge(START, "supervisor")
    builder.add_edge("facturacion", END)
    builder.add_edge("soporte", END)
    demo_graph = builder.compile()

    resultado = demo_graph.invoke({"messages": [{"role": "human", "content": "No me llega mi factura del mes pasado"}]})
    print(resultado["messages"][-1].content)


if __name__ == "__main__":
    resultado = graph.invoke({"nombre": "Ana"}, config)
    print(resultado["saludo"])
    demo_supervisor()
`,
      },
    ],
    salidaEsperada:
      "Hasta luego, Ana\n(el supervisor enruta a facturación o soporte según decida " +
      "qwen2.5-coder:14b — el texto exacto varía porque el modelo genera lenguaje natural)",
    spine: {
      crea: [],
      modifica: ["src/main.py"],
    },
  },
};
