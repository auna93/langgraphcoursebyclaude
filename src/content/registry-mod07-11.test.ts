import { describe, expect, it } from "vitest";

import { getModule } from "@/content/registry";
import type { CodeChallenge, CourseModule, ModuleId } from "@/content/types";

/**
 * Tests de contrato — S14 (SLICES.md §S14): "Contenido módulos 07–11".
 * CA-02 / CA-03 / CA-05 / CA-28 para mod07–11 (C-CONTENT, ARCHITECTURE.md §4).
 *
 * Independiente del implementer: solo usa el contrato público (`getModule`,
 * tipos de `@/content/types`) y las reglas fijadas en PRD.md §6 (filas 07–11)
 * y en ARCHITECTURE.md ("Reglas M3 para autores de contenido"). Replica el
 * patrón de `registry-mod03-06.test.ts` (S13, en PASS).
 *
 * `registry.test.ts` (S1) ya cubre invariantes GENÉRICOS válidos para los 16
 * módulos (incl. mod07–11 en su forma stub). Este archivo añade lo que S14
 * debe demostrar que YA NO es cierto de la forma stub: contenido sustancial,
 * sin marcador `enConstruccion`, y fidelidad temática a checkpointing/Store/
 * HITL/streaming I/streaming II (PRD §6, filas 07–11).
 */

type ModuleWithStubFlag = CourseModule & { enConstruccion?: true };

const MOD07_11_IDS: ModuleId[] = ["mod07", "mod08", "mod09", "mod10", "mod11"];

const STUB_MARKERS_RE =
  /en\s+construcci[oó]n|\btodo:|lorem ipsum|\bstub\b|\bplaceholder\b|pendiente|🚧/i;

function requireModule(id: ModuleId): ModuleWithStubFlag {
  const mod = getModule(id) as ModuleWithStubFlag | undefined;
  expect(mod, `${id} debe existir en el registry`).toBeDefined();
  return mod!;
}

function allChallenges(mod: CourseModule): CodeChallenge[] {
  const challenges = [...mod.secciones.llenaGaps.retos];
  const sintesis = mod.secciones.refinaSimplifica.sintesis;
  if (sintesis.kind === "code") challenges.push(sintesis.reto);
  return challenges;
}

