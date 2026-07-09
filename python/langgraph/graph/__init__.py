# Shim de `langgraph.graph` (C-RUNNER §tabla del shim).
#
# Superficie CORE (S6): `StateGraph`, `START`/`END`, `MessagesState`,
# `add_node`/`add_edge`/`add_conditional_edges`, `compile()`/`invoke()`, esquemas de
# estado input/output/private (con proyección de salida) y reducers vía
# `Annotated[T, reducer]` (p. ej. `operator.add`, `add_messages`).
#
# Superficie AVANZADA (S12): `checkpointer=`/`store=` en `compile()`, `get_state`/
# `get_state_history`, `interrupt`/`Command` (`langgraph.types`), `stream()` con
# `stream_mode` incluyendo `"messages"`.
#
# Límite de recursión: por defecto 25 "supersteps" (igual que LangGraph real); se puede
# ajustar con `config={"recursion_limit": N}` en `invoke()`. Superado el límite, se
# lanza `GraphRecursionError` con un mensaje claro (R3).
#
# ADR-08 (M3) — Supersteps atómicos (modelo Pregel): en cada superstep se ejecutan
# todos los nodos activos, sus updates se RECOLECTAN y se aplican al estado al CIERRE
# del superstep; los nodos de un superstep ven el estado del cierre del superstep
# anterior (nunca updates de sus "hermanos"). Aplicación al cierre: clave con reducer
# se reduce acumulando en orden de registro (`add_node`); clave SIN reducer escrita por
# más de un nodo en el mismo superstep -> `InvalidUpdateError`. Con 1 nodo activo por
# superstep (todo M1) el resultado es idéntico al merge inmediato anterior (R10). `Send`
# / map-reduce dinámico NO está en la superficie: prohibido.
from __future__ import annotations

import inspect
import typing
from typing import Any, Callable, Optional

from langgraph._runtime import _RunContext, pop, push
from langgraph.errors import InvalidUpdateError
from langgraph.graph.message import AnyMessage, add_messages
from langgraph.types import Command, GraphInterrupt, Interrupt

START = "__start__"
END = "__end__"

DEFAULT_RECURSION_LIMIT = 25

__all__ = [
    "START",
    "END",
    "DEFAULT_RECURSION_LIMIT",
    "StateGraph",
    "CompiledGraph",
    "MessagesState",
    "StateSnapshot",
    "GraphRecursionError",
    "InvalidUpdateError",
]

_MISSING = object()


class GraphRecursionError(RuntimeError):
    """Se superó el límite de recursión (supersteps) del grafo.

    Suele indicar un ciclo (`add_conditional_edges`) sin una condición de
    salida que alcance `END`.
    """


class StateSnapshot:
    """Snapshot de `get_state`/`get_state_history`: `.values` y `.next`."""

    __slots__ = ("values", "next")

    def __init__(self, values: dict, next: tuple[str, ...]) -> None:
        self.values = values
        self.next = tuple(next)

    def __repr__(self) -> str:  # pragma: no cover - solo depuración
        return f"StateSnapshot(values={self.values!r}, next={self.next!r})"


def _extract_reducer(annotation: Any) -> Optional[Callable[[Any, Any], Any]]:
    """Si `annotation` es `Annotated[T, reducer]`, devuelve `reducer`."""
    metadata = getattr(annotation, "__metadata__", None)
    if not metadata:
        return None
    for candidate in metadata:
        if callable(candidate):
            return candidate
    return None


def _reducers_for(schema: Any) -> dict[str, Callable[[Any, Any], Any]]:
    try:
        hints = typing.get_type_hints(schema, include_extras=True)
    except Exception:
        hints = getattr(schema, "__annotations__", {}) or {}
    reducers: dict[str, Callable[[Any, Any], Any]] = {}
    for key, annotation in hints.items():
        reducer = _extract_reducer(annotation)
        if reducer is not None:
            reducers[key] = reducer
    return reducers


def _schema_keys(schema: Any) -> Optional[set[str]]:
    if schema is None:
        return None
    hints = getattr(schema, "__annotations__", None)
    if hints is None:
        return None
    return set(hints.keys())


def _wants_store(fn: Callable[..., Any]) -> bool:
    """Un nodo declara `def node(state, *, store):` para recibir el store inyectado."""
    try:
        sig = inspect.signature(fn)
    except (TypeError, ValueError):  # pragma: no cover - callables sin signature
        return False
    param = sig.parameters.get("store")
    return param is not None and param.kind == inspect.Parameter.KEYWORD_ONLY


