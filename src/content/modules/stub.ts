import type { CodeChallenge, CourseModule, ModuleId, Quiz } from "../types";

/**
 * Esqueleto tipado para los módulos 03–16 (contenido completo en M3, slices
 * S13–S15 de `docs/arch/SLICES.md`). Marca las secciones como "en
 * construcción" mediante convención de contenido (texto), sin añadir campos
 * fuera de C-CONTENT: el tipo `CourseModule` no define un flag de estado, así
 * que la construcción se señala en el markdown visible, no en el esquema.
 *
 * Permitido SOLO hasta M3 (ver SLICES.md §S1).
 */
const STUB_MD =
  "> 🚧 **Contenido en construcción.** Este módulo se completa en el " +
  "milestone M3 (`docs/arch/SLICES.md`, slices S13–S15). El objetivo de " +
  "aprendizaje ya está fijado (PRD §6); este es un esqueleto tipado para que " +
  "el temario y la navegación libre (CA-04) funcionen desde el milestone M1.";

function stubQuiz(id: string, cantidadPreguntas: 3 | 4): Quiz {
  const preguntas: Quiz["preguntas"] = Array.from({ length: cantidadPreguntas }, (_, i) => ({
    id: `${id}-p${i + 1}`,
    kind: "boolean" as const,
    enunciadoMd: `🚧 Pregunta placeholder ${i + 1} de este módulo — contenido pendiente (M3).`,
    correcta: true,
    explicacionMd:
      "Placeholder: la pregunta y explicación reales llegan con el contenido completo del módulo (M3).",
  }));
  return { id, titulo: "Quiz (contenido pendiente)", preguntas };
}

function stubChallenge(id: string): CodeChallenge {
  return {
    id,
    titulo: "Reto (contenido pendiente)",
    enunciadoMd: STUB_MD,
    starterCode: "# 🚧 Reto pendiente de contenido (milestone M3).\n",
    solutionCode: "# 🚧 Reto pendiente de contenido (milestone M3).\n",
    validationCode:
      'from course_harness import check\n\ncheck("stub", "Reto placeholder: contenido real llega en M3", True)\n',
  };
}

/** Construye un módulo esqueleto con `titulo`/`objetivo` reales de PRD §6. */
export function createStubModule(numero: number, titulo: string, objetivo: string): CourseModule {
  const id = `mod${String(numero).padStart(2, "0")}` as ModuleId;
  return {
    id,
    numero,
    titulo,
    objetivo,
    secciones: {
      explicaSimple: {
        contenidoMd: STUB_MD,
        consignaExplicacion: `Explícale a alguien que no programa, con tus propias palabras, la idea central de "${titulo}".`,
      },
      detectaGaps: {
        contenidoMd: STUB_MD,
        quiz: stubQuiz(`${id}-quiz1`, 4),
      },
      llenaGaps: {
        contenidoMd: STUB_MD,
        retos: [stubChallenge(`${id}-reto1`)],
      },
      refinaSimplifica: {
        resumenBullets: [
          "Contenido pendiente: llega completo en el milestone M3.",
          `Objetivo de aprendizaje ya fijado: ${objetivo}`,
        ],
        sintesis: { kind: "quiz", quiz: stubQuiz(`${id}-quiz-sintesis`, 3) },
      },
    },
  };
}
