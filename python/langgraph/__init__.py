# Shim puro-Python de `langgraph` (ADR-02, C-RUNNER §tabla del shim).
#
# Superficie CORE (S6): `langgraph.graph` (StateGraph, START, END,
# add_node/add_edge/add_conditional_edges, compile/invoke, esquemas
# input/output/private, límite de recursión, MessagesState) y
# `langgraph.graph.message` (add_messages).
#
# Superficie AVANZADA (S12, ver tabla "Avanzado" de C-RUNNER — CERRADA):
# `langgraph.checkpoint.memory.InMemorySaver`, `langgraph.store.memory.InMemoryStore`,
# `langgraph.types` (interrupt/Command), `langgraph.prebuilt` (ToolNode,
# create_react_agent), `langgraph.config.get_stream_writer`, y los alias
# `langchain`/`langchain_core` (messages, tools). El executor de `langgraph.graph`
# ejecuta por supersteps atómicos (ADR-08). `subgraphs` NO está en la tabla del shim:
# fuera de superficie.
