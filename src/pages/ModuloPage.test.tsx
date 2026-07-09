import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ModuloPage } from "@/pages/ModuloPage";
import { getModule } from "@/content/registry";
import type { PyRunner } from "@/runner/types";

/**
 * `ChallengeCard` (S7) consume el runner real vía `useRunner` (C-RUNNER,
 * contrato cerrado en S6). Estos tests de INTEGRACIÓN de `ModuloPage` no
 * ejercitan Pyodide real (eso es responsabilidad de `ChallengeCard.test.tsx`
 * y de los tests de humo del runner, S6/S14): se mockea `useRunner` con un
 * `PyRunner` inerte, igual que el resto de la app haría en cualquier test que
 * no necesite ejecutar Python de verdad.
 */
const fakePyRunner: PyRunner = {
  init: () => Promise.resolve(),
  getState: () => "idle",
  runChallenge: () => Promise.resolve({ status: "fail", checks: [], stdout: "" } as const),
  cancel: () => undefined,
};

vi.mock("@/runner/useRunner", () => ({
  useRunner: () => fakePyRunner,
  getPyRunner: () => fakePyRunner,
}));

/**
 * Slice S2 (SLICES.md §S2) — CA-02, CA-29, CA-05.
 *
 * Independiente del implementer: usa el contenido REAL de mod01 (slice S1,
 * ya en PASS) vía `getModule`/C-CONTENT, no fixtures inventadas.
 *
 * DECISIÓN DE CONTRATO (fijada por este test, ver SLICES.md §S2: "ModuloPage
 * renderiza las 4 secciones en orden CON NAVEGACIÓN INTERNA" — la mención
 * explícita de "navegación" implica un control que activa una sección a la
 * vez, no un simple scroll por contenido siempre visible): el patrón es
 * WAI-ARIA tabs estándar (`role="tab"` / `role="tabpanel"`), no marcado
 * interno arbitrario:
 *   - el ORDEN y los TÍTULOS EXACTOS de las 4 secciones se leen de los
 *     controles `role="tab"` (CA-02).
 *   - el CONTENIDO de cada sección se verifica activando su tab y mirando el
 *     `role="tabpanel"` resultante.
 *   - los slots de Quiz/Reto (placeholders, S4/S7) vía `data-testid`
 *     ("quiz-slot" / "reto-slot") dentro del tabpanel activo.
 */

const MOD01 = getModule("mod01")!;

const TITULOS_EN_ORDEN = [
  "Explica simple",
  "Detecta tus gaps",
  "Llena los gaps",
  "Refina y simplifica",
];

