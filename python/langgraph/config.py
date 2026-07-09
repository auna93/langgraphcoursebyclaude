# Shim de `langgraph.config` (superficie CORE, C-RUNNER §tabla del shim).
#
# `get_stream_writer()` devuelve una función `writer(payload)` que publica eventos en
# el canal `custom` de `graph.stream(..., stream_mode="custom")` (grounding base §5).
# Fuera de un `stream()`/`invoke()` en curso, o si el modo `custom` no está activo,
# el writer es un no-op (igual que LangGraph real).
from __future__ import annotations

from typing import Any, Callable

from langgraph._runtime import current

__all__ = ["get_stream_writer"]


def get_stream_writer() -> Callable[[Any], None]:
    ctx = current()

    def writer(payload: Any) -> None:
        if ctx is not None:
            ctx.emit_custom(payload)

    return writer
