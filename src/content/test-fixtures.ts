/**
 * Fixtures de contenido para los tests de `src/content/traversal.ts` (ADR-13,
 * slice SE0, ARCHITECTURE.md §8.2(d)) y de la delegación de
 * `src/progress/selectors.ts` (§8.6).
 *
 * Construye `CourseModule` válidos (misma FORMA que el registry real, C-CONTENT
 * §4) con y sin `pasos`, para poder comparar la enumeración canónica contra el
 * caso "sin enriquecer" (protege CA-39) y ejercitar los 3 `kind` de
 * `PasoAccion` (§8.2(c)): "ejercicio" (cuenta como reto), "quiz" (cuenta como
 * quiz), "lectura" (no cuenta, §8.3).
 *
 * Independiente del implementer: solo usa NOMBRES y FORMAS ya CERRADOS por el
 * architect en ARCHITECTURE.md §8.2 (`PasoGuiado`, `PasoAccion`, `UsaLaIaBlock`,
 * `TutorialLocal`, `SpinePaso`). No depende de `src/content/registry.ts` (datos
 * reales del curso) a propósito, igual que `src/progress/test-fixtures.ts` (S3).
 */
import type {
  CodeChallenge,
  CourseModule,
  ModuleId,
  PasoGuiado,
  Quiz,
  TutorialLocal,
  UsaLaIaBlock,
} from "@/content/types";

function buildQuiz(id: string): Quiz {
  return {
    id,
    titulo: `Quiz ${id}`,
    preguntas: [
      {
        id: `${id}-p1`,
        kind: "boolean",
        enunciadoMd: `¿Pregunta de ${id}?`,
        correcta: true,
        explicacionMd: "Explicación.",
      },
    ],
  };
}

/**
 * `validationCode` INCLUYE el import del harness (`from course_harness import
 * check`) para que estos fixtures puedan ejecutarse tal cual en el runner
 * Pyodide REAL (usado por el smoke de `e2e/runner/traversal-pasos-smoke.spec.ts`,
 * SLICES.md §SE0 punto 5), no solo en los tests unitarios de `selectors`/
 * `traversal` (que nunca invocan Pyodide).
 */
function buildReto(id: string): CodeChallenge {
  return {
    id,
    titulo: `Reto ${id}`,
    enunciadoMd: `Enunciado de ${id}.`,
    starterCode: "# TODO",
    solutionCode: "pass",
    validationCode: 'from course_harness import check\ncheck("c1", "ok", True)',
  };
}

/**
 * Módulo SIN `pasos` (retrocompat): MISMA forma que consumían los tests de S1/S3
 * antes de M4. Base de la equivalencia CA-39: 1 quiz (paso 2) + 2 retos (paso 3)
 * + 1 reto de síntesis (paso 4).
 */
export function buildFixtureModuleSinPasos(id: ModuleId): CourseModule {
  return {
    id,
    numero: 1,
    titulo: `Módulo ${id}`,
    objetivo: "Objetivo de prueba.",
    secciones: {
      explicaSimple: {
        contenidoMd: "Contenido.",
        consignaExplicacion: "Explícaselo a alguien que no programa.",
      },
      detectaGaps: {
        quiz: buildQuiz(`${id}-quiz1`),
      },
      llenaGaps: {
        contenidoMd: "Contenido.",
        retos: [buildReto(`${id}-reto1`), buildReto(`${id}-reto2`)],
      },
      refinaSimplifica: {
        resumenBullets: ["Bullet 1"],
        sintesis: { kind: "code", reto: buildReto(`${id}-reto-sintesis`) },
      },
    },
  };
}

export const PASO_EXPLICA_LECTURA_ID = "paso-explica-lectura";
export const PASO_QUIZ_ID = "paso-quiz1";
export const PASO_RETO_ID = "paso-reto1";

/**
 * Mismo módulo base + `pasos` en 3 de las 4 secciones, en el orden canónico de
 * recorrido (ADR-13): `explicaSimple` → `detectaGaps` → `llenaGaps` →
 * `refinaSimplifica`. Ejercita los 3 `kind` de `PasoAccion`:
 *   - `explicaSimple.pasos[0]`: kind "lectura" (NO cuenta para "hecho").
 *   - `detectaGaps.pasos[0]`: kind "quiz" (CUENTA como quiz del módulo).
 *   - `llenaGaps.pasos[0]`: kind "ejercicio" (CUENTA como reto del módulo).
 */
export function buildFixtureModuleConPasos(id: ModuleId): CourseModule {
  const base = buildFixtureModuleSinPasos(id);

  const pasoLectura: PasoGuiado = {
    id: `${id}-${PASO_EXPLICA_LECTURA_ID}`,
    titulo: "Paso de lectura",
    explicacionMd: "Mini-explicación de lectura, no cuenta para 'hecho'.",
    accion: { kind: "lectura", bloqueMd: "```python\nprint('hola')\n```" },
  };
  const pasoQuiz: PasoGuiado = {
    id: `${id}-${PASO_QUIZ_ID}`,
    titulo: "Paso de micro-quiz",
    explicacionMd: "Mini-explicación de micro-quiz.",
    accion: { kind: "quiz", quiz: buildQuiz(`${id}-${PASO_QUIZ_ID}-quiz`) },
  };
  const pasoEjercicio: PasoGuiado = {
    id: `${id}-${PASO_RETO_ID}`,
    titulo: "Paso de mini-ejercicio",
    explicacionMd: "Mini-explicación de mini-ejercicio.",
    accion: { kind: "ejercicio", reto: buildReto(`${id}-${PASO_RETO_ID}-reto`) },
  };

  return {
    ...base,
    enriquecido: true,
    secciones: {
      ...base.secciones,
      explicaSimple: { ...base.secciones.explicaSimple, pasos: [pasoLectura] },
      detectaGaps: { ...base.secciones.detectaGaps, pasos: [pasoQuiz] },
      llenaGaps: { ...base.secciones.llenaGaps, pasos: [pasoEjercicio] },
    },
  };
}

export function buildFixtureUsaLaIaBlock(id: string): UsaLaIaBlock {
  return {
    id,
    titulo: "Usa la IA",
    promptsSugeridos: ["Prompt sugerido de prueba."],
    comoVerificar: ["Verificación 1", "Verificación 2"],
    comoIterar: "Si la respuesta no compila, ajusta el prompt y vuelve a pedirla.",
    queNoDelegar: ["No delegues el diseño del estado del grafo."],
  };
}

export function buildFixtureTutorialLocal(): TutorialLocal {
  return {
    setup: [
      {
        titulo: "Entorno virtual",
        powershell: "python -m venv .venv; .venv\\Scripts\\Activate.ps1",
        bash: "python3 -m venv .venv && source .venv/bin/activate",
      },
    ],
    codigo: [
      {
        archivo: "src/graph.py",
        codigo: "from langgraph.graph import StateGraph, START, END\n",
      },
    ],
    salidaEsperada: "Salida esperada literal de prueba.",
    spine: { crea: ["src/graph.py"], modifica: [], scaffolding: true },
  };
}
