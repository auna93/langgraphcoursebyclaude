# Shim de `langgraph.checkpoint.memory.InMemorySaver` (superficie AVANZADA, S12).
#
# Guarda, por `thread_id`, el historial de `StateSnapshot` que el executor
# (`langgraph.graph.CompiledGraph`) produce al cierre de cada superstep. El estado de
# un hilo sobrevive entre `invoke()`/`stream()` sucesivos con el mismo `thread_id`;
# hilos distintos no se ven entre sí (C-RUNNER §tabla avanzada).
from __future__ import annotations

from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:  # pragma: no cover - solo tipado
    from langgraph.graph import StateSnapshot

__all__ = ["InMemorySaver"]


class InMemorySaver:
    """Checkpointer en memoria: `{thread_id: [StateSnapshot, ...]}` (orden temporal)."""

    def __init__(self) -> None:
        self._history: dict[str, list["StateSnapshot"]] = {}

    def save(self, thread_id: str, snapshot: "StateSnapshot") -> None:
        self._history.setdefault(thread_id, []).append(snapshot)

    def latest(self, thread_id: str) -> Optional["StateSnapshot"]:
        history = self._history.get(thread_id)
        return history[-1] if history else None

    def history(self, thread_id: str) -> list["StateSnapshot"]:
        """Más reciente primero (C-RUNNER: `get_state_history`)."""
        return list(reversed(self._history.get(thread_id, [])))
