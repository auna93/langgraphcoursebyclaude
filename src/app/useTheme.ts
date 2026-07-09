import { useCallback, useEffect, useState } from "react";

/**
 * Tema claro/oscuro con persistencia local y sin peticiones externas.
 *
 * - Fuente de verdad de persistencia: `localStorage` clave `lgcourse.theme`.
 * - El script inline de `index.html` aplica la clase `.dark` ANTES de pintar
 *   (sin parpadeo); este hook la mantiene sincronizada tras interacciones.
 * - Sin localStorage disponible (modo privado/quota): degrada a claro sin romper.
 */
export type Theme = "light" | "dark";

const STORAGE_KEY = "lgcourse.theme";

function getInitialTheme(): Theme {
  // El script de index.html ya decidió el tema inicial: reutiliza esa decisión.
  if (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  ) {
    return "dark";
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      return "dark";
    }
  } catch {
    // localStorage inaccesible: usa claro por defecto.
  }
  return "light";
}

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignora si localStorage no está disponible: el tema sigue aplicado en memoria.
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggleTheme };
}