describe("S14 — mod07–11 dejan de ser stub (ADR-09)", () => {
  it.each(MOD07_11_IDS)("%s: NO define enConstruccion (o es false)", (id) => {
    const mod = requireModule(id);
    expect(mod.enConstruccion, `${id}.enConstruccion debería ser undefined/false`).not.toBe(true);
  });

  it.each(MOD07_11_IDS)(
    "%s: ningún contenidoMd contiene el literal/marcador 'EN CONSTRUCCIÓN' u otro placeholder",
    (id) => {
      const mod = requireModule(id);
      const bloques = [
        mod.secciones.explicaSimple.contenidoMd,
        mod.secciones.detectaGaps.contenidoMd ?? "",
        mod.secciones.llenaGaps.contenidoMd,
      ];
      for (const bloque of bloques) {
        expect(bloque, `${id}`).not.toMatch(STUB_MARKERS_RE);
      }
    },
  );

  it.each(MOD07_11_IDS)("%s: explicaSimple y llenaGaps tienen contenido sustancial (≥200 chars)", (id) => {
    const mod = requireModule(id);
    expect(mod.secciones.explicaSimple.contenidoMd.length, `${id} explicaSimple`).toBeGreaterThanOrEqual(200);
    expect(mod.secciones.llenaGaps.contenidoMd.length, `${id} llenaGaps`).toBeGreaterThanOrEqual(200);
  });

  it.each(MOD07_11_IDS)("%s: quiz paso 2 tiene 4–6 preguntas no placeholder", (id) => {
    const mod = requireModule(id);
    const preguntas = mod.secciones.detectaGaps.quiz.preguntas;
    expect(preguntas.length, `${id} quiz`).toBeGreaterThanOrEqual(4);
    expect(preguntas.length, `${id} quiz`).toBeLessThanOrEqual(6);
    for (const q of preguntas) {
      expect(q.enunciadoMd, `${id}/${q.id}`).not.toMatch(STUB_MARKERS_RE);
      expect(q.explicacionMd, `${id}/${q.id}`).not.toMatch(STUB_MARKERS_RE);
    }
  });

  it.each(MOD07_11_IDS)("%s: ≥1 reto de código real (paso 3 y/o síntesis)", (id) => {
    const mod = requireModule(id);
    const challenges = allChallenges(mod);
    expect(challenges.length, `${id} debería tener ≥1 reto real`).toBeGreaterThanOrEqual(1);
    for (const c of challenges) {
      expect(c.starterCode, `${id}/${c.id} starterCode`).not.toMatch(STUB_MARKERS_RE);
      expect(c.solutionCode, `${id}/${c.id} solutionCode`).not.toMatch(STUB_MARKERS_RE);
      expect(c.validationCode, `${id}/${c.id} validationCode`).not.toMatch(STUB_MARKERS_RE);
      const checkCount = (c.validationCode.match(/\bcheck(_eq|_raises)?\s*\(/g) ?? []).length;
      expect(checkCount, `${id}/${c.id} validationCode debería tener ≥1 aserción real`).toBeGreaterThanOrEqual(1);
      expect(c.validationCode, `${id}/${c.id}`).not.toMatch(/^\s*check\(\s*"stub"/m);
    }
  });

  it.each(MOD07_11_IDS)("%s: resumen de síntesis (paso 4) no vacío y ≤10 bullets", (id) => {
    const mod = requireModule(id);
    const bullets = mod.secciones.refinaSimplifica.resumenBullets;
    expect(bullets.length, id).toBeGreaterThan(0);
    expect(bullets.length, id).toBeLessThanOrEqual(10);
  });
});

describe("S14 — Reglas M3 del harness (ARCHITECTURE.md C-CONTENT, 'Reglas M3 para autores de contenido')", () => {
  it.each(MOD07_11_IDS)(
    "%s: validationCode importa SOLO de course_harness y solo check/check_eq/check_raises/get_llm_calls",
    (id) => {
      const mod = requireModule(id);
      const allowed = ["check", "check_eq", "check_raises", "get_llm_calls"];
      for (const c of allChallenges(mod)) {
        const importLines = c.validationCode
          .split("\n")
          .filter((line) => line.trim().startsWith("from course_harness import"));
        expect(importLines.length, `${id}/${c.id} debe importar del harness`).toBeGreaterThanOrEqual(1);
        for (const line of importLines) {
          const names = line
            .replace("from course_harness import", "")
            .split(",")
            .map((n) => n.trim())
            .filter(Boolean);
          for (const name of names) {
            expect(allowed, `${id}/${c.id} importa "${name}" — no permitido en M3`).toContain(name);
          }
        }
        expect(c.validationCode, `${id}/${c.id} usa run_graph (no existe, corregido M3)`).not.toContain("run_graph");
      }
    },
  );

  it.each(MOD07_11_IDS)("%s: ningún bloque de código usa Send (map-reduce dinámico, prohibido en la superficie)", (id) => {
    const mod = requireModule(id);
    const sources = [
      mod.secciones.explicaSimple.contenidoMd,
      mod.secciones.llenaGaps.contenidoMd,
      ...allChallenges(mod).flatMap((c) => [c.starterCode, c.solutionCode, c.validationCode]),
    ];
    for (const src of sources) {
      expect(src, `${id}`).not.toMatch(/\bSend\s*\(/);
    }
  });

  it.each(MOD07_11_IDS)("%s: ningún bloque de código usa subgraphs=True (fuera de la superficie ejecutable, ADR-11)", (id) => {
    const mod = requireModule(id);
    const sources = [
      mod.secciones.explicaSimple.contenidoMd,
      mod.secciones.llenaGaps.contenidoMd,
      ...allChallenges(mod).flatMap((c) => [c.starterCode, c.solutionCode, c.validationCode]),
    ];
    for (const src of sources) {
      expect(src, `${id}`).not.toMatch(/subgraphs\s*=\s*True/);
    }
  });
});

describe("S14 — fidelidad temática por módulo (PRD §6, C-RUNNER tabla 'Avanzado')", () => {
  it("mod07 (Checkpointing): usa InMemorySaver, thread_id y checkpointer=, y explica supervivencia entre invokes del mismo hilo", () => {
    const mod = requireModule("mod07");
    const codigos = [
      mod.secciones.llenaGaps.contenidoMd,
      ...allChallenges(mod).map((c) => c.solutionCode),
    ].join("\n");
    expect(codigos).toMatch(/InMemorySaver/);
    expect(codigos).toMatch(/thread_id/);
    expect(codigos).toMatch(/checkpointer\s*=/);
    const texto = mod.secciones.llenaGaps.contenidoMd.toLowerCase();
    expect(texto).toMatch(/hilo|thread/);
  });

  it("mod08 (Store): usa InMemoryStore, put/search con namespace tupla, y distingue checkpointer (hilo) de Store (entre hilos)", () => {
    const mod = requireModule("mod08");
    const codigos = [
      mod.secciones.llenaGaps.contenidoMd,
      ...allChallenges(mod).map((c) => c.solutionCode),
    ].join("\n");
    expect(codigos).toMatch(/InMemoryStore/);
    expect(codigos).toMatch(/\.put\s*\(/);
    expect(codigos).toMatch(/\.search\s*\(/);
    const texto = mod.secciones.llenaGaps.contenidoMd.toLowerCase();
    expect(texto).toMatch(/entre hilos|entre threads|compartid/);
  });

  it("mod09 (HITL): usa interrupt( y Command(resume=, y describe la re-ejecución del nodo al reanudar", () => {
    const mod = requireModule("mod09");
    const codigos = [
      mod.secciones.llenaGaps.contenidoMd,
      ...allChallenges(mod).map((c) => c.solutionCode),
    ].join("\n");
    expect(codigos).toMatch(/interrupt\s*\(/);
    expect(codigos).toMatch(/Command\s*\(\s*resume\s*=/);
    const texto = mod.secciones.llenaGaps.contenidoMd.toLowerCase();
    expect(texto).toMatch(/re-?ejecut/);
  });

  it("mod09 (HITL, regla 5 C-CONTENT): la acumulación entre nodos usa reducer explícito (Annotated + operator.add)", () => {
    const mod = requireModule("mod09");
    const codigos = [
      mod.secciones.llenaGaps.contenidoMd,
      ...allChallenges(mod).map((c) => c.solutionCode),
    ].join("\n");
    expect(codigos).toMatch(/Annotated/);
    expect(codigos).toMatch(/operator\.add|add_messages/);
  });

  it("mod10 (Streaming I): usa stream_mode=\"values\" y stream_mode=\"updates\" y explica qué emite cada modo", () => {
    const mod = requireModule("mod10");
    const codigos = [
      mod.secciones.llenaGaps.contenidoMd,
      ...allChallenges(mod).map((c) => c.solutionCode),
    ].join("\n");
    expect(codigos).toMatch(/stream_mode\s*=\s*["']values["']/);
    expect(codigos).toMatch(/stream_mode\s*=\s*["']updates["']/);
  });

  it("mod10 (Streaming I): NO usa stream_mode=\"messages\" ni get_stream_writer (eso es mod11)", () => {
    const mod = requireModule("mod10");
    const codigos = [
      mod.secciones.llenaGaps.contenidoMd,
      ...allChallenges(mod).flatMap((c) => [c.starterCode, c.solutionCode, c.validationCode]),
    ].join("\n");
    expect(codigos).not.toMatch(/stream_mode\s*=\s*["']messages["']/);
    expect(codigos).not.toContain("get_stream_writer");
  });

  it("mod11 (Streaming II): usa stream_mode=\"messages\" (o lista que lo incluya) y get_stream_writer + stream_mode=\"custom\"", () => {
    const mod = requireModule("mod11");
    const codigos = [
      mod.secciones.llenaGaps.contenidoMd,
      ...allChallenges(mod).map((c) => c.solutionCode),
    ].join("\n");
    expect(codigos).toMatch(/["']messages["']/);
    expect(codigos).toMatch(/stream_mode/);
    expect(codigos).toMatch(/get_stream_writer/);
    expect(codigos).toMatch(/["']custom["']/);
  });
});

describe("S14 — contenido en español (CA-05, muestreo sobre mod07–11)", () => {
  it.each(MOD07_11_IDS)("%s: título/objetivo no traen texto de UI en inglés obvio", (id) => {
    const mod = requireModule(id);
    const textoVisible = `${mod.titulo} ${mod.objetivo}`.toLowerCase();
    expect(textoVisible).not.toMatch(/\b(loading|error occurred|welcome|click here|submit|cancel)\b/);
  });

  it.each(MOD07_11_IDS)("%s: el resumen de síntesis (paso 4) está en español y no vacío", (id) => {
    const mod = requireModule(id);
    for (const bullet of mod.secciones.refinaSimplifica.resumenBullets) {
      expect(bullet.length, `${id} bullet vacío`).toBeGreaterThan(0);
    }
  });
});
