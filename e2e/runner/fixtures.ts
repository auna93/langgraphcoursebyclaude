/**
 * Fixtures de retos de código (forma de `CodeChallenge`, C-CONTENT) usados por los
 * tests de integración del runner (S6, SLICES.md §S6, contrato C-RUNNER).
 *
 * Se usan strings de Python planos (no se importa `src/content/types.ts` desde aquí
 * porque el runner solo necesita `studentCode`/`validationCode`/`llmDoubles`/
 * `timeoutMs`, que es exactamente lo que declara `RunChallengeRequest`).
 *
 * IMPORTANTE: estos fixtures NO dependen de si la solución es "bonita" o
 * pedagógica — solo ejercitan el contrato del runner (CA-06/07/10, timeout) de
 * forma aislada y determinista.
 */

/** CA-06 / CA-07: reto trivial ajeno al shim de LangGraph (aísla el runner de
 *  posibles bugs del shim; la fidelidad del shim se cubre aparte en R1). */
export const SUMA_CHALLENGE = {
  id: "test-suma",
  starterCode: ["def suma(a, b):", "    # TODO: implementa la suma", "    pass"].join("\n"),
  solutionCode: ["def suma(a, b):", "    return a + b"].join("\n"),
  /** Solución incorrecta a propósito: falla check_eq con un valor concreto. */
  incorrectCode: ["def suma(a, b):", "    return a - b"].join("\n"),
  validationCode: [
    "from course_harness import check_eq",
    'check_eq("suma_2_3", "suma(2, 3) da 5", suma(2, 3), 5)',
    'check_eq("suma_neg", "suma(-1, 1) da 0", suma(-1, 1), 0)',
  ].join("\n"),
};

/** Bucle infinito: nunca produce __COURSE_RESULT__; debe cortarse por timeout. */
export const INFINITE_LOOP_CHALLENGE = {
  id: "test-infinite-loop",
  studentCode: ["while True:", "    pass"].join("\n"),
  validationCode: [
    "from course_harness import check",
    '# Si esto se ejecuta, el timeout no cortó el bucle infinito de arriba.',
    'check("unreachable", "nunca deberiamos llegar aqui", True)',
  ].join("\n"),
};

/**
 * R1 — grounding §1 (docs/reference/langgraph-grounding.md): state + nodes + edges +
 * conditional (loop). Salida documentada: aggregate alterna A/B hasta longitud 7.
 */
export const GROUNDING_LOOP_CHALLENGE = {
  id: "test-grounding-loop",
  studentCode: [
    "import operator",
    "from typing import Annotated, Literal",
    "from typing_extensions import TypedDict",
    "from langgraph.graph import StateGraph, START, END",
    "",
    "class State(TypedDict):",
    "    aggregate: Annotated[list, operator.add]",
    "",
    "def a(state: State):",
    '    return {"aggregate": ["A"]}',
    "",
    "def b(state: State):",
    '    return {"aggregate": ["B"]}',
    "",
    "builder = StateGraph(State)",
    "builder.add_node(a)",
    "builder.add_node(b)",
    "",
    'def route(state: State) -> Literal["b", END]:',
    '    return "b" if len(state["aggregate"]) < 7 else END',
    "",
    'builder.add_edge(START, "a")',
    'builder.add_conditional_edges("a", route)',
    'builder.add_edge("b", "a")',
    "graph = builder.compile()",
  ].join("\n"),
  validationCode: [
    "from course_harness import check_eq",
    'result = graph.invoke({"aggregate": []})',
    'check_eq("loop_len", "el grafo itera hasta longitud 7", len(result["aggregate"]), 7)',
    'check_eq(',
    '    "loop_pattern",',
    '    "el patron alterna A/B empezando en A",',
    '    result["aggregate"],',
    '    ["A", "B", "A", "B", "A", "B", "A"],',
    ")",
  ].join("\n"),
};

/**
 * R1 — grounding §2: múltiples esquemas de estado (input/output/private).
 * Salida documentada: graph.invoke({"user_input": "My"}) == {"graph_output": "My name is Lance"}
 */
export const GROUNDING_SCHEMAS_CHALLENGE = {
  id: "test-grounding-schemas",
  studentCode: [
    "from typing import TypedDict",
    "from langgraph.graph import END, START, StateGraph",
    "",
    "class InputState(TypedDict):",
    "    user_input: str",
    "class OutputState(TypedDict):",
    "    graph_output: str",
    "class OverallState(TypedDict):",
    "    foo: str",
    "    user_input: str",
    "    graph_output: str",
    "class PrivateState(TypedDict):",
    "    bar: str",
    "",
    "def node_1(state: InputState) -> OverallState:",
    '    return {"foo": state["user_input"] + " name"}',
    "def node_2(state: OverallState) -> PrivateState:",
    '    return {"bar": state["foo"] + " is"}',
    "def node_3(state: PrivateState) -> OutputState:",
    '    return {"graph_output": state["bar"] + " Lance"}',
    "",
    "builder = StateGraph(OverallState, input_schema=InputState, output_schema=OutputState)",
    'builder.add_node("node_1", node_1)',
    'builder.add_node("node_2", node_2)',
    'builder.add_node("node_3", node_3)',
    'builder.add_edge(START, "node_1")',
    'builder.add_edge("node_1", "node_2")',
    'builder.add_edge("node_2", "node_3")',
    'builder.add_edge("node_3", END)',
    "graph = builder.compile()",
  ].join("\n"),
  validationCode: [
    "from course_harness import check_eq",
    'result = graph.invoke({"user_input": "My"})',
    'check_eq(',
    '    "schema_output",',
    "    \"graph_output es 'My name is Lance'\",",
    "    result,",
    '    {"graph_output": "My name is Lance"},',
    ")",
  ].join("\n"),
};

/**
 * CA-10: durante la validación, el scope de Python NO debe tener acceso a red
 * (`js.fetch`/`XMLHttpRequest` eliminados del scope, ARCHITECTURE.md §C-RUNNER).
 */
export const NETWORK_BLOCKED_CHALLENGE = {
  id: "test-network-blocked",
  studentCode: "",
  validationCode: [
    "from course_harness import check",
    "",
    "fetch_blocked = True",
    "try:",
    "    import js",
    '    js.fetch("https://example.com")',
    "    fetch_blocked = False",
    "except Exception:",
    "    fetch_blocked = True",
    'check("fetch_blocked", "js.fetch no esta disponible en la validacion", fetch_blocked)',
    "",
    "xhr_blocked = True",
    "try:",
    "    from js import XMLHttpRequest",
    "    XMLHttpRequest.new()",
    "    xhr_blocked = False",
    "except Exception:",
    "    xhr_blocked = True",
    'check("xhr_blocked", "XMLHttpRequest no esta disponible en la validacion", xhr_blocked)',
  ].join("\n"),
};
