/**
 * Tests de `QuizCard` (contrato C-CONTENT `Quiz`/`QuizQuestion`, C-PROGRESS
 * `recordQuizResult`/`isQuizDone`, CONFIG.curso.umbralQuizPct).
 * Slice S4 — SLICES.md §S4. Cubre CA-11, CA-12.
 *
 * Escrito de forma INDEPENDIENTE del implementer, contra los contratos
 * cerrados de ARCHITECTURE.md §4 (C-CONTENT, C-PROGRESS, Configuración).
 * `QuizCard` no tiene props ni marcado definidos en ARCHITECTURE.md más allá
 * de "toca `src/components/QuizCard.tsx`" — se fija aquí el contrato mínimo
 * de componente necesario para hacer estos tests deterministas (análogo a
 * la decisión de patrón ARIA de `ModuloPage.test.tsx` para S2). Cualquier
 * divergencia real y justificada del implementer debe ir al reviewer, no
 * relajarse aquí.
 *
 * ---------------------------------------------------------------------------
 * CONTRATO DE COMPONENTE ASUMIDO
 * ---------------------------------------------------------------------------
 *   interface QuizCardProps { moduleId: ModuleId; quiz: Quiz }
 *
 * - Cada pregunta se renderiza en un contenedor con `role="group"` (p.ej.
 *   `<fieldset><legend>`) cuyo NOMBRE ACCESIBLE es el `enunciadoMd` exacto de
 *   la pregunta (permite identificar qué pregunta se responde, CA-11).
 *     - "single" y "output": opciones como `role="radio"`, cada una
 *       etiquetada con el texto EXACTO de la opción.
 *     - "multi": opciones como `role="checkbox"`, mismo etiquetado.
 *     - "boolean": dos `role="radio"` etiquetados EXACTAMENTE "Verdadero" y
 *       "Falso" (C-CONTENT no da `opciones` para "boolean"; se fija aquí).
 *     - "output": además, el `codigo` de la pregunta es visible tal cual
 *       (verificable con `getByText` normalizando espacios).
 * - Cada pregunta tiene un botón para confirmar la respuesta, accesible por
 *   nombre que matchea `/responder|comprobar|verificar/i`, DESHABILITADO
 *   mientras no haya ninguna opción seleccionada. Al pulsarlo:
 *     - se indica visiblemente "Correcta" o "Incorrecta" (palabra exacta,
 *       distinguible por límites de palabra) — CA-11;
 *     - se muestra SIEMPRE la `explicacionMd` de la pregunta, en ambos casos
 *       (acierto y fallo) — CA-11.
 * - Cuando TODAS las preguntas del quiz fueron respondidas, `QuizCard`:
 *     - llama a `recordQuizResult(moduleId, quiz.id, pct)` del store real
 *       `useProgressStore` (C-PROGRESS), con `pct` = porcentaje EXACTO de
 *       aciertos (0–100);
 *     - muestra visiblemente la puntuación final (texto que matchea
 *       `/\d+\s*%/`) — "puntuación final visible" (SLICES.md §S4).
 * - Existe un control para repetir el quiz, accesible por nombre que matchea
 *   `/repetir/i`, que reinicia TODAS las preguntas a no respondidas
 *   (repetición ilimitada). El MEJOR resultado histórico se conserva en el
 *   store (verificado con el selector real `isQuizDone`, no se borra al
 *   repetir con peor resultado) — CA-12.
 * ---------------------------------------------------------------------------
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { QuizCard } from "@/components/QuizCard";
import type { ModuleId } from "@/content/types";
import type { Quiz, QuizQuestion } from "@/content/types";
import { CONFIG } from "@/config";
import { isQuizDone } from "@/progress/selectors";
import { useProgressStore } from "@/progress/store";

const MOD_ID: ModuleId = "mod01";

const SUBMIT_NAME = /responder|comprobar|verificar/i;
const REPEAT_NAME = /repetir/i;
const CORRECTA_WORD = /\bcorrecta\b/i;
const INCORRECTA_WORD = /\bincorrecta\b/i;
const SCORE_PATTERN = /\d+\s*%/;

beforeEach(() => {
  localStorage.clear();
  useProgressStore.getState().resetAll();
});

// ---------------------------------------------------------------------------
// Fixtures — una pregunta de cada uno de los 4 tipos de C-CONTENT.
// ---------------------------------------------------------------------------

const SINGLE_QUESTION: QuizQuestion = {
  id: "p-single",
  kind: "single",
  enunciadoMd: "¿Cuál es la capital de Francia?",
  opciones: ["Madrid", "París", "Roma", "Berlín"],
  correcta: 1,
  explicacionMd: "París es la capital de Francia.",
};

const MULTI_QUESTION: QuizQuestion = {
  id: "p-multi",
  kind: "multi",
  enunciadoMd: "¿Cuáles de estos números son pares?",
  opciones: ["2", "3", "4", "5"],
  correctas: [0, 2],
  explicacionMd: "2 y 4 son pares; 3 y 5 son impares.",
};

const BOOLEAN_QUESTION: QuizQuestion = {
  id: "p-boolean",
  kind: "boolean",
  enunciadoMd: "El cielo se percibe azul por la dispersión de Rayleigh.",
  correcta: true,
  explicacionMd: "Correcto: la luz azul se dispersa más que otros colores en la atmósfera.",
};

const OUTPUT_QUESTION: QuizQuestion = {
  id: "p-output",
  kind: "output",
  enunciadoMd: "¿Qué imprime este código?",
  codigo: "print(1 + 1)",
  opciones: ["1", "2", "3", "11"],
  correcta: 1,
  explicacionMd: "1 + 1 es 2, así que el código imprime '2'.",
};

function singleQuestionQuiz(pregunta: QuizQuestion, id = "quiz-mini"): Quiz {
  return { id, titulo: "Quiz de prueba", preguntas: [pregunta] };
}

/** Genera un quiz de N preguntas boolean, todas con `correcta: true`, para poder
 * alcanzar CUALQUIER porcentaje entero de aciertos eligiendo cuántas responder bien. */
