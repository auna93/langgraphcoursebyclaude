/**
 * Tests de `WebGpuFallbackCard` (nuevo, contrato C-ENGINE, `docs/arch/
 * ARCHITECTURE-M5-WEBLLM.md` §9.7/§9.8). Slice SF2 — `docs/arch/SLICES.md`
 * §SF2. Cubre los 5 estados de render fijados en §9.8 (`offer`, `fetching`,
 * `cancelled`, `error`, `unsupported`/`inactive`) y la condición de gating
 * (`CONFIG.webllm.enabled` + fase/estado de Ollama). CAs: CA-40b, CA-41,
 * CA-42 (UI), CA-43 (UI).
 *
 * Escrito de forma INDEPENDIENTE del implementer, sin importar
 * `engineStore` real ni `@mlc-ai/web-llm`: el componente es presentacional
 * puro (§9.8: "la card es render pasivo"), se prueba con `engine` inyectado
 * por prop y espías (`vi.fn()`) para las acciones.
 *
 * Los literales de `STRINGS.webgpuFallback.*` (§9.7) NO se importan de
 * `@/app/strings` (ese archivo lo completa el implementer en este mismo
 * slice); se reproducen aquí como constantes/función LOCAL con el texto y
 * la fórmula EXACTOS cerrados en el contrato, para verificar el resultado
 * observable sin acoplarse a que `strings.ts` ya los tenga.
 *
 * `CONFIG.webllm` se mockea (vía `vi.mock("@/config", ...)`) para no
 * depender de que SF1 ya haya añadido esas claves a `src/config.ts`.
 *
 * ---------------------------------------------------------------------------
 * CONTRATO DE COMPONENTE ASUMIDO (§9.8 fija el contenido/condición de
 * render por fase, pero no la forma exacta de las props; se fija aquí lo
 * mínimo para hacer estos tests deterministas — el componente es "render
 * pasivo" según el propio contrato, así que se asume PURAMENTE presentacional,
 * sin leer ningún store internamente):
 * ---------------------------------------------------------------------------
 *   export interface WebGpuFallbackCardProps {
 *     engine: AssistantEngine;
 *     acceptDownload: () => void;
 *     cancelFetch: () => void;
 *   }
 *
 * - Si NO debe renderizar nada (CONFIG.webllm.enabled === false, o
 *   phase ∈ {"unsupported","inactive"}, o phase ∈ {"offer","cancelled","error"}
 *   con `ollama` NO degradado), el componente devuelve `null` (verificable
 *   con `container.firstChild === null`).
 * - Cuando renderiza, usa un contenedor con `data-testid="webgpu-fallback-card"`.
 * - El botón de "activar"/"reintentar" es accesible por nombre EXACTO
 *   `"Descargar y activar"` (§9.7 `webgpuFallback.activar`) y llama a
 *   `acceptDownload()` al pulsarlo, sin argumentos.
 * - El botón de "cancelar" (solo en `fetching`) es accesible por nombre
 *   EXACTO `"Cancelar"` (§9.7 `webgpuFallback.cancelar`) y llama a
 *   `cancelFetch()` al pulsarlo, sin argumentos.
 * - El progreso se expone también como `role="progressbar"` con
 *   `aria-valuenow` igual a `engine.webllm.progress.pct` (convención a11y
 *   estándar; no literal del contrato, pero necesaria para verificar CA-42
 *   sin acoplarse a CSS).
 * ---------------------------------------------------------------------------
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WebGpuFallbackCard } from "@/components/WebGpuFallbackCard";

type OllamaStatus = "checking" | "connected" | "model_missing" | "disconnected";
type EngineKind = "ollama" | "webllm";
type WebLlmPhase =
  | "inactive"
  | "unsupported"
  | "offer"
  | "fetching"
  | "ready"
  | "cancelled"
  | "error";

interface AssistantEngine {
  active: EngineKind | null;
  ollama: OllamaStatus;
  webllm: {
    phase: WebLlmPhase;
    progress: { pct: number; texto: string } | null;
    model: string;
    lastError: string | null;
  };
}

const { mockConfig } = vi.hoisted(() => ({
  mockConfig: {
    webllm: {
      enabled: true,
      model: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
      modelUrl: "",
      modelLibUrl: "",
      modelSizeMb: 950,
    },
  },
}));

vi.mock("@/config", () => ({ CONFIG: mockConfig }));

// ---------------------------------------------------------------------------
// Réplicas LOCALES de los literales/fórmulas EXACTOS cerrados en §9.7 (no se
// importan de `@/app/strings`: ese archivo aún no los tiene en este slice).
// ---------------------------------------------------------------------------
const MODEL = "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC";
const ACTIVAR = "Descargar y activar";
const CANCELAR = "Cancelar";

function tamanoEsperado(mb: number): string {
  if (mb < 1000) return `${mb} MB`;
  const gb = (mb / 1000).toFixed(1).replace(".", ",");
  return `${gb} GB`;
}

function ofertaDescripcionEsperada(modelo: string, tamano: string): string {
  return (
    `Ollama no está disponible. Puedes activar un modelo local en tu navegador (${modelo}). ` +
    `Requiere una única descarga de ~${tamano}; quedará en la caché del navegador para las próximas sesiones.`
  );
}

function descargandoEsperado(pct: number): string {
  return `Descargando modelo WebGPU… ${pct} %`;
}

const CANCELADO_AVISO = "Descarga cancelada. Puedes volver a activarla cuando quieras.";
const ERROR_DESCARGA_FALLBACK =
  "No se pudo descargar o cargar el modelo WebGPU. Comprueba tu conexión y vuelve a intentarlo.";

function buildEngine(overrides: Partial<AssistantEngine> = {}): AssistantEngine {
  return {
    active: null,
    ollama: "disconnected",
    webllm: {
      phase: "inactive",
      progress: null,
      model: MODEL,
      lastError: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  mockConfig.webllm.enabled = true;
  mockConfig.webllm.modelSizeMb = 950;
});

function renderCard(engine: AssistantEngine, opts?: { acceptDownload?: () => void; cancelFetch?: () => void }) {
  const acceptDownload = opts?.acceptDownload ?? vi.fn();
  const cancelFetch = opts?.cancelFetch ?? vi.fn();
  const utils = render(
    <WebGpuFallbackCard engine={engine} acceptDownload={acceptDownload} cancelFetch={cancelFetch} />,
  );
  return { ...utils, acceptDownload, cancelFetch };
}

// ---------------------------------------------------------------------------
// Estado: unsupported / inactive ⇒ NO renderiza nada
// ---------------------------------------------------------------------------
describe("WebGpuFallbackCard — 'unsupported'/'inactive': NO se renderiza nada (CA-41)", () => {
  it("phase='unsupported' ⇒ container.firstChild === null", () => {
    const { container } = renderCard(
      buildEngine({ ollama: "disconnected", webllm: { phase: "unsupported", progress: null, model: MODEL, lastError: null } }),
    );
    expect(container.firstChild).toBeNull();
  });

  it("phase='inactive' ⇒ container.firstChild === null", () => {
    const { container } = renderCard(
      buildEngine({ ollama: "checking", webllm: { phase: "inactive", progress: null, model: MODEL, lastError: null } }),
    );
    expect(container.firstChild).toBeNull();
  });

  it("CONFIG.webllm.enabled=false ⇒ NO renderiza NADA aunque phase='fetching'", () => {
    mockConfig.webllm.enabled = false;
    const { container } = renderCard(
      buildEngine({
        ollama: "disconnected",
        webllm: { phase: "fetching", progress: { pct: 50, texto: "..." }, model: MODEL, lastError: null },
      }),
    );
    expect(container.firstChild).toBeNull();
  });

  it("phase='offer' pero ollama NO degradado (p.ej. 'checking') ⇒ NO renderiza nada", () => {
    const { container } = renderCard(
      buildEngine({ ollama: "checking", webllm: { phase: "offer", progress: null, model: MODEL, lastError: null } }),
    );
    expect(container.firstChild).toBeNull();
  });

  it("phase='offer' pero ollama='connected' ⇒ NO renderiza nada", () => {
    const { container } = renderCard(
      buildEngine({ ollama: "connected", webllm: { phase: "offer", progress: null, model: MODEL, lastError: null } }),
    );
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Estado: offer
// ---------------------------------------------------------------------------
describe("WebGpuFallbackCard — 'offer' (CA-40b)", () => {
  it("muestra título + descripción con modelo y tamaño en MB (modelSizeMb < 1000) + botón activar", () => {
    mockConfig.webllm.modelSizeMb = 950;
    const engine = buildEngine({
      ollama: "disconnected",
      webllm: { phase: "offer", progress: null, model: MODEL, lastError: null },
    });
    const { acceptDownload } = renderCard(engine);

    const card = screen.getByTestId("webgpu-fallback-card");
    expect(within(card).getByText("Asistente de respaldo (WebGPU)")).toBeInTheDocument();

    const tamano = tamanoEsperado(950);
    expect(tamano).toBe("950 MB");
    expect(within(card).getByText(ofertaDescripcionEsperada(MODEL, tamano))).toBeInTheDocument();

    const boton = within(card).getByRole("button", { name: ACTIVAR });
    fireEvent.click(boton);
    expect(acceptDownload).toHaveBeenCalledTimes(1);
    expect(acceptDownload).toHaveBeenCalledWith();
  });

  it("muestra el tamaño en GB con coma decimal cuando modelSizeMb >= 1000", () => {
    mockConfig.webllm.modelSizeMb = 1600;
    const engine = buildEngine({
      ollama: "model_missing",
      webllm: { phase: "offer", progress: null, model: MODEL, lastError: null },
    });
    renderCard(engine);

    const tamano = tamanoEsperado(1600);
    expect(tamano).toBe("1,6 GB");
    const card = screen.getByTestId("webgpu-fallback-card");
    expect(within(card).getByText(ofertaDescripcionEsperada(MODEL, tamano))).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Estado: fetching
// ---------------------------------------------------------------------------
describe("WebGpuFallbackCard — 'fetching' (CA-42/CA-43)", () => {
  it("muestra el porcentaje y una barra de progreso; botón cancelar llama a cancelFetch()", () => {
    const engine = buildEngine({
      ollama: "disconnected",
      webllm: { phase: "fetching", progress: { pct: 30, texto: "Fetching param cache [3/24]" }, model: MODEL, lastError: null },
    });
    const { cancelFetch } = renderCard(engine);

    const card = screen.getByTestId("webgpu-fallback-card");
    expect(within(card).getByText(descargandoEsperado(30))).toBeInTheDocument();

    const barra = within(card).getByRole("progressbar");
    expect(barra).toHaveAttribute("aria-valuenow", "30");

    const boton = within(card).getByRole("button", { name: CANCELAR });
    fireEvent.click(boton);
    expect(cancelFetch).toHaveBeenCalledTimes(1);
    expect(cancelFetch).toHaveBeenCalledWith();
  });

  it("≥1 actualización visible por cada 10% descargado (re-render con progreso creciente)", () => {
    const engine = (pct: number): AssistantEngine =>
      buildEngine({
        ollama: "disconnected",
        webllm: { phase: "fetching", progress: { pct, texto: `t${pct}` }, model: MODEL, lastError: null },
      });

    const acceptDownload = vi.fn();
    const cancelFetch = vi.fn();
    const { rerender } = render(
      <WebGpuFallbackCard engine={engine(0)} acceptDownload={acceptDownload} cancelFetch={cancelFetch} />,
    );

    const pasos = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    for (const pct of pasos) {
      rerender(<WebGpuFallbackCard engine={engine(pct)} acceptDownload={acceptDownload} cancelFetch={cancelFetch} />);
      const card = screen.getByTestId("webgpu-fallback-card");
      expect(within(card).getByText(descargandoEsperado(pct))).toBeInTheDocument();
      expect(within(card).getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(pct));
    }
  });

  it("no muestra el botón 'activar' mientras está en 'fetching'", () => {
    const engine = buildEngine({
      ollama: "disconnected",
      webllm: { phase: "fetching", progress: { pct: 5, texto: "" }, model: MODEL, lastError: null },
    });
    renderCard(engine);

    const card = screen.getByTestId("webgpu-fallback-card");
    expect(within(card).queryByRole("button", { name: ACTIVAR })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Estado: cancelled
// ---------------------------------------------------------------------------
describe("WebGpuFallbackCard — 'cancelled' (CA-43: la oferta permanece accesible)", () => {
  it("muestra el aviso de cancelación + botón para reintentar (acceptDownload)", () => {
    const engine = buildEngine({
      ollama: "disconnected",
      webllm: { phase: "cancelled", progress: null, model: MODEL, lastError: null },
    });
    const { acceptDownload } = renderCard(engine);

    const card = screen.getByTestId("webgpu-fallback-card");
    expect(within(card).getByText(CANCELADO_AVISO)).toBeInTheDocument();

    const boton = within(card).getByRole("button", { name: ACTIVAR });
    fireEvent.click(boton);
    expect(acceptDownload).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Estado: error
// ---------------------------------------------------------------------------
describe("WebGpuFallbackCard — 'error' (CA-43: reintento accesible)", () => {
  it("con lastError seteado, muestra ese mensaje + botón de reintento", () => {
    const engine = buildEngine({
      ollama: "disconnected",
      webllm: { phase: "error", progress: null, model: MODEL, lastError: "Fallo de red descargando pesos." },
    });
    const { acceptDownload } = renderCard(engine);

    const card = screen.getByTestId("webgpu-fallback-card");
    expect(within(card).getByText("Fallo de red descargando pesos.")).toBeInTheDocument();

    const boton = within(card).getByRole("button", { name: ACTIVAR });
    fireEvent.click(boton);
    expect(acceptDownload).toHaveBeenCalledTimes(1);
  });

  it("sin lastError (null), cae al mensaje genérico errorDescarga", () => {
    const engine = buildEngine({
      ollama: "model_missing",
      webllm: { phase: "error", progress: null, model: MODEL, lastError: null },
    });
    renderCard(engine);

    const card = screen.getByTestId("webgpu-fallback-card");
    expect(within(card).getByText(ERROR_DESCARGA_FALLBACK)).toBeInTheDocument();
  });
});
