/**
 * Tests de `FeynmanEditor` (contrato C-PROGRESS `saveExplanation`/
 * `isExplanationDone`, CONFIG.curso.umbralExplicacionChars). Slice S5 —
 * SLICES.md §S5. Cubre CA-13, CA-14.
 *
 * Escritos de forma INDEPENDIENTE del implementer, contra los contratos
 * cerrados de ARCHITECTURE.md §4 (C-PROGRESS, Configuración). `FeynmanEditor`
 * no tiene props ni marcado definidos en ARCHITECTURE.md más allá de "toca
 * `src/components/FeynmanEditor.tsx`" — se fija aquí el contrato mínimo de
 * componente necesario para hacer estos tests deterministas (mismo patrón
 * que `QuizCard.test.tsx` fijó para S4). La consigna
 * (`SeccionExplicaSimple.consignaExplicacion`, C-CONTENT) es responsabilidad
 * de quien integra el componente (`ModuloPage`, ver
 * `ModuloPage.feynman.test.tsx`), no de `FeynmanEditor` en sí. Cualquier
 * divergencia real y justificada del implementer debe ir al reviewer, no
 * relajarse aquí.
 *
 * ---------------------------------------------------------------------------
 * CONTRATO DE COMPONENTE ASUMIDO
 * ---------------------------------------------------------------------------
 *   interface FeynmanEditorProps { moduleId: ModuleId }
 *
 * - Contenedor raíz con `data-testid="feynman-editor"`.
 * - Un único `<textarea>` (rol nativo "textbox") DENTRO del contenedor, cuyo
 *   valor INICIAL se lee del store real `useProgressStore` (C-PROGRESS):
 *   `modules[moduleId]?.explicacion?.texto ?? ""` (soporte de CA-14).
 * - Contador de caracteres visible DENTRO del contenedor raíz: su
 *   `textContent` contiene, como subcadenas, el número de caracteres
 *   actuales Y el umbral `CONFIG.curso.umbralExplicacionChars` (formato
 *   libre, p. ej. "199 / 200"), verificable sin asumir la redacción exacta.
 * - Un elemento con `role="status"` cuyo texto contiene la palabra
 *   "completad…" (p. ej. "Completado") SOLO cuando `texto.length >= umbral`
 *   (CA-13); con menos, ese texto NO debe contener esa palabra (para no
 *   confundir con un falso "no completado" que la contuviera igualmente).
 * - Guardado EXPLÍCITO: botón accesible por nombre que matchea /guardar/i
 *   que, al pulsarlo, llama a `saveExplanation(moduleId, texto)` del store
 *   real de forma síncrona (verificable sin esperar).
 * - Guardado por DEBOUNCE: escribir sin pulsar el botón también termina
 *   persistiendo en el store real tras un tiempo corto (verificado con
 *   `vi.waitFor`, sin asumir el intervalo exacto del debounce).
 * - Botón "pedir feedback": accesible por nombre que matchea
 *   /pedir feedback/i. Slice S11 (SLICES.md §S11, CA-27/A-10) lo ACTIVA
 *   cuando la explicación GUARDADA en el store real alcanza el umbral
 *   (`isExplanationDone`, C-PROGRESS) y, al pulsarlo, invoca
 *   `useChatStore(...).sendFeynmanFeedback(moduleId)` (C-ASSIST) — se mockea
 *   `@/assistant/chatStore` completo (ver bloque `vi.mock` más abajo) porque
 *   el streaming/red de esa acción ya está cubierto de forma independiente en
 *   `chatStore.test.ts`; aquí solo se verifica que `FeynmanEditor` DISPARA la
 *   acción correcta con el `moduleId` correcto, gateada por la validez de la
 *   explicación guardada (no la del texto sin guardar todavía en el
 *   textarea, igual criterio que el indicador "completado" de CA-13, que lee
 *   del store real vía `isExplanationDone`).
 * ---------------------------------------------------------------------------
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FeynmanEditor } from "@/components/FeynmanEditor";
import { CONFIG } from "@/config";
import type { ModuleId } from "@/content/types";
import { isExplanationDone } from "@/progress/selectors";
import { useProgressStore } from "@/progress/store";
import { EXPLICACION_CORTA, EXPLICACION_VALIDA } from "@/progress/test-fixtures";

const MOD_ID: ModuleId = "mod01";

const SAVE_NAME = /guardar/i;
const FEEDBACK_NAME = /pedir feedback/i;
const COMPLETADO_WORD = /completad/i;

/**
 * Mock de `@/assistant/chatStore` (C-ASSIST): replica la forma real de un
 * store zustand (función-hook con `.getState()` estático) para soportar
 * cualquiera de las dos formas habituales de invocar una acción
 * (`useChatStore((s) => s.sendFeynmanFeedback)(id)` o
 * `useChatStore.getState().sendFeynmanFeedback(id)`), sin acoplarse a cuál
 * elige el implementer.
 */