MessagesState = typing.TypedDict(
    "MessagesState",
    {"messages": typing.Annotated[list[AnyMessage], add_messages]},
)
"""`TypedDict` con `messages: Annotated[list[AnyMessage], add_messages]`."""


class StateGraph:
    """Constructor de grafos (shim de `langgraph.graph.StateGraph`)."""

    def __init__(
        self,
        state_schema: Any,
        input_schema: Any = None,
        output_schema: Any = None,
    ) -> None:
        self.state_schema = state_schema
        self.input_schema = input_schema
        self.output_schema = output_schema
        self._nodes: dict[str, Callable[..., Optional[dict]]] = {}
        self._edges: dict[str, list[str]] = {}
        self._conditional: dict[str, tuple[Callable[[dict], Any], Optional[dict]]] = {}
        # Lista (no un único str): `add_edge(START, x)` puede llamarse más de una vez
        # para declarar fan-out inicial (ADR-08, ambos nodos activos en el superstep 1).
        self._entry: list[str] = []
        self._reducers = _reducers_for(state_schema)

    def add_node(
        self,
        name_or_fn: Any,
        fn: Optional[Callable[..., Optional[dict]]] = None,
    ) -> "StateGraph":
        if fn is None:
            fn = name_or_fn
            name = getattr(fn, "__name__", None)
            if not name:
                raise ValueError("add_node requiere un nombre si la función no tiene __name__")
        else:
            name = name_or_fn
        if name in (START, END):
            raise ValueError(f"No se puede usar {name!r} como nombre de nodo")
        self._nodes[name] = fn
        return self

    def add_edge(self, source: str, target: str) -> "StateGraph":
        if source == START:
            if target not in self._entry:
                self._entry.append(target)
            return self
        self._edges.setdefault(source, [])
        if target not in self._edges[source]:
            self._edges[source].append(target)
        return self

    def add_conditional_edges(
        self,
        source: str,
        path: Callable[[dict], Any],
        path_map: Optional[dict[Any, str]] = None,
    ) -> "StateGraph":
        self._conditional[source] = (path, path_map)
        return self

    def compile(self, checkpointer: Any = None, store: Any = None) -> "CompiledGraph":
        if not self._entry:
            raise ValueError(
                "El grafo no tiene punto de entrada. Usa add_edge(START, <nodo>)."
            )
        return CompiledGraph(self, checkpointer=checkpointer, store=store)


