import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ModuloPage } from "@/pages/ModuloPage";
import type { PyRunner } from "@/runner/types";
import {
  buildFixtureModuleConPasos,
  buildFixtureTutorialLocal,
  buildFixtureUsaLaIaBlock,
} from "@/content/test-fixtures";

/**
 * Slice SE0 (SLICES.md §SE0) — glue presentacional de `ModuloPage` para el
 * enriquecimiento (§8.6): wrappers finos `PasoView`/`UsaLaIaView`/
 * `TutorialLocalView` que reutilizan `MarkdownView`/`CodeBlock`/`ChallengeCard`/
 * `QuizCard`, SIN romper CA-02 (las 4 secciones Feynman siguen en orden, exacto
 * mismo criterio que `ModuloPage.test.tsx`, slice S2).
 *
 * Independiente del implementer: NO asume testids/nombres de los wrappers (no
 * forman parte del contrato §8, solo su existencia conceptual en §8.6) — solo
 * exige que el CONTENIDO de `pasos`/`usaLaIa`/`tutorialLocal` sea VISIBLE en
 * el documento tras navegar las 4 secciones, y que los mini-ejercicios/
 * micro-quizzes usen los MISMOS componentes reales que un reto/quiz de
 * sección (`ChallengeCard`/`QuizCard`, mismos `data-testid` que S7/S4).
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

const MOD_ID = "mod01";
const MODULO_ENRIQUECIDO = {
  ...buildFixtureModuleConPasos(MOD_ID),
  usaLaIa: [buildFixtureUsaLaIaBlock(`${MOD_ID}-ia1`)],
  tutorialLocal: buildFixtureTutorialLocal(),
};

vi.mock("@/content/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/content/registry")>();
  return {
    ...actual,
    getModule: (id: string) => (id === MOD_ID ? MODULO_ENRIQUECIDO : actual.getModule(id as never)),
  };
});

const TITULOS_EN_ORDEN = [
  "Explica simple",
  "Detecta tus gaps",
  "Llena los gaps",
  "Refina y simplifica",
];

function renderModulo() {
  return render(
    <MemoryRouter initialEntries={[`/modulo/${MOD_ID}`]}>
      <Routes>
        <Route path="/modulo/:id" element={<ModuloPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Navega las 4 secciones y concatena todo el texto visible (para no asumir
 *  en qué sección concreta coloca el implementer cada bloque nuevo). */
function visitAllSectionsText(): string {
  renderModulo();
  let texto = "";
  for (const titulo of TITULOS_EN_ORDEN) {
    const tab = screen.getByRole("tab", { name: titulo });
    fireEvent.click(tab);
    texto += ` ${document.body.textContent ?? ""}`;
  }
  return texto.toLowerCase();
}

describe("ModuloPage — un módulo enriquecido NO rompe CA-02 (SLICES.md §SE0(d))", () => {
  it("las 4 secciones Feynman siguen presentes, con los títulos EXACTOS y en orden", () => {
    renderModulo();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(TITULOS_EN_ORDEN);
  });
});

describe("ModuloPage — renderiza `pasos` de un módulo enriquecido (§8.2(b), sin UI nueva compleja)", () => {
  it("la mini-explicación de cada paso es visible en el documento", () => {
    const texto = visitAllSectionsText();
    const todosLosPasos = [
      ...(MODULO_ENRIQUECIDO.secciones.explicaSimple.pasos ?? []),
      ...(MODULO_ENRIQUECIDO.secciones.detectaGaps.pasos ?? []),
      ...(MODULO_ENRIQUECIDO.secciones.llenaGaps.pasos ?? []),
    ];
    expect(todosLosPasos.length).toBeGreaterThan(0);
    for (const paso of todosLosPasos) {
      expect(texto).toContain(paso.explicacionMd.toLowerCase());
    }
  });

  it('el mini-ejercicio del paso ("ejercicio") usa el `ChallengeCard` real (mismo componente que un reto de sección, `data-testid="challenge-card"`)', () => {
    renderModulo();
    fireEvent.click(screen.getByRole("tab", { name: "Llena los gaps" }));
    const panel = screen.getByRole("tabpanel");

    const pasoReto = MODULO_ENRIQUECIDO.secciones.llenaGaps.pasos?.find(
      (p) => p.accion.kind === "ejercicio",
    );
    expect(pasoReto).toBeDefined();
    if (!pasoReto || pasoReto.accion.kind !== "ejercicio") throw new Error("fixture inválido");
    const retoTitulo = pasoReto.accion.reto.titulo;

    const cards = within(panel).getAllByTestId("challenge-card");
    const titulos = cards.map((c) => c.textContent ?? "");
    expect(titulos.some((t) => t.includes(retoTitulo))).toBe(true);
  });

  it('el micro-quiz del paso ("quiz") usa el `QuizCard` real (mismo componente que un quiz de sección, enunciado visible)', () => {
    renderModulo();
    fireEvent.click(screen.getByRole("tab", { name: "Detecta tus gaps" }));
    const panel = screen.getByRole("tabpanel");

    const pasoQuiz = MODULO_ENRIQUECIDO.secciones.detectaGaps.pasos?.find(
      (p) => p.accion.kind === "quiz",
    );
    expect(pasoQuiz).toBeDefined();
    if (!pasoQuiz || pasoQuiz.accion.kind !== "quiz") throw new Error("fixture inválido");

    const primeraPregunta = pasoQuiz.accion.quiz.preguntas[0];
    expect(within(panel).getByText(primeraPregunta.enunciadoMd)).toBeInTheDocument();
  });
});

describe('ModuloPage — bloque "Usa la IA" (§12.3/§8.2(a)) sin nuevo motor de asistente (NG-10)', () => {
  it("expone ≥1 prompt sugerido copiable, visible en el documento", () => {
    const texto = visitAllSectionsText();
    const [bloque] = MODULO_ENRIQUECIDO.usaLaIa;
    expect(texto).toContain(bloque.promptsSugeridos[0].toLowerCase());
  });
});

describe('ModuloPage — "En tu máquina" / tutorial local (§12.4/§8.2(c))', () => {
  it("expone los comandos de setup (PowerShell y bash) y la salida esperada", () => {
    const texto = visitAllSectionsText();
    const tutorial = MODULO_ENRIQUECIDO.tutorialLocal;
    expect(texto).toContain(tutorial.setup[0].powershell.toLowerCase());
    expect(texto).toContain(tutorial.setup[0].bash.toLowerCase());
    expect(texto).toContain(tutorial.salidaEsperada.toLowerCase());
  });
});
