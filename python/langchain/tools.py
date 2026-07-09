# Shim de `langchain.tools.tool` (superficie AVANZADA, C-RUNNER §tabla del shim, S12).
#
# `@tool` sobre una función con docstring -> objeto tool con `.name` (nombre de la
# función), `.description` (docstring) e `.invoke(args_dict)` (grounding-avanzado §3).
from __future__ import annotations

from typing import Any, Callable, Optional

__all__ = ["tool", "Tool"]


class Tool:
    def __init__(self, fn: Callable[..., Any], name: Optional[str] = None) -> None:
        self.fn = fn
        self.name = name or getattr(fn, "__name__", "tool")
        self.description = (fn.__doc__ or "").strip()

    def invoke(self, tool_input: Any) -> Any:
        if isinstance(tool_input, dict):
            return self.fn(**tool_input)
        return self.fn(tool_input)

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        return self.fn(*args, **kwargs)

    def __repr__(self) -> str:  # pragma: no cover - solo depuración
        return f"Tool(name={self.name!r})"


def tool(fn: Optional[Callable[..., Any]] = None) -> Any:
    """Decorador `@tool` (con o sin paréntesis) que envuelve `fn` en un `Tool`."""

    def _wrap(target: Callable[..., Any]) -> Tool:
        return Tool(target)

    if fn is not None and callable(fn):
        return _wrap(fn)
    return _wrap