function renderModulo(id = "mod01") {
  return render(
    <MemoryRouter initialEntries={[`/modulo/${id}`]}>
      <Routes>
        <Route path="/modulo/:id" element={<ModuloPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Activa la sección Feynman `titulo` haciendo clic en su tab, y devuelve el tabpanel resultante. */
function goToSection(titulo: string) {
  const tab = screen.getByRole("tab", { name: titulo });
  fireEvent.click(tab);
  return screen.getByRole("tabpanel");
}

describe("ModuloPage — 4 secciones Feynman en orden exacto (CA-02)", () => {
  it("expone un control de navegación con las 4 secciones, con los títulos EXACTOS y en orden", () => {
    renderModulo("mod01");

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(TITULOS_EN_ORDEN);
  });

  it('al abrir el módulo, la sección activa por defecto es "Explica simple"', () => {
    renderModulo("mod01");

    const tabActivo = screen.getByRole("tab", { selected: true });
    expect(tabActivo.textContent?.trim()).toBe("Explica simple");
    expect(
      within(screen.getByRole("tabpanel")).getByRole("heading", { name: "Explica simple" }),
    ).toBeInTheDocument();
  });

  it("navegar a cada sección muestra el heading EXACTO correspondiente (CA-02)", () => {
    renderModulo("mod01");

    for (const titulo of TITULOS_EN_ORDEN) {
      const panel = goToSection(titulo);
      expect(within(panel).getByRole("heading", { name: titulo })).toBeInTheDocument();
    }
  });
});

describe("ModuloPage — contenido real de las secciones", () => {
  it('sección "Explica simple" renderiza el markdown y la consigna del módulo', () => {
    renderModulo("mod01");

    // Es la sección activa por defecto.
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getAllByText(/tablero de juego/i).length).toBeGreaterThan(0);
    expect(
      within(panel).getByText(MOD01.secciones.explicaSimple.consignaExplicacion),
    ).toBeInTheDocument();
  });

  it('sección "Llena los gaps" renderiza el bloque de código real con botón copiar (soporte CA-29)', () => {
    renderModulo("mod01");

    const panel = goToSection("Llena los gaps");
    // §12 (SE1): un módulo enriquecido puede añadir más bloques de código dentro
    // de la MISMA sección vía `pasos` (ARCHITECTURE.md §8.6, ya cableado en
    // ModuloPage desde SE0). El primer `code-block` del panel sigue siendo el
    // del `contenidoMd` de la sección (se renderiza antes que los retos/pasos).
    const block = within(panel).getAllByTestId("code-block")[0];
    const codeEl = within(block).getByText(
      (_, node) => node?.tagName.toLowerCase() === "code",
    );
    expect(codeEl.textContent).toMatch(/builder\.compile\(\)/);
    expect(within(block).getByRole("button", { name: /copiar/i })).toBeInTheDocument();
  });

  it('sección "Refina y simplifica" renderiza los bullets del resumen (≤10, exactos del módulo)', () => {
    renderModulo("mod01");

    const panel = goToSection("Refina y simplifica");
    const bullets = MOD01.secciones.refinaSimplifica.resumenBullets;
    for (const bullet of bullets) {
      expect(within(panel).getByText(bullet)).toBeInTheDocument();
    }
  });
});

describe("ModuloPage — quiz real integrado (S4), reto real integrado (S7)", () => {
  it('sección "Detecta tus gaps" expone el quiz interactivo real dentro del slot (CA-11)', () => {
    renderModulo("mod01");

    const panel = goToSection("Detecta tus gaps");
    const slot = within(panel).getByTestId("quiz-slot");

    // El quiz real (slice S4) muestra el enunciado interactivo de cada pregunta.
    const primeraPregunta = MOD01.secciones.detectaGaps.quiz.preguntas[0];
    expect(within(slot).getByText(primeraPregunta.enunciadoMd)).toBeInTheDocument();
  });

  it('sección "Llena los gaps" expone un slot por cada reto con el `ChallengeCard` real (CA-06/07 UI)', () => {
    renderModulo("mod01");

    const panel = goToSection("Llena los gaps");
    const retos = MOD01.secciones.llenaGaps.retos;
    const slots = within(panel).getAllByTestId("reto-slot");
    // §12 (SE1): un módulo enriquecido añade un `reto-slot` MÁS por cada
    // mini-ejercicio de `pasos` (ARCHITECTURE.md §8.3/§8.6) — al MENOS uno por
    // reto de sección, nunca menos (CA-06/07 UI intacto).
    expect(slots.length).toBeGreaterThanOrEqual(retos.length);

    // El editor real (S7, `ChallengeCard`/CodeMirror) reemplaza el placeholder de S2.
    for (const slot of slots) {
      expect(within(slot).getByTestId("challenge-card")).toBeInTheDocument();
      expect(within(slot).getByTestId("challenge-code-editor")).toBeInTheDocument();
    }
  });

  it('sección "Refina y simplifica" expone el slot de síntesis correspondiente (quiz o reto), según el módulo', () => {
    renderModulo("mod01");

    const panel = goToSection("Refina y simplifica");
    const sintesis = MOD01.secciones.refinaSimplifica.sintesis;

    if (sintesis.kind === "quiz") {
      expect(within(panel).getByTestId("quiz-slot")).toBeInTheDocument();
    } else {
      expect(within(panel).getByTestId("reto-slot")).toBeInTheDocument();
      expect(within(panel).getByTestId("challenge-card")).toBeInTheDocument();
    }
  });
});

describe("ModuloPage — CA-29 (copiar) integrado en la vista real del módulo", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("copiar el bloque de código de mod01 copia su contenido EXACTO", () => {
    renderModulo("mod01");

    const panel = goToSection("Llena los gaps");
    // §12 (SE1): ver nota de multiplicidad más arriba — el primer `code-block`
    // sigue siendo el de `contenidoMd`.
    const block = within(panel).getAllByTestId("code-block")[0];
    const codeEl = within(block).getByText(
      (_, node) => node?.tagName.toLowerCase() === "code",
    );
    const codigoVisible = codeEl.textContent ?? "";

    fireEvent.click(within(block).getByRole("button", { name: /copiar/i }));

    expect(writeText).toHaveBeenCalledWith(codigoVisible);
  });
});

describe("ModuloPage — CA-05: la UI de la vista está en español", () => {
  it("no usa strings de UI en inglés obvio en ninguna de las 4 secciones", () => {
    renderModulo("mod01");

    for (const titulo of TITULOS_EN_ORDEN) {
      goToSection(titulo);
      const textoVisible = document.body.textContent?.toLowerCase() ?? "";
      expect(textoVisible).not.toMatch(
        /\b(loading|error occurred|welcome|click here|submit|cancel|copy)\b/,
      );
    }
  });

  it('el botón de copiar dice "copiar", no "copy" (CA-05)', () => {
    renderModulo("mod01");

    const panel = goToSection("Llena los gaps");
    // §12 (SE1): puede haber varios botones "copiar" en la sección (uno por
    // cada `code-block`, incluidos los de `pasos`); basta con que exista ≥1.
    const [button] = within(panel).getAllByRole("button", { name: /copiar/i });
    expect(button).toBeInTheDocument();
  });
});
