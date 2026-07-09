# Estado interno del executor (NO es superficie pública del shim).
#
# Compartido entre `langgraph.graph` (el executor de supersteps), `langgraph.types`
# (interrupt/Command) y `langgraph.config` (get_stream_writer) para resolver, durante
# la ejecución de un nodo, si hay un valor de resume disponible, cuál es el store
# inyectable y a qué "escritor" de eventos custom debe mandar `get_stream_writer()`.
#
# Pila (no solo un valor) para tolerar nodos que invocan un subgrafo compilado (mismo
# proceso, ejecución síncrona, reentrante).
from __future__ import annotations

from typing import Any, Callable, Optional


class _RunContext:
    __slots__ = (
        "resume_available",
        "resume_value",
        "resume_consumed",
        "store",
        "node_name",
        "_writer",
    )

    def __init__(
        self,
        store: Any = None,
        node_name: Optional[str] = None,
        writer: Optional[Callable[[Any], None]] = None,
    ) -> None:
        self.resume_available = False
        self.resume_value: Any = None
        self.resume_consumed = False
        self.store = store
        self.node_name = node_name
        self._writer = writer

    def emit_custom(self, payload: Any) -> None:
        if self._writer is not None:
            self._writer(payload)


_stack: list[_RunContext] = []


def push(ctx: _RunContext) -> None:
    _stack.append(ctx)


def pop() -> None:
    _stack.pop()


def current() -> Optional[_RunContext]:
    return _stack[-1] if _stack else None
