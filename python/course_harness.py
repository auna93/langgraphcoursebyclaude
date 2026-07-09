# course_harness — API que usa `validationCode` de los retos (C-RUNNER,
# ARCHITECTURE.md §4). Se importa en el namespace del alumno como:
#   from course_harness import check, check_eq, check_raises, get_llm_calls, FakeChatModel
#
# `run_attempt` es el punto de entrada que llama `py.worker.ts`: ejecuta
# studentCode + validationCode en un namespace nuevo por intento y devuelve
# un JSON con los CheckResult[], stdout y el resultado (ok/syntax/runtime).
# El worker además publica ese JSON en la variable reservada
# `__COURSE_RESULT__` del scope global de Pyodide (canal documentado en el
# contrato) tras cada intento.
from __future__ import annotations

import io
import json
import sys
import traceback
import types
from typing import Any, Callable, Iterable, Optional

_checks: list[dict[str, Any]] = []
_llm_calls: list[dict[str, Any]] = []
_configured_doubles: list[dict[str, Any]] = []


def _reset() -> None:
    """Limpia el estado del harness. Se llama al inicio de cada `run_attempt`."""
    _checks.clear()
    _llm_calls.clear()


def _configure(llm_doubles_json: Optional[str]) -> None:
    """Registra los `llmDoubles` del `CodeChallenge` para el intento actual."""
    _configured_doubles.clear()
    if llm_doubles_json:
        _configured_doubles.extend(json.loads(llm_doubles_json))


def check(id: str, description: str, condition: bool, message: str = "") -> bool:
    """Registra un CheckResult. `passed` = bool(condition)."""
    passed = bool(condition)
    _checks.append(
        {
            "id": id,
            "description": description,
            "passed": passed,
            "message": None if passed else (message or "La condición no se cumplió."),
        }
    )
    return passed


def check_eq(id: str, description: str, actual: Any, expected: Any) -> bool:
    """Check de igualdad; mensaje de fallo "esperado X, obtenido Y"."""
    passed = actual == expected
    message = None if passed else f"esperado {expected!r}, obtenido {actual!r}"
    _checks.append({"id": id, "description": description, "passed": passed, "message": message})
    return passed


def check_raises(
    id: str,
    description: str,
    fn: Callable[[], Any],
    exc_type: type,
) -> bool:
    """Check que `fn()` lanza `exc_type` (o una subclase)."""
    try:
        fn()
    except exc_type:
        _checks.append({"id": id, "description": description, "passed": True, "message": None})
        return True
    except Exception as exc:
        message = f"se esperaba {exc_type.__name__}, se obtuvo {type(exc).__name__}: {exc}"
        _checks.append({"id": id, "description": description, "passed": False, "message": message})
        return False
    _checks.append(
        {
            "id": id,
            "description": description,
            "passed": False,
            "message": (
                f"se esperaba que lanzara {exc_type.__name__}, "
                "no se lanzó ninguna excepción"
            ),
        }
    )
    return False


def get_llm_calls() -> list[dict[str, Any]]:
    """Lista de invocaciones registradas por `FakeChatModel` en este intento."""
    return [dict(call) for call in _llm_calls]


def _checks_snapshot() -> list[dict[str, Any]]:
    return [dict(c) for c in _checks]


def _last_human_text(messages: Iterable[Any]) -> str:
    for msg in reversed(list(messages)):
        if isinstance(msg, dict):
            role = msg.get("role", msg.get("type"))
            content = msg.get("content", "")
        else:
            role = getattr(msg, "type", None) or getattr(msg, "role", None)
            content = getattr(msg, "content", "")
        if role in ("human", "user"):
            return str(content)
    return ""


