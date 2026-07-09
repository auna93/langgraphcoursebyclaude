import { Link } from "react-router-dom";

import { STRINGS } from "@/app/strings";
import { COURSE_MODULES } from "@/content/registry";
import { moduleStatus } from "@/progress/selectors";
import { useProgressStore } from "@/progress/store";

/**
 * Lista los 16 módulos del curso con título, objetivo y estado de progreso
 * (CA-01), con navegación libre a cualquiera de ellos (CA-04).
 *
 * El estado de cada módulo se calcula con el selector puro `moduleStatus`
 * (C-PROGRESS, S3) a partir del progreso real persistido en el store
 * (integración S1+S3 en M1, CA-01/CA-15).
 */
export function TemarioPage() {
  const modules = useProgressStore((state) => state.modules);

  return (
    <section>
      <h1 className="text-2xl font-bold">{STRINGS.temario.titulo}</h1>
      <p className="mt-2 text-muted-foreground">{STRINGS.temario.descripcion}</p>

      <ol className="mt-6 flex flex-col gap-3">
        {COURSE_MODULES.map((modulo) => {
          const estado = moduleStatus(modulo, modules[modulo.id]);
          return (
            <li key={modulo.id}>
              <Link
                to={`/modulo/${modulo.id}`}
                className="block rounded-md border border-border p-4 hover:bg-accent"
              >
                <div className="flex items-center justify-between gap-4">
                  <h2 className="font-semibold">
                    {String(modulo.numero).padStart(2, "0")}. {modulo.titulo}
                  </h2>
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    {STRINGS.estadoModulo[estado]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{modulo.objetivo}</p>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
