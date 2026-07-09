import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { App } from "@/App";
import { STRINGS } from "@/app/strings";

describe("App shell (S0)", () => {
  it("renderiza el layout con sidebar y la página Temario en la ruta /", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: STRINGS.temario.titulo }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(STRINGS.asistente.titulo)).toBeInTheDocument();
  });

  it("navega a /modulo/:id y muestra el módulo real (S2: 4 secciones Feynman)", () => {
    render(
      <MemoryRouter initialEntries={["/modulo/mod01"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: /¿Qué es LangGraph\?/ }),
    ).toBeInTheDocument();
  });
});
