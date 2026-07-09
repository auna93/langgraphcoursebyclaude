/**
 * Tests de `StatusBadge` (contrato C-ENGINE, `docs/arch/
 * ARCHITECTURE-M5-WEBLLM.md` §9.4/§9.7/§9.8). Slice SF2 — `docs/arch/
 * SLICES.md` §SF2. Cubre CA-45 (label WebGPU, distinto de los 3 existentes,
 * comando de recuperación sigue visible) y la NO-regresión de CA-18/19/20
 * (comportamiento EXACTO actual con `active === "ollama"` o `active === null`).
 *
 * Escrito de forma INDEPENDIENTE del implementer. `StatusBadge` no tenía
 * test unitario propio en S8 (solo cobertura e2e en
 * `e2e/ollama-status.spec.ts`); este archivo fija el contrato de componente
 * mínimo para S8 + el delta M5, migrando el prop shape de `{status}` a
 * `{engine}` (§9.8: "StatusBadgeProps pasa de `{status: OllamaStatus}` a
 * `{engine: AssistantEngine}`").
 *
 * Los literales de los 3 estados existentes y los comandos CMD_SERVE/
 * CMD_PULL se importan de los contratos YA CERRADOS (`@/app/strings`,
 * `@/assistant/types`, `@/config`) — intactos por M5 (§9.12). El literal
 * NUEVO del label WebGPU (§9.7: `estadoAsistente.respaldoWebGpu`) NO se
 * importa de `STRINGS` (ese campo lo añade el implementer en este mismo
 * slice, en `src/app/strings.ts`, que este test-author no toca); se fija
 * aquí como constante local con el valor EXACTO cerrado en el contrato.
 *
 * ---------------------------------------------------------------------------
 * CONTRATO DE COMPONENTE ASUMIDO (§9.8 no fija el marcado, solo el mapeo
 * label/comando; se fija aquí lo mínimo para tests deterministas, heredado
 * del `data-testid` ya usado por la implementación S8 de `StatusBadge`):
 * ---------------------------------------------------------------------------
 *   export interface StatusBadgeProps { engine: AssistantEngine }
 *
 * - Contenedor raíz con `data-testid="status-badge"`.
 * - El label (uno de los 4: 3 existentes + WebGPU) es texto visible dentro
 *   del contenedor, recuperable con `getByText`.
 * - El comando de recuperación (si aplica) es texto visible LITERAL
 *   (`CMD_SERVE` / `CMD_PULL(model)`), recuperable con `getByText`.
 * ---------------------------------------------------------------------------
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "@/components/StatusBadge";
import { CMD_PULL, CMD_SERVE } from "@/assistant/types";
import { STRINGS } from "@/app/strings";
import { CONFIG } from "@/config";

type OllamaStatus = "checking" | "connected" | "model_missing" | "disconnected";
type EngineKind = "ollama" | "webllm";

interface AssistantEngine {
  active: EngineKind | null;
  ollama: OllamaStatus;
  webllm: {
    phase:
      | "inactive"
      | "unsupported"
      | "offer"
      | "fetching"
      | "ready"
      | "cancelled"
      | "error";
    progress: { pct: number; texto: string } | null;
    model: string;
    lastError: string | null;
  };
}

/** §9.7 — literal EXACTO cerrado, contiene "WebGPU", distinto de los 3 existentes. */
const WEBGPU_LABEL_ESPERADO = "Respaldo WebGPU activo";

function buildEngine(overrides: Partial<AssistantEngine> = {}): AssistantEngine {
  return {
    active: null,
    ollama: "checking",
    webllm: {
      phase: "inactive",
      progress: null,
      model: CONFIG.ollama.model,
      lastError: null,
    },
    ...overrides,
  };
}

function badge(): HTMLElement {
  return screen.getByTestId("status-badge");
}

