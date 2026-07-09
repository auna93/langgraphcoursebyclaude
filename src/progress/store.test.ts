/**
 * Tests unitarios del store `src/progress/store.ts` (contrato C-PROGRESS,
 * ARCHITECTURE.md §4). Slice S3 — SLICES.md §S3.
 *
 * Cubre: mejor-resultado de quiz, último-intento de reto (CA-08 a nivel de
 * store), `markSolutionViewed` no marca hecho, y CA-17 (reset de un módulo
 * no toca los demás / reset de curso completo).
 *
 * Se opera SOLO contra la API pública: `useProgressStore` (nombre asumido,
 * convención zustand) exponiendo `ProgressState & ProgressActions` vía
 * `getState()`. Las acciones usadas son las literales del contrato:
 * `saveExplanation`, `recordQuizResult`, `recordChallengeResult`,
 * `markSolutionViewed`, `resetModule`, `resetAll`.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { useProgressStore } from "@/progress/store";

const MOD_A = "mod01";
const MOD_B = "mod02";
const QUIZ_A = "mod01-quiz1";
const RETO_A = "mod01-reto1";

beforeEach(() => {
  localStorage.clear();
  useProgressStore.getState().resetAll();
});

describe("recordQuizResult — mejor resultado histórico", () => {
  it("60% luego 90%: queda hecho y refleja 90 (el mejor)", () => {
    useProgressStore.getState().recordQuizResult(MOD_A, QUIZ_A, 60);
    useProgressStore.getState().recordQuizResult(MOD_A, QUIZ_A, 90);

    const registro = useProgressStore.getState().modules[MOD_A]?.quizzes[QUIZ_A];
    expect(registro?.mejorPct).toBe(90);
    expect(registro?.intentos).toBe(2);
  });

  it("90% y luego 70%: sigue reflejando el mejor (90), no retrocede", () => {
    useProgressStore.getState().recordQuizResult(MOD_A, QUIZ_A, 60);
    useProgressStore.getState().recordQuizResult(MOD_A, QUIZ_A, 90);
    useProgressStore.getState().recordQuizResult(MOD_A, QUIZ_A, 70);

    const registro = useProgressStore.getState().modules[MOD_A]?.quizzes[QUIZ_A];
    expect(registro?.mejorPct).toBe(90);
    expect(registro?.intentos).toBe(3);
  });
});

describe("recordChallengeResult — último intento manda (CA-08 a nivel de store)", () => {
  it("pass, luego fail: el estado refleja fail (no acumula 'alguna vez pasó')", () => {
    useProgressStore.getState().recordChallengeResult(MOD_A, RETO_A, true);
    let registro = useProgressStore.getState().modules[MOD_A]?.retos[RETO_A];
    expect(registro?.ultimoPass).toBe(true);

    useProgressStore.getState().recordChallengeResult(MOD_A, RETO_A, false);
    registro = useProgressStore.getState().modules[MOD_A]?.retos[RETO_A];
    expect(registro?.ultimoPass).toBe(false);
    expect(registro?.intentos).toBe(2);
  });
});

describe("markSolutionViewed — nunca marca hecho", () => {
  it("ver la solución fija solucionVista=true sin alterar ultimoPass", () => {
    useProgressStore.getState().recordChallengeResult(MOD_A, RETO_A, false);
    useProgressStore.getState().markSolutionViewed(MOD_A, RETO_A);

    const registro = useProgressStore.getState().modules[MOD_A]?.retos[RETO_A];
    expect(registro?.solucionVista).toBe(true);
    expect(registro?.ultimoPass).toBe(false);
  });
});

describe("CA-17 — resetModule solo afecta ese módulo", () => {
  it("reinicia mod01 a no-iniciado sin tocar mod02", () => {
    useProgressStore.getState().saveExplanation(MOD_A, "x".repeat(250));
    useProgressStore.getState().recordQuizResult(MOD_A, QUIZ_A, 90);
    useProgressStore.getState().recordChallengeResult(MOD_A, RETO_A, true);

    useProgressStore.getState().saveExplanation(MOD_B, "y".repeat(250));
    useProgressStore.getState().recordQuizResult(MOD_B, "mod02-quiz1", 100);

    useProgressStore.getState().resetModule(MOD_A);

    const modA = useProgressStore.getState().modules[MOD_A];
    expect(modA?.explicacion ?? null).toBeNull();
    expect(Object.keys(modA?.quizzes ?? {})).toHaveLength(0);
    expect(Object.keys(modA?.retos ?? {})).toHaveLength(0);

    // mod02 permanece intacto
    const modB = useProgressStore.getState().modules[MOD_B];
    expect(modB?.explicacion?.texto).toBe("y".repeat(250));
    expect(modB?.quizzes["mod02-quiz1"]?.mejorPct).toBe(100);
  });
});

describe("US-10 — resetAll reinicia el curso completo", () => {
  it("todos los módulos vuelven a cero", () => {
    useProgressStore.getState().saveExplanation(MOD_A, "x".repeat(250));
    useProgressStore.getState().saveExplanation(MOD_B, "y".repeat(250));
    useProgressStore.getState().recordQuizResult(MOD_A, QUIZ_A, 90);

    useProgressStore.getState().resetAll();

    const modA = useProgressStore.getState().modules[MOD_A];
    const modB = useProgressStore.getState().modules[MOD_B];
    expect(modA?.explicacion ?? null).toBeNull();
    expect(modB?.explicacion ?? null).toBeNull();
    expect(Object.keys(modA?.quizzes ?? {})).toHaveLength(0);
  });
});

describe("saveExplanation — guarda el texto íntegro", () => {
  it("persiste el texto tal cual, sin recortar", () => {
    const texto = "Explicación de prueba con acentos: canción, niño.".repeat(3);
    useProgressStore.getState().saveExplanation(MOD_A, texto);
    expect(useProgressStore.getState().modules[MOD_A]?.explicacion?.texto).toBe(texto);
  });
});
