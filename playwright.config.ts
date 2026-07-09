import { defineConfig, devices } from "@playwright/test";

// S6 (SLICES.md §S6, C-RUNNER): los tests del runner Pyodide se ejecutan contra el
// servidor de desarrollo de Vite (no el build de producción) porque necesitan importar
// módulos TS del runner directamente por URL (`/src/runner/pyRunner.ts`) sin que exista
// todavía ninguna UI que los exponga (la UI de retos llega en S7). Vite dev sirve
// cualquier módulo del proyecto transformado on-demand; los assets de Pyodide se sirven
// igual desde `public/pyodide/` (mismo origen, CA-10) en dev y en preview.
const RUNNER_DEV_PORT = 5183;
const RUNNER_DEV_URL = `http://localhost:${RUNNER_DEV_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /e2e[\\/]runner[\\/]/,
    },
    {
      name: "runner-pyodide",
      use: { ...devices["Desktop Chrome"], baseURL: RUNNER_DEV_URL },
      testMatch: /e2e[\\/]runner[\\/].*\.spec\.ts/,
      timeout: 60_000,
    },
  ],
  webServer: [
    {
      command: "npm run build && npm run preview -- --port 4173",
      url: "http://localhost:4173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npm run dev -- --port ${RUNNER_DEV_PORT} --strictPort`,
      url: RUNNER_DEV_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
