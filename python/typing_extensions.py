# Compat local para Pyodide sin acceso a red (CA-10, ADR-01).
#
# Los ejemplos canónicos del grounding importan `TypedDict`/`Literal`/`Annotated`
# desde `typing_extensions` (así se ve en LangGraph real). CPython 3.11+ (el
# runtime de Pyodide en este proyecto) ya trae estos símbolos en `typing`, así
# que en vez de descargar el paquete real `typing_extensions` (violaría CA-10:
# 0 requests durante la validación) este módulo puramente re-exporta desde la
# librería estándar. Se antepone a `sys.path` (ver py.worker.ts) para que
# `import typing_extensions` resuelva aquí sin tocar la red.
from typing import (  # noqa: F401
    Annotated,
    Literal,
    NotRequired,
    Required,
    TypedDict,
)
