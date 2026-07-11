# Smoke manual M5 — Fallback WebGPU/WebLLM con GPU real + Ollama real

> Exigido por `docs/arch/SLICES.md` ("Cierre M5 (integrator)") y
> `docs/arch/ARCHITECTURE-M5-WEBLLM.md` §9.10, riesgo R17: *"E2e con
> GPU/descarga real inviable en CI ⇒ mitigación: unit/e2e con cliente fake
> determinista; smoke manual documentado contra GPU real (igual que el smoke
> de Ollama real en M2)"*. Los e2e automatizados (`e2e/webgpu-fallback.spec.ts`,
> `e2e/webgpu/webgpu-fallback-flow.spec.ts`, `e2e/webgpu/webgpu-fallback-disabled.spec.ts`)
> cubren toda la máquina de estados y el wiring con `navigator.gpu` falseado y
> el cliente `WebLlmClient` sustituido por un doble — **nunca** ejercitan una
> GPU real, una descarga real de los ~950 MB–1.6 GB del modelo, ni la calidad
> real de inferencia. Este documento es el procedimiento que un humano debe
> seguir para cerrar esa brecha antes de considerar M5 validado en producción.
>
> No lo ejecuta el integrator (no hay GPU real disponible en el entorno de
> integración) — queda como pendiente de validación manual, documentado aquí
> para que el humano (o el pipeline de release) lo corra antes de desplegar.

## 1. Prerrequisitos

- Navegador con WebGPU habilitado y una GPU real utilizable (~2 GB de VRAM
  libres): Chrome/Edge ≥113 en Windows/macOS/Linux con drivers de GPU
  actualizados, o Chrome en un equipo con GPU dedicada. Verificar antes de
  empezar: `chrome://gpu` → "WebGPU" debe figurar como "Hardware accelerated".
- [Ollama](https://ollama.com) instalado localmente, con el modelo primario
  disponible: `ollama pull qwen2.5-coder:14b`.
- Conexión a internet capaz de descargar ~950 MB (modelo default
  `Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC`, `CONFIG.webllm.modelSizeMb`) desde
  `huggingface.co` y `raw.githubusercontent.com` (verificar que ningún proxy o
  firewall corporativo bloquee esos dos hosts; si los bloquea, es una
  incompatibilidad ambiental a reportar, no un defecto de M5).
- Node/npm ya instalados (`npm install` corrido en la raíz del repo).
- Antes de empezar: `npm run build && npm run preview` (puerto 4173 por
  defecto) — smoke contra el BUILD de producción, no contra `vite dev`.

## 2. Estado inicial — fallback deshabilitado, Ollama con el modelo pulled

1. Con `ollama serve` corriendo y el modelo `qwen2.5-coder:14b` instalado,
   abrir la app (`http://localhost:4173`).
2. Confirmar el indicador del sidebar ("Asistente") muestra **"Conectado"**
   (CA-18, sin cambios de M5).
3. Enviar una pregunta cualquiera y confirmar que responde vía Ollama con
   streaming normal (CA-21).

## 3. Degradación → oferta → descarga real (CA-40b, CA-42, A-13)

1. Detener Ollama: `Ctrl+C` en la terminal donde corre `ollama serve` (o
   cerrar el proceso). Confirmar en `curl http://localhost:11434` que ya no
   responde.
2. En ≤5 s el indicador debe pasar a **"Sin conexión"** y, en ≤3 s adicionales
   (CA-40), debe aparecer la card **"Asistente de respaldo (WebGPU)"** con la
   descripción del modelo y el tamaño estimado (p. ej. "~950 MB").
3. Abrir las DevTools → pestaña **Network**, filtrar por `huggingface` /
   `githubusercontent`. Confirmar que hasta este punto hay **0 requests** a
   esos hosts (CA-40/41/47).
4. Pulsar **"Descargar y activar"**. Confirmar:
   - Aparece una barra de progreso con porcentaje creciente (CA-42).
   - En la pestaña Network aparecen peticiones **GET** (sin body) hacia
     `huggingface.co` y/o `raw.githubusercontent.com`, y **solo** esos dos
     hosts (ninguna otra petición externa, CA-47).
   - Mientras descarga, la app sigue interactiva: navegar a otro módulo del
     temario y responder una pregunta del quiz sin que la UI se congele
     (CA-42).
5. **Cancelar** la descarga a mitad de camino (botón "Cancelar"). Confirmar
   que la UI vuelve a "Descarga cancelada..." en ≤2 s (cronometrar con reloj)
   y que el indicador principal sigue en "Sin conexión" con el comando
   `ollama serve` visible (CA-43, terminal CA-19 sigue intacto por debajo).
6. Pulsar **"Descargar y activar"** de nuevo y dejar completar la descarga
   esta vez (puede tardar desde segundos hasta varios minutos según la
   conexión). Confirmar que:
   - El progreso llega a 100 % y el indicador cambia a **"Respaldo WebGPU
     activo"** (CA-45), con el comando `ollama serve` aún visible debajo (guía
     de retorno, §9.8).
   - En el hilo del chat aparece un aviso en español que nombra "WebGPU"
     (CA-45).

