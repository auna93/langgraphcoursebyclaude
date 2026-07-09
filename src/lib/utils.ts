import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Utilidad estándar de shadcn/ui para combinar clases Tailwind sin colisiones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
