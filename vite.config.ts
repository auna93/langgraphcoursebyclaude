import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ADR-06: proxy same-origin hacia Ollama; el navegador nunca llama a
// localhost:11434 directamente. Aplica tanto en `dev` como en `preview`.
const ollamaProxy = {
  "/ollama": {
    target: "http://localhost:11434",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/ollama/, ""),
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    proxy: ollamaProxy,
  },
  preview: {
    proxy: ollamaProxy,
  },
  worker: {
    format: "es",
  },
  // `pyodide` solo se importa (estáticamente) desde `src/runner/py.worker.ts`.
  // Se pre-bundlea aquí para evitar que Vite lo descubra en caliente la
  // primera vez que el worker lo importa (eso dispara un full-reload del
  // dev server que rompe el contexto de ejecución del test, S6).
  optimizeDeps: {
    include: ["pyodide"],
  },
});
