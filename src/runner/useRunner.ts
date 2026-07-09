/**
 * Hook fino para consumir el runner desde la UI (regla de dependencia de
 * ARCHITECTURE.md §2: la UI nunca habla con Pyodide directamente).
 */
import { useMemo } from "react";

import { createPyRunner } from "./pyRunner";
import type { PyRunner } from "./types";

let singleton: PyRunner | null = null;

/** Instancia única compartida, accesible fuera de React (bootstrap, tests). */
export function getPyRunner(): PyRunner {
  if (!singleton) {
    singleton = createPyRunner();
  }
  return singleton;
}

/** Instancia única de `PyRunner` compartida por toda la app (una cola global). */
export function useRunner(): PyRunner {
  return useMemo(() => getPyRunner(), []);
}
