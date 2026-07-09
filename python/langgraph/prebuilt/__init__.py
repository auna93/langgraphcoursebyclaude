# Shim de `langgraph.prebuilt` (superficie AVANZADA, C-RUNNER §tabla del shim, S12):
# `ToolNode` y `create_react_agent` (grounding-avanzado §3-4).
from __future__ import annotations

from typing import Any, Callable, Iterable

from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.graph.message import AIMessage, ToolMessage

__all__ = ["ToolNode", "create_react_agent"]


class ToolNode:
    """Nodo prefabricado: ejecuta los `tool_calls` de la última `AIMessage`.

    Uso como nodo: `builder.add_node("tools", ToolNode(tools))`. Ejecuta cada tool en
    el orden de la lista `tool_calls` (secuencial, determinista) y devuelve
    `{"messages": [ToolMessage(content=str(resultado), tool_call_id=id), ...]}`.
    """

    def __init__(self, tools: Iterable[Any]) -> None:
        self.tools = list(tools)
        self._by_name = {getattr(t, "name", getattr(t, "__name__", None)): t for t in self.tools}
        self.__name__ = "tools"

    def __call__(self, state: dict) -> dict:
        messages = state.get("messages", [])
        if not messages:
            raise ValueError("ToolNode requiere state['messages'] con al menos una AIMessage.")
        last = messages[-1]
        tool_calls = getattr(last, "tool_calls", None) or []
        result: list[ToolMessage] = []
        for call in tool_calls:
            name = call["name"]
            tool_fn = self._by_name.get(name)
            if tool_fn is None:
                raise KeyError(f"Tool desconocida: {name!r} (tools registradas: {list(self._by_name)})")
            observation = tool_fn.invoke(call.get("args", {}))
            result.append(ToolMessage(content=str(observation), tool_call_id=call.get("id")))
        return {"messages": result}


def _should_continue(state: dict) -> str:
    messages = state.get("messages", [])
    last = messages[-1] if messages else None
    tool_calls = getattr(last, "tool_calls", None) if last is not None else None
    return "tools" if tool_calls else END


def create_react_agent(model: Any, tools: Iterable[Any]) -> Any:
    """`create_react_agent(model, tools)` -> grafo compilado (loop ReAct, grounding-avanzado §4).

    Estado = `MessagesState`. Nodos `"agent"` (modelo con tools bind) y `"tools"`
    (`ToolNode`); ciclo modelo -> si hay tool_calls -> tools -> modelo -> ... hasta una
    `AIMessage` sin tool_calls.
    """
    tool_list = list(tools)
    llm_with_tools = model.bind_tools(tool_list)

    def agent(state: dict) -> dict:
        return {"messages": [llm_with_tools.invoke(state["messages"])]}

    builder = StateGraph(MessagesState)
    builder.add_node("agent", agent)
    builder.add_node("tools", ToolNode(tool_list))
    builder.add_edge(START, "agent")
    builder.add_conditional_edges("agent", _should_continue, {"tools": "tools", END: END})
    builder.add_edge("tools", "agent")
    return builder.compile()
