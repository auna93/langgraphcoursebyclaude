/**
 * Chunker del contenido del curso (C-RAG, ARCHITECTURE.md §4, slice S10).
 *
 * Parte cada sección Feynman de un `CourseModule` por headings `##` de su
 * markdown (objetivo: 150–500 palabras/chunk, ADR-05). No importa React ni
 * otras carpetas de `src/*` salvo `content/` (dato puro, permitido para
 * todos según §2 de ARCHITECTURE.md).
 */

import type { CourseModule, ModuleId } from "@/content/types";
import type { RagChunk } from "./types";

type SectionKey = RagChunk["sectionKey"];

/** Etiqueta de fallback cuando hay texto ANTES del primer heading `##`. */
const SECTION_FALLBACK_TITLE: Record<SectionKey, string> = {
  explicaSimple: "Explica simple",
  detectaGaps: "Detecta huecos",
  llenaGaps: "Llena huecos",
  refinaSimplifica: "Refina y simplifica",
};

const HEADING_RE = /^##\s+(.+?)\s*$/;
const FENCE_RE = /^```/;

interface HeadingChunk {
  titulo: string;
  texto: string;
}

/**
 * Divide un markdown por líneas `## heading`, ignorando las que caen dentro
 * de un bloque de código delimitado por ``` (para no confundir comentarios
 * `##` de código Python con headings reales). El contenido previo al primer
 * heading (si lo hay y no está vacío) forma un chunk con `fallbackTitle`.
 */
function splitByHeadings(md: string, fallbackTitle: string): HeadingChunk[] {
  const lines = md.split("\n");
  const chunks: { titulo: string; lines: string[] }[] = [];
  let current: { titulo: string; lines: string[] } | null = null;
  let inFence = false;

  for (const line of lines) {
    if (FENCE_RE.test(line.trim())) {
      inFence = !inFence;
    }

    const headingMatch = !inFence ? HEADING_RE.exec(line) : null;
    if (headingMatch) {
      if (current) chunks.push(current);
      current = { titulo: headingMatch[1].trim(), lines: [] };
      continue;
    }

    if (!current) {
      current = { titulo: fallbackTitle, lines: [] };
    }
    current.lines.push(line);
  }
  if (current) chunks.push(current);

  return chunks
    .map((c) => ({ titulo: c.titulo, texto: c.lines.join("\n").trim() }))
    .filter((c) => c.texto.length > 0);
}

function sectionMarkdown(modulo: CourseModule, sectionKey: SectionKey): string {
  const { secciones } = modulo;
  switch (sectionKey) {
    case "explicaSimple":
      return secciones.explicaSimple.contenidoMd;
    case "detectaGaps":
      return secciones.detectaGaps.contenidoMd ?? "";
    case "llenaGaps":
      return secciones.llenaGaps.contenidoMd;
    case "refinaSimplifica": {
      const bullets = secciones.refinaSimplifica.resumenBullets
        .map((b) => `- ${b}`)
        .join("\n");
      return `## Resumen\n${bullets}`;
    }
  }
}

const SECTION_KEYS: readonly SectionKey[] = [
  "explicaSimple",
  "detectaGaps",
  "llenaGaps",
  "refinaSimplifica",
];

/** Chunks de un único módulo, deterministas (mismo contenido ⇒ mismos ids). */
export function chunkModule(modulo: CourseModule): RagChunk[] {
  const chunks: RagChunk[] = [];

  for (const sectionKey of SECTION_KEYS) {
    const md = sectionMarkdown(modulo, sectionKey);
    if (md.trim().length === 0) continue;

    const parts = splitByHeadings(md, SECTION_FALLBACK_TITLE[sectionKey]);
    parts.forEach((part, i) => {
      chunks.push({
        id: `${modulo.id}/${sectionKey}/${i}`,
        moduleId: modulo.id as ModuleId,
        moduleTitulo: modulo.titulo,
        sectionKey,
        titulo: part.titulo,
        texto: part.texto,
      });
    });
  }

  return chunks;
}

/** Chunks de todos los módulos del curso, en el orden del registry. */
export function chunkModules(modules: readonly CourseModule[]): RagChunk[] {
  return modules.flatMap((m) => chunkModule(m));
}
