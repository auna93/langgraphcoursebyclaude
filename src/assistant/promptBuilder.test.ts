/**
 * Tests unitarios de `buildPrompt` (contrato C-ASSIST, ARCHITECTURE.md §4,
 * `src/assistant/types.ts`). Slice S10 — SLICES.md §S10 (refuerza
 * A-05/A-06/A-08; completa lo cableado en S9 con `ragHits`/`currentModule`
 * reales).
 *
 * `buildPrompt` es PURA: se prueba sin red y sin mocks. Cubre:
 *  - CA-23: con `currentModule` fijado, el system prompt incluye el
 *    id/título/objetivo del módulo actual (contexto de ubicación).
 *  - CA-24: con `ragHits` no vacíos, el system prompt contiene los
 *    fragmentos recuperados (contexto RAG presente y no vacío).
 *  - A-08: el system prompt instruye responder en español, indicar cuando
 *    la pregunta está fuera de alcance y redirigir al temario, y priorizar
 *    el contenido del curso sobre el conocimiento general.
 *  - Forma del array devuelto: [system, ...historial, user] (contrato
 *    literal de `PromptInput`/`ChatMessage`).
 */
import { describe, expect, it } from "vitest";

import { buildFeynmanFeedbackMessage, buildPrompt } from "@/assistant/promptBuilder";
import type { ChatMessage, PromptInput } from "@/assistant/types";
import type { RagHit } from "@/rag/types";

function baseInput(overrides: Partial<PromptInput> = {}): PromptInput {
  return {
    pregunta: "¿Qué es un grafo en LangGraph?",
    historial: [],
    currentModule: null,
    ragHits: [],
    ...overrides,
  };
}

const RAG_HIT_A: RagHit = {
  id: "mod05/llenaGaps/0",
  moduleId: "mod05",
  moduleTitulo: "Conditional edges y ciclos",
  sectionKey: "llenaGaps",
  titulo: "Routing con add_conditional_edges",
  texto:
    "add_conditional_edges(nodo, funcion_ruta) decide el siguiente nodo según el estado; " +
    "puede devolver el nombre de un nodo o END.",
  score: 4.2,
};

