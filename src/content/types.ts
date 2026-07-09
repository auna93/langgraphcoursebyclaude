/**
 * Esquema del contenido del curso (contrato C-CONTENT, ARCHITECTURE.md §4).
 *
 * Transcripción LITERAL del contrato. `content/` es dato puro: no importa
 * nada de la app ni de React. Cualquier cambio de forma exige volver al
 * architect (Gate 2) — no se parchea aquí de forma divergente.
 */

/** Identificadores estables. NUNCA renombrar una vez publicados: el progreso los referencia. */
export type ModuleId = `mod${string}`; // "mod01" … "mod16"

export interface CourseModule {
  id: ModuleId;
  numero: number; // 1..16
  titulo: string; // español
  objetivo: string; // objetivo de aprendizaje (tabla PRD §6)
  /** Exactamente las 4 secciones Feynman, en este orden. */
  secciones: {
    explicaSimple: SeccionExplicaSimple; // paso 1
    detectaGaps: SeccionQuiz; // paso 2
    llenaGaps: SeccionProfundiza; // paso 3
    refinaSimplifica: SeccionRefina; // paso 4
  };
  /**
   * §12 (ADR-15): marcador PROGRAMÁTICO de módulo bajo formato ENRIQUECIDO. `true` SOLO
   * en módulos ya enriquecidos (piloto mod01–03; luego mod04–06, 07–11, 12–16). Los
   * tests CA-30..CA-39 se exigen ÚNICAMENTE a módulos con `enriquecido === true`; un
   * módulo sin este campo NO está obligado al formato §12 (retrocompat). Ortogonal a
   * `enConstruccion` (nunca coexisten: un stub no está enriquecido).
   */
  enriquecido?: true;
  /** §12.3: bloques "Usa la IA" (copiloto qwen). ≥1 en módulo enriquecido (CA-34). */
  usaLaIa?: UsaLaIaBlock[];
  /** §12.4: tutorial local "En tu máquina" + tramo del project spine (CA-35..CA-38). */
  tutorialLocal?: TutorialLocal;
}

export interface SeccionExplicaSimple {
  /** Markdown en español. Analogía cotidiana, sin jerga no definida. */
  contenidoMd: string;
  /** Prompt del cuadro "explícaselo a alguien que no programa". */
  consignaExplicacion: string;
  /**
   * §12.2: secuencia ORDENADA de pasos guiados de ESTA sección. Opcional (retrocompat).
   * Los pasos viven sobre todo en `llenaGaps` (paso 3), pero pueden aparecer en las 4.
   * El orden del array ES el orden pedagógico y la base de CA-33 (incrementalidad
   * DENTRO de la sección).
   */
  pasos?: PasoGuiado[];
}

export interface SeccionQuiz {
  contenidoMd?: string; // intro opcional
  quiz: Quiz; // 4–6 preguntas
  /** §12.2: ver `SeccionExplicaSimple.pasos`. */
  pasos?: PasoGuiado[];
}

export interface SeccionProfundiza {
  contenidoMd: string; // API real, casos borde, errores comunes
  retos: CodeChallenge[]; // 1–2 retos
  /** §12.2: ver `SeccionExplicaSimple.pasos`. */
  pasos?: PasoGuiado[];
}

export interface SeccionRefina {
  resumenBullets: string[]; // ≤10 bullets
  /** Reto de síntesis: código O quiz de integración (mod16: quiz). */
  sintesis: { kind: "code"; reto: CodeChallenge } | { kind: "quiz"; quiz: Quiz };
  /** §12.2: ver `SeccionExplicaSimple.pasos`. */
  pasos?: PasoGuiado[];
}

// ---------- Paso guiado (§12.2) ----------
export interface PasoGuiado {
  id: string; // único en el módulo, ej. "mod01-paso1"
  titulo: string; // español
  /** Mini-explicación breve (markdown ES). NO vacía y ≤120 palabras (CA-30). SOLO el
   *  micro-concepto de este paso (no adelanta los siguientes). */
  explicacionMd: string;
  /** EXACTAMENTE una acción concreta (CA-30). */
  accion: PasoAccion;
}

export type PasoAccion =
  /** Caso normal: mini-ejercicio de código bajo el contrato §5.2. REUTILIZA
   *  CodeChallenge (ADR-12): mismo runner, mismo harness, mismo smoke (CA-32). Alcance
   *  reducido: 1 concepto, 1–3 `# TODO` (CA-32/CA-33). CUENTA para "hecho" (CA-15). */
  | { kind: "ejercicio"; reto: CodeChallenge }
  /** Excepción: micro-predicción/quiz de 1–2 ítems. REUTILIZA Quiz. CUENTA como quiz del
   *  módulo (CA-11/12, umbral 80% de CONFIG) — enumeración canónica ADR-13. */
  | { kind: "quiz"; quiz: Quiz }
  /** Excepción: lectura-y-ejecución sin verificación automática (raro; NO cuenta para
   *  "hecho"). El `bloqueMd` es prosa/código ilustrativo con "copiar" (CA-29). */
  | { kind: "lectura"; bloqueMd: string };