function largeBooleanQuiz(n: number, id = "quiz-large"): Quiz {
  const preguntas: QuizQuestion[] = Array.from({ length: n }, (_, i) => ({
    id: `q${i}`,
    kind: "boolean",
    enunciadoMd: `Afirmación número ${i + 1} es verdadera.`,
    correcta: true,
    explicacionMd: `Explicación de la afirmación ${i + 1}.`,
  }));
  return { id, titulo: "Quiz grande", preguntas };
}

// ---------------------------------------------------------------------------
// Helpers de interacción por tipo de pregunta.
// ---------------------------------------------------------------------------

function groupFor(enunciadoMd: string): HTMLElement {
  return screen.getByRole("group", { name: enunciadoMd });
}

function submitButtonOf(group: HTMLElement): HTMLElement {
  return within(group).getByRole("button", { name: SUBMIT_NAME });
}

function answerSingleOrOutput(pregunta: QuizQuestion & { opciones: string[] }, opcionIndex: number) {
  const group = groupFor(pregunta.enunciadoMd);
  fireEvent.click(within(group).getByRole("radio", { name: pregunta.opciones[opcionIndex] }));
  fireEvent.click(submitButtonOf(group));
  return group;
}

function answerMulti(pregunta: QuizQuestion & { opciones: string[] }, opcionIndices: number[]) {
  const group = groupFor(pregunta.enunciadoMd);
  for (const i of opcionIndices) {
    fireEvent.click(within(group).getByRole("checkbox", { name: pregunta.opciones[i] }));
  }
  fireEvent.click(submitButtonOf(group));
  return group;
}

function answerBoolean(pregunta: QuizQuestion, respuesta: boolean) {
  const group = groupFor(pregunta.enunciadoMd);
  const name = respuesta ? /verdadero/i : /falso/i;
  fireEvent.click(within(group).getByRole("radio", { name }));
  fireEvent.click(submitButtonOf(group));
  return group;
}

