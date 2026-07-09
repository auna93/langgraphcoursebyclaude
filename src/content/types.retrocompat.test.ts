/**
 * Retrocompatibilidad del delta §8.2 (ARCHITECTURE.md) en `src/content/types.ts`.
 * Slice SE0 (SLICES.md §SE0). Protege dos invariantes con DOS mecanismos:
 *
 *  (a) "un `CourseModule` SIN los campos nuevos sigue siendo válido": lo
 *      garantiza que `MODULO_SIN_ENRIQUECER` (abajo) tipe contra `CourseModule`
 *      bajo `tsc -b`/`npm run build` (compile-time). Los 16 módulos actuales
 *      del registry ya cumplen esto hoy.
 *  (b) "un `CourseModule` CON los campos nuevos type-checkea": lo garantiza
 *      que `MODULO_ENRIQUECIDO` (que usa `enriquecido`, `usaLaIa`,
 *      `tutorialLocal`, `pasos` y los tipos `PasoGuiado`/`UsaLaIaBlock`/
 *      `TutorialLocal`, §8.2(c)) también tipe.
 *
 * IMPORTANTE (mecanismo de verificación): `vitest run` (esbuild, transpile-only)
 * NO tipa-chequea este archivo — un `import type` de un símbolo inexistente se
 * borra en transpilación sin error runtime. La verificación REAL de (a)/(b) es
 * `npx tsc -b` / `npm run build` (el gate de build del proyecto). Antes de que
 * `src/content/types.ts` transcriba el delta §8.2, `tsc -b` falla con
 * "Module '\"@/content/types\"' has no exported member 'PasoGuiado'" (y
 * excess-property errors en `MODULO_ENRIQUECIDO`) — rojo por la razón correcta
 * (falta la transcripción del contrato, no un error de este test). Las
 * aserciones runtime de abajo son un smoke complementario de forma.
 */
import { describe, expect, it } from "vitest";

import type {
  CourseModule,
  PasoGuiado,
  TutorialLocal,
  UsaLaIaBlock,
} from "@/content/types";

const MODULO_SIN_ENRIQUECER: CourseModule = {
  id: "mod01",
  numero: 1,
  titulo: "Módulo de prueba",
  objetivo: "Objetivo de prueba.",
  secciones: {
    explicaSimple: { contenidoMd: "x", consignaExplicacion: "x" },
    detectaGaps: {
      quiz: {
        id: "q1",
        titulo: "Q",
        preguntas: [
          { id: "p1", kind: "boolean", enunciadoMd: "x", correcta: true, explicacionMd: "x" },
        ],
      },
    },
    llenaGaps: { contenidoMd: "x", retos: [] },
    refinaSimplifica: {
      resumenBullets: [],
      sintesis: {
        kind: "code",
        reto: {
          id: "r1",
          titulo: "R",
          enunciadoMd: "x",
          starterCode: "x",
          solutionCode: "x",
          validationCode: "x",
        },
      },
    },
  },
};

const PASO_EJEMPLO: PasoGuiado = {
  id: "mod01-paso1",
  titulo: "Paso de ejemplo",
  explicacionMd: "Mini-explicación breve.",
  accion: { kind: "lectura", bloqueMd: "print('hola')" },
};

const USA_LA_IA_EJEMPLO: UsaLaIaBlock = {
  id: "mod01-ia1",
  promptsSugeridos: ["Prompt"],
  comoVerificar: ["Uno", "Dos"],
  comoIterar: "Itera así.",
  queNoDelegar: ["No delegar X"],
};

const TUTORIAL_LOCAL_EJEMPLO: TutorialLocal = {
  setup: [{ powershell: "python -m venv .venv", bash: "python3 -m venv .venv" }],
  codigo: [{ archivo: "src/graph.py", codigo: "from langgraph.graph import StateGraph" }],
  salidaEsperada: "Salida esperada.",
  spine: { crea: ["src/graph.py"], modifica: [], scaffolding: true },
};

const MODULO_ENRIQUECIDO: CourseModule = {
  ...MODULO_SIN_ENRIQUECER,
  enriquecido: true,
  usaLaIa: [USA_LA_IA_EJEMPLO],
  tutorialLocal: TUTORIAL_LOCAL_EJEMPLO,
  secciones: {
    ...MODULO_SIN_ENRIQUECER.secciones,
    llenaGaps: { ...MODULO_SIN_ENRIQUECER.secciones.llenaGaps, pasos: [PASO_EJEMPLO] },
  },
};

describe("CourseModule — retrocompat del delta §8.2 (ARCHITECTURE.md), verificado por `tsc -b`", () => {
  it("un módulo SIN campos nuevos conserva su forma (smoke runtime; el contrato lo garantiza el build)", () => {
    expect(MODULO_SIN_ENRIQUECER.secciones.llenaGaps.retos).toEqual([]);
    expect((MODULO_SIN_ENRIQUECER as { enriquecido?: true }).enriquecido).toBeUndefined();
  });

  it("un módulo CON los campos nuevos (enriquecido, usaLaIa, tutorialLocal, pasos) tipa y expone su forma", () => {
    expect(MODULO_ENRIQUECIDO.enriquecido).toBe(true);
    expect(MODULO_ENRIQUECIDO.usaLaIa).toHaveLength(1);
    expect(MODULO_ENRIQUECIDO.tutorialLocal?.salidaEsperada).toBe("Salida esperada.");
    expect(MODULO_ENRIQUECIDO.secciones.llenaGaps.pasos).toHaveLength(1);
    expect(MODULO_ENRIQUECIDO.secciones.llenaGaps.pasos?.[0].accion.kind).toBe("lectura");
  });
});