const { sendFeynmanFeedback } = vi.hoisted(() => ({ sendFeynmanFeedback: vi.fn() }));

vi.mock("@/assistant/chatStore", () => {
  const state = { sendFeynmanFeedback };
  const useChatStore = Object.assign(
    (selector: (s: typeof state) => unknown) => selector(state),
    { getState: () => state },
  );
  return { useChatStore };
});

function editor(): HTMLElement {
  return screen.getByTestId("feynman-editor");
}

function textarea(): HTMLElement {
  return within(editor()).getByRole("textbox");
}

function estado(): HTMLElement {
  return within(editor()).getByRole("status");
}

beforeEach(() => {
  localStorage.clear();
  useProgressStore.getState().resetAll();
  sendFeynmanFeedback.mockClear();
});

// ---------------------------------------------------------------------------
// Restauración desde el store real (soporte de CA-14).
// ---------------------------------------------------------------------------

describe("FeynmanEditor — restauración desde el store real", () => {
  it("con progreso vacío, el textarea arranca sin texto", () => {
    render(<FeynmanEditor moduleId={MOD_ID} />);
    expect(textarea()).toHaveValue("");
  });

  it("inicializa el textarea con el texto ya guardado en el store real (C-PROGRESS)", () => {
    useProgressStore.getState().saveExplanation(MOD_ID, "Explicación previa guardada.");
    render(<FeynmanEditor moduleId={MOD_ID} />);
    expect(textarea()).toHaveValue("Explicación previa guardada.");
  });
});

// ---------------------------------------------------------------------------
// Contador de caracteres visible.
// ---------------------------------------------------------------------------

describe("FeynmanEditor — contador de caracteres visible", () => {
  it("refleja el número de caracteres actuales y el umbral configurado", () => {
    render(<FeynmanEditor moduleId={MOD_ID} />);
    fireEvent.change(textarea(), { target: { value: EXPLICACION_CORTA } });

    const texto = editor().textContent ?? "";
    expect(texto).toContain(String(EXPLICACION_CORTA.length));
    expect(texto).toContain(String(CONFIG.curso.umbralExplicacionChars));
  });

  it("se actualiza en vivo al seguir escribiendo", () => {
    render(<FeynmanEditor moduleId={MOD_ID} />);

    expect(editor().textContent ?? "").toContain("0");

    fireEvent.change(textarea(), { target: { value: "12345" } });
    expect(editor().textContent ?? "").toContain("5");
  });
});

// ---------------------------------------------------------------------------
// CA-13 — umbral EXACTO de 200 caracteres desde CONFIG.
// ---------------------------------------------------------------------------

describe("FeynmanEditor — CA-13: umbral EXACTO de 200 caracteres", () => {
  it("199 caracteres ⇒ paso 1 NO completado (ni en la UI ni en el selector real)", () => {
    render(<FeynmanEditor moduleId={MOD_ID} />);
    fireEvent.change(textarea(), { target: { value: EXPLICACION_CORTA } });
    fireEvent.click(screen.getByRole("button", { name: SAVE_NAME }));

    expect(estado().textContent ?? "").not.toMatch(COMPLETADO_WORD);
    const progress = useProgressStore.getState().modules[MOD_ID];
    expect(isExplanationDone(progress)).toBe(false);
  });

  it("200 caracteres exactos ⇒ paso 1 SÍ completado (CONFIG.curso.umbralExplicacionChars)", () => {
    expect(CONFIG.curso.umbralExplicacionChars).toBe(200); // documenta la config usada
    render(<FeynmanEditor moduleId={MOD_ID} />);
    fireEvent.change(textarea(), { target: { value: EXPLICACION_VALIDA } });
    fireEvent.click(screen.getByRole("button", { name: SAVE_NAME }));

    expect(estado().textContent ?? "").toMatch(COMPLETADO_WORD);
    const progress = useProgressStore.getState().modules[MOD_ID];
    expect(isExplanationDone(progress)).toBe(true);
  });

  it("el indicador reacciona en vivo mientras se escribe, sin necesidad de guardar", () => {
    render(<FeynmanEditor moduleId={MOD_ID} />);

    fireEvent.change(textarea(), { target: { value: EXPLICACION_CORTA } });
    expect(estado().textContent ?? "").not.toMatch(COMPLETADO_WORD);

    fireEvent.change(textarea(), { target: { value: EXPLICACION_VALIDA } });
    expect(estado().textContent ?? "").toMatch(COMPLETADO_WORD);
  });
});

// ---------------------------------------------------------------------------
// Guardado explícito y guardado por debounce (SLICES.md §S5).
// ---------------------------------------------------------------------------

