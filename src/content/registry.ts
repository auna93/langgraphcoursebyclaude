import type { CourseModule, ModuleId } from "./types";
import { mod01 } from "./modules/mod01";
import { mod02 } from "./modules/mod02";
import { mod03 } from "./modules/mod03";
import { mod04 } from "./modules/mod04";
import { mod05 } from "./modules/mod05";
import { mod06 } from "./modules/mod06";
import { mod07 } from "./modules/mod07";
import { mod08 } from "./modules/mod08";
import { mod09 } from "./modules/mod09";
import { mod10 } from "./modules/mod10";
import { mod11 } from "./modules/mod11";
import { mod12 } from "./modules/mod12";
import { mod13 } from "./modules/mod13";
import { mod14 } from "./modules/mod14";
import { mod15 } from "./modules/mod15";
import { mod16 } from "./modules/mod16";

/**
 * Registry del curso (contrato C-CONTENT, ARCHITECTURE.md §4).
 *
 * mod01–mod16: contenido completo (PRD §5.1 + grounding base + avanzado).
 * mod01–02 slice S1, mod03–06 slice S13, mod07–11 slice S14 (superficie
 * AVANZADA del shim: checkpointing, Store, HITL, streaming I/II), mod12–16
 * slice S15 (tool calling, ReAct, multi-agente, subgraphs, deployment). Cierre
 * de M3: 16/16 módulos sin `enConstruccion` (ADR-09). `content/` es dato puro:
 * no importa React ni el resto de la app.
 */

export const COURSE_MODULES: readonly CourseModule[] = [
  mod01,
  mod02,
  mod03,
  mod04,
  mod05,
  mod06,
  mod07,
  mod08,
  mod09,
  mod10,
  mod11,
  mod12,
  mod13,
  mod14,
  mod15,
  mod16,
];

export function getModule(id: ModuleId): CourseModule | undefined {
  return COURSE_MODULES.find((m) => m.id === id);
}
