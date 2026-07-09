import type { CourseModule } from "../types";

/**
 * Módulo 16 — Deployment: langgraph.json y Platform.
 * Contenido completo (slice S15). CONCEPTUAL (NG-06, PRD §6): sin shim de
 * `langgraph_sdk`/deployment real. Bloques de `langgraph.json` y del SDK
 * (`get_sync_client`, `runs.stream`) son SOLO ilustrativos con botón "copiar"
 * (mismo tratamiento que `subgraphs=True` en mod15, ADR-11). La síntesis es un
 * quiz de integración (CA-03): sin reto de código.
 * §12 (ADR-15, SE4): formato enriquecido — CONCEPTUAL (CA-03/CA-31, excepción
 * mod16): sustituye mini-ejercicios por micro-quizzes. Cierra el project
 * spine (mod01–15) con un `langgraph.json` declarativo (ilustrativo, NG-12/13).
 */
export const mod16: CourseModule = {
  id: "mod16",
  numero: 16,
  titulo: "Deployment: langgraph.json y Platform",
  objetivo:
    "Describir la estructura de langgraph.json, y consumir un deployment con " +
    "el SDK (get_sync_client, runs.stream).",
  enriquecido: true,
  secciones: {
    explicaSimple: {
      contenidoMd: `## De "funciona en mi máquina" a "un servicio que otros pueden usar"

Durante todo el curso construiste e invocaste grafos DENTRO de tu propio código
Python. Pero para que otras personas o aplicaciones usen tu grafo sin tener tu código
fuente, necesitas **desplegarlo como un servicio**: algo a lo que se le manda una
petición (por HTTP) y responde, como cualquier API.

**LangGraph Platform** es ese servicio: le describes qué grafos quieres exponer con un
archivo de configuración (\`langgraph.json\`), y la plataforma se encarga de levantar un
servidor que los ejecuta. Desde fuera, un cliente (el **SDK**) le manda peticiones como
"ejecuta el agente X con esta pregunta" y recibe la respuesta, incluso en streaming.

## Este módulo es conceptual

No vas a desplegar nada de verdad en este curso: no hay red externa ni backend propio
(NG-02/NG-06). El objetivo es que sepas **describir** la estructura de
\`langgraph.json\` y **leer/reconocer** el patrón de uso del SDK, para no perderte si en
tu trabajo real necesitas desplegar un grafo.`,
      consignaExplicacion:
        "Explícale a alguien que no programa la diferencia entre 'un programa que corre " +
        "en tu máquina' y 'un servicio desplegado que otros pueden usar mandándole " +
        "peticiones', usando la metáfora de langgraph.json como la 'ficha de registro' " +
        "de qué grafos expone el servicio.",
    },
    detectaGaps: {
      contenidoMd: "Comprueba si entiendes la idea general de deployment (sin necesidad de desplegar nada).",
      quiz: {
        id: "mod16-quiz1",
        titulo: "¿Qué es langgraph.json y el SDK?",
        preguntas: [
          {
            id: "mod16-quiz1-p1",
            kind: "single",
            enunciadoMd: "¿Para qué sirve `langgraph.json`?",
            opciones: [
              "Declara qué grafos/agentes del proyecto se exponen como deployables en LangGraph Platform",
              "Es el archivo donde se define el shim del curso",
              "Contiene el estado persistido de un checkpointer",
              "Reemplaza a `StateGraph` como forma de construir grafos",
            ],
            correcta: 0,
            explicacionMd:
              "`langgraph.json` es configuración de despliegue: qué grafos exponer y cómo " +
              "encontrarlos, no una forma alternativa de construir grafos.",
          },
          {
            id: "mod16-quiz1-p2",
            kind: "boolean",
            enunciadoMd:
              "El SDK (`get_sync_client`) se usa para CONSUMIR un grafo ya desplegado " +
              "desde fuera del proceso donde corre, típicamente por HTTP.",
            correcta: true,
            explicacionMd:
              "Correcto: el SDK es un cliente remoto; no ejecuta el grafo localmente, " +
              "habla con el servicio desplegado.",
          },
          {
            id: "mod16-quiz1-p3",
            kind: "multi",
            enunciadoMd: "¿Qué es cierto sobre este módulo, según las reglas del curso (NG-06)?",
            opciones: [
              "Es conceptual: no se exige desplegar nada de verdad",
              "No hay shim ejecutable de `langgraph_sdk` en el curso",
              "Los ejercicios de este módulo validan un despliegue real contra Ollama",
              "Los bloques de código del SDK son solo ilustrativos, con botón copiar",
            ],
            correctas: [0, 1, 3],
            explicacionMd:
              "El curso es 100% local y sin backend propio (NG-02/06): este módulo enseña " +
              "el concepto y el patrón de uso, sin ejecución real.",
          },
          {
            id: "mod16-quiz1-p4",
            kind: "single",
            enunciadoMd:
              "Combinando lo del módulo 09 y este módulo, ¿cómo se apoya el HITL " +
              "(human-in-the-loop) en un deployment real?",
            opciones: [
              "Igual que localmente: `interrupt(...)` dentro de un nodo, y se reanuda con `Command(resume=...)`",
              "El deployment no soporta HITL en absoluto",
              "Se necesita una API completamente distinta solo para producción",
              "Solo funciona si no hay checkpointer",
            ],
            correcta: 0,
            explicacionMd:
              "El mecanismo de HITL es el mismo `interrupt`/`Command(resume=...)` que ya " +
              "conoces; el deployment no cambia esa semántica, solo el transporte " +
              "(HTTP/SDK en vez de invocación local).",
          },
          {
            id: "mod16-quiz1-p5",
            kind: "boolean",
            enunciadoMd:
              "`client.runs.stream(...)` puede pedir `stream_mode=\"updates\"`, el mismo " +
              "concepto de modos de streaming que ya viste con `graph.stream(...)` local " +
              "(módulos 10-11), solo que ahora la respuesta viaja por red hacia el " +
              "deployment.",
            correcta: true,
            explicacionMd:
              "Correcto: el SDK reutiliza el mismo vocabulario de `stream_mode` que el " +
              "grafo local; lo que cambia es el transporte, no el concepto.",
          },
          {
            id: "mod16-quiz1-p6",
            kind: "single",
            enunciadoMd: "¿Por qué el curso no incluye un reto de código ejecutable de deployment?",
            opciones: [
              "Porque desplegar exige red/infraestructura externa, fuera del alcance 100% local del curso (NG-02/06)",
              "Porque `langgraph.json` no existe realmente",
              "Porque el shim ya lo soporta pero se decidió omitirlo por pereza",
              "Porque el SDK es idéntico al de checkpointing",
            ],
            correcta: 0,
            explicacionMd:
              "El curso corre 100% local sin backend propio (O3/NG-02); un reto de " +
              "deployment real rompería esa garantía, así que el módulo 16 es conceptual.",
          },
        ],
      },
    },
    llenaGaps: {
      contenidoMd: `## SOLO ILUSTRATIVO — langgraph.json

> Este bloque describe el formato real de \`langgraph.json\`. NO se ejecuta ni se
> valida en el curso (NG-06): cópialo como referencia si necesitas desplegar un grafo
> de verdad fuera del entorno del curso.

\`\`\`json
{
  "dependencies": ["."],
  "graphs": {
    "agent": "./my_agent.py:graph"
  },
  "env": ".env"
}
\`\`\`

**Cómo leerlo:** \`graphs\` mapea un NOMBRE público (\`"agent"\`) al objeto grafo
compilado dentro de tu código (\`./my_agent.py:graph\`, el atributo \`graph\` del módulo
\`my_agent.py\`). Ese nombre es el que usará el SDK para invocarlo remotamente.

## SOLO ILUSTRATIVO — SDK: get_sync_client + runs.stream

> Este bloque muestra el patrón de consumo real del SDK. NO se ejecuta ni se valida
> en el curso (sin shim de \`langgraph_sdk\`, mismo tratamiento ilustrativo que el
> streaming namespaced del módulo 15).

\`\`\`python
from langgraph_sdk import get_sync_client

client = get_sync_client(url="your-deployment-url", api_key="your-langsmith-api-key")
for chunk in client.runs.stream(
    None, "agent",  # nombre del agente definido en langgraph.json
    input={"messages": [{"role": "human", "content": "What is LangGraph?"}]},
    stream_mode="updates",
):
    print(chunk.event, chunk.data)
\`\`\`

**Cómo leerlo:** \`get_sync_client(url=...)\` crea un cliente remoto; \`client.runs.stream\`
manda la petición al agente \`"agent"\` (el mismo nombre declarado en \`langgraph.json\`)
y recibe eventos en streaming, con el mismo vocabulario \`stream_mode\` que ya conoces
del grafo local.

**Ideas clave para llevarte, sin necesitar ejecutar nada:**
- \`langgraph.json\` es la "ficha de registro": qué grafos expone el deployment y bajo
  qué nombre.
- El SDK habla por red con el deployment: no ejecuta tu grafo en tu proceso local.
- HITL (\`interrupt\`/\`Command(resume=...)\`) funciona igual en remoto: el mecanismo no
  cambia, solo el transporte.
- Este módulo no tiene reto de código: se evalúa con un quiz de integración que combina
  conceptos de todo el curso (paso 4).`,
      retos: [],
      pasos: [
        {
          id: "mod16-paso1",
          titulo: "Lee la estructura de langgraph.json",
          explicacionMd:
            "Lee el archivo `langgraph.json`: declara qué grafos compilados se exponen y " +
            "bajo qué nombre público.",
          accion: {
            kind: "lectura",
            bloqueMd: `\`\`\`json
{
  "dependencies": ["."],
  "graphs": {
    "agent": "./my_agent.py:graph"
  },
  "env": ".env"
}
\`\`\`
Este fragmento ya está completo: solo léelo, no hace falta ejecutarlo ni completar nada todavía.`,
          },
        },
        {
          id: "mod16-paso2",
          titulo: "Predicción: ¿qué representa la clave graphs?",
          explicacionMd:
            "Antes de ver el SDK, predice qué representa el valor de `\"agent\"` en " +
            "`\"graphs\": {\"agent\": \"./my_agent.py:graph\"}`.",
          accion: {
            kind: "quiz",
            quiz: {
              id: "mod16-paso2-quiz",
              titulo: "¿Qué apunta ./my_agent.py:graph?",
              preguntas: [
                {
                  id: "mod16-paso2-quiz-p1",
                  kind: "single",
                  enunciadoMd: "¿A qué apunta el valor `\"./my_agent.py:graph\"`?",
                  opciones: [
                    "Al atributo `graph` (el grafo YA COMPILADO) dentro del módulo `my_agent.py`",
                    "A una función que hay que llamar para compilar el grafo en cada request",
                    "A un archivo de configuración adicional",
                    "Al nombre de la clase StateGraph usada",
                  ],
                  correcta: 0,
                  explicacionMd:
                    "`langgraph.json` referencia el OBJETO grafo ya compilado (`graph = " +
                    "builder.compile()`), accesible como atributo del módulo indicado.",
                },
              ],
            },
          },
        },
        {
          id: "mod16-paso3",
          titulo: "Lee el patrón de consumo del SDK",
          explicacionMd:
            "Lee cómo un cliente remoto consume el deployment con `get_sync_client` y " +
            "`client.runs.stream`, con el mismo vocabulario `stream_mode` ya conocido.",
          accion: {
            kind: "lectura",
            bloqueMd: `\`\`\`python
from langgraph_sdk import get_sync_client

client = get_sync_client(url="your-deployment-url", api_key="your-langsmith-api-key")
for chunk in client.runs.stream(
    None, "agent",
    input={"messages": [{"role": "human", "content": "What is LangGraph?"}]},
    stream_mode="updates",
):
    print(chunk.event, chunk.data)
\`\`\`
Este fragmento ya está completo: solo léelo, no hace falta ejecutarlo ni completar nada todavía (sin shim de langgraph_sdk, NG-06).`,
          },
        },
        {
          id: "mod16-paso4",
          titulo: "Predicción: ¿el vocabulario de stream_mode cambia en remoto?",
          explicacionMd:
            "Antes de la síntesis, predice si `stream_mode` significa algo distinto " +
            "cuando el grafo corre en un deployment remoto.",
          accion: {
            kind: "quiz",
            quiz: {
              id: "mod16-paso4-quiz",
              titulo: "¿Cambia stream_mode en remoto?",
              preguntas: [
                {
                  id: "mod16-paso4-quiz-p1",
                  kind: "boolean",
                  enunciadoMd:
                    "`client.runs.stream(..., stream_mode=\"updates\")` usa el MISMO " +
                    "concepto de `stream_mode` que `graph.stream(...)` local (módulos " +
                    "10-11): solo cambia el transporte (HTTP/SDK), no el vocabulario.",
                  correcta: true,
                  explicacionMd:
                    "Correcto: el SDK reutiliza el mismo vocabulario de `stream_mode`; el " +
                    "deployment cambia el transporte, no el concepto.",
                },
              ],
            },
          },
        },
        {
          id: "mod16-paso5",
          titulo: "Predicción: ¿sigue funcionando HITL en remoto?",
          explicacionMd:
            "Cierre conceptual: predice si `interrupt(...)`/`Command(resume=...)` " +
            "(módulo 09) siguen funcionando igual cuando el grafo está desplegado.",
          accion: {
            kind: "quiz",
            quiz: {
              id: "mod16-paso5-quiz",
              titulo: "¿HITL funciona igual en un deployment?",
              preguntas: [
                {
                  id: "mod16-paso5-quiz-p1",
                  kind: "single",
                  enunciadoMd:
                    "¿Qué le pasa al mecanismo de `interrupt`/`Command(resume=...)` " +
                    "cuando el grafo se despliega en LangGraph Platform?",
                  opciones: [
                    "Nada: el mecanismo es el mismo, solo cambia el transporte (HTTP/SDK)",
                    "Deja de funcionar: HITL no se soporta en producción",
                    "Necesita una API completamente distinta",
                    "Solo funciona si el grafo no tiene checkpointer",
                  ],
                  correcta: 0,
                  explicacionMd:
                    "El deployment no cambia la semántica de HITL: sigue requiriendo " +
                    "checkpointer + thread_id, solo que la reanudación llega por red.",
                },
              ],
            },
          },
        },
      ],
    },
    refinaSimplifica: {
      resumenBullets: [
        "`langgraph.json` declara qué grafos compilados se exponen como deployables y con qué nombre.",
        "El SDK (`get_sync_client`, `client.runs.stream`) consume un deployment por red, sin ejecutar el grafo localmente.",
        "El vocabulario de `stream_mode` es el mismo en local y en remoto: solo cambia el transporte.",
        "HITL (`interrupt`/`Command(resume=...)`) funciona igual en un deployment real.",
        "Este módulo es conceptual (NG-06): sin shim de `langgraph_sdk`, sin reto de código ejecutable.",
        "La síntesis del curso combina checkpointing, tool calling, multi-agente y subgraphs en un quiz de integración.",
      ],
      sintesis: {
        kind: "quiz",
        quiz: {
          id: "mod16-quiz-sintesis",
          titulo: "Síntesis del curso: de fundamentos a deployment",
          preguntas: [
            {
              id: "mod16-quiz-sintesis-p1",
              kind: "single",
              enunciadoMd:
                "Un grafo con `interrupt(...)` necesita, como mínimo, dos cosas para " +
                "poder pausar y reanudar correctamente. ¿Cuáles?",
              opciones: [
                "Un checkpointer y un thread_id",
                "Un Store y un namespace",
                "ToolNode y create_react_agent",
                "langgraph.json y el SDK",
              ],
              correcta: 0,
              explicacionMd:
                "Sin checkpointer + thread_id no hay dónde guardar el punto de pausa " +
                "(módulo 09) — ese requisito no cambia si el grafo termina desplegado.",
            },
            {
              id: "mod16-quiz-sintesis-p2",
              kind: "single",
              enunciadoMd:
                "¿Qué diferencia principal hay entre el ciclo manual modelo→tool→modelo " +
                "(módulo 12) y `create_react_agent` (módulo 13)?",
              opciones: [
                "Ninguna en el patrón: create_react_agent monta el mismo ciclo con menos código",
                "create_react_agent no puede usar tools",
                "El ciclo manual no soporta FakeChatModel",
                "create_react_agent requiere un Store obligatorio",
              ],
              correcta: 0,
              explicacionMd:
                "`create_react_agent` es una versión ya montada del mismo ciclo ReAct " +
                "(razonar → actuar → observar → repetir).",
            },
            {
              id: "mod16-quiz-sintesis-p3",
              kind: "boolean",
              enunciadoMd:
                "Tanto el patrón supervisor como el swarm/handoffs se construyen con la " +
                "misma API del shim: StateGraph + Command(goto=, update=), sin ninguna " +
                "clase especial de 'multi-agente'.",
              correcta: true,
              explicacionMd:
                "Correcto: no hay API dedicada a multi-agente; es composición de piezas " +
                "ya conocidas (módulo 14).",
            },
            {
              id: "mod16-quiz-sintesis-p4",
              kind: "multi",
              enunciadoMd:
                "¿Qué elementos del curso son SOLO ilustrativos (con botón copiar, sin " +
                "reto ejecutable ni validación)?",
              opciones: [
                "`graph.stream(..., subgraphs=True)` / el prefijo `ns` (módulo 15)",
                "`langgraph.json` y el SDK (`get_sync_client`, `runs.stream`, módulo 16)",
                "`interrupt(...)` / `Command(resume=...)` (módulo 09)",
                "`ToolNode` (módulo 12)",
              ],
              correctas: [0, 1],
              explicacionMd:
                "`subgraphs=True`/`ns` (módulo 15) y el SDK de deployment (módulo 16) son " +
                "los dos bloques ilustrativos del curso; el resto de la superficie usada " +
                "(interrupt/Command, ToolNode, etc.) es ejecutable y validada.",
            },
            {
              id: "mod16-quiz-sintesis-p5",
              kind: "single",
              enunciadoMd:
                "¿Qué SIGUE siendo cierto para un subgraph-como-nodo (módulo 15) dentro " +
                "de un grafo que se despliega en LangGraph Platform?",
              opciones: [
                "Debe compartir al menos una clave de estado con el grafo padre para comunicarse",
                "Deja de necesitar `add_node` para registrarse",
                "Ya no puede tener claves privadas",
                "Se convierte automáticamente en una llamada al SDK",
              ],
              correcta: 0,
              explicacionMd:
                "El deployment no cambia la semántica de composición de grafos: el " +
                "requisito de clave compartida sigue siendo el mismo.",
            },
          ],
        },
      },
    },
  },
  usaLaIa: [
    {
      id: "mod16-ia1",
      titulo: "Usa la IA para preparar un despliegue (sin desplegar nada en este curso)",
      promptsSugeridos: [
        "Tengo un proyecto LangGraph con esta estructura de carpetas (pego mi árbol de " +
          "`src/`). ¿Cómo escribo un `langgraph.json` que exponga mi `graph` de " +
          "`src/graph.py`?",
        "Explícame con un ejemplo distinto al del curso qué necesito revisar antes de " +
          "desplegar un grafo con HITL (interrupt/Command) en LangGraph Platform.",
      ],
      comoVerificar: [
        "¿La respuesta usa el formato EXACTO de `langgraph.json` (claves `dependencies`, " +
          "`graphs`, `env`), sin inventar claves nuevas?",
        "¿La IA aclara que el SDK (`get_sync_client`/`runs.stream`) es SOLO ilustrativo " +
          "en este curso (sin red, NG-02/06), y no algo que la app ejecute?",
        "¿Distingue con claridad `langgraph.json` (config de despliegue) de " +
          "`StateGraph`/`compile()` (construcción del grafo, sin relación con el deploy)?",
      ],
      comoIterar:
        "Si la respuesta mezcla conceptos de construcción del grafo con los de " +
        "despliegue, pide específicamente que separe 'qué construye el grafo' de 'qué " +
        "lo expone como servicio', en vez de pedir todo el flujo reescrito.",
      queNoDelegar: [
        "No le pidas que 'despliegue tu proyecto de verdad': este módulo es conceptual " +
          "(NG-02/06); no ejecutes comandos de despliegue reales fuera de tu propio " +
          "criterio y responsabilidad.",
        "No copies una respuesta que use `langgraph_sdk` esperando que la app lo " +
          "ejecute: no hay shim de `langgraph_sdk` en el curso (ADR-11/NG-06).",
      ],
    },
  ],
  tutorialLocal: {
    introMd:
      "Este es el CIERRE del project spine: el proyecto que empezó como scaffolding en " +
      "el módulo 01 (venv + `src/state.py`/`graph.py`/`main.py`) ya tiene checkpointing, " +
      "memoria compartida, HITL, streaming, tool calling, ReAct, multi-agente y " +
      "subgraphs. Este tramo añade el archivo declarativo (`langgraph.json`) que lo " +
      "dejaría listo para desplegarse — SOLO como referencia, sin ejecutar ningún " +
      "despliegue real (NG-02/06/12/13).",
    setup: [
      {
        titulo: "(Opcional, fuera del curso) Instala el CLI de LangGraph para Studio local",
        descripcionMd:
          "Requiere red y no se ejecuta como parte del curso (NG-02/06): solo para " +
          "quien quiera explorar el despliegue real fuera del entorno del curso.",
        powershell: 'pip install "langgraph-cli[inmem]"',
        bash: 'pip install "langgraph-cli[inmem]"',
      },
      {
        titulo: "Revisa el proyecto terminado",
        descripcionMd: "El proyecto sigue ejecutándose igual que en los módulos anteriores.",
        powershell: "python src\\main.py",
        bash: "python src/main.py",
      },
    ],
    codigo: [
      {
        archivo: "langgraph.json",
        descripcionMd:
          "Declara el grafo del proyecto (`src/graph.py:graph`) como deployable bajo el " +
          "nombre `\"asistente\"`. Archivo puramente declarativo: no lo ejecuta ni lo " +
          "valida el curso (NG-06/NG-12).",
        codigo: `{
  "dependencies": ["."],
  "graphs": {
    "asistente": "./src/graph.py:graph"
  },
  "env": ".env"
}
`,
      },
      {
        archivo: "consumir_deployment.py (referencia, NO ejecutable en el curso)",
        descripcionMd:
          "SOLO ILUSTRATIVO (ADR-11/NG-06): así se consumiría el proyecto YA DESPLEGADO " +
          "(con el `langgraph.json` de arriba) desde otro proceso, usando el SDK. No hay " +
          "shim de `langgraph_sdk` en el curso: esto es referencia para fuera del entorno.",
        codigo: `from langgraph_sdk import get_sync_client

client = get_sync_client(url="your-deployment-url", api_key="your-langsmith-api-key")
for chunk in client.runs.stream(
    None, "asistente",
    input={"nombre": "Ana"},
    stream_mode="updates",
):
    print(chunk.event, chunk.data)
`,
      },
    ],
    salidaEsperada:
      "Hasta luego, Ana\n(langgraph.json es un archivo de configuración: no produce " +
      "salida por sí mismo — describe cómo desplegar el proyecto terminado)",
    spine: {
      crea: ["langgraph.json"],
      modifica: [],
    },
  },
};
