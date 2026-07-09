# Shim de `langgraph.types` (superficie AVANZADA, C-RUNNER §tabla del shim, S12).
#
# `interrupt(value)`: pausa el grafo DENTRO de un nodo. Si hay un valor de resume
# disponible (porque el invoke actual reanuda ese nodo tras un `Command(resume=...)`),
# devuelve ese valor y el nodo continúa. Si no, lanza `GraphInterrupt` — el executor
# (`langgraph.graph`) la captura y pausa el grafo en ese nodo (grounding-avanzado §1).
#
# `Command`: `resume=` se pasa como `input_state` de `invoke()` para reanudar un hilo
# pausado; `goto=`/`update=` se devuelve DESDE un nodo para enrutar+actualizar estado
# ignorando las aristas salientes (base de handoffs multi-agente, grounding-avanzado §4).
from __future__ import annotations

from typing import Any, Optional

from langgraph._runtime import current

__all__ = ["interrupt", "Command", "GraphInterrupt", "Interrupt"]

_MISSING = object()


class GraphInterrupt(Exception):
    """Señal interna: un nodo llamó a `interrupt()` sin resume disponible."""

    def __init__(self, value: Any) -> None:
        super().__init__("El grafo se interrumpió (interrupt()).")
        self.value = value


class Interrupt:
    """Elemento de la lista `"__interrupt__"` que devuelve `invoke()` al pausar."""

    __slots__ = ("value",)

    def __init__(self, value: Any) -> None:
        self.value = value

    def __eq__(self, other: object) -> bool:
        return isinstance(other, Interrupt) and self.value == other.value

    def __repr__(self) -> str:  # pragma: no cover - solo depuración
        return f"Interrupt(value={self.value!r})"


def interrupt(value: Any) -> Any:
    """Pausa el nodo actual (o devuelve el valor de resume si se está reanudando)."""
    ctx = current()
    if ctx is None:
        raise RuntimeError(
            "interrupt() solo puede llamarse dentro de un nodo en ejecución de un grafo compilado."
        )
    if ctx.resume_available and not ctx.resume_consumed:
        ctx.resume_consumed = True
        return ctx.resume_value
    raise GraphInterrupt(value)


class Command:
    """`Command(resume=...)` reanuda; `Command(goto=..., update=...)` enruta+actualiza."""

    def __init__(
        self,
        resume: Any = _MISSING,
        goto: Optional[str] = None,
        update: Optional[dict[str, Any]] = None,
    ) -> None:
        self.resume = resume
        self.goto = goto
        self.update = update

    @property
    def has_resume(self) -> bool:
        return self.resume is not _MISSING

    def __repr__(self) -> str:  # pragma: no cover - solo depuración
        return f"Command(resume={self.resume!r}, goto={self.goto!r}, update={self.update!r})"
