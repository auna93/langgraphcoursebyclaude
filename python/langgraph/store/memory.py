# Shim de `langgraph.store.memory.InMemoryStore` (superficie AVANZADA, S12).
#
# Memoria compartida ENTRE hilos (a diferencia del checkpointer, que es memoria de UN
# hilo). `namespace` es una tupla de strings; `put`/`get`/`search` (C-RUNNER §tabla
# avanzada, grounding-avanzado §2). `search(namespace, query=None, limit=10)` hace
# matching léxico case-insensitive sobre el `value` serializado, en orden de inserción,
# determinista; `query=None` devuelve todos (hasta `limit`).
from __future__ import annotations

import json
from typing import Any, Optional

__all__ = ["InMemoryStore", "StoreItem"]


class StoreItem:
    """Resultado de `put`/`get`/`search`: `.namespace`, `.key`, `.value`."""

    __slots__ = ("namespace", "key", "value")

    def __init__(self, namespace: tuple[str, ...], key: str, value: Any) -> None:
        self.namespace = namespace
        self.key = key
        self.value = value

    def __repr__(self) -> str:  # pragma: no cover - solo depuración
        return f"StoreItem(namespace={self.namespace!r}, key={self.key!r}, value={self.value!r})"


class InMemoryStore:
    """Store en memoria compartido entre hilos: `{namespace: {key: StoreItem}}`."""

    def __init__(self) -> None:
        self._data: dict[tuple[str, ...], dict[str, StoreItem]] = {}

    def put(self, namespace: tuple[str, ...], key: str, value: Any) -> None:
        namespace = tuple(namespace)
        bucket = self._data.setdefault(namespace, {})
        bucket[key] = StoreItem(namespace, key, value)

    def get(self, namespace: tuple[str, ...], key: str) -> Optional[StoreItem]:
        bucket = self._data.get(tuple(namespace))
        if bucket is None:
            return None
        return bucket.get(key)

    def search(
        self,
        namespace: tuple[str, ...],
        query: Optional[str] = None,
        limit: int = 10,
    ) -> list[StoreItem]:
        bucket = self._data.get(tuple(namespace), {})
        items = list(bucket.values())  # orden de inserción (dict de Python 3.7+)
        if query:
            needle = query.lower()
            items = [
                item
                for item in items
                if needle in json.dumps(item.value, sort_keys=True, default=str).lower()
            ]
        return items[:limit]