## 4. Chat real vía WebGPU (CA-44, A-16)

1. Con el motor WebGPU activo, entrar a un módulo del curso (p. ej. mod01) y
   hacer una pregunta relacionada con su contenido.
2. Confirmar:
   - El primer token aparece en ≤10 s (CA-21/44) y el texto se renderiza de
     forma incremental (no todo de golpe).
   - La respuesta razona sobre el contexto del curso (evidencia informal de
     que el RAG/módulo llegaron al prompt — CA-23/24 vía WebGPU).
   - Se puede pulsar **"Detener"** a mitad de respuesta y el texto parcial
     queda visible, cortando en ≤2 s (CA-22).
3. Ir a la sección "Explica simple" de un módulo, escribir/guardar una
   explicación ≥200 caracteres y pulsar **"Pedir feedback"**. Confirmar que la
   respuesta llega igual que en el paso anterior, vía WebGPU (CA-27/CA-44).
4. Anotar de forma cualitativa la latencia y la calidad de la respuesta (se
   acepta menor calidad que qwen 14B, SU-09 — esto NO es un defecto).

## 5. Recuperación automática de Ollama (CA-46, A-14)

1. Con el motor WebGPU respondiendo, iniciar `ollama serve` de nuevo (y
   confirmar que el modelo `qwen2.5-coder:14b` sigue instalado).
2. Sin recargar la página, en ≤15 s (intervalo de health-check por defecto,
   `VITE_OLLAMA_HEALTH_INTERVAL_MS`) el indicador debe volver a **"Conectado"**
   y aparecer un aviso en el hilo del chat que nombra "Ollama" (CA-45/46).
3. Enviar un nuevo mensaje y confirmar en la pestaña Network que la petición
   va contra `/ollama/api/chat` (proxy hacia `localhost:11434`), no contra el
   motor WebGPU.
4. Repetir el punto 1 pero esta vez volver a detener Ollama **mientras el
   modelo WebGPU está generando una respuesta** (enviar una pregunta,
   detener/arrancar Ollama a mitad de generación) y confirmar que la
   generación en curso NO se corta por la conmutación (CA-46: "ninguna
   generación en curso se interrumpe").

## 6. Sesión futura — cacheado (A-13, CA-40a)

1. Recargar la página completa (F5) con Ollama detenido de nuevo.
2. Confirmar que esta vez el fallback se activa **automáticamente, sin
   mostrar la oferta ni pedir confirmación** (el modelo ya está en la caché
   del navegador) y que, en la pestaña Network, **0 requests** llegan a
   `huggingface.co`/`raw.githubusercontent.com` durante toda la sesión
   (CA-40a/CA-47 "modelo ya cacheado").

## 7. Resultado

Registrar en la PR/ticket de release:

- Navegador + SO + GPU usados, y si `chrome://gpu` reportaba aceleración de
  WebGPU antes de empezar.
- Tamaño real descargado y tiempo aproximado de la primera descarga.
- Cualquier desviación de los pasos 1–6 (con capturas de pantalla/DevTools si
  es posible) — un fallo aquí que no reproduzca en los e2e automatizados es un
  **finding de integración con GPU real** para reportar al architect (si es un
  problema de diseño/contrato) o al reviewer/implementer del slice
  correspondiente (si es un defecto puntual), no algo que el integrator deba
  parchear directamente.
