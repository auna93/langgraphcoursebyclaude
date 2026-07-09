import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { STRINGS } from "@/app/strings";
import { getModule } from "@/content/registry";
import type {
  CodeChallenge,
  CourseModule,
  ModuleId,
  PasoGuiado,
  Quiz,
  TutorialLocal,
  UsaLaIaBlock,
} from "@/content/types";
import { ChallengeCard } from "@/components/ChallengeCard";
import { CodeBlock } from "@/components/CodeBlock";
import { FeynmanEditor } from "@/components/FeynmanEditor";
import { MarkdownView } from "@/components/MarkdownView";
import { QuizCard } from "@/components/QuizCard";
import { useConfirmedResetModule } from "@/progress/store";

/** Orden y claves EXACTOS de las 4 secciones Feynman (CA-02, C-CONTENT). */
const SECTION_KEYS = [
  "explicaSimple",
  "detectaGaps",
  "llenaGaps",
  "refinaSimplifica",
] as const;

type SectionKey = (typeof SECTION_KEYS)[number];

function sectionLabel(key: SectionKey): string {
  return STRINGS.modulo.secciones[key];
}

function tabId(key: SectionKey): string {
  return `tab-${key}`;
}

function panelId(key: SectionKey): string {
  return `panel-${key}`;
}

/**
 * Renderiza un módulo (`:id`) con sus 4 secciones Feynman, en orden, con
 * navegación interna tipo pestañas (patrón de accesibilidad WAI-ARIA
 * `role="tab"`/`role="tabpanel"`, CA-02): solo el panel de la sección activa
 * está montado a la vez. El markdown se resuelve con `MarkdownView`; los
 * bloques de código incluyen "copiar" (CA-29) vía `CodeBlock`. El quiz (paso
 * 2, y la síntesis del paso 4 si es de tipo quiz) se renderiza con el
 * `QuizCard` real (slice S4, CA-11/CA-12). Los retos (paso 3, y la síntesis
 * si es de tipo código) se renderizan con el `ChallengeCard` real (slice S7,
 * CA-06/07 UI, CA-08, CA-09).
 */
