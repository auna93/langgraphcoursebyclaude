/**
 * Store de progreso (C-PROGRESS, ARCHITECTURE.md §4): zustand + persist en
 * `localStorage`, clave `lgcourse.progress.v1`. Persiste EXCLUSIVAMENTE
 * hechos primitivos (`ProgressState`); el estado derivado (`moduleStatus`,
 * `isSolutionAvailable`, `isExplanationDone`) vive en `selectors.ts` y nunca
 * se guarda (invariante de ARCHITECTURE.md §3).
 */

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import type { ModuleId } from "@/content/types";

import { migrate, PROGRESS_SCHEMA_VERSION } from "./migrations";
import type { ModuleProgress, ProgressActions, ProgressState } from "./types";

export const PROGRESS_STORAGE_KEY = "lgcourse.progress.v1";

/**
 * Fallback en memoria para cuando `localStorage` no está disponible o lanza
 * (R6: modo privado, cuota llena, `localStorage` deshabilitado). Vive fuera
 * del store para sobrevivir a recreaciones del store en tests, pero se
 * pierde al recargar la página — degradación aceptada, la app sigue
 * funcional sin persistencia real.
 */
const memoryFallback = new Map<string, string>();

/**
 * Storage tolerante a fallos (R6). Cada operación intenta `localStorage`
 * primero; cualquier excepción (o su ausencia) degrada silenciosamente al
 * Map en memoria, sin propagar el error ni crashear la app.
 */
const resilientStorage: StateStorage = {
  getItem: (name) => {
    try {
      const value = window.localStorage.getItem(name);
      if (value !== null) return value;
    } catch {
      // localStorage inaccesible: seguimos al fallback.
    }
    return memoryFallback.get(name) ?? null;
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
      return;
    } catch {
      // localStorage inaccesible o cuota llena: seguimos al fallback.
    }
    memoryFallback.set(name, value);
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
      return;
    } catch {
      // localStorage inaccesible: seguimos al fallback.
    }
    memoryFallback.delete(name);
  },
};

function emptyModuleProgress(): ModuleProgress {
  return { explicacion: null, quizzes: {}, retos: {} };
}

function moduleProgressOf(state: ProgressState, moduleId: ModuleId): ModuleProgress {
  return state.modules[moduleId] ?? emptyModuleProgress();
}

type ProgressStore = ProgressState & ProgressActions;

export const useProgressStore = create<ProgressStore>()(
  persist(
    (set) => ({
      schemaVersion: 1,
      modules: {},

      saveExplanation(moduleId, texto) {
        set((state) => ({
          modules: {
            ...state.modules,
            [moduleId]: {
              ...moduleProgressOf(state, moduleId),
              explicacion: { texto, actualizadoEn: Date.now() },
            },
          },
        }));
      },

      recordQuizResult(moduleId, quizId, pct) {
        set((state) => {
          const current = moduleProgressOf(state, moduleId);
          const prev = current.quizzes[quizId];
          const mejorPct = Math.max(prev?.mejorPct ?? 0, pct);
          const intentos = (prev?.intentos ?? 0) + 1;
          return {
            modules: {
              ...state.modules,
              [moduleId]: {
                ...current,
                quizzes: { ...current.quizzes, [quizId]: { mejorPct, intentos } },
              },
            },
          };
        });
      },

      recordChallengeResult(moduleId, retoId, passed) {
        set((state) => {
          const current = moduleProgressOf(state, moduleId);
          const prev = current.retos[retoId];
          const intentos = (prev?.intentos ?? 0) + 1;
          return {
            modules: {
              ...state.modules,
              [moduleId]: {
                ...current,
                retos: {
                  ...current.retos,
                  [retoId]: {
                    ultimoPass: passed,
                    intentos,
                    solucionVista: prev?.solucionVista ?? false,
                  },
                },
              },
            },
          };
        });
      },

      markSolutionViewed(moduleId, retoId) {
        set((state) => {
          const current = moduleProgressOf(state, moduleId);
          const prev = current.retos[retoId];
          return {
            modules: {
              ...state.modules,
              [moduleId]: {
                ...current,
                retos: {
                  ...current.retos,
                  [retoId]: {
                    ultimoPass: prev?.ultimoPass ?? false,
                    intentos: prev?.intentos ?? 0,
                    solucionVista: true,
                  },
                },
              },
            },
          };
        });
      },

      resetModule(moduleId) {
        set((state) => {
          const rest = { ...state.modules };
          delete rest[moduleId];
          return { modules: rest };
        });
      },

      resetAll() {
        set({ modules: {} });
      },
    }),
    {
      name: PROGRESS_STORAGE_KEY,
      version: PROGRESS_SCHEMA_VERSION,
      storage: createJSONStorage(() => resilientStorage),
      migrate,
      // Solo hechos primitivos: nunca persistir estado derivado (moduleStatus, etc.).
      partialize: (state) => ({ schemaVersion: state.schemaVersion, modules: state.modules }),
    },
  ),
);

/** Acción `resetModule` como hook, para botones "reiniciar módulo" (CA-17). */
export function useResetModule(): ProgressActions["resetModule"] {
  return useProgressStore((state) => state.resetModule);
}

/** Acción `resetAll` como hook, para el botón "reiniciar curso" (US-10). */
export function useResetAll(): ProgressActions["resetAll"] {
  return useProgressStore((state) => state.resetAll);
}

/**
 * Envuelve `resetModule` con una confirmación previa (CA-17: "acción
 * confirmada"). La UI de confirmación (modal, `window.confirm`, etc.) la
 * decide quien integra el hook (Temario/ModuloPage); aquí solo se garantiza
 * que la acción no se dispara si `confirm` devuelve `false`.
 */
export function useConfirmedResetModule(confirm: (moduleId: ModuleId) => boolean) {
  const resetModule = useResetModule();
  return (moduleId: ModuleId) => {
    if (confirm(moduleId)) resetModule(moduleId);
  };
}

/** Equivalente a `useConfirmedResetModule` para "reiniciar curso" (US-10). */
export function useConfirmedResetAll(confirm: () => boolean) {
  const resetAll = useResetAll();
  return () => {
    if (confirm()) resetAll();
  };
}
