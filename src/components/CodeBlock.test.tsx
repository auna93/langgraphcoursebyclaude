import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CodeBlock } from "@/components/CodeBlock";

/**
 * Slice S2 (SLICES.md §S2) — CA-29, CA-05.
 *
 * Contrato público que este test fija para `CodeBlock` (no está en
 * ARCHITECTURE.md más allá de "botón copiar (clipboard)"; el test-author lo
 * concreta aquí para que implementer y reviewer compartan la misma interfaz):
 *
 *   export function CodeBlock(props: { code: string; language?: string }): JSX.Element
 *
 * Marcado exigido:
 *   - contenedor raíz con `data-testid="code-block"`.
 *   - el texto EXACTO de `code` visible dentro de un elemento `<code>`.
 *   - un `<button>` con nombre accesible que matchee /copiar/i (CA-05: español).
 *   - al hacer click, se llama `navigator.clipboard.writeText(code)` con el
 *     contenido EXACTO recibido por prop (CA-29).
 */
describe("CodeBlock (CA-29, CA-05)", () => {
  const SAMPLE_CODE = [
    "def route(state):",
    '    return "b" if len(state["aggregate"]) < 7 else END',
    "",
  ].join("\n");

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

  it("renderiza el código exacto dentro de un bloque identificable", () => {
    render(<CodeBlock code={SAMPLE_CODE} language="python" />);

    const block = screen.getByTestId("code-block");
    const codeEl = within(block).getByText((_, node) => node?.tagName.toLowerCase() === "code");
    expect(codeEl.textContent).toBe(SAMPLE_CODE);
  });

  it('expone un botón "copiar" en español (CA-05)', () => {
    render(<CodeBlock code={SAMPLE_CODE} />);

    const button = screen.getByRole("button", { name: /copiar/i });
    expect(button).toBeInTheDocument();
    // No debe usar el literal en inglés "Copy".
    expect(button.textContent?.toLowerCase()).not.toMatch(/\bcopy\b/);
  });

  it("al hacer click copia el contenido EXACTO del bloque al portapapeles (CA-29)", () => {
    render(<CodeBlock code={SAMPLE_CODE} language="python" />);

    fireEvent.click(screen.getByRole("button", { name: /copiar/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(SAMPLE_CODE);
  });

  it("dos bloques distintos copian cada uno su propio contenido, sin mezclarse", () => {
    const CODE_A = "print('a')\n";
    const CODE_B = "print('b')\n";

    render(
      <>
        <CodeBlock code={CODE_A} />
        <CodeBlock code={CODE_B} />
      </>,
    );

    const buttons = screen.getAllByRole("button", { name: /copiar/i });
    expect(buttons).toHaveLength(2);

    fireEvent.click(buttons[1]);
    expect(writeText).toHaveBeenLastCalledWith(CODE_B);

    fireEvent.click(buttons[0]);
    expect(writeText).toHaveBeenLastCalledWith(CODE_A);
  });
});
