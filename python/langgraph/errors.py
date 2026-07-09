# Shim de `langgraph.errors` (superficie AVANZADA, C-RUNNER §superstep, ADR-08, S12).
#
# `InvalidUpdateError`: escritura concurrente a una clave SIN reducer dentro del mismo
# superstep (igual path de import que LangGraph real: `langgraph.errors`).
from __future__ import annotations

__all__ = ["InvalidUpdateError"]


class InvalidUpdateError(Exception):
    """Dos (o más) nodos activos del mismo superstep devolvieron un update para la
    misma clave del estado, y esa clave no tiene un reducer (`Annotated[T, reducer]`).
    Añade un reducer si el fan-out es intencional (ADR-08)."""
