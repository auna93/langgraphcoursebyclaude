/**
 * Migración del estado persistido de C-PROGRESS (`localStorage`, clave
 * `lgcourse.progress.v1`, ARCHITECTURE.md §4).
 *
 * v1 es la primera versión publicada del schema. Cualquier estado persistido
 * con una versión desconocida o con forma inesperada (corrupción, clave
 * manipulada a mano, etc.) se descarta y se reemplaza por un estado vacío en
 * lugar de crashear la app (R6, ARCHITECTURE.md §6).
 */

import type { ProgressState } from "./types";

export const PROGRESS_SCHEMA_VERSION = 1;

export function emptyProgressState(): ProgressState {
  return { schemaVersion: 1, modules: {} };
}

function isValidProgressState(value: unknown): value is ProgressState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.schemaVersion === 1 && typeof v.modules === "object" && v.modules !== null;
}

/**
 * `migrate` de `zustand/persist`: recibe el estado persistido (forma libre,
 * de cualquier versión anterior) y la versión con la que fue escrito.
 * Como v1 es la única versión existente hasta ahora, cualquier cosa que no
 * calce exactamente con la forma esperada se trata como ausente.
 */
export function migrate(persistedState: unknown, version: number): ProgressState {
  if (version === PROGRESS_SCHEMA_VERSION && isValidProgressState(persistedState)) {
    return persistedState;
  }
  return emptyProgressState();
}
