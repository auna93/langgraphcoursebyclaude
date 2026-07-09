import { useEffect, useState } from "react";

import { STRINGS } from "@/app/strings";
import { CONFIG } from "@/config";
import type { ModuleId, Quiz, QuizQuestion } from "@/content/types";
import { useProgressStore } from "@/progress/store";
import { MarkdownView } from "@/components/MarkdownView";

/**
 * Quiz interactivo (C-CONTENT `Quiz`), slice S4 — CA-11, CA-12.
 *
 * Cada pregunta es un `<fieldset>` (rol ARIA "group" nativo) cuyo nombre
 * accesible es el `enunciadoMd` EXACTO (vía `aria-label`, desacoplado del
 * markdown renderizado visualmente — ver `QuizCard.test.tsx`). Las opciones
 * son inputs nativos `radio` (single/boolean/output) o `checkbox` (multi),
 * etiquetados con el texto exacto de la opción. Cada pregunta se confirma
 * con un botón "Comprobar" (deshabilitado sin selección): al confirmar,
 * corrige de inmediato y muestra SIEMPRE la explicación (acierto o fallo,
 * CA-11) y bloquea la pregunta. Al confirmar la última pregunta se calcula
 * la puntuación final (0–100) y se registra en progreso vía
 * `recordQuizResult` (mejor resultado, CA-12: hecho ⇔ ≥ `CONFIG.curso.umbralQuizPct`).
 * "Repetir" limpia las respuestas locales para reintentar sin límite; el
 * mejor resultado histórico lo conserva el store, nunca este componente.
 */

interface AnswerState {
  /** Índices seleccionados: 0 o 1 elemento para single/boolean/output, N para multi. */
  selected: number[];
  checked: boolean;
}

function initialAnswers(quiz: Quiz): Record<string, AnswerState> {
  return Object.fromEntries(quiz.preguntas.map((p) => [p.id, { selected: [], checked: false }]));
}

/** Boolean se modela como opciones fijas ["Verdadero", "Falso"] (índices 0/1). */
function optionsOf(pregunta: QuizQuestion): string[] {
  if (pregunta.kind === "boolean") return [STRINGS.quizCard.verdadero, STRINGS.quizCard.falso];
  return pregunta.opciones;
}

function correctIndicesOf(pregunta: QuizQuestion): number[] {
  switch (pregunta.kind) {
    case "single":
    case "output":
      return [pregunta.correcta];
    case "boolean":
      return [pregunta.correcta ? 0 : 1];
    case "multi":
      return pregunta.correctas;
  }
}

function sameSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, i) => value === sortedB[i]);
}

function isCorrect(pregunta: QuizQuestion, selected: number[]): boolean {
  return sameSet(selected, correctIndicesOf(pregunta));
}

export interface QuizCardProps {
  moduleId: ModuleId;
  quiz: Quiz;
}

