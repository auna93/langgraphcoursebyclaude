import { python } from "@codemirror/lang-python";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useState } from "react";

import { STRINGS } from "@/app/strings";
import { CONFIG } from "@/config";
import type { CodeChallenge, ModuleId } from "@/content/types";
import { isSolutionAvailable } from "@/progress/selectors";
import { useProgressStore } from "@/progress/store";
import { useRunner } from "@/runner/useRunner";
import type { RunChallengeResult } from "@/runner/types";

/**
 * `ChallengeCard`: UI del reto de código (C-CONTENT `CodeChallenge`), slice
 * S7 — CA-06/07 (UI), CA-08, CA-09.
 *
 * Editor CodeMirror (Python) precargado con `starterCode`. Junto al editor
 * visual se mantiene un `<textarea data-testid="challenge-code-editor">`
 * controlado por el MISMO estado (`code`): puente de testabilidad para
 * `fireEvent.change`/`.value` en jsdom (CodeMirror no expone un input nativo
 * controlable así), sin comprometer el editor real que ve el alumno.
 *
 * El botón "Ejecutar y validar" llama a `PyRunner.runChallenge` (C-RUNNER,
 * vía `useRunner`, contrato cerrado en S6) con el código del alumno y la
 * `validationCode`/`llmDoubles`/`timeoutMs` del reto; nunca habla con
 * Pyodide directamente (regla de dependencia de ARCHITECTURE §2).
 *
 * El resultado se registra como el ÚLTIMO intento en el store real
 * (`recordChallengeResult`, CA-08: pass sobrescribe a hecho, un fail
 * posterior lo revierte). "Ver solución" está AUSENTE del documento sin
 * intentos (CA-09, selector real `isSolutionAvailable`); en cuanto existe
 * ≥1 intento aparece, y al revelarla marca `solucionVista` (C-PROGRESS) sin
 * disparar una nueva ejecución ni afectar `ultimoPass`.
 */

export interface ChallengeCardProps {
  moduleId: ModuleId;
  reto: CodeChallenge;
}