// ---------- Bloque "Usa la IA" (§12.3) ----------
export interface UsaLaIaBlock {
  id: string; // único en el módulo, ej. "mod01-ia1"
  titulo?: string;
  /** ≥1 prompt sugerido copiable, orientado al módulo (CA-34). */
  promptsSugeridos: string[];
  /** Checklist "cómo verificar la respuesta de la IA": ≥2 ítems (CA-34). */
  comoVerificar: string[];
  /** Guía "cómo iterar" si la respuesta no compila/no pasa. NO vacía (CA-34). */
  comoIterar: string;
  /** "Qué NO delegar" (el alumno escribe/entiende el código): ≥1 ítem (CA-34, NG-11). */
  queNoDelegar: string[];
}

// ---------- Tutorial local "En tu máquina" + project spine (§12.4) ----------
export interface TutorialLocal {
  introMd?: string; // encuadre opcional del tramo del módulo
  /** ≥1 bloque de setup, cada uno con AMBOS shells no vacíos (CA-35). Incremental:
   *  solo lo NUEVO del módulo, no se repite entero. */
  setup: SetupBloque[];
  /** ≥1 bloque de código LangGraph REAL (CA-35/36). ILUSTRATIVO: con "copiar" (CA-29),
   *  NO ejecutado por el runner (NG-12) — igual que los bloques ilustrativos de ADR-11. */
  codigo: TutorialCodigo[];
  /** Salida esperada LITERAL para que el alumno compare (CA-35). NO vacía. */
  salidaEsperada: string;
  /** Tramo del project spine que aporta este módulo (CA-38). */
  spine: SpinePaso;
}

export interface SetupBloque {
  titulo?: string;
  descripcionMd?: string;
  /** Comandos Windows PowerShell (copiables). NO vacío (CA-35). */
  powershell: string;
  /** Comandos bash (copiables). NO vacío (CA-35). */
  bash: string;
}

export interface TutorialCodigo {
  /** Ruta del archivo del project spine (ej. "src/graph.py"). Ata el código al spine
   *  (CA-38). */
  archivo: string;
  descripcionMd?: string;
  /** Código Python REAL: superficie LangGraph del grounding (CA-36) + donde haya LLM,
   *  `from langchain_ollama import ChatOllama` con `model="qwen2.5-coder:14b"` (u override
   *  A-01). CERO proveedores cloud (NG-02). Ilustrativo (no lo corre el runner, NG-12). */
  codigo: string;
}

export interface SpinePaso {
  /** Archivos CREADOS respecto del módulo enriquecido anterior. */
  crea: string[];
  /** Archivos MODIFICADOS respecto del módulo anterior (⊆ archivos ya creados, CA-38). */
  modifica: string[];
  /** SOLO mod01: scaffolding completo (venv + estructura `src/` + `requirements.txt`).
   *  Cuando es `true`, `crea` incluye el árbol inicial del proyecto (CA-38). */
  scaffolding?: true;
}

// ---------- Quiz ----------
export interface Quiz {
  id: string; // único en el módulo, ej. "mod03-quiz1"
  titulo: string;
  preguntas: QuizQuestion[]; // 4–6 (síntesis: 3–6)
}

export type QuizQuestion =
  | { id: string; kind: "single"; enunciadoMd: string; opciones: string[]; correcta: number; explicacionMd: string }
  | { id: string; kind: "multi"; enunciadoMd: string; opciones: string[]; correctas: number[]; explicacionMd: string }
  | { id: string; kind: "boolean"; enunciadoMd: string; correcta: boolean; explicacionMd: string }
  /** Predicción de salida: se muestra `codigo` y opciones de salida posibles. */
  | { id: string; kind: "output"; enunciadoMd: string; codigo: string; opciones: string[]; correcta: number; explicacionMd: string };

// ---------- Reto de código ----------
export interface CodeChallenge {
  id: string; // ej. "mod05-reto1"
  titulo: string;
  enunciadoMd: string;
  /** Esqueleto con huecos `# TODO`. Es lo que ve el alumno en el editor. */
  starterCode: string;
  /** Solución de referencia (US-08). Debe pasar la validación. */
  solutionCode: string;
  /**
   * Código Python de validación. Se ejecuta DESPUÉS del código del alumno, en el mismo
   * namespace. Usa exclusivamente el harness:
   *   from course_harness import check, check_eq, check_raises, get_llm_calls
   * Cada check produce un CheckResult con id y mensaje concreto (CA-07).
   */
  validationCode: string;
  /**
   * Dobles deterministas de LLM (SU-02). Si se define, el harness registra respuestas
   * fijas que FakeChatModel devuelve en orden/por-coincidencia; ver C-RUNNER §harness.
   */
  llmDoubles?: LlmDouble[];
  /** Timeout duro de la validación. Default 8000 (presupuesto CA-06 <10 s). */
  timeoutMs?: number;
}

export interface LlmDouble {
  /** Si el último mensaje humano contiene `matchSubstring`, responde `respuesta`;
   *  si matchSubstring se omite, es la respuesta por defecto/en orden. */
  matchSubstring?: string;
  respuesta: string;
  /** Tool calls simulados que el doble emite (para módulos 12–14). */
  toolCalls?: { name: string; args: Record<string, unknown> }[];
}