export function ModuloPage() {
  const { id } = useParams<{ id: string }>();
  const modulo = id ? getModule(id as ModuleId) : undefined;
  const [activeSection, setActiveSection] = useState<SectionKey>(SECTION_KEYS[0]);
  const reiniciarModulo = useConfirmedResetModule(() =>
    window.confirm(STRINGS.modulo.reiniciarModuloConfirmacion),
  );

  if (!modulo) {
    return (
      <section>
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          {STRINGS.modulo.volver}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">
          {STRINGS.modulo.tituloFallback} {id}
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          {STRINGS.modulo.noEncontrado}
        </p>
      </section>
    );
  }

  return (
    <section>
      <Link to="/" className="text-sm text-muted-foreground hover:underline">
        {STRINGS.modulo.volver}
      </Link>

      <header className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {String(modulo.numero).padStart(2, "0")}. {modulo.titulo}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{modulo.objetivo}</p>
        </div>
        <button
          type="button"
          onClick={() => reiniciarModulo(modulo.id)}
          className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent"
        >
          {STRINGS.modulo.reiniciarModulo}
        </button>
      </header>

      <div role="tablist" aria-label={STRINGS.modulo.seccionesNavLabel} className="mt-6">
        <ol className="flex flex-wrap gap-2 border-b border-border pb-2">
          {SECTION_KEYS.map((key) => {
            const selected = key === activeSection;
            return (
              <li key={key}>
                <button
                  type="button"
                  role="tab"
                  id={tabId(key)}
                  aria-selected={selected}
                  aria-controls={panelId(key)}
                  onClick={() => setActiveSection(key)}
                  className={
                    selected
                      ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                      : "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent"
                  }
                >
                  {sectionLabel(key)}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div
        role="tabpanel"
        id={panelId(activeSection)}
        aria-labelledby={tabId(activeSection)}
        className="mt-6"
      >
        <h2 className="text-lg font-bold">{sectionLabel(activeSection)}</h2>
        <div className="mt-3">
          <SectionContent modulo={modulo} sectionKey={activeSection} />
        </div>
      </div>

      {modulo.usaLaIa && modulo.usaLaIa.length > 0 && (
        <UsaLaIaView blocks={modulo.usaLaIa} />
      )}
      {modulo.tutorialLocal && <TutorialLocalView tutorial={modulo.tutorialLocal} />}
    </section>
  );
}

function SectionContent({
  modulo,
  sectionKey,
}: {
  modulo: CourseModule;
  sectionKey: SectionKey;
}) {
  const { secciones } = modulo;

  switch (sectionKey) {
    case "explicaSimple": {
      const seccion = secciones.explicaSimple;
      return (
        <div>
          <MarkdownView contenidoMd={seccion.contenidoMd} />
          <div className="mt-6 rounded-md border border-border p-4">
            <h3 className="text-sm font-semibold">{STRINGS.modulo.tuExplicacion}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{seccion.consignaExplicacion}</p>
            <div className="mt-3">
              <FeynmanEditor moduleId={modulo.id} />
            </div>
          </div>
          <PasosList moduleId={modulo.id} pasos={seccion.pasos} />
        </div>
      );
    }
    case "detectaGaps": {
      const seccion = secciones.detectaGaps;
      return (
        <div>
          {seccion.contenidoMd && <MarkdownView contenidoMd={seccion.contenidoMd} />}
          <QuizSlot moduleId={modulo.id} quiz={seccion.quiz} />
          <PasosList moduleId={modulo.id} pasos={seccion.pasos} />
        </div>
      );
    }
    case "llenaGaps": {
      const seccion = secciones.llenaGaps;
      return (
        <div>
          <MarkdownView contenidoMd={seccion.contenidoMd} />
          <h3 className="mt-6 text-sm font-semibold">{STRINGS.modulo.retosTitulo}</h3>
          <ul className="mt-2 flex flex-col gap-4">
            {seccion.retos.map((reto) => (
              <li key={reto.id}>
                <RetoSlot moduleId={modulo.id} reto={reto} />
              </li>
            ))}
          </ul>
          <PasosList moduleId={modulo.id} pasos={seccion.pasos} />
        </div>
      );
    }
    case "refinaSimplifica": {
      const seccion = secciones.refinaSimplifica;
      return (
        <div>
          <h3 className="text-sm font-semibold">{STRINGS.modulo.resumenTitulo}</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {seccion.resumenBullets.map((bullet, i) => (
              <li key={i}>{bullet}</li>
            ))}
          </ul>
          <h3 className="mt-6 text-sm font-semibold">{STRINGS.modulo.sintesisTitulo}</h3>
          {seccion.sintesis.kind === "quiz" ? (
            <QuizSlot moduleId={modulo.id} quiz={seccion.sintesis.quiz} />
          ) : (
            <RetoSlot moduleId={modulo.id} reto={seccion.sintesis.reto} />
          )}
          <PasosList moduleId={modulo.id} pasos={seccion.pasos} />
        </div>
      );
    }
    default:
      return null;
  }
}

/** Quiz del paso 2 / síntesis: componente real `QuizCard` (slice S4, CA-11/CA-12). */
function QuizSlot({ moduleId, quiz }: { moduleId: ModuleId; quiz: Quiz }) {
  return (
    <div data-testid="quiz-slot">
      <QuizCard moduleId={moduleId} quiz={quiz} />
    </div>
  );
}

/** Reto de código del paso 3 (y síntesis si es de tipo código): `ChallengeCard` real (S7). */
function RetoSlot({ moduleId, reto }: { moduleId: ModuleId; reto: CodeChallenge }) {
  return (
    <div data-testid="reto-slot">
      <MarkdownView contenidoMd={reto.enunciadoMd} />
      <div className="mt-3">
        <ChallengeCard moduleId={moduleId} reto={reto} />
      </div>
    </div>
  );
}

/**
 * §12.2 (slice SE0): lista de pasos guiados de una sección (si el módulo está
 * enriquecido). Wrapper fino: reusa `PasoView`, sin estado nuevo. Si la
 * sección no define `pasos`, no renderiza nada (retrocompat visual, CA-02).
 */
function PasosList({ moduleId, pasos }: { moduleId: ModuleId; pasos: PasoGuiado[] | undefined }) {
  if (!pasos || pasos.length === 0) return null;
  return (
    <div className="mt-6" data-testid="pasos-guiados">
      <h3 className="text-sm font-semibold">{STRINGS.pasoGuiado.pasosTitulo}</h3>
      <ol className="mt-2 flex flex-col gap-6">
        {pasos.map((paso) => (
          <li key={paso.id}>
            <PasoView moduleId={moduleId} paso={paso} />
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * §12.2 (slice SE0): un `PasoGuiado` individual. Renderiza su
 * mini-explicación con `MarkdownView` y su ÚNICA acción con el componente
 * existente que corresponde (`ChallengeCard` para "ejercicio", `QuizCard`
 * para "quiz", `MarkdownView` para "lectura" ilustrativa). Sin UI nueva
 * compleja (§8.6).
 */
function PasoView({ moduleId, paso }: { moduleId: ModuleId; paso: PasoGuiado }) {
  return (
    <div data-testid="paso-guiado" className="rounded-md border border-border p-4">
      <h4 className="text-sm font-semibold">{paso.titulo}</h4>
      <MarkdownView contenidoMd={paso.explicacionMd} />
      <div className="mt-3">
        {paso.accion.kind === "ejercicio" && (
          <RetoSlot moduleId={moduleId} reto={paso.accion.reto} />
        )}
        {paso.accion.kind === "quiz" && <QuizSlot moduleId={moduleId} quiz={paso.accion.quiz} />}
        {paso.accion.kind === "lectura" && <MarkdownView contenidoMd={paso.accion.bloqueMd} />}
      </div>
    </div>
  );
}

/**
 * §12.3 (slice SE0): bloque(s) "Usa la IA". Puramente presentacional: los
 * prompts sugeridos se muestran copiables vía `CodeBlock` (CA-29); nunca
 * envía nada al asistente ni califica (NG-11).
 */
function UsaLaIaView({ blocks }: { blocks: UsaLaIaBlock[] }) {
  return (
    <section className="mt-8" data-testid="usa-la-ia">
      <h2 className="text-lg font-bold">{STRINGS.usaLaIa.titulo}</h2>
      <ul className="mt-3 flex flex-col gap-6">
        {blocks.map((block) => (
          <li key={block.id} className="rounded-md border border-border p-4">
            {block.titulo && <h3 className="text-sm font-semibold">{block.titulo}</h3>}

            <h4 className="mt-3 text-sm font-semibold">{STRINGS.usaLaIa.promptsSugeridosTitulo}</h4>
            <div className="mt-2 flex flex-col gap-2">
              {block.promptsSugeridos.map((prompt, i) => (
                <CodeBlock key={i} code={prompt} />
              ))}
            </div>

            <h4 className="mt-3 text-sm font-semibold">{STRINGS.usaLaIa.comoVerificarTitulo}</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {block.comoVerificar.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>

            <h4 className="mt-3 text-sm font-semibold">{STRINGS.usaLaIa.comoIterarTitulo}</h4>
            <MarkdownView contenidoMd={block.comoIterar} />

            <h4 className="mt-3 text-sm font-semibold">{STRINGS.usaLaIa.queNoDelegarTitulo}</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {block.queNoDelegar.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * §12.4 (slice SE0): "En tu máquina" — tutorial local ilustrativo (NO
 * ejecutado por el runner, NG-12). Setup PowerShell/bash y código LangGraph
 * real vía `CodeBlock` (CA-29, "copiar"); no dispara `PyRunner`.
 */
function TutorialLocalView({ tutorial }: { tutorial: TutorialLocal }) {
  return (
    <section className="mt-8" data-testid="tutorial-local">
      <h2 className="text-lg font-bold">{STRINGS.tutorialLocal.titulo}</h2>
      {tutorial.introMd && <MarkdownView contenidoMd={tutorial.introMd} />}

      <h3 className="mt-4 text-sm font-semibold">{STRINGS.tutorialLocal.setupTitulo}</h3>
      <ul className="mt-2 flex flex-col gap-4">
        {tutorial.setup.map((bloque, i) => (
          <li key={i}>
            {bloque.titulo && <h4 className="text-sm font-semibold">{bloque.titulo}</h4>}
            {bloque.descripcionMd && <MarkdownView contenidoMd={bloque.descripcionMd} />}
            <p className="mt-2 text-xs font-medium text-muted-foreground">
              {STRINGS.tutorialLocal.powershellLabel}
            </p>
            <CodeBlock code={bloque.powershell} language="powershell" />
            <p className="mt-2 text-xs font-medium text-muted-foreground">
              {STRINGS.tutorialLocal.bashLabel}
            </p>
            <CodeBlock code={bloque.bash} language="bash" />
          </li>
        ))}
      </ul>

      <h3 className="mt-4 text-sm font-semibold">{STRINGS.tutorialLocal.codigoTitulo}</h3>
      <ul className="mt-2 flex flex-col gap-4">
        {tutorial.codigo.map((bloque, i) => (
          <li key={i}>
            <p className="text-xs font-medium text-muted-foreground">{bloque.archivo}</p>
            {bloque.descripcionMd && <MarkdownView contenidoMd={bloque.descripcionMd} />}
            <CodeBlock code={bloque.codigo} language="python" />
          </li>
        ))}
      </ul>

      <h3 className="mt-4 text-sm font-semibold">{STRINGS.tutorialLocal.salidaEsperadaTitulo}</h3>
      <CodeBlock code={tutorial.salidaEsperada} />
    </section>
  );
}
