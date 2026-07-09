import { useEffect, useState } from "react";

import { STRINGS } from "@/app/strings";

/**
 * Bloque de código con resaltado (Shiki, cargado de forma perezosa) y botón
 * "copiar" que copia el contenido EXACTO del bloque al portapapeles (CA-29).
 *
 * Mientras Shiki carga (o si falla), se muestra el código sin resaltar en un
 * `<pre>` plano: el botón de copiar siempre copia `code` tal cual, nunca el
 * HTML resaltado.
 */

// Doble tema de Shiki: emite ambos como variables CSS (`--shiki-light` /
// `--shiki-dark`) y el color se resuelve con la clase `.dark` del root (ver
// index.css). Así el resaltado sigue al tema claro-crema / oscuro sin re-render.
const SHIKI_THEMES = { light: "github-light", dark: "github-dark" } as const;
const COPIED_FEEDBACK_MS = 1500;

export interface CodeBlockProps {
  code: string;
  /** Lenguaje para el resaltado (ej. "python"). Si se omite, sin resaltado semántico. */
  language?: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);

    import("shiki")
      .then(({ codeToHtml }) =>
        codeToHtml(code, {
          lang: language ?? "text",
          themes: SHIKI_THEMES,
          // No fija color/fondo resueltos: solo las variables CSS por token,
          // que index.css conmuta según el tema.
          defaultColor: false,
        }),
      )
      .then((result) => {
        if (!cancelled) setHtml(result);
      })
      .catch(() => {
        // Silencioso: se degrada a `<pre>` plano (ver render de abajo).
      });

    return () => {
      cancelled = true;
    };
  }, [code, language]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopyFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <div
      data-testid="code-block"
      className="relative my-4 overflow-hidden rounded-md border border-border bg-muted/30"
    >
      <button
        type="button"
        onClick={handleCopy}
        aria-label={STRINGS.codeBlock.copiar}
        className="absolute right-2 top-2 z-10 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-accent"
      >
        {copied ? STRINGS.codeBlock.copiado : STRINGS.codeBlock.copiar}
      </button>
      {html ? (
        <div
          className="overflow-x-auto text-sm [&>pre]:m-0 [&>pre]:p-4"
          // El HTML viene de Shiki a partir de `code` (contenido del curso, no
          // de entrada de usuario): no es HTML crudo de terceros.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto p-4 text-sm">
          <code>{code}</code>
        </pre>
      )}
      {copyFailed && (
        <p role="status" className="px-4 pb-2 text-xs text-red-600 dark:text-red-400">
          No se pudo copiar automáticamente: selecciona el código y cópialo manualmente.
        </p>
      )}
    </div>
  );
}
