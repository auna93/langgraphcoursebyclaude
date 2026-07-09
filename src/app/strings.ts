/**
 * Strings de UI centralizados, en español (CA-05).
 *
 * Ningún componente del shell debe usar texto de UI hardcodeado; siempre
 * importar desde aquí. ADR-07: los 3 labels de estado del asistente son
 * literales exactos, reusados por `StatusBadge` (slice S8) y por los tests.
 */

import { CMD_SERVE } from "@/assistant/types";

export const STRINGS = {
  app: {
    nombre: "Curso interactivo de LangGraph",
  },
  tema: {
    cambiarAOscuro: "Activar modo oscuro",
    cambiarAClaro: "Activar modo claro",
  },
  nav: {
    temario: "Temario",
  },
  temario: {
    titulo: "Temario",
    descripcion: "Elige un módulo para empezar a aprender LangGraph.",
    placeholder: "El listado de los 16 módulos se cargará aquí.",
  },
  /** Labels de `ModuleStatus` (C-PROGRESS), usados por el Temario (CA-01). */
  estadoModulo: {
    no_iniciado: "No iniciado",
    en_curso: "En curso",
    completado: "Completado",
  },
  modulo: {
    tituloFallback: "Módulo",
    placeholder: "El contenido del módulo se cargará aquí.",
    volver: "Volver al temario",
    noEncontrado: "No se encontró este módulo.",
    seccionesNavLabel: "Secciones del módulo",
    /** Títulos EXACTOS de las 4 secciones Feynman, en orden (CA-02). */
    secciones: {
      explicaSimple: "Explica simple",
      detectaGaps: "Detecta tus gaps",
      llenaGaps: "Llena los gaps",
      refinaSimplifica: "Refina y simplifica",
    },
    tuExplicacion: "Tu explicación",
    quizTitulo: "Quiz",
    retosTitulo: "Retos de código",
    resumenTitulo: "Resumen",
    sintesisTitulo: "Síntesis",
    /** Acción "reiniciar módulo" (CA-17, hook `useConfirmedResetModule` de S3). */
    reiniciarModulo: "Reiniciar módulo",
    reiniciarModuloConfirmacion:
      "¿Reiniciar el progreso de este módulo? Se perderán tu explicación, tus resultados de quiz y tus intentos de reto.",
  },
  codeBlock: {
    copiar: "Copiar",
    copiado: "¡Copiado!",
  },
  /**
   * §12.2 (`content/traversal.ts`, `PasoView` en `ModuloPage`, slice SE0). Los
   * pasos guiados reusan `ChallengeCard`/`QuizCard`/`MarkdownView` existentes;
   * sin componentes nuevos.
   */
  pasoGuiado: {
    pasosTitulo: "Pasos guiados",
  },
  /** §12.3 ("Usa la IA", slice SE0). Bloque presentacional, sin estado nuevo. */
  usaLaIa: {
    titulo: "Usa la IA",
    promptsSugeridosTitulo: "Prompts sugeridos",
    comoVerificarTitulo: "Cómo verificar la respuesta",
    comoIterarTitulo: "Cómo iterar",
    queNoDelegarTitulo: "Qué NO delegar",
  },
  /** §12.4 ("En tu máquina", slice SE0). Bloque ilustrativo con "copiar" (CA-29). */
  tutorialLocal: {
    titulo: "En tu máquina",
    setupTitulo: "Configuración",
    powershellLabel: "PowerShell",
    bashLabel: "bash",
    codigoTitulo: "Código",
    salidaEsperadaTitulo: "Salida esperada",
  },
  /**
   * Quiz interactivo (CA-11, CA-12, `components/QuizCard`). `correcta`/
   * `incorrecta` deben contener esas palabras EXACTAS (límites de palabra:
   * "incorrecta" no debe disparar una búsqueda de "correcta").
   */
  quizCard: {
    correcta: "Respuesta correcta.",
    incorrecta: "Respuesta incorrecta.",
    comprobar: "Comprobar",
    repetir: "Repetir",
    verdadero: "Verdadero",
    falso: "Falso",
    puntuacionLabel: (aciertos: number, total: number, pct: number) =>
      `Puntuación: ${aciertos}/${total} (${pct}%)`,
    hecho: "¡Quiz superado!",
    noHecho: (umbralPct: number) =>
      `Aún no alcanzas el ${umbralPct}% necesario. Puedes repetir cuando quieras.`,
  },
  /**
   * Editor de la explicación Feynman del paso 1 (`components/FeynmanEditor`,
   * slice S5). CA-13/CA-14: guardado explícito + con debounce, umbral desde
   * `CONFIG.curso.umbralExplicacionChars`. El botón "pedir feedback" (CA-27,
   * slice S11) se activa cuando la explicación GUARDADA cumple el umbral.
   */
  feynmanEditor: {
    placeholderTextarea: "Escribe aquí tu explicación, como si se la contaras a alguien que no programa…",
    contador: (actual: number, umbral: number) => `${actual} / ${umbral} caracteres`,
    completado: "¡Explicación completada!",
    faltan: (cantidad: number) => `Faltan ${cantidad} caracteres para completar este paso.`,
    guardar: "Guardar",
    guardado: "Guardado",
    cambiosSinGuardar: "Cambios sin guardar…",
    pedirFeedback: "Pedir feedback",
    /** Habilitado (CA-27, S11): explicación guardada ≥ umbral. */
    pedirFeedbackTooltip: "Envía tu explicación guardada al asistente para recibir feedback sobre los gaps.",
    /** Deshabilitado: aún no hay explicación guardada que cumpla el umbral. */
    pedirFeedbackTooltipDeshabilitado:
      "Guarda una explicación de al menos 200 caracteres para pedir feedback al asistente.",
  },
  /**
   * Reto de código (`components/ChallengeCard`, slice S7). CA-06/07 (UI),
   * CA-08 (último intento), CA-09 (gating "ver solución").
   */
  challengeCard: {
    enunciadoTitulo: "Enunciado",
    editorLabel: "Tu código",
    ejecutar: "Ejecutar y validar",
    ejecutando: "Ejecutando…",
    cargandoEntorno: "Cargando entorno de Python… (puede tardar unos segundos la primera vez)",
    resultadoTitulo: "Resultado",
    pass: "¡Reto superado!",
    fail: "Aún no. Revisa los checks fallidos.",
    stdoutTitulo: "Salida (stdout)",
    errorSyntax: "Error de sintaxis en tu código:",
    errorRuntime: "Error al ejecutar tu código:",
    timeoutPrefijo: "Tiempo agotado.",
    errorInfraestructura:
      "No se pudo ejecutar el entorno de Python. Intenta de nuevo o recarga la página.",
    verSolucion: "Ver solución",
    solucionTitulo: "Solución",
    intentosLabel: (n: number) => `Intentos: ${n}`,
  },
  asistente: {
    titulo: "Asistente",
    placeholder: "El chat del asistente se cargará aquí.",
    /**
     * Contenido del mensaje `system` que compone `assistant/promptBuilder.ts`
     * (C-ASSIST). CA-23 (bloque módulo actual) y CA-24 (bloque contexto RAG)
     * se activan en S10; en S9 ambos bloques quedan condicionados a que
     * `currentModule`/`ragHits` no estén vacíos (aquí no lo están todavía).
     */
    systemPrompt: {
      rol: "Eres el tutor del curso interactivo de LangGraph. Responde siempre en español, de forma clara, breve y pedagógica.",
      moduloActual: (id: string, titulo: string, objetivo: string) =>
        `MÓDULO ACTUAL: ${id} — ${titulo}: ${objetivo}`,
      contextoCursoTitulo: "CONTEXTO DEL CURSO:",
      fueraDeAlcance:
        "Si la pregunta está fuera del alcance del curso de LangGraph, dilo explícitamente y redirige al alumno al temario.",
      prioridadContexto:
        "Prioriza siempre la información del CONTEXTO DEL CURSO sobre tu conocimiento general si hay conflicto.",
    },
    /** `components/ChatPanel.tsx` (slice S9). CA-21, CA-22, CA-26. */
    chatPanel: {
      historialVacio: "Aún no hay mensajes. Escribe tu primera pregunta.",
      enviar: "Enviar",
      detener: "Detener",
      limpiar: "Limpiar conversación",
      generando: "Generando respuesta…",
      /** CA-26: mensaje legible + instrucción de recuperación tras error a mitad de stream. */
      errorStream:
        `Se interrumpió la respuesta. Comprueba que Ollama sigue en marcha (\`${CMD_SERVE}\`) y vuelve a intentarlo.`,
      tuMensajeLabel: "Tú:",
      asistenteMensajeLabel: "Asistente:",
      /** M5 (`docs/arch/ARCHITECTURE-M5-WEBLLM.md` §9.7, CA-44/CA-45): error de
       *  streaming a mitad de respuesta vía el motor de respaldo WebGPU (análogo
       *  a `errorStream` para Ollama, CA-26). */
      errorStreamWebGpu:
        "Se interrumpió la respuesta del modelo WebGPU local. Vuelve a intentarlo; si el problema persiste, recarga la página.",
    },
  },
  /** ADR-07: labels de estado del asistente Ollama, literales exactos (CA-18/19/20). */
  estadoAsistente: {
    conectado: "Conectado",
    modeloNoInstalado: "Modelo no instalado",
    sinConexion: "Sin conexión",
    comprobando: "Comprobando…",
    /** Prefijo antes del comando de recuperación literal (CMD_SERVE/CMD_PULL). */
    instruccionRecuperacion: "Ejecuta en una terminal:",
    /** Input del chat deshabilitado mientras no esté "Conectado" (el chat llega en S9). */
    chatDeshabilitado: "El chat estará disponible cuando el asistente esté conectado.",
    /** Placeholder del input de chat (gancho de S8; el envío llega en S9). */
    chatPlaceholder: "Escribe tu pregunta…",
    /** M5 (§9.7, CA-45): label del badge cuando `active === "webllm"`. Contiene
     *  "WebGPU" y es distinto de los 3 literales existentes (sin colisión por
     *  substring con "Conectado"). */
    respaldoWebGpu: "Respaldo WebGPU activo",
  },
  /**
   * M5 (`docs/arch/ARCHITECTURE-M5-WEBLLM.md` §9.7): `WebGpuFallbackCard`
   * (oferta / progreso / cancelar / reintento del fallback in-browser,
   * CA-40b/42/43).
   */
  webgpuFallback: {
    ofertaTitulo: "Asistente de respaldo (WebGPU)",
    ofertaDescripcion: (modelo: string, tamano: string) =>
      `Ollama no está disponible. Puedes activar un modelo local en tu navegador (${modelo}). ` +
      `Requiere una única descarga de ~${tamano}; quedará en la caché del navegador para las próximas sesiones.`,
    activar: "Descargar y activar",
    descargando: (pct: number) => `Descargando modelo WebGPU… ${pct} %`,
    cancelar: "Cancelar",
    canceladoAviso: "Descarga cancelada. Puedes volver a activarla cuando quieras.",
    errorDescarga:
      "No se pudo descargar o cargar el modelo WebGPU. Comprueba tu conexión y vuelve a intentarlo.",
    /** Formato del tamaño estimado (CA-40b "en MB/GB"): mb < 1000 ⇒ `${mb} MB`;
     *  mb ≥ 1000 ⇒ `${(mb/1000) con 1 decimal, coma decimal} GB` (p. ej. "1,6 GB"). */
    tamano: (mb: number): string => {
      if (mb < 1000) return `${mb} MB`;
      const gb = (mb / 1000).toFixed(1).replace(".", ",");
      return `${gb} GB`;
    },
  },
  /**
   * M5 (§9.7, CA-45): avisos de conmutación de motor en el hilo del chat
   * (`chatStore.appendEngineNotice`, slice SF3). Ambos NOMBRAN el motor
   * entrante.
   */
  avisoCambioMotor: {
    aWebGpu: (modelo: string) =>
      `Ollama no está disponible. A partir de ahora el asistente responde con el modelo local ` +
      `${modelo} en tu navegador (WebGPU, modo respaldo); la calidad puede ser menor.`,
    aOllama: (modelo: string) =>
      `Ollama vuelve a estar disponible. El asistente vuelve a responder con ${modelo} vía Ollama.`,
  },
} as const;