/** Responde las N primeras preguntas del quiz grande correctamente y el resto mal. */
function answerLargeQuizWithCorrectCount(quiz: Quiz, correctCount: number) {
  for (let i = 0; i < quiz.preguntas.length; i++) {
    answerBoolean(quiz.preguntas[i], i < correctCount);
  }
}

// ---------------------------------------------------------------------------
// CA-11 — corrección inmediata + explicación SIEMPRE visible, los 4 tipos.
// ---------------------------------------------------------------------------

describe("QuizCard — CA-11: corrección inmediata + explicación (tipo 'single')", () => {
  it("responder CORRECTAMENTE indica 'Correcta' y muestra la explicación", () => {
    render(<QuizCard moduleId={MOD_ID} quiz={singleQuestionQuiz(SINGLE_QUESTION)} />);
    const group = answerSingleOrOutput(SINGLE_QUESTION, SINGLE_QUESTION.correcta as number);

    expect(within(group).getByText(CORRECTA_WORD)).toBeInTheDocument();
    expect(within(group).queryByText(INCORRECTA_WORD)).not.toBeInTheDocument();
    expect(within(group).getByText(SINGLE_QUESTION.explicacionMd)).toBeInTheDocument();
  });

  it("responder INCORRECTAMENTE indica 'Incorrecta' y TAMBIÉN muestra la explicación", () => {
    render(<QuizCard moduleId={MOD_ID} quiz={singleQuestionQuiz(SINGLE_QUESTION)} />);
    const opcionIncorrecta = SINGLE_QUESTION.opciones.findIndex(
      (_, i) => i !== SINGLE_QUESTION.correcta,
    );
    const group = answerSingleOrOutput(SINGLE_QUESTION, opcionIncorrecta);

    expect(within(group).getByText(INCORRECTA_WORD)).toBeInTheDocument();
    expect(within(group).getByText(SINGLE_QUESTION.explicacionMd)).toBeInTheDocument();
  });
});

describe("QuizCard — CA-11: corrección inmediata + explicación (tipo 'multi')", () => {
  it("seleccionar exactamente el conjunto correcto ⇒ 'Correcta' + explicación", () => {
    render(<QuizCard moduleId={MOD_ID} quiz={singleQuestionQuiz(MULTI_QUESTION)} />);
    const group = answerMulti(MULTI_QUESTION, MULTI_QUESTION.correctas as number[]);

    expect(within(group).getByText(CORRECTA_WORD)).toBeInTheDocument();
    expect(within(group).getByText(MULTI_QUESTION.explicacionMd)).toBeInTheDocument();
  });

  it("seleccionar un conjunto parcial/incorrecto ⇒ 'Incorrecta' + explicación", () => {
    render(<QuizCard moduleId={MOD_ID} quiz={singleQuestionQuiz(MULTI_QUESTION)} />);
    // Solo una de las dos correctas: conjunto incompleto ⇒ incorrecto.
    const group = answerMulti(MULTI_QUESTION, [(MULTI_QUESTION.correctas as number[])[0]]);

    expect(within(group).getByText(INCORRECTA_WORD)).toBeInTheDocument();
    expect(within(group).getByText(MULTI_QUESTION.explicacionMd)).toBeInTheDocument();
  });
});

describe("QuizCard — CA-11: corrección inmediata + explicación (tipo 'boolean')", () => {
  it("responder Verdadero cuando correcta=true ⇒ 'Correcta' + explicación", () => {
    render(<QuizCard moduleId={MOD_ID} quiz={singleQuestionQuiz(BOOLEAN_QUESTION)} />);
    const group = answerBoolean(BOOLEAN_QUESTION, true);

    expect(within(group).getByText(CORRECTA_WORD)).toBeInTheDocument();
    expect(within(group).getByText(BOOLEAN_QUESTION.explicacionMd)).toBeInTheDocument();
  });

  it("responder Falso cuando correcta=true ⇒ 'Incorrecta' + explicación", () => {
    render(<QuizCard moduleId={MOD_ID} quiz={singleQuestionQuiz(BOOLEAN_QUESTION)} />);
    const group = answerBoolean(BOOLEAN_QUESTION, false);

    expect(within(group).getByText(INCORRECTA_WORD)).toBeInTheDocument();
    expect(within(group).getByText(BOOLEAN_QUESTION.explicacionMd)).toBeInTheDocument();
  });
});