export function QuizCard({ moduleId, quiz }: QuizCardProps) {
  const [answers, setAnswers] = useState<Record<string, AnswerState>>(() => initialAnswers(quiz));
  const [submitted, setSubmitted] = useState(false);

  const recordQuizResult = useProgressStore((state) => state.recordQuizResult);

  const total = quiz.preguntas.length;
  const allAnswered = quiz.preguntas.every((pregunta) => answers[pregunta.id]?.checked);
  const correctCount = quiz.preguntas.filter((pregunta) =>
    isCorrect(pregunta, answers[pregunta.id]?.selected ?? []),
  ).length;
  const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const hecho = pct >= CONFIG.curso.umbralQuizPct;

  useEffect(() => {
    if (allAnswered && !submitted) {
      setSubmitted(true);
      recordQuizResult(moduleId, quiz.id, pct);
    }
    // Se registra una única vez por intento completo, al pasar a "todas respondidas".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allAnswered, submitted]);

  function setAnswer(id: string, next: AnswerState) {
    setAnswers((prev) => ({ ...prev, [id]: next }));
  }

  function repetir() {
    setAnswers(initialAnswers(quiz));
    setSubmitted(false);
  }

  return (
    <div data-testid="quiz-card" className="mt-4 rounded-md border border-border p-4">
      <h4 className="text-sm font-semibold">
        {STRINGS.modulo.quizTitulo}: {quiz.titulo}
      </h4>

      <ol className="mt-4 flex flex-col gap-6">
        {quiz.preguntas.map((pregunta, i) => (
          <li key={pregunta.id}>
            <QuestionView
              numero={i + 1}
              pregunta={pregunta}
              answer={answers[pregunta.id]}
              onChange={(next) => setAnswer(pregunta.id, next)}
            />
          </li>
        ))}
      </ol>

      {allAnswered && (
        <div className="mt-6 rounded-md bg-muted p-3" role="status">
          <p className="text-sm font-semibold">{STRINGS.quizCard.puntuacionLabel(correctCount, total, pct)}</p>
          <p className="mt-1 text-sm">
            {hecho ? STRINGS.quizCard.hecho : STRINGS.quizCard.noHecho(CONFIG.curso.umbralQuizPct)}
          </p>
          <button
            type="button"
            onClick={repetir}
            className="mt-3 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            {STRINGS.quizCard.repetir}
          </button>
        </div>
      )}
    </div>
  );
}

function QuestionView({
  numero,
  pregunta,
  answer,
  onChange,
}: {
  numero: number;
  pregunta: QuizQuestion;
  answer: AnswerState;
  onChange: (next: AnswerState) => void;
}) {
  const opciones = optionsOf(pregunta);
  const disabled = answer.checked;
  const correcta = answer.checked ? isCorrect(pregunta, answer.selected) : null;
  const inputType = pregunta.kind === "multi" ? "checkbox" : "radio";

  function toggle(i: number) {
    if (disabled) return;
    if (pregunta.kind === "multi") {
      const next = answer.selected.includes(i)
        ? answer.selected.filter((v) => v !== i)
        : [...answer.selected, i];
      onChange({ selected: next, checked: false });
    } else {
      onChange({ selected: [i], checked: false });
    }
  }

  function confirmar() {
    if (answer.selected.length === 0 || disabled) return;
    onChange({ selected: answer.selected, checked: true });
  }

  return (
    // La preservación de saltos de línea (`whitespace-pre-wrap`) es necesaria
    // SOLO para el `codigo` de las preguntas "output" (texto directo, sin
    // envoltorio, ver QuizCard.test.tsx); el resto de hijos revierte a
    // `whitespace-normal font-sans` explícitamente.
    <fieldset
      aria-label={pregunta.enunciadoMd}
      className="whitespace-pre-wrap font-mono text-xs"
    >
      <div className="whitespace-normal font-sans text-sm font-medium">
        {numero}. <MarkdownView contenidoMd={pregunta.enunciadoMd} />
      </div>

      {pregunta.kind === "output" && <>{"\n" + pregunta.codigo}</>}

      <div className="mt-2 flex flex-col gap-2 whitespace-normal font-sans text-sm">
        {opciones.map((opcion, i) => (
          <label
            key={i}
            className={
              disabled
                ? "flex items-center gap-2 rounded-md border border-border px-3 py-2 opacity-70"
                : "flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 hover:bg-accent"
            }
          >
            <input
              type={inputType}
              name={pregunta.id}
              checked={answer.selected.includes(i)}
              disabled={disabled}
              onChange={() => toggle(i)}
            />
            {opcion}
          </label>
        ))}
      </div>

      <div className="mt-2 whitespace-normal font-sans">
        <button
          type="button"
          disabled={answer.selected.length === 0 || disabled}
          onClick={confirmar}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          {STRINGS.quizCard.comprobar}
        </button>
      </div>

      {answer.checked && (
        <div className="mt-2 whitespace-normal rounded-md border border-border p-3 font-sans" role="status">
          <p
            className={
              correcta
                ? "text-sm font-semibold text-green-700 dark:text-green-400"
                : "text-sm font-semibold text-red-700 dark:text-red-400"
            }
          >
            {correcta ? STRINGS.quizCard.correcta : STRINGS.quizCard.incorrecta}
          </p>
          <div className="mt-1 text-sm text-muted-foreground">
            <MarkdownView contenidoMd={pregunta.explicacionMd} />
          </div>
        </div>
      )}
    </fieldset>
  );
}
