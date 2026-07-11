import { defineConfig, devices } from "@playwright/test";

// S6 (SLICES.md §S6, C-RUNNER): los tests del runner Pyodide se ejecutan contra el
// servidor de desarrollo de Vite (no el build de producción) porque necesitan importar
// módulos TS del runner directamente por URL (`/src/runner/pyRunner.ts`) sin que exista
// todavía ninguna UI que los exponga (la UI de retos llega en S7). Vite dev sirve
// cualquier módulo del proyecto transformado on-demand; los assets de Pyodide se sirven
// igual desde `public/pyodide/` (mismo origen, CA-10) en dev y en preview.
const RUNNER_DEV_PORT = 5183;
const RUNNER_DEV_URL = `http://localhost:${RUNNER_DEV_PORT}`;

// Cierre M5 (SLICES.md "Cierre M5 (integrator)", `docs/arch/ARCHITECTURE-M5-WEBLLM.md`
// §9.10 R17/R18): no hay GPU real en CI, así que el recorrido completo CA-40..46 se
// prueba sustituyendo los métodos del `WebLlmClient` de PRODUCCIÓN (el singleton de
// `src/assistant/engineStore.ts`, obtenido vía `getWebLlmClient()`) por dobles
// controlables desde el test — mismo patrón que `window.__runChallengeInPage` de
// `e2e/runner/helpers.ts` (import dinámico por URL estable, solo posible contra el
// servidor de desarrollo, que sirve los módulos TS sin bundlear). El health-check se
// acelera vía `VITE_OLLAMA_HEALTH_INTERVAL_MS` (env del propio proceso `vite dev`, no
// del test) para no esperar los 15 s por defecto en cada transición de Ollama.
const WEBGPU_DEV_PORT = 5185;
const WEBGPU_DEV_URL = `http://localhost:${WEBGPU_DEV_PORT}`;

// Cierre M5: regresión CA-19/CA-20 con el fallback DESHABILITADO por configuración
// (`VITE_WEBLLM_ENABLED=false`, CA-41). `CONFIG.webllm.enabled` se resuelve una única
// vez de `import.meta.env` al construir/servir la app (`src/config.ts`), así que probar
// este caso de verdad (más allá del unit test de `engineStore.test.ts`, describe "E8")
// exige un build + preview PROPIOS con esa variable, en un puerto y `outDir` distintos
// para no pisar el build por defecto (`dist/`) que usa el proyecto "chromium".
const WEBGPU_DISABLED_PORT = 4174;
const WEBGPU_DISABLED_URL = `http://localhost:${WEBGPU_DISABLED_PORT}`;
const WEBGPU_DISABLED_OUT_DIR = "dist-webllm-disabled";

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
      testIgnore: /e2e[\\/](runner|webgpu)[\\/]/,
    },
    {
      name: "runner-pyodide",
      use: { ...devices["Desktop Chrome"], baseURL: RUNNER_DEV_URL },
      testMatch: /e2e[\\/]runner[\\/].*\.spec\.ts/,
      timeout: 60_000,
    },
    {
      name: "webgpu-fallback",
      use: { ...devices["Desktop Chrome"], baseURL: WEBGPU_DEV_URL },
      testMatch: /e2e[\\/]webgpu[\\/]webgpu-fallback-flow\.spec\.ts/,
      timeout: 60_000,
    },
    {
      name: "webgpu-fallback-disabled",
      use: { ...devices["Desktop Chrome"], baseURL: WEBGPU_DISABLED_URL },
      testMatch: /e2e[\\/]webgpu[\\/]webgpu-fallback-disabled\.spec\.ts/,
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
    {
      command: `npm run dev -- --port ${WEBGPU_DEV_PORT} --strictPort`,
      url: WEBGPU_DEV_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        // Acelera la detección de recuperación de Ollama (CA-46) sin cambiar el
        // default de producción (15 s, `src/config.ts`): solo afecta a este proceso
        // `vite dev` dedicado al proyecto Playwright "webgpu-fallback".
        VITE_OLLAMA_HEALTH_INTERVAL_MS: "1500",
      },
    },
    {
      command: `npm run build -- --outDir ${WEBGPU_DISABLED_OUT_DIR} && npm run preview -- --outDir ${WEBGPU_DISABLED_OUT_DIR} --port ${WEBGPU_DISABLED_PORT}`,
      url: WEBGPU_DISABLED_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        VITE_WEBLLM_ENABLED: "false",
      },
    },
  ],
});