describe("QuizCard — CA-11: corrección inmediata + explicación (tipo 'output')", () => {
  it("muestra el código exacto de la pregunta antes de responder", () => {
    render(<QuizCard moduleId={MOD_ID} quiz={singleQuestionQuiz(OUTPUT_QUESTION)} />);
    const group = groupFor(OUTPUT_QUESTION.enunciadoMd);

    expect(
      within(group).getByText((_, node) => (node?.textContent ?? "").includes(OUTPUT_QUESTION.codigo!)),
    ).toBeInTheDocument();
  });

  it("responder correctamente la predicción de salida ⇒ 'Correcta' + explicación", () => {
    render(<QuizCard moduleId={MOD_ID} quiz={singleQuestionQuiz(OUTPUT_QUESTION)} />);
    const group = answerSingleOrOutput(OUTPUT_QUESTION, OUTPUT_QUESTION.correcta as number);

    expect(within(group).getByText(CORRECTA_WORD)).toBeInTheDocument();
    expect(within(group).getByText(OUTPUT_QUESTION.explicacionMd)).toBeInTheDocument();
  });

  it("responder incorrectamente la predicción de salida ⇒ 'Incorrecta' + explicación", () => {
    render(<QuizCard moduleId={MOD_ID} quiz={singleQuestionQuiz(OUTPUT_QUESTION)} />);
    const opcionIncorrecta = OUTPUT_QUESTION.opciones!.findIndex(
      (_, i) => i !== OUTPUT_QUESTION.correcta,
    );
    const group = answerSingleOrOutput(OUTPUT_QUESTION, opcionIncorrecta);

    expect(within(group).getByText(INCORRECTA_WORD)).toBeInTheDocument();
    expect(within(group).getByText(OUTPUT_QUESTION.explicacionMd)).toBeInTheDocument();
  });
});