describe("buildPrompt — forma general del resultado", () => {
  it("devuelve [system, ...historial, user] preservando el historial intacto", () => {
    const historial: ChatMessage[] = [
      { role: "user", content: "hola" },
      { role: "assistant", content: "hola, ¿en qué te ayudo?" },
    ];

    const mensajes = buildPrompt(baseInput({ historial }));

    expect(mensajes[0].role).toBe("system");
    expect(mensajes.slice(1, 1 + historial.length)).toEqual(historial);
    const last = mensajes[mensajes.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toBe("¿Qué es un grafo en LangGraph?");
  });
});

describe("buildPrompt — CA-23: contexto de módulo actual", () => {
  it("con currentModule fijado, el system prompt menciona su id y su título", () => {
    const mensajes = buildPrompt(
      baseInput({
        currentModule: {
          id: "mod05",
          titulo: "Conditional edges y ciclos",
          objetivo: "Implementar routing con add_conditional_edges y ciclos con condición de parada.",
        },
      }),
    );

    const system = mensajes[0].content;
    expect(system).toContain("mod05");
    expect(system).toContain("Conditional edges y ciclos");
  });

  it("sin currentModule (null), el system prompt NO afirma estar en ningún módulo concreto", () => {
    const mensajes = buildPrompt(baseInput({ currentModule: null }));

    const system = mensajes[0].content;
    expect(system).not.toContain("mod05");
    expect(system.toUpperCase()).not.toContain("MÓDULO ACTUAL");
  });
});

describe("buildPrompt — CA-24: contexto RAG no vacío", () => {
  it("con ragHits no vacíos, el system prompt contiene el fragmento recuperado", () => {
    const mensajes = buildPrompt(baseInput({ ragHits: [RAG_HIT_A] }));

    const system = mensajes[0].content;
    expect(system).toContain(RAG_HIT_A.texto);
  });

  it("con ragHits vacíos, el system prompt no incluye contenido de fragmentos inexistentes", () => {
    const mensajes = buildPrompt(baseInput({ ragHits: [] }));

    const system = mensajes[0].content;
    expect(system).not.toContain(RAG_HIT_A.texto);
  });
});

describe("buildPrompt — A-08: alcance del curso y prioridad del contexto", () => {
  it("el system prompt instruye decir explícitamente cuando la pregunta está fuera de alcance y redirigir al temario", () => {
    const mensajes = buildPrompt(baseInput());

    const system = mensajes[0].content.toLowerCase();
    expect(system).toMatch(/fuera del alcance|fuera de alcance/);
    expect(system).toMatch(/temario/);
  });

  it("el system prompt instruye priorizar el contenido del curso sobre el conocimiento general", () => {
    const mensajes = buildPrompt(baseInput());

    const system = mensajes[0].content.toLowerCase();
    expect(system).toMatch(/prioriza|prioridad/);
  });

  it("el system prompt está en español (responde siempre en español)", () => {
    const mensajes = buildPrompt(baseInput());

    const system = mensajes[0].content.toLowerCase();
    expect(system).toMatch(/español/);
  });
});

/**
 * `buildFeynmanFeedbackMessage` (contrato C-ASSIST, ARCHITECTURE.md §4):
 *
 *   export declare function buildFeynmanFeedbackMessage(
 *     moduloTitulo: string,
 *     explicacion: string,
 *   ): string;
 *
 * Slice S11 (SLICES.md §S11) — CA-27, A-10 ("el alumno puede enviar su
 * explicación al asistente con un solo clic para recibir crítica de gaps").
 * Función PURA: se prueba sin red ni store, igual que `buildPrompt`. Cubre:
 *  - el mensaje resultante contiene la explicación del alumno ÍNTEGRA (no
 *    truncada, no resumida) — es lo que `chatStore.sendFeynmanFeedback`
 *    envía como turno del alumno, y es lo que hace verificable CA-27
 *    ("la explicación se envía al asistente como mensaje").
 *  - el mensaje contiene el título del módulo (contexto para el asistente,
 *    sin depender del bloque "MÓDULO ACTUAL" de `buildPrompt`, que en S9
 *    depende de la ruta actual — aquí el contexto viaja explícito en el
 *    propio mensaje del alumno).
 *  - el mensaje pide EXPLÍCITAMENTE una crítica de gaps/huecos (A-10: "recibir
 *    crítica de gaps"), no un simple saludo o eco de la explicación.
 *  - determinista: mismos inputs ⇒ mismo resultado, siempre.
 */
describe("buildFeynmanFeedbackMessage — CA-27/A-10: mensaje de feedback Feynman", () => {
  const MODULO_TITULO = "¿Qué es LangGraph?";
  const EXPLICACION =
    "LangGraph es una librería para construir grafos de estados donde cada nodo es una función " +
    "que recibe el estado, hace algo y devuelve una actualización parcial; las aristas deciden el " +
    "siguiente nodo, y el grafo compilado se ejecuta con invoke() hasta llegar a END.";

  it("el mensaje contiene la explicación del alumno íntegra, sin truncar ni alterar", () => {
    const mensaje = buildFeynmanFeedbackMessage(MODULO_TITULO, EXPLICACION);

    expect(mensaje).toContain(EXPLICACION);
  });

  it("el mensaje contiene el título del módulo como contexto", () => {
    const mensaje = buildFeynmanFeedbackMessage(MODULO_TITULO, EXPLICACION);

    expect(mensaje).toContain(MODULO_TITULO);
  });

  it("el mensaje pide explícitamente una crítica de gaps/huecos en la explicación (A-10)", () => {
    const mensaje = buildFeynmanFeedbackMessage(MODULO_TITULO, EXPLICACION);

    expect(mensaje.toLowerCase()).toMatch(/gap|hueco|falta|error|impreciso|incorrect/);
    expect(mensaje.toLowerCase()).toMatch(/feedback|crítica|critica|revisa|evalúa|evalua|analiza/);
  });

  it("es determinista: mismos inputs producen exactamente el mismo mensaje", () => {
    const a = buildFeynmanFeedbackMessage(MODULO_TITULO, EXPLICACION);
    const b = buildFeynmanFeedbackMessage(MODULO_TITULO, EXPLICACION);

    expect(a).toBe(b);
  });

  it("no confunde el título de un módulo con la explicación de otro (no hardcodea contenido)", () => {
    const otroTitulo = "Reducers y estado compartido";
    const otraExplicacion = "Un reducer combina el valor previo del estado con la actualización de un nodo.";

    const mensajeA = buildFeynmanFeedbackMessage(MODULO_TITULO, EXPLICACION);
    const mensajeB = buildFeynmanFeedbackMessage(otroTitulo, otraExplicacion);

    expect(mensajeA).not.toContain(otraExplicacion);
    expect(mensajeB).not.toContain(EXPLICACION);
    expect(mensajeA).not.toBe(mensajeB);
  });

  it("explicaciones con saltos de línea y caracteres especiales viajan intactas", () => {
    const explicacionCompleja =
      "Primero: el estado.\nSegundo: los nodos.\n¿Y las aristas? Deciden el flujo — con `add_edge`.";
    const mensaje = buildFeynmanFeedbackMessage(MODULO_TITULO, explicacionCompleja);

    expect(mensaje).toContain(explicacionCompleja);
  });
});
