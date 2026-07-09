# Shim de `langgraph.graph.message` (superficie CORE, C-RUNNER §tabla del shim).
#
# `add_messages`: reducer para listas de mensajes. Semántica (grounding §3):
# append de mensajes nuevos; si un mensaje entrante trae un `id` ya presente
# en la lista existente, lo REEMPLAZA en su posición (update-by-id) en vez de
# duplicarlo. Acepta tanto dicts `{role, content}` como los objetos Message
# de este shim (`HumanMessage`/`AIMessage`/`SystemMessage`/`ToolMessage`).
from __future__ import annotations

import uuid
from typing import Any, Iterable, Optional

__all__ = [
    "BaseMessage",
    "AnyMessage",
    "HumanMessage",
    "AIMessage",
    "SystemMessage",
    "ToolMessage",
    "add_messages",
]


class BaseMessage:
    type: str = "base"

    def __init__(self, content: str, id: Optional[str] = None, **extra: Any) -> None:
        self.content = content
        self.id = id or uuid.uuid4().hex
        for key, value in extra.items():
            setattr(self, key, value)

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, BaseMessage):
            return NotImplemented
        return (
            type(self) is type(other)
            and self.content == other.content
            and self.id == other.id
        )

    def __repr__(self) -> str:  # pragma: no cover - solo depuración
        return f"{type(self).__name__}(content={self.content!r}, id={self.id!r})"


class HumanMessage(BaseMessage):
    type = "human"


class AIMessage(BaseMessage):
    type = "ai"

    def __init__(
        self,
        content: str,
        id: Optional[str] = None,
        tool_calls: Optional[list[dict[str, Any]]] = None,
        **extra: Any,
    ) -> None:
        super().__init__(content, id=id, **extra)
        self.tool_calls = tool_calls or []


class SystemMessage(BaseMessage):
    type = "system"


class ToolMessage(BaseMessage):
    type = "tool"

    def __init__(
        self,
        content: str,
        tool_call_id: Optional[str] = None,
        id: Optional[str] = None,
        **extra: Any,
    ) -> None:
        super().__init__(content, id=id, **extra)
        self.tool_call_id = tool_call_id


# Alias de tipado (grounding base §3, `from langchain.messages import AnyMessage`).
# En LangGraph real es un `Union[...]`; aquí basta con la clase base para anotaciones,
# el shim no verifica tipos en runtime.
AnyMessage = BaseMessage


_ROLE_TO_CLASS: dict[str, type[BaseMessage]] = {
    "human": HumanMessage,
    "user": HumanMessage,
    "ai": AIMessage,
    "assistant": AIMessage,
    "system": SystemMessage,
    "tool": ToolMessage,
}


def _coerce(message: Any) -> BaseMessage:
    if isinstance(message, BaseMessage):
        return message
    if isinstance(message, dict):
        role = message.get("role", message.get("type", "human"))
        cls = _ROLE_TO_CLASS.get(role, HumanMessage)
        extra = {
            key: value
            for key, value in message.items()
            if key not in ("role", "type", "content")
        }
        return cls(message.get("content", ""), **extra)
    raise TypeError(f"Mensaje no soportado por add_messages: {message!r}")


def add_messages(existing: Optional[Iterable[Any]], new: Optional[Iterable[Any]]) -> list[BaseMessage]:
    """Reducer: append-por-defecto, update-by-id si el `id` ya existe."""
    result: list[BaseMessage] = [
        m if isinstance(m, BaseMessage) else _coerce(m) for m in (existing or [])
    ]
    index_by_id = {m.id: i for i, m in enumerate(result)}
    for raw in new or []:
        message = _coerce(raw)
        if message.id in index_by_id:
            result[index_by_id[message.id]] = message
        else:
            index_by_id[message.id] = len(result)
            result.append(message)
    return result
