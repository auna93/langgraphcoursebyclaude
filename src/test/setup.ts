import "@testing-library/jest-dom/vitest";

/**
 * Node 22+ expone un `localStorage`/`sessionStorage` global experimental
 * respaldado por archivo (`--localstorage-file`). Cuando no hay archivo
 * configurado, ese global queda instalado pero INOPERANTE (sin `setItem`/
 * `clear` funcionales) y jsdom (25.x), al detectar que el global ya existe,
 * lo reutiliza en vez de instalar su propio `Storage` — dejando
 * `window.localStorage` roto de forma indistinguible de una implementación
 * real, sin importar el orden de inicialización.
 *
 * Los tests de persistencia (`src/progress/**`, contrato C-PROGRESS: R6
 * "localStorage lleno o bloqueado") necesitan un `Storage` de verdad,
 * determinista y aislado por test. Se instala aquí un polyfill mínimo en
 * memoria — SOLO si el `Storage` provisto por el entorno no funciona — para
 * que los tests dependan del contrato `Storage` estándar y no de la versión
 * de Node de la máquina donde corren.
 */
function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.has(key) ? (data.get(key) as string) : null;
    },
    key(index: number) {
      return Array.from(data.keys())[index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, String(value));
    },
  };
  return storage;
}

function isWorkingStorage(storage: unknown): storage is Storage {
  if (!storage || typeof storage !== "object") return false;
  const candidate = storage as Partial<Storage>;
  if (typeof candidate.setItem !== "function" || typeof candidate.clear !== "function") {
    return false;
  }
  try {
    const probeKey = "__lgcourse_storage_probe__";
    candidate.setItem(probeKey, "1");
    const ok = candidate.getItem?.(probeKey) === "1";
    candidate.removeItem?.(probeKey);
    return ok;
  } catch {
    return false;
  }
}

function ensureWorkingStorage(key: "localStorage" | "sessionStorage"): void {
  const current = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>)[key] : undefined;
  const storage = isWorkingStorage(current) ? current : createMemoryStorage();

  for (const target of [globalThis, window].filter(Boolean) as object[]) {
    Object.defineProperty(target, key, {
      configurable: true,
      value: storage,
    });
  }
}

if (typeof window !== "undefined") {
  ensureWorkingStorage("localStorage");
  ensureWorkingStorage("sessionStorage");
}

/**
 * jsdom no implementa `Range.getClientRects`/`getBoundingClientRect`
 * (necesarios para medir texto). `ChallengeCard` (slice S7) usa CodeMirror
 * (`@uiw/react-codemirror`), que los invoca para su capa de medición interna;
 * sin este polyfill, CodeMirror logea errores en cada render/medición
 * (no rompe los tests — los datos de layout no importan en jsdom — pero
 * ensucia la salida). Devuelve rects vacíos: layout inexistente pero estable.
 */
if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = function getClientRects() {
    return { length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] } as unknown as DOMRectList;
  };
}
if (typeof Range !== "undefined" && !Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() {} } as DOMRect;
  };
}

/**
 * jsdom no implementa `Element.prototype.scrollIntoView` (no hay layout
 * real). El feedback Feynman con un clic (slice S11, CA-27/A-10) desplaza el
 * sidebar del asistente a la vista tras pedir feedback; sin este polyfill,
 * cualquier implementación que llame a `scrollIntoView` lanza
 * `TypeError: ... is not a function` en los tests, aunque el comportamiento
 * observable relevante (el foco) no dependa de layout real. No-op estable.
 */
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {
    // no-op: jsdom no calcula layout real, no hay nada que desplazar.
  };
}
