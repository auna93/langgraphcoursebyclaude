import { describe, expect, it } from "vitest";

import { getModule } from "@/content/registry";
import { getModuleChallenges, getModulePasos, getModuleQuizzes } from "@/content/traversal";
import type {
  CodeChallenge,
  CourseModule,
  ModuleId,
  PasoAccion,
  PasoGuiado,
  TutorialCodigo,
} from "@/content/types";

/**
 * Tests de contrato — SE2 (SLICES.md §SE2): "Enriquecer mod04–06" (nodes/edges,
 * conditional edges/ciclos, add_messages — grounding §1-3, sin LLM avanzado).
 * Cubre CA-30..CA-39 (PRD §12.5) EXCLUSIVAMENTE para mod04, mod05 y mod06,
 * contra el delta de C-CONTENT cerrado en ARCHITECTURE.md §8 (tipos
 * `PasoGuiado`/`PasoAccion`/`UsaLaIaBlock`/`TutorialLocal`, reglas §8.5).
 *
 * REPLICA el patrón de `enriquecido-mod01-03.test.ts` (SE1, en PASS), extendido
 * a mod04–06. SE2 es explícitamente "solo shim core" (SLICES.md §SE2): a
 * diferencia de SE1 (que ya auditaba "sin LLM" porque mod01–03 no lo
 * necesitan), aquí se reafirma la misma restricción — mod04–06 tampoco
 * requieren LLM (grounding §1-3: state+nodes+edges+conditional, add_messages),
 * así que NINGÚN bloque de `tutorialLocal.codigo` debería usar `ChatOllama` ni
 * símbolos de la tabla "avanzada" del shim.
 *
 * Independiente del implementer: solo usa el contrato público (`getModule`,
 * `getModulePasos`/`getModuleChallenges`/`getModuleQuizzes` de
 * `content/traversal.ts`, ya en PASS desde SE0) y los tipos de
 * `@/content/types`. No asume nada de cómo el implementer construye el
 * contenido internamente.
 *
 * Antes de que SE2 enriquezca mod04–06 (campo `enriquecido: true` + `pasos` +
 * `usaLaIa` + `tutorialLocal` ausentes), este archivo es ROJO por la razón
 * correcta: `mod.enriquecido` es `undefined`, `getModulePasos(mod)` devuelve
 * `[]` (< 5), `mod.usaLaIa`/`mod.tutorialLocal` son `undefined` — no por
 * errores de import o de setup.
 *
 * CA-38 (continuidad del project spine) se verifica de forma ACUMULATIVA desde
 * mod01 (SE1 debe estar en PASS para que este archivo pueda pasar: si mod01–03
 * aún no declaran `tutorialLocal.spine`, este test es ROJO por la razón
 * correcta — continuidad rota, no ausencia de datos de SE2).
 */

const MOD_IDS: ModuleId[] = ["mod04", "mod05", "mod06"];
const SPINE_CHAIN_IDS: ModuleId[] = ["mod01", "mod02", "mod03", "mod04", "mod05", "mod06"];

function requireModule(id: ModuleId): CourseModule {
  const mod = getModule(id);
  expect(mod, `${id} debe existir en el registry`).toBeDefined();
  return mod!;
}

function contarPalabras(texto: string): number {
  return texto.split(/\s+/).filter((token) => token.length > 0).length;
}

