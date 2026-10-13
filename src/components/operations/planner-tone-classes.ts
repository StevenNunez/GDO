/**
 * Clases de color de Last Planner. Viven aquí (y no en `src/lib`) porque Tailwind escanea
 * `src/components` pero no `src/lib`. Van escritas completas, no armadas con plantillas, para que
 * el compilador las detecte. La lógica de qué tono corresponde a qué está en `@/lib/planner-tones`.
 */
import type { Tone } from '@/lib/planner-tones';

export type { Tone };

/** Texto del tono. */
export const toneText: Record<Tone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
  neutral: 'text-muted-foreground',
};

/** Riel de 3 px en el borde izquierdo de un contenedor `relative` (usa `before:`). */
export const toneRail: Record<Tone, string> = {
  success: 'before:bg-success',
  warning: 'before:bg-warning',
  danger: 'before:bg-danger',
  info: 'before:bg-info',
  neutral: 'before:bg-border',
};

/** Relleno sólido de barras y puntos. */
export const toneFill: Record<Tone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-muted-foreground/50',
};

/** Superficie sólida con su texto: botones activos y celdas marcadas. El ámbar es el de la marca. */
export const toneSolid: Record<Tone, string> = {
  success: 'bg-success text-white dark:text-background',
  warning: 'bg-cta text-cta-foreground',
  danger: 'bg-danger text-white dark:text-background',
  info: 'bg-info text-white dark:text-background',
  neutral: 'bg-foreground/80 text-background',
};

/** Borde del tono. */
export const toneBorder: Record<Tone, string> = {
  success: 'border-success',
  warning: 'border-warning',
  danger: 'border-danger',
  info: 'border-info',
  neutral: 'border-border',
};

/** Paleta categórica de tipologías (`--cat-1…8`). El índice sale de `paletaDeTipologias`. */
export const catFill = ['bg-cat-1', 'bg-cat-2', 'bg-cat-3', 'bg-cat-4', 'bg-cat-5', 'bg-cat-6', 'bg-cat-7', 'bg-cat-8'] as const;
export const catText = ['text-cat-1', 'text-cat-2', 'text-cat-3', 'text-cat-4', 'text-cat-5', 'text-cat-6', 'text-cat-7', 'text-cat-8'] as const;
export const catRail = ['before:bg-cat-1', 'before:bg-cat-2', 'before:bg-cat-3', 'before:bg-cat-4', 'before:bg-cat-5', 'before:bg-cat-6', 'before:bg-cat-7', 'before:bg-cat-8'] as const;
