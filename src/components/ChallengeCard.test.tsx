/**
 * Tests de `ChallengeCard` (contratos C-RUNNER `PyRunner`/`RunChallengeRequest`/
 * `RunChallengeResult`/`CheckResult`, C-PROGRESS `recordChallengeResult`/
 * `markSolutionViewed`/`isChallengePassed`/`isSolutionAvailable`, C-CONTENT
 * `CodeChallenge`). Slice S7 — SLICES.md §S7. Cubre CA-06 (UI), CA-07 (UI),
 * CA-08, CA-09.
 *
 * Escritos de forma INDEPENDIENTE del implementer, contra los contratos
 * cerrados de ARCHITECTURE.md §4. El runner se MOCKEA con la interfaz EXACTA
 * de C-RUNNER (`PyRunner`): ningún test aquí carga Pyodide real (eso lo cubre
 * el slice S6, `src/runner/**`). El store de progreso es el REAL
 * (`useProgressStore`) para verificar el registro efectivo (CA-08/09), igual
 * que hicieron `QuizCard.test.tsx` (S4) y `FeynmanEditor.test.tsx` (S5).
 *
 * ---------------------------------------------------------------------------
 * CONTRATO DE COMPONENTE ASUMIDO (no fijado por ARCHITECTURE.md más allá de
 * "toca `src/components/ChallengeCard.tsx`" — se fija aquí el mínimo necesario
 * para tests deterministas, análogo al patrón de QuizCard/FeynmanEditor).
 * ---------------------------------------------------------------------------
 *   interface ChallengeCardProps { moduleId: ModuleId; reto: CodeChallenge }
 *
 * - Consume el runner exclusivamente vía `useRunner()` de `@/runner/useRunner`
 *   (regla de dependencia ARCHITECTURE §2: la UI nunca habla con Pyodide
 *   directamente). Este módulo se mockea íntegramente en este archivo.
 * - Contenedor raíz con `data-testid="challenge-card"`.
 * - Editor de código: un control con `data-testid="challenge-code-editor"`
 *   cuyo valor es legible/editable con `fireEvent.change`/`.value` (nota: la
 *   arquitectura elige CodeMirror para producción; si CodeMirror no expone
 *   directamente un `<textarea>` controlable así en jsdom, el implementer
 *   debe exponer este `data-testid` como puente de testabilidad — p. ej. un
 *   `<textarea>` sincronizado — sin comprometer el editor real de producción).
 *   Arranca con el valor `reto.starterCode` (US-03).
 * - `runner.init()` se llama de forma lazy al montar el componente (el reto
 *   se vuelve "visible", C-RUNNER: "Llamar lazy en el primer reto visible").
 *   Mientras esa promesa está pendiente: (a) es visible un texto que matchea
 *   `/cargando entorno/i` dentro del contenedor, y (b) el botón de
 *   ejecutar/validar está deshabilitado.
 * - Botón "ejecutar/validar", accesible por nombre que matchea
 *   `/ejecutar|validar/i`. Al pulsarlo (con el runner ya inicializado), llama
 *   a `runner.runChallenge(req)` con:
 *     req.challengeId === reto.id
 *     req.studentCode === valor actual del editor
 *     req.validationCode === reto.validationCode
 *     req.llmDoubles === reto.llmDoubles
 *     req.timeoutMs === reto.timeoutMs ?? CONFIG.runner.defaultTimeoutMs
 *   Mientras esa promesa está pendiente: texto que matchea `/ejecutando/i` y
 *   el botón queda deshabilitado.
 * - Al resolver `runChallenge`:
 *     - status "timeout": se muestra el `message` EXACTO devuelto por el
 *       runner (ya en español, contrato C-RUNNER).
 *     - status "pass"/"fail": cada `CheckResult` de `checks` se renderiza en
 *       un elemento con `data-testid="check-${check.id}"` y atributo
 *       `data-passed="true"|"false"`, que contiene el texto de
 *       `check.description` y, si `check.passed === false`, también el texto
 *       de `check.message` (CA-07: identifica la aserción concreta, nunca un
 *       mensaje genérico).
 *     - el `stdout` se muestra dentro de un elemento con
 *       `data-testid="challenge-stdout"`.
 *     - se llama a `recordChallengeResult(moduleId, reto.id, status === "pass")`
 *       del store REAL `useProgressStore` (verificable con el selector real
 *       `isChallengePassed`) — CA-06/CA-08.
 * - Botón "ver solución", accesible por nombre que matchea `/ver soluci/i`:
 *     - AUSENTE del documento mientras no exista ningún intento registrado
 *       (`isSolutionAvailable` false) — CA-09.
 *     - PRESENTE en cuanto exista ≥1 intento (pass o fail) — CA-09.
 *     - al pulsarlo: (a) aparece un elemento `data-testid="challenge-solution-code"`
 *       cuyo texto (normalizando espacios) es EXACTAMENTE `reto.solutionCode`;
 *       (b) llama a `markSolutionViewed(moduleId, reto.id)` del store real
 *       (verificable con `progress.retos[reto.id].solucionVista === true`);
 *       (c) NUNCA cambia `ultimoPass` ni invoca `runner.runChallenge` de
 *       nuevo — verlo nunca marca el reto como hecho (CA-09).
 * ---------------------------------------------------------------------------
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChallengeCard } from "@/components/ChallengeCard";
import { CONFIG } from "@/config";
import type { CodeChallenge, ModuleId } from "@/content/types";
import { isChallengePassed, isSolutionAvailable } from "@/progress/selectors";
import { useProgressStore } from "@/progress/store";
import type { RunChallengeRequest, RunChallengeResult } from "@/runner/types";

// ---------------------------------------------------------------------------
// Mock del runner: interfaz EXACTA de C-RUNNER (`PyRunner`). No se carga
// Pyodide en ningún momento de este archivo.
// ---------------------------------------------------------------------------

const mockRunner = vi.hoisted(() => ({
  init: vi.fn(),
  getState: vi.fn(),
  runChallenge: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock("@/runner/useRunner", () => ({
  useRunner: () => mockRunner,
}));

const MOD_ID: ModuleId = "mod05";

const RUN_NAME = /ejecutar|validar/i;
const SOLUTION_NAME = /ver soluci/i;

function buildReto(overrides: Partial<CodeChallenge> = {}): CodeChallenge {
  return {
    id: "mod05-reto1",
    titulo: "Reto de prueba",
    enunciadoMd: "Completa la función `resolver` para que devuelva 42.",
    starterCode: "def resolver():\n    # TODO\n    pass\n",
    solutionCode: "def resolver():\n    return 42\n",
    validationCode: "check('c1', 'retorna 42', resolver() == 42)",
    ...overrides,
  };
}

const PASS_RESULT: RunChallengeResult = {
  status: "pass",
  checks: [{ id: "c1", description: "retorna 42", passed: true }],
  stdout: "",
};

function failResult(message = "esperado 42, obtenido 0"): RunChallengeResult {
  return {
    status: "fail",
    checks: [{ id: "c1", description: "retorna 42", passed: false, message }],
    stdout: "",
  };
}

const TIMEOUT_RESULT: RunChallengeResult = {
  status: "timeout",
  message: "El código superó el límite de 8 s",
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function normalizeWs(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function card(): HTMLElement {
  return screen.getByTestId("challenge-card");
}

function codeEditor(): HTMLElement {
  return within(card()).getByTestId("challenge-code-editor");
}

function runButton(): HTMLElement {
  return within(card()).getByRole("button", { name: RUN_NAME });
}

function solutionButtonQuery(): HTMLElement | null {
  return within(card()).queryByRole("button", { name: SOLUTION_NAME });
}

function checkResultEl(id: string): HTMLElement {
  return within(card()).getByTestId(`check-${id}`);
}

function progressOf(moduleId: ModuleId) {
  return useProgressStore.getState().modules[moduleId];
}

beforeEach(() => {
  localStorage.clear();
  useProgressStore.getState().resetAll();

  mockRunner.init.mockReset().mockResolvedValue(undefined);
  mockRunner.getState.mockReset().mockReturnValue("idle");
  mockRunner.runChallenge.mockReset().mockResolvedValue(PASS_RESULT);
  mockRunner.cancel.mockReset();
});

// ---------------------------------------------------------------------------
// Editor: arranca con el starterCode.
// ---------------------------------------------------------------------------

describe("ChallengeCard — editor de código", () => {
  it("arranca con el starterCode EXACTO del reto", () => {
    const reto = buildReto();
    render(<ChallengeCard moduleId={MOD_ID} reto={reto} />);
    expect(codeEditor()).toHaveValue(reto.starterCode);
  });
});

// ---------------------------------------------------------------------------
// Estados del runner: cargando entorno / ejecutando / timeout (SLICES §S7).
// ---------------------------------------------------------------------------

describe("ChallengeCard — estado 'cargando entorno' (init lazy al montar)", () => {
  it("muestra 'cargando entorno' mientras runner.init() está pendiente y deshabilita ejecutar", async () => {
    const deferred = createDeferred<void>();
    mockRunner.init.mockReturnValue(deferred.promise);

    render(<ChallengeCard moduleId={MOD_ID} reto={buildReto()} />);

    expect(await within(card()).findByText(/cargando entorno/i)).toBeInTheDocument();
    expect(runButton()).toBeDisabled();

    deferred.resolve();

    await waitFor(() => expect(within(card()).queryByText(/cargando entorno/i)).not.toBeInTheDocument());
    expect(runButton()).not.toBeDisabled();
  });
});

describe("ChallengeCard — estado 'ejecutando'", () => {
  it("muestra 'ejecutando' mientras runChallenge() está pendiente y deshabilita ejecutar", async () => {
    const deferred = createDeferred<RunChallengeResult>();
    mockRunner.runChallenge.mockReturnValue(deferred.promise);

    render(<ChallengeCard moduleId={MOD_ID} reto={buildReto()} />);
    await waitFor(() => expect(runButton()).not.toBeDisabled());

    fireEvent.click(runButton());

    expect(await within(card()).findByText(/ejecutando/i)).toBeInTheDocument();
    expect(runButton()).toBeDisabled();

    deferred.resolve(PASS_RESULT);
    await waitFor(() => expect(within(card()).queryByText(/ejecutando/i)).not.toBeInTheDocument());
  });
});

describe("ChallengeCard — estado 'timeout'", () => {
  it("bucle infinito ⇒ timeout: muestra el mensaje EXACTO devuelto por el runner", async () => {
    mockRunner.runChallenge.mockResolvedValue(TIMEOUT_RESULT);

    render(<ChallengeCard moduleId={MOD_ID} reto={buildReto()} />);
    await waitFor(() => expect(runButton()).not.toBeDisabled());
    fireEvent.click(runButton());

    expect(await within(card()).findByText(TIMEOUT_RESULT.message)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// CA-06 (UI) — solución correcta ⇒ pass, checks visibles, marca hecho.
// ---------------------------------------------------------------------------

describe("ChallengeCard — CA-06: solución correcta ⇒ pass y marca el reto como hecho", () => {
  it("muestra los checks superados y registra pass en el store real de progreso", async () => {
    const reto = buildReto();
    mockRunner.runChallenge.mockResolvedValue(PASS_RESULT);

    render(<ChallengeCard moduleId={MOD_ID} reto={reto} />);
    await waitFor(() => expect(runButton()).not.toBeDisabled());
    fireEvent.click(runButton());

    await waitFor(() => expect(isChallengePassed(progressOf(MOD_ID), reto.id)).toBe(true));

    const check = checkResultEl("c1");
    expect(check).toHaveAttribute("data-passed", "true");
    expect(within(check).getByText("retorna 42")).toBeInTheDocument();
  });

  it("muestra el stdout devuelto por el runner", async () => {
    const reto = buildReto();
    mockRunner.runChallenge.mockResolvedValue({
      status: "pass",
      checks: [{ id: "c1", description: "retorna 42", passed: true }],
      stdout: "resultado: 42\n",
    });

    render(<ChallengeCard moduleId={MOD_ID} reto={reto} />);
    await waitFor(() => expect(runButton()).not.toBeDisabled());
    fireEvent.click(runButton());

    const stdoutEl = await within(card()).findByTestId("challenge-stdout");
    await waitFor(() => expect(stdoutEl.textContent ?? "").toContain("resultado: 42"));
  });

  it("envía runChallenge con la forma EXACTA del contrato C-RUNNER (código editado + defaults)", async () => {
    const reto = buildReto();
    const codigoEditado = "def resolver():\n    return 42\n";

    render(<ChallengeCard moduleId={MOD_ID} reto={reto} />);
    await waitFor(() => expect(runButton()).not.toBeDisabled());

    fireEvent.change(codeEditor(), { target: { value: codigoEditado } });
    fireEvent.click(runButton());

    await waitFor(() => expect(mockRunner.runChallenge).toHaveBeenCalledTimes(1));
    const req = mockRunner.runChallenge.mock.calls[0]![0] as RunChallengeRequest;

    expect(req.challengeId).toBe(reto.id);
    expect(req.studentCode).toBe(codigoEditado);
    expect(req.validationCode).toBe(reto.validationCode);
    expect(req.llmDoubles).toBeUndefined();
    expect(req.timeoutMs).toBe(CONFIG.runner.defaultTimeoutMs);
  });

  it("usa reto.timeoutMs cuando está definido, en vez del default de CONFIG", async () => {
    const reto = buildReto({ timeoutMs: 3000 });

    render(<ChallengeCard moduleId={MOD_ID} reto={reto} />);
    await waitFor(() => expect(runButton()).not.toBeDisabled());
    fireEvent.click(runButton());

    await waitFor(() => expect(mockRunner.runChallenge).toHaveBeenCalledTimes(1));
    const req = mockRunner.runChallenge.mock.calls[0]![0] as RunChallengeRequest;
    expect(req.timeoutMs).toBe(3000);
  });

  it("propaga los llmDoubles del reto a la solicitud", async () => {
    const reto = buildReto({ llmDoubles: [{ respuesta: "hola" }] });

    render(<ChallengeCard moduleId={MOD_ID} reto={reto} />);
    await waitFor(() => expect(runButton()).not.toBeDisabled());
    fireEvent.click(runButton());

    await waitFor(() => expect(mockRunner.runChallenge).toHaveBeenCalledTimes(1));
    const req = mockRunner.runChallenge.mock.calls[0]![0] as RunChallengeRequest;
    expect(req.llmDoubles).toEqual(reto.llmDoubles);
  });
});

// ---------------------------------------------------------------------------
// CA-07 (UI) — solución incorrecta ⇒ fail con check identificado concretamente.
// ---------------------------------------------------------------------------

describe("ChallengeCard — CA-07: solución incorrecta ⇒ fail con mensaje concreto (no genérico)", () => {
  it("muestra el check fallido con su mensaje EXACTO y registra fail en el store", async () => {
    const reto = buildReto();
    mockRunner.runChallenge.mockResolvedValue(failResult("esperado 42, obtenido 0"));

    render(<ChallengeCard moduleId={MOD_ID} reto={reto} />);
    await waitFor(() => expect(runButton()).not.toBeDisabled());
    fireEvent.click(runButton());

    await waitFor(() => expect(isChallengePassed(progressOf(MOD_ID), reto.id)).toBe(false));

    const check = checkResultEl("c1");
    expect(check).toHaveAttribute("data-passed", "false");
    expect(within(check).getByText("esperado 42, obtenido 0")).toBeInTheDocument();
    expect(isSolutionAvailable(progressOf(MOD_ID), reto.id)).toBe(true);
  });

  it("identifica el check ESPECÍFICO que falla entre varios checks (uno pasa, otro falla)", async () => {
    const reto = buildReto();
    mockRunner.runChallenge.mockResolvedValue({
      status: "fail",
      checks: [
        { id: "c1", description: "retorna un entero", passed: true },
        { id: "c2", description: "el valor es 42", passed: false, message: "esperado 42, obtenido 7" },
      ],
      stdout: "",
    });

    render(<ChallengeCard moduleId={MOD_ID} reto={reto} />);
    await waitFor(() => expect(runButton()).not.toBeDisabled());
    fireEvent.click(runButton());

    await waitFor(() => expect(checkResultEl("c2")).toHaveAttribute("data-passed", "false"));
    expect(checkResultEl("c1")).toHaveAttribute("data-passed", "true");
    expect(within(checkResultEl("c2")).getByText("esperado 42, obtenido 7")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// CA-08 — último intento manda: pass ⇒ hecho, luego fail ⇒ no-hecho.
// ---------------------------------------------------------------------------

describe("ChallengeCard — CA-08: el ÚLTIMO intento manda", () => {
  it("reto en pass, luego un envío que falla ⇒ el estado pasa a no-hecho", async () => {
    const reto = buildReto();
    mockRunner.runChallenge.mockResolvedValueOnce(PASS_RESULT);

    render(<ChallengeCard moduleId={MOD_ID} reto={reto} />);
    await waitFor(() => expect(runButton()).not.toBeDisabled());
    fireEvent.click(runButton());
    await waitFor(() => expect(isChallengePassed(progressOf(MOD_ID), reto.id)).toBe(true));

    mockRunner.runChallenge.mockResolvedValueOnce(failResult());
    fireEvent.click(runButton());
    await waitFor(() => expect(isChallengePassed(progressOf(MOD_ID), reto.id)).toBe(false));

    expect(progressOf(MOD_ID)?.retos[reto.id]?.intentos).toBe(2);
  });

  it("reto en fail, luego un envío que pasa ⇒ el estado pasa a hecho", async () => {
    const reto = buildReto();
    mockRunner.runChallenge.mockResolvedValueOnce(failResult());

    render(<ChallengeCard moduleId={MOD_ID} reto={reto} />);
    await waitFor(() => expect(runButton()).not.toBeDisabled());
    fireEvent.click(runButton());
    await waitFor(() => expect(isChallengePassed(progressOf(MOD_ID), reto.id)).toBe(false));

    mockRunner.runChallenge.mockResolvedValueOnce(PASS_RESULT);
    fireEvent.click(runButton());
    await waitFor(() => expect(isChallengePassed(progressOf(MOD_ID), reto.id)).toBe(true));

    expect(progressOf(MOD_ID)?.retos[reto.id]?.intentos).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// CA-09 — gating de "ver solución".
// ---------------------------------------------------------------------------

describe("ChallengeCard — CA-09: gating del botón 'ver solución'", () => {
  it("sin ningún intento, el botón 'ver solución' NO está disponible", () => {
    render(<ChallengeCard moduleId={MOD_ID} reto={buildReto()} />);
    expect(solutionButtonQuery()).not.toBeInTheDocument();
    expect(isSolutionAvailable(progressOf(MOD_ID), buildReto().id)).toBe(false);
  });

  it("con ≥1 intento (fallido), el botón 'ver solución' está disponible", async () => {
    const reto = buildReto();
    mockRunner.runChallenge.mockResolvedValue(failResult());

    render(<ChallengeCard moduleId={MOD_ID} reto={reto} />);
    await waitFor(() => expect(runButton()).not.toBeDisabled());
    fireEvent.click(runButton());

    await waitFor(() => expect(solutionButtonQuery()).toBeInTheDocument());
  });

  it("con ≥1 intento (en pass), el botón 'ver solución' también está disponible", async () => {
    const reto = buildReto();
    mockRunner.runChallenge.mockResolvedValue(PASS_RESULT);

    render(<ChallengeCard moduleId={MOD_ID} reto={reto} />);
    await waitFor(() => expect(runButton()).not.toBeDisabled());
    fireEvent.click(runButton());

    await waitFor(() => expect(solutionButtonQuery()).toBeInTheDocument());
  });

  it("ver la solución muestra el código de referencia EXACTO, marca solucionVista, y NUNCA marca hecho", async () => {
    const reto = buildReto();
    mockRunner.runChallenge.mockResolvedValue(failResult());

    render(<ChallengeCard moduleId={MOD_ID} reto={reto} />);
    await waitFor(() => expect(runButton()).not.toBeDisabled());
    fireEvent.click(runButton());

    const solutionButton = await within(card()).findByRole("button", { name: SOLUTION_NAME });
    expect(within(card()).queryByTestId("challenge-solution-code")).not.toBeInTheDocument();

    fireEvent.click(solutionButton);

    const solutionEl = await within(card()).findByTestId("challenge-solution-code");
    expect(normalizeWs(solutionEl.textContent ?? "")).toBe(normalizeWs(reto.solutionCode));

    const progress = progressOf(MOD_ID);
    expect(progress?.retos[reto.id]?.solucionVista).toBe(true);
    // Ver la solución NUNCA marca el reto como hecho: seguía en fail.
    expect(isChallengePassed(progress, reto.id)).toBe(false);
    // Ver la solución no dispara una nueva ejecución del runner.
    expect(mockRunner.runChallenge).toHaveBeenCalledTimes(1);
  });

  it("ver la solución tras un intento en PASS no cambia el estado (sigue hecho)", async () => {
    const reto = buildReto();
    mockRunner.runChallenge.mockResolvedValue(PASS_RESULT);

    render(<ChallengeCard moduleId={MOD_ID} reto={reto} />);
    await waitFor(() => expect(runButton()).not.toBeDisabled());
    fireEvent.click(runButton());
    await waitFor(() => expect(isChallengePassed(progressOf(MOD_ID), reto.id)).toBe(true));

    const solutionButton = await within(card()).findByRole("button", { name: SOLUTION_NAME });
    fireEvent.click(solutionButton);

    const progress = progressOf(MOD_ID);
    expect(progress?.retos[reto.id]?.solucionVista).toBe(true);
    expect(isChallengePassed(progress, reto.id)).toBe(true);
  });
});
