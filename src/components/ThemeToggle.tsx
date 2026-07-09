import { STRINGS } from "@/app/strings";
import { useTheme } from "@/app/useTheme";
import { Button } from "@/components/ui/button";

/**
 * Botón para alternar el tema claro/oscuro. Se monta en la esquina superior
 * derecha del header (`Layout`). Iconos SVG inline (sin dependencias externas,
 * compatible con el requisito de cero red externa).
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const label = isDark
    ? STRINGS.tema.cambiarAClaro
    : STRINGS.tema.cambiarAOscuro;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      aria-pressed={isDark}
      className="h-9 w-9 px-0"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
      <span className="sr-only">{label}</span>
    </Button>
  );
}

function MoonIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}
