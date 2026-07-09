# Política de orquestación — pipeline greenfield

Este proyecto se construye con un pipeline de agentes especializados. Esta política
gobierna QUIÉN actúa, EN QUÉ ORDEN y bajo QUÉ CONDICIÓN de avance (gates). Respétala
al delegar; no saltes fases ni fusiones roles.

## Filosofía de costo

- Modelo caro (`fable`) donde un error se propaga a todo el sistema: **spec**,
  **architect**, **reviewer**. Aquí se piensa despacio y en profundidad.
- Modelo barato/rápido (`sonnet`) donde hay alto volumen de tokens: **implementer**,
  **test-author**, **integrator**.
- Un **reviewer** fuerte es lo que hace viable un implementer barato: la calidad se
  garantiza en la revisión, no encareciendo la implementación.

## Flujo maestro

```
spec ──(gate: PRD aprobado)──► architect ──(gate: contratos cerrados)──►
   por cada slice del DAG (respetando dependencias):
       test-author  +  implementer  ──►  reviewer  ──(loop hasta PASS)──►
   ──► integrator (una vez por milestone, con todos sus slices en PASS)
```

## Gates (condiciones de avance, no opcionales)

1. **Gate PRD**: no se diseña arquitectura hasta que `docs/spec/PRD.md` exista con
   criterios de aceptación medibles y sin ambigüedades bloqueantes. Si hay preguntas
   abiertas que impiden diseñar, se devuelve al humano; no se supone.
2. **Gate contratos**: no se paraleliza ningún slice hasta que sus **contratos** de
   interfaces/APIs estén cerrados en `docs/arch/`. **Contratos antes de paralelizar**,
   siempre. Slices que comparten contrato no arrancan hasta que ese contrato esté fijo.
3. **Gate PASS por slice**: un slice no se integra hasta que el **reviewer** emita
   veredicto PASS explícito, con tests en verde y contratos intactos.
4. **Gate milestone**: el **integrator** solo cierra un milestone cuando todos sus
   slices están en PASS; y el milestone no se da por cerrado con build o e2e en rojo.

## Loop de slice

Por cada slice del DAG de `docs/arch/SLICES.md`, en orden de dependencias:

1. **test-author** escribe los tests desde los criterios de aceptación (deben fallar
   antes de existir el código). Trabaja **independiente** del implementer.
2. **implementer** implementa contra la arquitectura y los contratos hasta poner los
   tests en verde. En el primer slice hace el scaffolding. Si un contrato tiene un
   hueco, lo reporta y NO se desvía.
3. **reviewer** revisa el diff contra PRD + arquitectura + contratos + tests y emite
   PASS/FAIL con findings `archivo:línea` y fix sugerido.
4. Si FAIL → vuelve a **implementer** (o **test-author** si el defecto está en los
   tests) y se repite el loop hasta PASS.

Los slices sin dependencias entre sí pueden avanzar en paralelo **una vez cerrados sus
contratos** (Gate 2).

## Fuente de verdad

- Toda decisión de arquitectura vive en `docs/arch/` (`ARCHITECTURE.md` + `SLICES.md`).
  Ningún otro agente redefine stack, límites de módulos, modelo de datos ni contratos.
- El producto y sus criterios de aceptación viven en `docs/spec/PRD.md`.
- Si durante implementación o integración aparece un hueco de contrato o un fallo de
  diseño, se **devuelve al architect** para actualizar `docs/arch/`; no se parchea en el
  código de forma divergente.

## Reglas transversales

- Un agente = un objetivo. Nadie asume el rol de otro (el implementer no arquitecta; el
  integrator no agrega features; el reviewer no edita).
- Los tests definen "hecho"; no se relajan assertions ni se silencian para pasar gates.
- Alcance mínimo de herramientas por rol: análisis/revisión en read-only; solo los
  agentes que producen código tienen Write/Edit/Bash.