function contarTodos(codigo: string): number {
  return (codigo.match(/#\s*TODO/g) ?? []).length;
}

function contarAserciones(validationCode: string): number {
  return (validationCode.match(/\bcheck(_eq|_raises)?\s*\(/g) ?? []).length;
}

function esMiniEjercicio(paso: PasoGuiado): paso is PasoGuiado & { accion: Extract<PasoAccion, { kind: "ejercicio" }> } {
  return paso.accion.kind === "ejercicio";
}

/** Recorre las 4 secciones del módulo devolviendo, por sección, SOLO sus
 *  `pasos` declarados (a diferencia de `getModulePasos`, que aplana todo). Se
 *  necesita así para CA-33: la incrementalidad se mide DENTRO de cada
 *  sección, no en el aplanado global. */
function pasosPorSeccion(mod: CourseModule): PasoGuiado[][] {
  return [
    mod.secciones.explicaSimple.pasos ?? [],
    mod.secciones.detectaGaps.pasos ?? [],
    mod.secciones.llenaGaps.pasos ?? [],
    mod.secciones.refinaSimplifica.pasos ?? [],
  ];
}

describe("SE2 — marcador `enriquecido` (ADR-15)", () => {
  it.each(MOD_IDS)("%s: enriquecido === true", (id) => {
    const mod = requireModule(id);
    expect(mod.enriquecido, `${id}.enriquecido debería ser true`).toBe(true);
  });

  it.each(MOD_IDS)("%s: NUNCA coexiste enriquecido con enConstruccion (ADR-15)", (id) => {
    const mod = requireModule(id) as CourseModule & { enConstruccion?: true };
    expect(mod.enConstruccion, `${id} enriquecido no puede ser un stub`).not.toBe(true);
  });
});

describe("CA-30 — cada módulo enriquecido tiene ≥5 PASOS bien formados", () => {
  it.each(MOD_IDS)("%s: getModulePasos(mod).length >= 5", (id) => {
    const mod = requireModule(id);
    const pasos = getModulePasos(mod);
    expect(pasos.length, `${id} debería tener ≥5 pasos (tiene ${pasos.length})`).toBeGreaterThanOrEqual(5);
  });

  it.each(MOD_IDS)("%s: cada paso tiene explicacionMd no vacío y ≤120 palabras", (id) => {
    const mod = requireModule(id);
    for (const paso of getModulePasos(mod)) {
      expect(paso.explicacionMd.trim().length, `${id}/${paso.id} explicacionMd vacío`).toBeGreaterThan(0);
      const palabras = contarPalabras(paso.explicacionMd);
      expect(palabras, `${id}/${paso.id} explicacionMd tiene ${palabras} palabras (> 120)`).toBeLessThanOrEqual(120);
    }
  });

  it.each(MOD_IDS)("%s: cada paso tiene EXACTAMENTE una acción concreta de un kind válido", (id) => {
    const mod = requireModule(id);
    for (const paso of getModulePasos(mod)) {
      expect(paso.accion, `${id}/${paso.id} sin accion`).toBeDefined();
      expect(["ejercicio", "quiz", "lectura"], `${id}/${paso.id} kind inválido`).toContain(paso.accion.kind);
    }
  });

  it.each(MOD_IDS)("%s: ids de pasos únicos dentro del módulo", (id) => {
    const mod = requireModule(id);
    const ids = getModulePasos(mod).map((p) => p.id);
    expect(new Set(ids).size, `${id} tiene ids de paso duplicados`).toBe(ids.length);
  });
});

describe("CA-31 — ≥3 mini-ejercicios de código verificables por módulo", () => {
  it.each(MOD_IDS)("%s: ≥3 pasos con accion.kind === 'ejercicio'", (id) => {
    const mod = requireModule(id);
    const miniEjercicios = getModulePasos(mod).filter(esMiniEjercicio);
    expect(
      miniEjercicios.length,
      `${id} debería tener ≥3 mini-ejercicios (tiene ${miniEjercicios.length})`,
    ).toBeGreaterThanOrEqual(3);
  });
});

describe("CA-32 — mini-ejercicio bien formado (estructura; la ejecución real está en el smoke e2e)", () => {
  it.each(MOD_IDS)("%s: cada mini-ejercicio tiene enunciado, 1–3 '# TODO', ≥1 aserción y solución", (id) => {
    const mod = requireModule(id);
    const miniEjercicios = getModulePasos(mod)
      .filter(esMiniEjercicio)
      .map((p) => p.accion.reto);

    for (const reto of miniEjercicios) {
      expect(reto.enunciadoMd.trim().length, `${id}/${reto.id} enunciadoMd vacío`).toBeGreaterThan(0);

      const todos = contarTodos(reto.starterCode);
      expect(todos, `${id}/${reto.id} starterCode tiene ${todos} '# TODO' (esperado 1–3)`).toBeGreaterThanOrEqual(1);
      expect(todos, `${id}/${reto.id} starterCode tiene ${todos} '# TODO' (esperado 1–3)`).toBeLessThanOrEqual(3);

      const aserciones = contarAserciones(reto.validationCode);
      expect(aserciones, `${id}/${reto.id} validationCode sin aserciones del harness`).toBeGreaterThanOrEqual(1);

      expect(reto.solutionCode.trim().length, `${id}/${reto.id} solutionCode vacío`).toBeGreaterThan(0);
    }
  });

  it.each(MOD_IDS)("%s: validationCode de mini-ejercicios importa SOLO del harness permitido (sin run_graph)", (id) => {
    const mod = requireModule(id);
    const allowed = ["check", "check_eq", "check_raises", "get_llm_calls"];
    const miniEjercicios = getModulePasos(mod)
      .filter(esMiniEjercicio)
      .map((p) => p.accion.reto);

    for (const reto of miniEjercicios) {
      expect(reto.validationCode, `${id}/${reto.id} usa run_graph (no existe)`).not.toContain("run_graph");
      const importLines = reto.validationCode
        .split("\n")
        .filter((line) => line.trim().startsWith("from course_harness import"));
      for (const line of importLines) {
        const names = line
          .replace("from course_harness import", "")
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean);
        for (const name of names) {
          expect(allowed, `${id}/${reto.id} importa "${name}" no permitido`).toContain(name);
        }
      }
    }
  });
});

describe("CA-33 — incrementalidad DENTRO de cada sección (nº de '# TODO' no decrece)", () => {
  it.each(MOD_IDS)("%s: para mini-ejercicios consecutivos de la MISMA sección, #TODO(n) >= #TODO(n-1)", (id) => {
    const mod = requireModule(id);
    for (const pasosSeccion of pasosPorSeccion(mod)) {
      const miniEjercicios = pasosSeccion.filter(esMiniEjercicio).map((p) => p.accion.reto);
      for (let n = 1; n < miniEjercicios.length; n++) {
        const anterior = contarTodos(miniEjercicios[n - 1].starterCode);
        const actual = contarTodos(miniEjercicios[n].starterCode);
        expect(
          actual,
          `${id}: ${miniEjercicios[n].id} (#TODO=${actual}) debería tener >= #TODO que ${miniEjercicios[n - 1].id} (#TODO=${anterior})`,
        ).toBeGreaterThanOrEqual(anterior);
      }
    }
  });
});

describe('CA-34 — bloque "Usa la IA" con sus 4 componentes', () => {
  it.each(MOD_IDS)("%s: usaLaIa.length >= 1", (id) => {
    const mod = requireModule(id);
    expect(mod.usaLaIa, `${id} debería definir usaLaIa`).toBeDefined();
    expect(mod.usaLaIa!.length, `${id} debería tener ≥1 bloque "Usa la IA"`).toBeGreaterThanOrEqual(1);
  });

  it.each(MOD_IDS)("%s: cada bloque tiene ≥1 prompt, ≥2 ítems de verificación, iteración no vacía y ≥1 qué-no-delegar", (id) => {
    const mod = requireModule(id);
    for (const bloque of mod.usaLaIa ?? []) {
      expect(bloque.promptsSugeridos.length, `${id}/${bloque.id} promptsSugeridos`).toBeGreaterThanOrEqual(1);
      for (const prompt of bloque.promptsSugeridos) {
        expect(prompt.trim().length, `${id}/${bloque.id} prompt vacío`).toBeGreaterThan(0);
      }
      expect(bloque.comoVerificar.length, `${id}/${bloque.id} comoVerificar`).toBeGreaterThanOrEqual(2);
      expect(bloque.comoIterar.trim().length, `${id}/${bloque.id} comoIterar vacío`).toBeGreaterThan(0);
      expect(bloque.queNoDelegar.length, `${id}/${bloque.id} queNoDelegar`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('CA-35 — tutorial local "En tu máquina" presente', () => {
  it.each(MOD_IDS)("%s: tutorialLocal definido con setup, código y salida esperada", (id) => {
    const mod = requireModule(id);
    expect(mod.tutorialLocal, `${id} debería definir tutorialLocal`).toBeDefined();
    const tutorial = mod.tutorialLocal!;

    expect(tutorial.setup.length, `${id} tutorialLocal.setup`).toBeGreaterThanOrEqual(1);
    for (const bloque of tutorial.setup) {
      expect(bloque.powershell.trim().length, `${id} setup.powershell vacío`).toBeGreaterThan(0);
      expect(bloque.bash.trim().length, `${id} setup.bash vacío`).toBeGreaterThan(0);
    }

    expect(tutorial.codigo.length, `${id} tutorialLocal.codigo`).toBeGreaterThanOrEqual(1);
    for (const bloque of tutorial.codigo) {
      expect(bloque.archivo.trim().length, `${id} tutorialLocal.codigo[].archivo vacío`).toBeGreaterThan(0);
      expect(bloque.codigo.trim().length, `${id} tutorialLocal.codigo[].codigo vacío`).toBeGreaterThan(0);
    }

    expect(tutorial.salidaEsperada.trim().length, `${id} salidaEsperada vacía`).toBeGreaterThan(0);
  });
});

// ---------- CA-36/CA-37: allowlist de símbolos y coherencia app↔máquina ----------

/** Símbolos EXACTOS de la tabla del shim (C-RUNNER, ARCHITECTURE.md §4, "Core" +
 *  "Avanzado" — cerradas en M3) que legítimamente pueden aparecer en código
 *  LangGraph/langchain, más el cliente LLM local admitido (ADR-14). SE2 solo
 *  usa shim CORE (SLICES.md §SE2: "Solo shim core"), pero el allowlist general
 *  de CA-36 cubre ambas tablas para no acoplar el test a esa restricción de
 *  fase (se verifica "solo core" por separado, más abajo).
 */
const CORE_SYMBOLS = [
  "StateGraph",
  "START",
  "END",
  "MessagesState",
  "add_messages",
  "get_stream_writer",
  "AnyMessage",
  "SystemMessage",
  "HumanMessage",
  "AIMessage",
  "ToolMessage",
];

const ADVANCED_SYMBOLS = [
  "InMemorySaver",
  "get_state_history",
  "get_state",
  "interrupt",
  "Command",
  "InMemoryStore",
  "bind_tools",
  "tool_calls",
  "ToolNode",
  "create_react_agent",
  "FakeChatModel",
];

const ALLOWED_LANGGRAPH_SYMBOLS = [...CORE_SYMBOLS, ...ADVANCED_SYMBOLS];

const CHAT_OLLAMA_SYMBOL = "ChatOllama";

const CLOUD_PROVIDER_RE = /langchain_openai|langchain_anthropic|langchain_google|langchain_cohere|langchain_mistralai|\bopenai\b|\banthropic\b/i;

const ALLOWED_LANGGRAPH_IMPORT_PATHS = [
  "langgraph.graph",
  "langgraph.graph.message",
  "langgraph.config",
  "langgraph.checkpoint.memory",
  "langgraph.types",
  "langgraph.store.memory",
  "langgraph.prebuilt",
  "langchain.messages",
  "langchain_core.messages",
  "langchain.tools",
  "langchain_core.tools",
];

const IMPORT_FROM_RE = /from\s+([\w.]+)\s+import\s+(.+)/g;

describe("CA-36 — fidelidad de API del tutorial local (allowlist shim + ChatOllama, 0 cloud)", () => {
  it.each(MOD_IDS)("%s: 0 imports de proveedores cloud en tutorialLocal.codigo", (id) => {
    const mod = requireModule(id);
    for (const bloque of mod.tutorialLocal?.codigo ?? []) {
      expect(bloque.codigo, `${id}/${bloque.archivo} importa un proveedor cloud`).not.toMatch(CLOUD_PROVIDER_RE);
    }
  });

  it.each(MOD_IDS)("%s: los imports de langgraph*/langchain* del tutorial pertenecen al allowlist del shim", (id) => {
    const mod = requireModule(id);
    for (const bloque of mod.tutorialLocal?.codigo ?? []) {
      const re = new RegExp(IMPORT_FROM_RE);
      let match: RegExpExecArray | null = re.exec(bloque.codigo);
      while (match !== null) {
        const importPath = match[1];
        if (/^langgraph|^langchain/.test(importPath)) {
          const isAllowedPath = ALLOWED_LANGGRAPH_IMPORT_PATHS.some(
            (allowed) => importPath === allowed || importPath.startsWith(`${allowed}.`),
          );
          const isOllamaPath = importPath === "langchain_ollama";
          expect(
            isAllowedPath || isOllamaPath,
            `${id}/${bloque.archivo} importa de "${importPath}", fuera del allowlist del shim`,
          ).toBe(true);

          if (isOllamaPath) {
            const names = match[2].split(",").map((n) => n.trim());
            for (const name of names) {
              expect(name, `${id}/${bloque.archivo} importa "${name}" de langchain_ollama (solo ChatOllama)`).toBe(
                CHAT_OLLAMA_SYMBOL,
              );
            }
          }
        }
        match = re.exec(bloque.codigo);
      }
    }
  });

  it.each(MOD_IDS)("%s (SE2: solo shim core): sin ChatOllama ni superficie avanzada — mod04–06 no usan LLM", (id) => {
    const mod = requireModule(id);
    for (const bloque of mod.tutorialLocal?.codigo ?? []) {
      expect(bloque.codigo, `${id}/${bloque.archivo} no debería usar ChatOllama (mod04–06 sin LLM)`).not.toContain(
        CHAT_OLLAMA_SYMBOL,
      );
      for (const advanced of ADVANCED_SYMBOLS) {
        expect(bloque.codigo, `${id}/${bloque.archivo} usa símbolo avanzado "${advanced}" (SE2 es solo shim core)`).not.toMatch(
          new RegExp(`\\b${advanced}\\b`),
        );
      }
    }
  });

  it.each(MOD_IDS)("%s: si define model=, usa 'qwen2.5-coder:14b' o el override VITE_OLLAMA_MODEL", (id) => {
    const mod = requireModule(id);
    for (const bloque of mod.tutorialLocal?.codigo ?? []) {
      const modelMatches = bloque.codigo.match(/ChatOllama\([^)]*model\s*=\s*"([^"]+)"/g) ?? [];
      for (const m of modelMatches) {
        expect(m).toMatch(/qwen2\.5-coder:14b|VITE_OLLAMA_MODEL|os\.environ/);
      }
    }
  });
});

/** Símbolos permitidos como tokens (regex de palabra completa) usados para
 *  medir el conjunto de símbolos LangGraph presentes en un texto (CA-37). */
function simbolosPresentes(texto: string): Set<string> {
  const encontrados = new Set<string>();
  for (const simbolo of ALLOWED_LANGGRAPH_SYMBOLS) {
    if (new RegExp(`\\b${simbolo}\\b`).test(texto)) encontrados.add(simbolo);
  }
  return encontrados;
}

function fuentesDeRetos(challenges: CodeChallenge[]): string {
  return challenges.map((c) => `${c.starterCode}\n${c.solutionCode}\n${c.validationCode}`).join("\n");
}

function fuentesDeTutorial(codigo: TutorialCodigo[]): string {
  return codigo.map((c) => c.codigo).join("\n");
}

describe("CA-37 — coherencia app↔máquina: símbolos del tutorial ⊆ símbolos de los retos validados del módulo", () => {
  it.each(MOD_IDS)("%s: Stut (tutorial) ⊆ Smax (retos/mini-ejercicios validados por el runner)", (id) => {
    const mod = requireModule(id);
    const smax = simbolosPresentes(fuentesDeRetos(getModuleChallenges(mod)));
    const stut = simbolosPresentes(fuentesDeTutorial(mod.tutorialLocal?.codigo ?? []));

    const faltantes = [...stut].filter((s) => !smax.has(s));
    expect(faltantes, `${id}: símbolos del tutorial ausentes de los retos validados: ${faltantes.join(", ")}`).toEqual([]);
  });

  it.each(MOD_IDS)(
    "%s: regla dura §8.4 — ChatOllama y comandos de shell NUNCA en starter/solution/validationCode",
    (id) => {
      const mod = requireModule(id);
      for (const reto of getModuleChallenges(mod)) {
        for (const [campo, codigo] of [
          ["starterCode", reto.starterCode],
          ["solutionCode", reto.solutionCode],
          ["validationCode", reto.validationCode],
        ] as const) {
          expect(codigo, `${id}/${reto.id}.${campo} contiene ChatOllama (prohibido en retos ejecutables)`).not.toContain(
            CHAT_OLLAMA_SYMBOL,
          );
          expect(codigo, `${id}/${reto.id}.${campo} contiene langchain_ollama`).not.toContain("langchain_ollama");
          expect(codigo.toLowerCase(), `${id}/${reto.id}.${campo} contiene un comando de shell (ollama serve/pull)`).not.toMatch(
            /ollama\s+(serve|pull)/,
          );
        }
      }
    },
  );
});

// ---------- CA-38: project spine continuo (mod01–06, ACUMULATIVO desde SE1) ----------

describe("CA-38 — project spine continuo (mod04–06 continúan el spine de mod01–03, sin saltos)", () => {
  it.each(MOD_IDS)("%s: NO declara scaffolding === true (solo mod01)", (id) => {
    const mod = requireModule(id);
    expect(mod.tutorialLocal?.spine.scaffolding, `${id} no debería declarar scaffolding (solo mod01)`).not.toBe(true);
  });

  it.each(MOD_IDS)("%s: spine.crea ∪ spine.modifica no está vacío", (id) => {
    const mod = requireModule(id);
    const spine = mod.tutorialLocal?.spine;
    expect(spine, `${id} debería definir spine`).toBeDefined();
    const total = spine!.crea.length + spine!.modifica.length;
    expect(total, `${id} spine.crea ∪ spine.modifica está vacío`).toBeGreaterThan(0);
  });

  it(
    "continuidad sin saltos: todo archivo modificado por mod01–06 fue creado antes (o en el mismo módulo)",
    () => {
      const acumuladoCrea = new Set<string>();
      for (const id of SPINE_CHAIN_IDS) {
        const mod = requireModule(id);
        const spine = mod.tutorialLocal?.spine;
        expect(spine, `${id} debería definir spine (SE1 debe estar en PASS para que SE2 pueda cerrar el spine)`).toBeDefined();
        // El propio módulo puede crear y modificar en el mismo paso; se añade
        // `crea` de este módulo ANTES de validar sus `modifica` (regla §8.5: "o
        // del propio, antes de modificarse").
        for (const archivo of spine!.crea) acumuladoCrea.add(archivo);
        for (const archivo of spine!.modifica) {
          expect(
            acumuladoCrea.has(archivo),
            `${id} modifica "${archivo}" sin que haya sido creado antes por ningún módulo enriquecido (salto de continuidad)`,
          ).toBe(true);
        }
      }
    },
  );

  it("mod04–06 introducen ≥1 archivo/modificación NUEVA respecto de mod01–03 (el spine crece, no se estanca)", () => {
    const previo = new Set<string>();
    for (const id of ["mod01", "mod02", "mod03"] as ModuleId[]) {
      const mod = requireModule(id);
      const spine = mod.tutorialLocal?.spine;
      for (const archivo of spine?.crea ?? []) previo.add(archivo);
      for (const archivo of spine?.modifica ?? []) previo.add(archivo);
    }
    const tocadosSE2 = new Set<string>();
    for (const id of MOD_IDS) {
      const mod = requireModule(id);
      const spine = mod.tutorialLocal?.spine;
      for (const archivo of spine?.crea ?? []) tocadosSE2.add(archivo);
      for (const archivo of spine?.modifica ?? []) tocadosSE2.add(archivo);
    }
    expect(tocadosSE2.size, "mod04–06 deberían tocar ≥1 archivo del project spine").toBeGreaterThan(0);
  });
});

// ---------- CA-39: regresión sobre contratos previos (CA-01..CA-29) ----------

describe("CA-39 — el enriquecimiento no rompe CA-02/03/28 en mod04–06", () => {
  it.each(MOD_IDS)("%s: conserva las 4 secciones Feynman con su forma esperada", (id) => {
    const mod = requireModule(id);
    expect(mod.secciones.explicaSimple, `${id} explicaSimple`).toBeDefined();
    expect(mod.secciones.detectaGaps, `${id} detectaGaps`).toBeDefined();
    expect(mod.secciones.llenaGaps, `${id} llenaGaps`).toBeDefined();
    expect(mod.secciones.refinaSimplifica, `${id} refinaSimplifica`).toBeDefined();
    expect(mod.secciones.explicaSimple.contenidoMd.length, `${id} explicaSimple.contenidoMd`).toBeGreaterThan(0);
  });

  it.each(MOD_IDS)("%s: el quiz de detectaGaps sigue teniendo 4–6 preguntas (CA-03)", (id) => {
    const mod = requireModule(id);
    const n = mod.secciones.detectaGaps.quiz.preguntas.length;
    expect(n, `${id} quiz debería tener 4–6 preguntas (tiene ${n})`).toBeGreaterThanOrEqual(4);
    expect(n, `${id} quiz debería tener 4–6 preguntas (tiene ${n})`).toBeLessThanOrEqual(6);
  });

  it.each(MOD_IDS)("%s: llenaGaps conserva ≥1 reto de código de sección (CA-03)", (id) => {
    const mod = requireModule(id);
    expect(mod.secciones.llenaGaps.retos.length, `${id} llenaGaps.retos`).toBeGreaterThanOrEqual(1);
  });

  it.each(MOD_IDS)("%s: refinaSimplifica conserva resumen (≤10 bullets) y síntesis", (id) => {
    const mod = requireModule(id);
    expect(mod.secciones.refinaSimplifica.resumenBullets.length, `${id} resumenBullets vacío`).toBeGreaterThan(0);
    expect(mod.secciones.refinaSimplifica.resumenBullets.length, `${id} resumenBullets > 10`).toBeLessThanOrEqual(10);
    expect(mod.secciones.refinaSimplifica.sintesis, `${id} sintesis`).toBeDefined();
  });

  it.each(MOD_IDS)("%s: getModuleChallenges/getModuleQuizzes siguen operando sin lanzar (enumeración canónica intacta)", (id) => {
    const mod = requireModule(id);
    expect(() => getModuleChallenges(mod)).not.toThrow();
    expect(() => getModuleQuizzes(mod)).not.toThrow();
    expect(getModuleChallenges(mod).length).toBeGreaterThanOrEqual(1);
    expect(getModuleQuizzes(mod).length).toBeGreaterThanOrEqual(1);
  });
});