export function ChallengeCard({ moduleId, reto }: ChallengeCardProps) {
  const runner = useRunner();

  const [code, setCode] = useState(reto.starterCode);
  const [initializing, setInitializing] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunChallengeResult | null>(null);
  const [solutionVisible, setSolutionVisible] = useState(false);

  const progress = useProgressStore((state) => state.modules[moduleId]);
  const recordChallengeResult = useProgressStore((state) => state.recordChallengeResult);
  const markSolutionViewed = useProgressStore((state) => state.markSolutionViewed);

  const intentos = progress?.retos[reto.id]?.intentos ?? 0;
  const solutionAvailable = isSolutionAvailable(progress, reto.id);

  // Reinicia el editor y el resultado al cambiar de reto (navegación entre módulos/retos).
  useEffect(() => {
    setCode(reto.starterCode);
    setResult(null);
    setSolutionVisible(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reto.id]);

  // Precarga el entorno en cuanto el reto es visible (init lazy, idempotente, C-RUNNER).
  useEffect(() => {
    let cancelled = false;
    setInitializing(true);
    runner
      .init()
      .catch(() => {
        // El error real se reporta cuando el alumno pulsa "Ejecutar" (runChallenge lo relanza).
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runner]);

  async function handleRun() {
    setRunning(true);
    setResult(null);
    try {
      const runResult = await runner.runChallenge({
        challengeId: reto.id,
        studentCode: code,
        validationCode: reto.validationCode,
        llmDoubles: reto.llmDoubles,
        timeoutMs: reto.timeoutMs ?? CONFIG.runner.defaultTimeoutMs,
      });
      setResult(runResult);
      recordChallengeResult(moduleId, reto.id, runResult.status === "pass");
    } finally {
      setRunning(false);
    }
  }

  function handleVerSolucion() {
    setSolutionVisible(true);
    markSolutionViewed(moduleId, reto.id);
  }

  const trabajando = initializing || running;

  return (
    <div data-testid="challenge-card" className="rounded-md border border-border p-4">
      <h4 className="text-sm font-semibold">{reto.titulo}</h4>

      <div className="mt-3">
        <p className="text-xs font-semibold text-muted-foreground">
          {STRINGS.challengeCard.editorLabel}
        </p>
        <div className="mt-1 overflow-hidden rounded-md border border-border">
          <CodeMirror value={code} height="220px" extensions={[python()]} onChange={setCode} />
        </div>
        {/* Puente de testabilidad (ver docstring del componente): mismo estado que CodeMirror. */}
        <textarea
          data-testid="challenge-code-editor"
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleRun}
          disabled={trabajando}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          {STRINGS.challengeCard.ejecutar}
        </button>
        <span className="text-xs text-muted-foreground">
          {STRINGS.challengeCard.intentosLabel(intentos)}
        </span>
      </div>

      {initializing && (
        <p className="mt-3 text-sm text-muted-foreground">
          {STRINGS.challengeCard.cargandoEntorno}
        </p>
      )}
      {running && (
        <p className="mt-3 text-sm text-muted-foreground">{STRINGS.challengeCard.ejecutando}</p>
      )}

      {result && !trabajando && (
        <div className="mt-4 rounded-md bg-muted p-3">
          <p className="text-sm font-semibold">{STRINGS.challengeCard.resultadoTitulo}</p>

          {result.status === "timeout" && (
            <>
              <p className="mt-1 text-sm font-semibold text-red-700 dark:text-red-400">
                {STRINGS.challengeCard.timeoutPrefijo}
              </p>
              <p className="mt-1 text-sm text-red-700 dark:text-red-400">{result.message}</p>
            </>
          )}

          {result.status === "error" && (
            <>
              <p className="mt-1 text-sm font-semibold text-red-700 dark:text-red-400">
                {result.errorKind === "syntax"
                  ? STRINGS.challengeCard.errorSyntax
                  : STRINGS.challengeCard.errorRuntime}
              </p>
              <p className="mt-1 text-sm text-red-700 dark:text-red-400">{result.message}</p>
            </>
          )}

          {(result.status === "pass" || result.status === "fail") && (
            <>
              <p
                className={
                  result.status === "pass"
                    ? "mt-1 text-sm font-semibold text-green-700 dark:text-green-400"
                    : "mt-1 text-sm font-semibold text-red-700 dark:text-red-400"
                }
              >
                {result.status === "pass" ? STRINGS.challengeCard.pass : STRINGS.challengeCard.fail}
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {result.checks.map((check) => (
                  <li
                    key={check.id}
                    data-testid={`check-${check.id}`}
                    data-passed={String(check.passed)}
                    className={
                      check.passed
                        ? "text-green-700 dark:text-green-400"
                        : "text-red-700 dark:text-red-400"
                    }
                  >
                    <span aria-hidden="true">{check.passed ? "✓" : "✗"}</span>{" "}
                    <span>{check.description}</span>
                    {!check.passed && check.message && (
                      <>
                        {" — "}
                        <span>{check.message}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {(result.status === "pass" || result.status === "fail" || result.status === "error") && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-muted-foreground">
                {STRINGS.challengeCard.stdoutTitulo}
              </p>
              <pre
                data-testid="challenge-stdout"
                className="mt-1 overflow-x-auto rounded-md bg-background p-2 text-xs"
              >
                {result.stdout}
              </pre>
            </div>
          )}
        </div>
      )}

      {solutionAvailable && (
        <div className="mt-4">
          <button
            type="button"
            onClick={handleVerSolucion}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            {STRINGS.challengeCard.verSolucion}
          </button>

          {solutionVisible && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-muted-foreground">
                {STRINGS.challengeCard.solucionTitulo}
              </p>
              <pre
                data-testid="challenge-solution-code"
                className="mt-1 overflow-x-auto rounded-md border border-border bg-muted/30 p-3 text-xs"
              >
                <code>{reto.solutionCode}</code>
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
