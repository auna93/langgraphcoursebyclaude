/**
 * `buildPrompt` — función PURA de C-ASSIST (ARCHITECTURE.md §4).
 *
 * Slice S9: firma FINAL, invocada por `chatStore.send` con `ragHits: []` y
 * `currentModule: null` (el RAG y el módulo actual llegan cableados en S10 —
 * ese slice sólo necesita AÑADIR contenido real a los bloques condicionales
 * de abajo, no cambiar la forma de esta función).
 *
 * `buildFeynmanFeedbackMessage` (CA-27, A-10, slice S11): función PURA que
 * compone el mensaje `user` que `chatStore.sendFeynmanFeedback` envía por el
 * mismo pipeline de streaming que `send` (reusa `buildPrompt`/`send`, no
 * duplica lógica de streaming). Incluye la explicación íntegra del alumno
 * (C-PROGRESS, `ModuleProgress.explicacion.texto`) y pide explícitamente una
 * crítica de gaps, en español.
 */

import { STRINGS } from "@/app/strings";
import type { ChatMessage, PromptInput } from "@/assistant/types";

export function buildPrompt(input: PromptInput): ChatMessage[] {
  const { pregunta, historial, currentModule, ragHits } = input;

  const bloques: string[] = [STRINGS.asistente.systemPrompt.rol];

  if (currentModule !== null) {
    bloques.push(
      STRINGS.asistente.systemPrompt.moduloActual(
        currentModule.id,
        currentModule.titulo,
        currentModule.objetivo,
      ),
    );
  }

  if (ragHits.length > 0) {
    const contexto = ragHits
      .map((hit) => `### ${hit.titulo}\n${hit.texto}`)
      .join("\n\n");
    bloques.push(`${STRINGS.asistente.systemPrompt.contextoCursoTitulo}\n${contexto}`);
  }

  bloques.push(STRINGS.asistente.systemPrompt.fueraDeAlcance);
  bloques.push(STRINGS.asistente.systemPrompt.prioridadContexto);

  const system: ChatMessage = { role: "system", content: bloques.join("\n\n") };
  const user: ChatMessage = { role: "user", content: pregunta };

  return [system, ...historial, user];
}

/**
 * Mensaje `user` pre-formateado del feedback Feynman (CA-27, A-10). Incluye
 * el módulo y la explicación íntegra del alumno, y pide explícitamente una
 * crítica de los gaps (qué falta o está mal explicado), en español.
 */
export function buildFeynmanFeedbackMessage(moduloTitulo: string, explicacion: string): string {
  return [
    `Esta es mi explicación (técnica Feynman) del módulo "${moduloTitulo}", como si se la contara a alguien que no programa:`,
    "",
    `"""`,
    explicacion,
    `"""`,
    "",
    "Por favor, dame feedback en español: ¿qué conceptos me faltan, qué explico mal o de forma imprecisa, y qué gaps debería llenar para que la explicación sea correcta y completa?",

  ].join("\n");
}