describe("FeynmanEditor — guardado explícito", () => {
  it("el botón 'Guardar' persiste el texto EXACTO en el store real de inmediato", () => {
    render(<FeynmanEditor moduleId={MOD_ID} />);
    const texto = "Mi explicación con tildes: ñ, á, é, saltos y símbolos: #, %, &.";
    fireEvent.change(textarea(), { target: { value: texto } });
    fireEvent.click(screen.getByRole("button", { name: SAVE_NAME }));

    expect(useProgressStore.getState().modules[MOD_ID]?.explicacion?.texto).toBe(texto);
  });

  it("no persiste nada en el store antes de escribir (sin llamadas espurias al montar)", () => {
    render(<FeynmanEditor moduleId={MOD_ID} />);
    expect(useProgressStore.getState().modules[MOD_ID]?.explicacion).toBeUndefined();
  });
});

describe("FeynmanEditor — guardado por debounce (sin pulsar Guardar)", () => {
  it("tras escribir y esperar, el texto se persiste en el store real sin acción explícita", async () => {
    render(<FeynmanEditor moduleId={MOD_ID} />);
    const texto = "Explicación que se guarda sola tras una pausa al escribir (debounce).";
    fireEvent.change(textarea(), { target: { value: texto } });

    await vi.waitFor(
      () => {
        expect(useProgressStore.getState().modules[MOD_ID]?.explicacion?.texto).toBe(texto);
      },
      { timeout: 5000 },
    );
  });
});

// ---------------------------------------------------------------------------
// CA-27/A-10 (slice S11) — botón "pedir feedback" ACTIVADO cuando hay
// explicación válida guardada; deshabilitado en caso contrario.
// ---------------------------------------------------------------------------

describe("FeynmanEditor — CA-27: botón 'pedir feedback' deshabilitado sin explicación válida GUARDADA", () => {
  it("con el store vacío (nada escrito ni guardado) el botón existe y está deshabilitado", () => {
    render(<FeynmanEditor moduleId={MOD_ID} />);
    expect(screen.getByRole("button", { name: FEEDBACK_NAME })).toBeDisabled();
  });

  it("escribir sin guardar (aunque llegue al umbral) NO activa el botón: depende del texto GUARDADO", () => {
    render(<FeynmanEditor moduleId={MOD_ID} />);
    fireEvent.change(textarea(), { target: { value: EXPLICACION_VALIDA } });
    // Sin pulsar "Guardar" ni esperar al debounce.

    expect(screen.getByRole("button", { name: FEEDBACK_NAME })).toBeDisabled();
  });

  it("con una explicación guardada por debajo del umbral (CA-13) el botón sigue deshabilitado", () => {
    useProgressStore.getState().saveExplanation(MOD_ID, EXPLICACION_CORTA);
    render(<FeynmanEditor moduleId={MOD_ID} />);

    expect(isExplanationDone(useProgressStore.getState().modules[MOD_ID])).toBe(false);
    expect(screen.getByRole("button", { name: FEEDBACK_NAME })).toBeDisabled();
  });

  it("pulsar el botón deshabilitado no invoca sendFeynmanFeedback", () => {
    render(<FeynmanEditor moduleId={MOD_ID} />);
    fireEvent.click(screen.getByRole("button", { name: FEEDBACK_NAME }));

    expect(sendFeynmanFeedback).not.toHaveBeenCalled();
  });
});

describe("FeynmanEditor — CA-27: botón 'pedir feedback' ACTIVADO con explicación válida guardada", () => {
  it("con una explicación guardada que alcanza el umbral (CA-13) el botón se habilita", () => {
    useProgressStore.getState().saveExplanation(MOD_ID, EXPLICACION_VALIDA);
    render(<FeynmanEditor moduleId={MOD_ID} />);

    expect(isExplanationDone(useProgressStore.getState().modules[MOD_ID])).toBe(true);
    expect(screen.getByRole("button", { name: FEEDBACK_NAME })).toBeEnabled();
  });

  it("al pulsarlo, invoca sendFeynmanFeedback con el moduleId del editor actual", () => {
    useProgressStore.getState().saveExplanation(MOD_ID, EXPLICACION_VALIDA);
    render(<FeynmanEditor moduleId={MOD_ID} />);

    fireEvent.click(screen.getByRole("button", { name: FEEDBACK_NAME }));

    expect(sendFeynmanFeedback).toHaveBeenCalledTimes(1);
    expect(sendFeynmanFeedback).toHaveBeenCalledWith(MOD_ID);
  });

  it("guardar la explicación EN VIVO (botón Guardar) habilita el botón sin necesidad de recargar", () => {
    render(<FeynmanEditor moduleId={MOD_ID} />);
    expect(screen.getByRole("button", { name: FEEDBACK_NAME })).toBeDisabled();

    fireEvent.change(textarea(), { target: { value: EXPLICACION_VALIDA } });
    fireEvent.click(screen.getByRole("button", { name: SAVE_NAME }));

    expect(screen.getByRole("button", { name: FEEDBACK_NAME })).toBeEnabled();
  });
});
