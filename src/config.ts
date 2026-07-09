/**
 * Configuración de la aplicación (contrato CONFIG, ARCHITECTURE.md §4).
 *
 * Lee `import.meta.env.VITE_*` con valores por defecto. Nunca se re-lee en
 * runtime (se resuelve una vez al cargar el módulo).
 */

import type { OllamaConfig } from "@/assistant/types";

export interface AppConfig {
  ollama: OllamaConfig;
  runner: {
    /** "/pyodide/" */
    pyodideBaseUrl: string;
    /** 8000 (presupuesto CA-06 <10 s) */
    defaultTimeoutMs: number;
  };
  curso: {
    /** 200 (CA-13) */
    umbralExplicacionChars: number;
    /** 80 (CA-12) */
    umbralQuizPct: number;
  };
  rag: {
    /** 4 */
    topK: number;
  };
}

function readString(key: string, fallback: string): string {
  const env = import.meta.env as Record<string, string | undefined>;
  const value = env[key];
  return value && value.length > 0 ? value : fallback;
}

function readNumber(key: string, fallback: number): number {
  const env = import.meta.env as Record<string, string | undefined>;
  const value = env[key];
  if (value === undefined || value.length === 0) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const CONFIG: AppConfig = {
  ollama: {
    baseUrl: readString("VITE_OLLAMA_BASE_URL", "/ollama"),
    model: readString("VITE_OLLAMA_MODEL", "qwen2.5-coder:14b"),
    healthIntervalMs: readNumber("VITE_OLLAMA_HEALTH_INTERVAL_MS", 15000),
    healthTimeoutMs: readNumber("VITE_OLLAMA_HEALTH_TIMEOUT_MS", 3000),
  },
  runner: {
    pyodideBaseUrl: readString("VITE_PYODIDE_BASE_URL", "/pyodide/"),
    defaultTimeoutMs: readNumber("VITE_RUNNER_DEFAULT_TIMEOUT_MS", 8000),
  },
  curso: {
    umbralExplicacionChars: readNumber("VITE_UMBRAL_EXPLICACION_CHARS", 200),
    umbralQuizPct: readNumber("VITE_UMBRAL_QUIZ_PCT", 80),
  },
  rag: {
    topK: readNumber("VITE_RAG_TOPK", 4),
  },
};