describe("StatusBadge — active === null (comportamiento EXACTO actual, sin regresión CA-18/19/20)", () => {
  it("ollama='checking' ⇒ 'Comprobando…' sin comando de recuperación", () => {
    render(<StatusBadge engine={buildEngine({ active: null, ollama: "checking" })} />);

    expect(within(badge()).getByText(STRINGS.estadoAsistente.comprobando)).toBeInTheDocument();
    expect(within(badge()).queryByText(CMD_SERVE)).not.toBeInTheDocument();
  });

  it("ollama='connected' ⇒ 'Conectado' sin comando de recuperación (CA-18)", () => {
    render(<StatusBadge engine={buildEngine({ active: null, ollama: "connected" })} />);

    expect(within(badge()).getByText(STRINGS.estadoAsistente.conectado)).toBeInTheDocument();
    expect(within(badge()).queryByText(CMD_SERVE)).not.toBeInTheDocument();
    expect(within(badge()).queryByText(CMD_PULL(CONFIG.ollama.model))).not.toBeInTheDocument();
  });

  it("ollama='disconnected' ⇒ 'Sin conexión' + comando 'ollama serve' literal (CA-19)", () => {
    render(<StatusBadge engine={buildEngine({ active: null, ollama: "disconnected" })} />);

    expect(within(badge()).getByText(STRINGS.estadoAsistente.sinConexion)).toBeInTheDocument();
    expect(within(badge()).getByText(CMD_SERVE)).toBeInTheDocument();
  });

  it("ollama='model_missing' ⇒ 'Modelo no instalado' + comando 'ollama pull <modelo>' literal (CA-20)", () => {
    render(<StatusBadge engine={buildEngine({ active: null, ollama: "model_missing" })} />);

    expect(within(badge()).getByText(STRINGS.estadoAsistente.modeloNoInstalado)).toBeInTheDocument();
    expect(within(badge()).getByText(CMD_PULL(CONFIG.ollama.model))).toBeInTheDocument();
  });
});

describe("StatusBadge — active === 'ollama' (comportamiento EXACTO actual según engine.ollama)", () => {
  it("con ollama='connected' ⇒ 'Conectado', sin ningún comando de recuperación", () => {
    render(<StatusBadge engine={buildEngine({ active: "ollama", ollama: "connected" })} />);

    expect(within(badge()).getByText(STRINGS.estadoAsistente.conectado)).toBeInTheDocument();
    expect(within(badge()).queryByText(CMD_SERVE)).not.toBeInTheDocument();
    expect(within(badge()).queryByText(CMD_PULL(CONFIG.ollama.model))).not.toBeInTheDocument();
    expect(within(badge()).queryByText(WEBGPU_LABEL_ESPERADO)).not.toBeInTheDocument();
  });
});

describe("StatusBadge — active === 'webllm' (CA-45: label nuevo, distinto de los 3 existentes)", () => {
  it("muestra el label EXACTO 'Respaldo WebGPU activo' y contiene literalmente 'WebGPU'", () => {
    render(<StatusBadge engine={buildEngine({ active: "webllm", ollama: "disconnected" })} />);

    expect(within(badge()).getByText(WEBGPU_LABEL_ESPERADO)).toBeInTheDocument();
    expect(within(badge()).getByText(/WebGPU/)).toBeInTheDocument();
  });

  it("el label WebGPU es literalmente distinto de los 3 existentes (sin colisión)", () => {
    render(<StatusBadge engine={buildEngine({ active: "webllm", ollama: "disconnected" })} />);

    // Positiva: el label WebGPU debe estar realmente presente (no solo que
    // las constantes difieran entre sí).
    expect(within(badge()).getByText(WEBGPU_LABEL_ESPERADO)).toBeInTheDocument();
    expect(WEBGPU_LABEL_ESPERADO).not.toBe(STRINGS.estadoAsistente.conectado);
    expect(WEBGPU_LABEL_ESPERADO).not.toBe(STRINGS.estadoAsistente.modeloNoInstalado);
    expect(WEBGPU_LABEL_ESPERADO).not.toBe(STRINGS.estadoAsistente.sinConexion);
    expect(
      within(badge()).queryByText(STRINGS.estadoAsistente.conectado, { exact: true }),
    ).not.toBeInTheDocument();
  });

  it("con ollama='disconnected' mantiene visible el comando 'ollama serve' (guía de retorno al motor primario)", () => {
    render(<StatusBadge engine={buildEngine({ active: "webllm", ollama: "disconnected" })} />);

    expect(within(badge()).getByText(WEBGPU_LABEL_ESPERADO)).toBeInTheDocument();
    expect(within(badge()).getByText(CMD_SERVE)).toBeInTheDocument();
  });

  it("con ollama='model_missing' mantiene visible el comando 'ollama pull <modelo>'", () => {
    render(<StatusBadge engine={buildEngine({ active: "webllm", ollama: "model_missing" })} />);

    expect(within(badge()).getByText(WEBGPU_LABEL_ESPERADO)).toBeInTheDocument();
    expect(within(badge()).getByText(CMD_PULL(CONFIG.ollama.model))).toBeInTheDocument();
  });
});
