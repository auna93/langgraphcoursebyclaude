/**
 * Integración de `FeynmanEditor` en `ModuloPage` (slice S5, SLICES.md §S5).
 * Cubre CA-13/CA-14 a nivel de integración (además de `FeynmanEditor.test.tsx`,
 * que cubre el componente aislado) y el "aislamiento por módulo" implícito
 * en C-PROGRESS (`ProgressState.modules` es un registro POR `ModuleId`).
 *
 * Independiente del implementer: usa el contenido REAL de mod01/mod02 (S1,
 * ya en PASS) vía `getModule`, y el store real de progreso (S3, ya en PASS).
 * No asume marcado interno de `FeynmanEditor` más allá de exponer un único
 * `<textarea>` (rol "textbox") localizable dentro del `tabpanel` activo —
 * contrato ya fijado por `FeynmanEditor.test.tsx`.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { getModule } from "@/content/registry";
import type { ModuleId } from "@/content/types";
import { ModuloPage } from "@/pages/ModuloPage";
import { EXPLICACION_VALIDA } from "@/progress/test-fixtures";
import { useProgressStore } from "@/progress/store";

const MOD01 = getModule("mod01")!;
const MOD02 = getModule("mod02")!;

function renderModulo(id: ModuleId) {
  return render(
    <MemoryRouter initialEntries={[`/modulo/${id}`]}>
      <Routes>
        <Route path="/modulo/:id" element={<ModuloPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function explicaSimplePanel() {
  // "Explica simple" es la sección activa por defecto (CA-02, ModuloPage.test.tsx).
  return screen.getByRole("tabpanel");
}

beforeEach(() => {
  localStorage.clear();
  useProgressStore.getState().resetAll();
});

describe("ModuloPage — sección 'Explica simple' integra el editor real (S5)", () => {
  it("muestra la consigna REAL del módulo (C-CONTENT) y el editor Feynman", () => {
    renderModulo("mod01");
    const panel = explicaSimplePanel();

    expect(within(panel).getByText(MOD01.secciones.explicaSimple.consignaExplicacion)).toBeInTheDocument();
    expect(within(panel).getByTestId("feynman-editor")).toBeInTheDocument();
  });

  it("ya no muestra el placeholder 'próximamente' de S2", () => {
    renderModulo("mod01");
    const panel = explicaSimplePanel();

    expect(within(panel).queryByText(/próximamente|proximamente/i)).not.toBeInTheDocument();
  });
});

describe("ModuloPage — guardar la explicación de un módulo NO afecta a otros (aislamiento por ModuleId)", () => {
  it("escribir y guardar en mod01 deja el progreso de mod02 intacto", () => {
    renderModulo("mod01");
    const panel = explicaSimplePanel();
    const textarea = within(panel).getByTestId("feynman-editor").querySelector("textarea");
    expect(textarea).not.toBeNull();

    fireEvent.change(textarea as HTMLTextAreaElement, { target: { value: EXPLICACION_VALIDA } });
    fireEvent.click(within(panel).getByRole("button", { name: /guardar/i }));

    expect(useProgressStore.getState().modules["mod01"]?.explicacion?.texto).toBe(EXPLICACION_VALIDA);
    expect(useProgressStore.getState().modules["mod02"]?.explicacion).toBeUndefined();
  });

  it("navegar a mod02 muestra su propio editor vacío, sin arrastrar el texto de mod01", () => {
    useProgressStore.getState().saveExplanation("mod01", EXPLICACION_VALIDA);

    renderModulo("mod02");
    const panel = explicaSimplePanel();

    expect(within(panel).getByText(MOD02.secciones.explicaSimple.consignaExplicacion)).toBeInTheDocument();
    const textarea = within(panel).getByTestId("feynman-editor").querySelector("textarea");
    expect(textarea).toHaveValue("");
  });
});