describe("QuizCard — el botón de confirmar está deshabilitado sin selección", () => {
  it("no se puede confirmar una pregunta 'single' sin elegir opción", () => {
    render(<QuizCard moduleId={MOD_ID} quiz={singleQuestionQuiz(SINGLE_QUESTION)} />);
    const group = groupFor(SINGLE_QUESTION.enunciadoMd);
    expect(submitButtonOf(group)).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// CA-12 — ≥80% hecho, <80% no hecho, mejor resultado se conserva, repetible.
// ---------------------------------------------------------------------------

describe("QuizCard — CA-12: umbral de aciertos EXACTO (79% vs 80%, quiz de 100 preguntas)", () => {
  it("79% de aciertos ⇒ el quiz NO queda marcado como hecho", () => {
    const quiz = largeBooleanQuiz(100, "quiz-79");
    render(<QuizCard moduleId={MOD_ID} quiz={quiz} />);
    answerLargeQuizWithCorrectCount(quiz, 79);

    const progress = useProgressStore.getState().modules[MOD_ID];
    expect(progress?.quizzes[quiz.id]?.mejorPct).toBe(79);
    expect(isQuizDone(progress, quiz.id)).toBe(false);
  }, 20000);

  it("80% de aciertos ⇒ el quiz queda marcado como hecho (umbral CONFIG.curso.umbralQuizPct)", () => {
    expect(CONFIG.curso.umbralQuizPct).toBe(80); // documenta la config usada por el test
    const quiz = largeBooleanQuiz(100, "quiz-80");
    render(<QuizCard moduleId={MOD_ID} quiz={quiz} />);
    answerLargeQuizWithCorrectCount(quiz, 80);

    const progress = useProgressStore.getState().modules[MOD_ID];
    expect(progress?.quizzes[quiz.id]?.mejorPct).toBe(80);
    expect(isQuizDone(progress, quiz.id)).toBe(true);
  }, 20000);
});

describe("QuizCard — puntuación final visible y registro en progreso", () => {
  it("al responder todas las preguntas, se muestra una puntuación final numérica", () => {
    const quiz: Quiz = {
      id: "quiz-score-visible",
      titulo: "Quiz corto",
      preguntas: [SINGLE_QUESTION, BOOLEAN_QUESTION],
    };
    render(<QuizCard moduleId={MOD_ID} quiz={quiz} />);

    answerSingleOrOutput(SINGLE_QUESTION, SINGLE_QUESTION.correcta as number);
    answerBoolean(BOOLEAN_QUESTION, true);

    expect(screen.getByText(SCORE_PATTERN)).toBeInTheDocument();
  });

  it("registra el resultado del quiz en el store real de progreso (moduleId, quizId, pct)", () => {
    const quiz: Quiz = {
      id: "quiz-record",
      titulo: "Quiz corto",
      preguntas: [SINGLE_QUESTION, BOOLEAN_QUESTION],
    };
    render(<QuizCard moduleId={MOD_ID} quiz={quiz} />);

    answerSingleOrOutput(SINGLE_QUESTION, SINGLE_QUESTION.correcta as number); // acierto
    answerBoolean(BOOLEAN_QUESTION, false); // fallo (correcta=true)

    const registro = useProgressStore.getState().modules[MOD_ID]?.quizzes[quiz.id];
    expect(registro?.mejorPct).toBe(50);
    expect(registro?.intentos).toBe(1);
  });
});

describe("QuizCard — CA-12: repetición ilimitada conserva el MEJOR resultado", () => {
  it("60% luego 100%: el store refleja 100 (el mejor)", () => {
    const quiz = largeBooleanQuiz(5, "quiz-repite-1");
    render(<QuizCard moduleId={MOD_ID} quiz={quiz} />);

    answerLargeQuizWithCorrectCount(quiz, 3); // 60%
    let progress = useProgressStore.getState().modules[MOD_ID];
    expect(progress?.quizzes[quiz.id]?.mejorPct).toBe(60);
    expect(isQuizDone(progress, quiz.id)).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: REPEAT_NAME }));
    answerLargeQuizWithCorrectCount(quiz, 5); // 100%

    progress = useProgressStore.getState().modules[MOD_ID];
    expect(progress?.quizzes[quiz.id]?.mejorPct).toBe(100);
    expect(progress?.quizzes[quiz.id]?.intentos).toBe(2);
    expect(isQuizDone(progress, quiz.id)).toBe(true);
  });

  it("100% y luego un intento peor (40%): el MEJOR resultado (100) NO se pierde", () => {
    const quiz = largeBooleanQuiz(5, "quiz-repite-2");
    render(<QuizCard moduleId={MOD_ID} quiz={quiz} />);

    answerLargeQuizWithCorrectCount(quiz, 5); // 100%
    fireEvent.click(screen.getByRole("button", { name: REPEAT_NAME }));
    answerLargeQuizWithCorrectCount(quiz, 2); // 40%

    const progress = useProgressStore.getState().modules[MOD_ID];
    expect(progress?.quizzes[quiz.id]?.mejorPct).toBe(100);
    expect(progress?.quizzes[quiz.id]?.intentos).toBe(2);
    expect(isQuizDone(progress, quiz.id)).toBe(true);
  });

  it("repetir reinicia todas las preguntas a no respondidas (se puede volver a elegir opción)", () => {
    const quiz = singleQuestionQuiz(SINGLE_QUESTION, "quiz-reset-preguntas");
    render(<QuizCard moduleId={MOD_ID} quiz={quiz} />);

    answerSingleOrOutput(SINGLE_QUESTION, SINGLE_QUESTION.correcta as number);
    fireEvent.click(screen.getByRole("button", { name: REPEAT_NAME }));

    const group = groupFor(SINGLE_QUESTION.enunciadoMd);
    // Tras repetir, el botón de confirmar vuelve a estar deshabilitado (sin
    // selección) y ya no hay feedback de la ronda anterior.
    expect(within(group).queryByText(CORRECTA_WORD)).not.toBeInTheDocument();
    expect(submitButtonOf(group)).toBeDisabled();
  });
});