class FakeChatModel:
    """Doble determinista de modelo de chat (SU-02, C-RUNNER §tabla del shim).

    `doubles`: lista de `{matchSubstring?, respuesta, toolCalls?}` (mismo
    shape que `LlmDouble` de C-CONTENT). Si no se pasan explícitamente, usa
    los `llmDoubles` configurados por el runner para el `CodeChallenge`
    actual (`RunChallengeRequest.llmDoubles`).

    Resolución por `invoke(messages)`, según el último mensaje humano:
    1. El primer `double` cuyo `matchSubstring` está contenido en el texto.
    2. Si ninguno matchea, los `doubles` SIN `matchSubstring` actúan como
       cola de respuestas por defecto, en orden (se repiten cíclicamente si
       hay más llamadas que dobles, para no romper por agotamiento).
    """

    def __init__(self, doubles: Optional[list[dict[str, Any]]] = None) -> None:
        self._doubles = doubles if doubles is not None else list(_configured_doubles)
        self._default_index = 0
        self._call_counter = 0
        self._tools: list[Any] = []

    def bind_tools(self, tools: Iterable[Any]) -> "FakeChatModel":
        """`model.bind_tools(tools)` (C-RUNNER §tabla avanzada): registra las tools y
        devuelve el propio modelo (permite `llm_with_tools = model.bind_tools(tools)`)."""
        self._tools = list(tools)
        return self

    def invoke(self, messages: Iterable[Any]):
        # Import diferido para evitar dependencia circular con el shim.
        from langgraph.graph.message import AIMessage

        text = _last_human_text(messages)
        double = self._resolve(text)
        response_text = double.get("respuesta", "") if double else ""
        raw_tool_calls = double.get("toolCalls", []) if double else []
        tool_calls: list[dict[str, Any]] = []
        for call in raw_tool_calls:
            self._call_counter += 1
            tool_calls.append(
                {
                    "name": call["name"],
                    "args": call.get("args", {}),
                    "id": f"call_{self._call_counter}",
                }
            )
        _llm_calls.append({"input": text, "response": response_text})
        return AIMessage(response_text, tool_calls=tool_calls)

    def _resolve(self, text: str) -> Optional[dict[str, Any]]:
        for double in self._doubles:
            substring = double.get("matchSubstring")
            if substring and substring in text:
                return double
        defaults = [d for d in self._doubles if not d.get("matchSubstring")]
        if not defaults:
            return None
        # En orden de definición; agotados los defaults, repite el ÚLTIMO
        # indefinidamente (SLICES.md §S12, C-RUNNER §tabla avanzada del harness).
        index = min(self._default_index, len(defaults) - 1)
        self._default_index += 1
        return defaults[index]


def run_attempt(
    student_code: str,
    validation_code: str,
    llm_doubles_json: Optional[str] = None,
) -> str:
    """Ejecuta `student_code` + `validation_code` en un namespace nuevo.

    Nunca lanza: mapea errores del alumno al JSON de salida (CA-07). Devuelve
    JSON con forma:
      {"kind": "ok"|"syntax"|"runtime", "checks": CheckResult[],
       "stdout": str, "message": str|None}
    """
    _reset()
    _configure(llm_doubles_json)

    stdout_buffer = io.StringIO()
    combined_source = f"{student_code}\n{validation_code}\n"

    try:
        code_obj = compile(combined_source, "<validacion>", "exec")
    except SyntaxError as exc:
        return json.dumps(
            {
                "kind": "syntax",
                "checks": [],
                "stdout": "",
                "message": f"{type(exc).__name__}: {exc}",
            }
        )

    # Namespace nuevo por intento, respaldado por un módulo REAL registrado en
    # `sys.modules`. Necesario porque el TypedDict del alumno (CPython 3.12)
    # guarda sus anotaciones como `ForwardRef` perezosos: `typing.get_type_hints`
    # (usado por el shim para descubrir reducers `Annotated[T, reducer]`) los
    # resuelve buscando `sys.modules[cls.__module__].__dict__` como globalns;
    # sin un módulo real registrado, esa resolución falla con `NameError`.
    module_name = "__course_attempt__"
    attempt_module = types.ModuleType(module_name)
    namespace: dict[str, Any] = attempt_module.__dict__
    namespace["__name__"] = module_name
    sys.modules[module_name] = attempt_module
    old_stdout = sys.stdout
    sys.stdout = stdout_buffer
    try:
        exec(code_obj, namespace)
    except Exception as exc:
        return json.dumps(
            {
                "kind": "runtime",
                "checks": _checks_snapshot(),
                "stdout": stdout_buffer.getvalue(),
                "message": f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}",
            }
        )
    finally:
        sys.stdout = old_stdout
        sys.modules.pop(module_name, None)

    return json.dumps(
        {
            "kind": "ok",
            "checks": _checks_snapshot(),
            "stdout": stdout_buffer.getvalue(),
            "message": None,
        }
    )