class CompiledGraph:
    """Grafo compilado (shim de lo que devuelve `StateGraph.compile()`)."""

    def __init__(self, builder: StateGraph, checkpointer: Any = None, store: Any = None) -> None:
        self._builder = builder
        self._checkpointer = checkpointer
        self._store = store
        # Soporta ser usado como nodo de un grafo padre (subgraph-como-nodo):
        # add_node(subgraph) toma el nombre de la variable via __name__ si se define.

    def __call__(self, state: dict) -> dict:
        return self.invoke(state)

    # ------------------------------------------------------------------
    # Helpers de proyección / routing (sin cambios respecto a S6)
    # ------------------------------------------------------------------

    def _project_input(self, state: dict) -> dict:
        return dict(state)

    def _node_order(self) -> list[str]:
        return list(self._builder._nodes.keys())

    def _call_node(self, fn: Callable[..., Any], state: dict, ctx: _RunContext) -> Any:
        if _wants_store(fn):
            return fn(state, store=ctx.store)
        return fn(state)

    def _targets_after(self, node_name: str, state: dict) -> list[str]:
        conditional = self._builder._conditional.get(node_name)
        if conditional is not None:
            path_fn, path_map = conditional
            result = path_fn(state)
            # `path_map` puede ser un dict (remapea el valor devuelto por `path_fn` a
            # un nombre de nodo) o una lista/tupla (solo documenta los destinos
            # posibles; el valor devuelto por `path_fn` ES el nombre del nodo,
            # grounding-avanzado §3: `add_conditional_edges(..., ["tool_node", END])`).
            if isinstance(path_map, dict):
                target = path_map[result]
            else:
                target = result
            return [target]
        return list(self._builder._edges.get(node_name, []))

    def _project_output(self, state: dict) -> dict:
        output_schema = self._builder.output_schema
        keys = _schema_keys(output_schema)
        if keys is None:
            return dict(state)
        return {key: state[key] for key in keys if key in state}

    def _thread_id(self, config: Optional[dict]) -> Optional[str]:
        if not config:
            return None
        return config.get("configurable", {}).get("thread_id")

    def _recursion_limit(self, config: Optional[dict]) -> int:
        if config and "recursion_limit" in config:
            return config["recursion_limit"]
        return DEFAULT_RECURSION_LIMIT

    # ------------------------------------------------------------------
    # Aplicación de updates al cierre del superstep (ADR-08)
    # ------------------------------------------------------------------

    def _apply_updates(self, state: dict, pending: list[tuple[str, dict]]) -> dict:
        new_state = dict(state)
        writers_by_key: dict[str, list[tuple[str, Any]]] = {}
        for node_name, update in pending:
            if update is None:
                continue
            if not isinstance(update, dict):
                raise TypeError(
                    "Cada nodo debe devolver un dict con las claves actualizadas (o None)."
                )
            for key, value in update.items():
                writers_by_key.setdefault(key, []).append((node_name, value))

        for key, writers in writers_by_key.items():
            reducer = self._builder._reducers.get(key)
            if reducer is None:
                if len(writers) > 1:
                    names = ", ".join(name for name, _ in writers)
                    raise InvalidUpdateError(
                        f"Escritura concurrente a la clave {key!r} sin reducer, desde los "
                        f"nodos: {names}. Añade un reducer (Annotated[T, reducer]) en el "
                        "esquema de estado si el fan-out es intencional."
                    )
                new_state[key] = writers[0][1]
                continue
            if key in new_state:
                acc = new_state[key]
                for _, value in writers:
                    acc = reducer(acc, value)
            else:
                acc = writers[0][1]
                for _, value in writers[1:]:
                    acc = reducer(acc, value)
            new_state[key] = acc
        return new_state

    # ------------------------------------------------------------------
    # Motor de ejecución por supersteps (compartido por invoke/stream)
    # ------------------------------------------------------------------

    def _run(
        self,
        input_state: Optional[dict],
        config: Optional[dict],
        *,
        emit: Optional[Callable[[str, Any], None]] = None,
    ) -> dict:
        thread_id = self._thread_id(config)
        limit = self._recursion_limit(config)

        resume_map: dict[str, Any] = {}
        if isinstance(input_state, Command) and input_state.has_resume:
            if self._checkpointer is None or thread_id is None:
                raise RuntimeError(
                    "Command(resume=...) requiere compile(checkpointer=...) y "
                    "config={'configurable': {'thread_id': ...}}."
                )
            snapshot = self._checkpointer.latest(thread_id)
            if snapshot is None or not snapshot.next:
                raise RuntimeError(
                    f"No hay ejecución pausada que reanudar en el hilo {thread_id!r}."
                )
            state = dict(snapshot.values)
            active = list(snapshot.next)
            resume_map = {name: input_state.resume for name in active}
        else:
            base_values: dict = {}
            if thread_id is not None and self._checkpointer is not None:
                snapshot = self._checkpointer.latest(thread_id)
                if snapshot is not None:
                    base_values = dict(snapshot.values)
            if input_state:
                state = self._apply_updates(base_values, [(START, dict(input_state))])
            else:
                state = dict(base_values)
            active = list(self._builder._entry)

        step = 0
        node_order = self._node_order()
        ordering = {name: i for i, name in enumerate(node_order)}

        while active:
            step += 1
            if step > limit:
                raise GraphRecursionError(
                    f"El grafo superó el límite de recursión ({limit} pasos). "
                    "Revisa las condiciones de salida de los ciclos "
                    "(add_conditional_edges)."
                )
            ordered_active = sorted(dict.fromkeys(active), key=lambda n: ordering.get(n, 0))

            pending_updates: list[tuple[str, dict]] = []
            interrupts_this_step: list[tuple[str, Any]] = []
            commands_by_node: dict[str, Command] = {}

            for node_name in ordered_active:
                if node_name == END:
                    continue
                fn = self._builder._nodes.get(node_name)
                if fn is None:
                    raise KeyError(f"Nodo desconocido: {node_name!r}")

                ctx = _RunContext(
                    store=self._store,
                    node_name=node_name,
                    writer=(lambda payload: emit("custom", payload)) if emit else None,
                )
                if node_name in resume_map:
                    ctx.resume_available = True
                    ctx.resume_value = resume_map[node_name]

                push(ctx)
                try:
                    result = self._call_node(fn, self._project_input(state), ctx)
                except GraphInterrupt as gi:
                    if self._checkpointer is None or thread_id is None:
                        raise RuntimeError(
                            "interrupt() requiere compile(checkpointer=...) y "
                            "config={'configurable': {'thread_id': ...}} para poder "
                            "pausar y reanudar el grafo."
                        ) from gi
                    interrupts_this_step.append((node_name, gi.value))
                    continue
                finally:
                    pop()

                if isinstance(result, Command):
                    commands_by_node[node_name] = result
                    if result.update:
                        pending_updates.append((node_name, result.update))
                elif result is not None:
                    pending_updates.append((node_name, result))
                    if emit:
                        messages_update = result.get("messages") if isinstance(result, dict) else None
                        if messages_update:
                            for msg in messages_update:
                                emit("messages", (msg, node_name))

            resume_map = {}
            state = self._apply_updates(state, pending_updates)

            if emit:
                emit("values", dict(state))
                for node_name, update in pending_updates:
                    emit("updates", {node_name: update})

            if interrupts_this_step:
                next_nodes = tuple(name for name, _ in interrupts_this_step)
                if self._checkpointer is not None and thread_id is not None:
                    self._checkpointer.save(thread_id, StateSnapshot(dict(state), next_nodes))
                output = self._project_output(state)
                output["__interrupt__"] = [Interrupt(value) for _, value in interrupts_this_step]
                return output

            next_active: list[str] = []
            for node_name in ordered_active:
                command = commands_by_node.get(node_name)
                if command is not None:
                    if command.goto and command.goto != END and command.goto not in next_active:
                        next_active.append(command.goto)
                    continue
                for target in self._targets_after(node_name, state):
                    if target != END and target not in next_active:
                        next_active.append(target)
            active = next_active

            if self._checkpointer is not None and thread_id is not None:
                self._checkpointer.save(thread_id, StateSnapshot(dict(state), tuple(active)))

        return self._project_output(state)

    # ------------------------------------------------------------------
    # API pública
    # ------------------------------------------------------------------

    def invoke(self, input_state: Optional[dict] = None, config: Optional[dict] = None) -> dict:
        return self._run(input_state, config)

    def stream(
        self,
        input_state: Optional[dict] = None,
        config: Optional[dict] = None,
        stream_mode: Any = "values",
        **_ignored: Any,
    ):
        """`graph.stream(input, stream_mode=...)`.

        Modo simple (string): yields los eventos crudos de ese modo (`values` -> dict de
        estado tras cada superstep; `updates` -> `{node_name: update}` por nodo que
        escribió en el superstep; `custom` -> el payload de `get_stream_writer()`;
        `messages` -> tuplas `(message_chunk, metadata)` token a token, determinista por
        palabras, con `metadata["langgraph_node"]` = nodo emisor).
        Modo lista: yields tuplas `(modo, evento)` combinando los modos pedidos.
        """
        modes = stream_mode if isinstance(stream_mode, list) else [stream_mode]
        events: list[tuple[str, Any]] = []

        def emit(mode: str, payload: Any) -> None:
            if mode == "messages" and "messages" in modes:
                for chunk, metadata in _tokenize_message(payload[0], payload[1]):
                    events.append(("messages", (chunk, metadata)))
            elif mode in modes:
                events.append((mode, payload))

        self._run(input_state, config, emit=emit)

        single = not isinstance(stream_mode, list)
        for mode, payload in events:
            yield payload if single else (mode, payload)

    def get_state(self, config: Optional[dict]) -> StateSnapshot:
        thread_id = self._thread_id(config)
        if self._checkpointer is None or thread_id is None:
            raise RuntimeError("get_state requiere compile(checkpointer=...) y thread_id.")
        snapshot = self._checkpointer.latest(thread_id)
        return snapshot if snapshot is not None else StateSnapshot({}, ())

    def get_state_history(self, config: Optional[dict]) -> list[StateSnapshot]:
        thread_id = self._thread_id(config)
        if self._checkpointer is None or thread_id is None:
            raise RuntimeError("get_state_history requiere compile(checkpointer=...) y thread_id.")
        return self._checkpointer.history(thread_id)


def _tokenize_message(message: Any, node_name: str) -> list[tuple[Any, dict]]:
    """Trocea `message.content` en tokens deterministas (split por espacios,
    conservando el separador en cada token salvo el último) para `stream_mode="messages"`.
    """
    from langgraph.graph.message import AIMessage

    content = getattr(message, "content", "")
    words = content.split(" ")
    chunks: list[tuple[Any, dict]] = []
    metadata = {"langgraph_node": node_name}
    for i, word in enumerate(words):
        text = word if i == len(words) - 1 else word + " "
        chunk = AIMessage(text, id=getattr(message, "id", None))
        chunks.append((chunk, metadata))
    return chunks
