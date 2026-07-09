import { useEffect, useRef, useState } from "react";

import { STRINGS } from "@/app/strings";
import { useChatStore } from "@/assistant/chatStore";
import { CONFIG } from "@/config";
import type { ModuleId } from "@/content/types";
import { isExplanationDone } from "@/progress/selectors";
import { useProgressStore } from "@/progress/store";

/**
 * Editor de la explicación propia del paso 1 "Explica simple" (C-CONTENT
 * `SeccionExplicaSimple.consignaExplicacion`, mostrada por `ModuloPage`).
 *
 * Slice S5 — CA-13, CA-14. Persiste vía `useProgressStore.saveExplanation`
 * (C-PROGRESS): guardado EXPLÍCITO (botón "Guardar") y guardado con debounce
 * mientras el alumno escribe, para no perder texto si cierra sin pulsar el
 * botón. El umbral de "completado" (CA-13) se lee de
 * `CONFIG.curso.umbralExplicacionChars` (200) vía el selector real
 * `isExplanationDone`, nunca recalculado a mano aquí.
 *
 * Botón "Pedir feedback" (CA-27, A-10, slice S11): se ACTIVA cuando la
 * explicación GUARDADA (C-PROGRESS, no el borrador sin guardar) ya cumple el
 * umbral (`isExplanationDone`). Al pulsarlo dispara
 * `chatStore.sendFeynmanFeedback(moduleId)` (C-ASSIST — compone el mensaje
 * con `buildFeynmanFeedbackMessage` y lo streamea por el mismo pipeline que
 * `send`, CA-21) y desplaza/enfoca el sidebar del asistente para que la
 * respuesta en streaming sea visible de inmediato.
 */

/** id del `<aside>` del asistente en `src/app/Layout.tsx` (foco tras CA-27). */
const ASSISTANT_SIDEBAR_ID = "asistente-sidebar";

const DEBOUNCE_MS = 800;

export interface FeynmanEditorProps {
  moduleId: ModuleId;
}

export function FeynmanEditor({ moduleId }: FeynmanEditorProps) {
  const progress = useProgressStore((state) => state.modules[moduleId]);
  const saveExplanation = useProgressStore((state) => state.saveExplanation);
  const sendFeynmanFeedback = useChatStore((state) => state.sendFeynmanFeedback);

  const textoGuardado = progress?.explicacion?.texto ?? "";
  const [texto, setTexto] = useState(textoGuardado);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Al cambiar de módulo (navegación), carga el texto guardado de ESE
  // módulo. No depende de `progress`/`textoGuardado` en general para no
  // pisar lo que el alumno está escribiendo cuando el propio guardado (con
  // debounce o explícito) actualiza el store.
  useEffect(() => {
    setTexto(useProgressStore.getState().modules[moduleId]?.explicacion?.texto ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleChange(value: string) {
    setTexto(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveExplanation(moduleId, value);
    }, DEBOUNCE_MS);
  }

  function handleGuardar() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    saveExplanation(moduleId, texto);
  }

  function handlePedirFeedback() {
    sendFeynmanFeedback(moduleId);

    // Abre/enfoca el sidebar del asistente (CA-27): en móvil el `<aside>`
    // queda debajo del contenido principal (`src/app/Layout.tsx`), así que
    // hay que desplazarlo a la vista; el foco de teclado va al campo de
    // texto del chat (`ChatPanel`) para que el alumno pueda seguir la
    // conversación sin buscar el panel manualmente. `scrollIntoView` no
    // existe en jsdom (tests) — se llama de forma opcional.
    const sidebar = document.getElementById(ASSISTANT_SIDEBAR_ID);
    sidebar?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    sidebar?.querySelector<HTMLElement>('input[type="text"]')?.focus();
  }

  const umbral = CONFIG.curso.umbralExplicacionChars;
  // Indicador de completado: feedback inmediato mientras se escribe, con el
  // MISMO umbral que el selector real `isExplanationDone` (C-PROGRESS,
  // CONFIG.curso.umbralExplicacionChars). El estado persistido que usa
  // `moduleStatus` (CA-15) sigue siendo el texto GUARDADO en el store; este
  // indicador solo evita que el alumno tenga que guardar para saber si ya
  // llegó al umbral.
  const completado = texto.length >= umbral;
  const haySinGuardar = texto !== textoGuardado;
  const faltan = Math.max(0, umbral - texto.length);
  const textareaId = `feynman-texto-${moduleId}`;
  // "Pedir feedback" (CA-27) se activa con la explicación GUARDADA (no el
  // borrador sin guardar en `texto`), usando el mismo selector real que
  // determina el paso 1 completado (C-PROGRESS `isExplanationDone`).
  const feedbackHabilitado = isExplanationDone(progress);

  return (
    <div data-testid="feynman-editor">
      <label htmlFor={textareaId} className="sr-only">
        {STRINGS.modulo.tuExplicacion}
      </label>
      <textarea
        id={textareaId}
        value={texto}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={STRINGS.feynmanEditor.placeholderTextarea}
        rows={6}
        className="w-full rounded-md border border-border bg-background p-3 text-sm"
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{STRINGS.feynmanEditor.contador(texto.length, umbral)}</span>
        <span role="status">
          {completado ? STRINGS.feynmanEditor.completado : STRINGS.feynmanEditor.faltan(faltan)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleGuardar}
          disabled={!haySinGuardar}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          {STRINGS.feynmanEditor.guardar}
        </button>
        <span className="text-xs text-muted-foreground">
          {haySinGuardar ? STRINGS.feynmanEditor.cambiosSinGuardar : STRINGS.feynmanEditor.guardado}
        </span>

        {/* Botón "pedir feedback" (CA-27, A-10): activo cuando la explicación
            GUARDADA cumple el umbral. Se envuelve en un `span` con `title`
            porque los botones nativos deshabilitados no siempre disparan el
            tooltip del `title` propio. */}
        <span
          title={
            feedbackHabilitado
              ? STRINGS.feynmanEditor.pedirFeedbackTooltip
              : STRINGS.feynmanEditor.pedirFeedbackTooltipDeshabilitado
          }
          className="ml-auto"
        >
          <button
            type="button"
            onClick={handlePedirFeedback}
            disabled={!feedbackHabilitado}
            title={
              feedbackHabilitado
                ? STRINGS.feynmanEditor.pedirFeedbackTooltip
                : STRINGS.feynmanEditor.pedirFeedbackTooltipDeshabilitado
            }
            aria-label={STRINGS.feynmanEditor.pedirFeedback}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            {STRINGS.feynmanEditor.pedirFeedback}
          </button>
        </span>
      </div>
    </div>
  );
}
