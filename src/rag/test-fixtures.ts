/**
 * Fixtures compartidas para los tests de `src/rag/*` (slice S10).
 *
 * Construye `CourseModule`s mínimos pero completos (satisfacen C-CONTENT en
 * TS strict) con contenido conocido y estable para probar el chunker y el
 * boost del módulo actual (A-06) SIN depender de la prosa real del registry
 * (esos casos, más realistas, se prueban aparte contra `COURSE_MODULES`).
 *
 * Diseño deliberado de las dos secciones `explicaSimple`:
 *  - `FIXTURE_ALPHA`: el término "widget" aparece en el HEADING (boost x2 de
 *    `titulo` en MiniSearch, ver ADR-05) y 2 veces en el cuerpo ⇒ score alto
 *    sin boost de módulo.
 *  - `FIXTURE_BETA`: "widget" aparece UNA sola vez, solo en el cuerpo, nunca
 *    en un heading ⇒ score bajo sin boost de módulo.
 * Sin `boostModuleId`, ALPHA debe rankear por encima de BETA. Con
 * `boostModuleId: FIXTURE_BETA.id`, BETA debe adelantar a ALPHA (A-06).
 */
import type { CodeChallenge, CourseModule, Quiz } from "@/content/types";

function minimalQuiz(id: string): Quiz {
  return {
    id,
    titulo: `Quiz ${id}`,
    preguntas: [
      {
        id: `${id}-p1`,
        kind: "boolean",
        enunciadoMd: "¿Pregunta placeholder?",
        correcta: true,
        explicacionMd: "Explicación placeholder.",
      },
    ],
  };
}

function minimalChallenge(id: string): CodeChallenge {
  return {
    id,
    titulo: `Reto ${id}`,
    enunciadoMd: "Enunciado placeholder.",
    starterCode: "# TODO\n",
    solutionCode: "# solución\n",
    validationCode: 'from course_harness import check\ncheck("stub", "placeholder", True)\n',
  };
}

function buildFixtureModule(params: {
  id: CourseModule["id"];
  numero: number;
  titulo: string;
  explicaSimpleMd: string;
}): CourseModule {
  const { id, numero, titulo, explicaSimpleMd } = params;
  return {
    id,
    numero,
    titulo,
    objetivo: `Objetivo placeholder de ${titulo}.`,
    secciones: {
      explicaSimple: {
        contenidoMd: explicaSimpleMd,
        consignaExplicacion: "Explica esto con tus propias palabras.",
      },
      detectaGaps: {
        quiz: minimalQuiz(`${id}-quiz1`),
      },
      llenaGaps: {
        contenidoMd: "Contenido de profundización placeholder.",
        retos: [minimalChallenge(`${id}-reto1`)],
      },
      refinaSimplifica: {
        resumenBullets: ["Bullet placeholder."],
        sintesis: { kind: "quiz", quiz: minimalQuiz(`${id}-quiz-sintesis`) },
      },
    },
  };
}

export const FIXTURE_ALPHA: CourseModule = buildFixtureModule({
  id: "modA1",
  numero: 97,
  titulo: "Fixture Alpha",
  explicaSimpleMd:
    "## Widgets por todas partes\n\n" +
    "Este módulo habla de widget. El widget aparece otra vez aquí: widget.",
});

export const FIXTURE_BETA: CourseModule = buildFixtureModule({
  id: "modB2",
  numero: 98,
  titulo: "Fixture Beta",
  explicaSimpleMd:
    "## Otro tema completamente distinto\n\n" +
    "Aquí solo se menciona widget una vez en el cuerpo del texto.",
});

/** Módulo con DOS headings en la misma sección, para probar el chunker. */
export const FIXTURE_MULTI_HEADING: CourseModule = buildFixtureModule({
  id: "modC3",
  numero: 99,
  titulo: "Fixture Multi-heading",
  explicaSimpleMd:
    "## Primer encabezado alfa\n\n" +
    "Contenido del primer fragmento sobre zetatermino.\n\n" +
    "## Segundo encabezado beta\n\n" +
    "Contenido del segundo fragmento sobre yotatermino.",
});

export const FIXTURE_MODULES: readonly CourseModule[] = [
  FIXTURE_ALPHA,
  FIXTURE_BETA,
  FIXTURE_MULTI_HEADING,
];
