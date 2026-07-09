import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownView } from "@/components/MarkdownView";

/**
 * Slice S2 (SLICES.md §S2) — soporte de CA-02 (renderizado de contenido de
 * las 4 secciones) y CA-29 (bloques de código con "copiar").
 *
 * Contrato público que este test fija (react-markdown+Shiki según
 * ARCHITECTURE.md §1, sin exponer esos detalles en el test). El nombre de la
 * prop sigue el vocabulario de C-CONTENT (`contenidoMd`, ARCHITECTURE.md §4)
 * para que el mismo campo del contrato de contenido se pase tal cual:
 *
 *   export function MarkdownView(props: { contenidoMd: string }): JSX.Element
 *
 * Reglas:
 *   - headings `##`/`###` se renderizan como headings accesibles (nivel 2/3).
 *   - `**negrita**` se renderiza como <strong>.
 *   - un bloque de código con fences (```python ... ```) se renderiza vía
 *     `CodeBlock` (contrato de `CodeBlock.test.tsx`): contenedor
 *     `data-testid="code-block"` con el código EXACTO (sin las fences) y un
 *     botón "copiar".
 */
describe("MarkdownView", () => {
  it("renderiza encabezados markdown como headings accesibles", () => {
    render(<MarkdownView contenidoMd={"## Título de sección\n\nTexto normal."} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Título de sección" }),
    ).toBeInTheDocument();
  });

  it("renderiza negrita como <strong>", () => {
    render(<MarkdownView contenidoMd={"Esto es **muy importante**."} />);

    const strong = screen.getByText("muy importante");
    expect(strong.tagName.toLowerCase()).toBe("strong");
  });

  it("renderiza un bloque de código con fences vía CodeBlock, con el código EXACTO y botón copiar (CA-29)", () => {
    const code = 'def suma(a, b):\n    return a + b\n';
    const markdown = ["Antes del bloque.", "", "```python", code.trimEnd(), "```", "", "Después."].join(
      "\n",
    );

    render(<MarkdownView contenidoMd={markdown} />);

    const block = screen.getByTestId("code-block");
    const codeEl = within(block).getByText((_, node) => node?.tagName.toLowerCase() === "code");
    expect(codeEl.textContent?.trim()).toBe(code.trim());
    expect(within(block).getByRole("button", { name: /copiar/i })).toBeInTheDocument();
  });

  it("no renderiza el marcado markdown crudo (### / ** / ```) como texto visible", () => {
    render(
      <MarkdownView
        contenidoMd={["## Encabezado", "", "**negrita**", "", "```python", "x = 1", "```"].join("\n")}
      />,
    );

    expect(screen.queryByText(/##\s*Encabezado/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\*\*negrita\*\*/)).not.toBeInTheDocument();
  });
});
