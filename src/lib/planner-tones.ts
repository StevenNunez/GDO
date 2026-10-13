/**
 * Color con significado para Last Planner (diseño «Torre») — la parte de lógica.
 *
 * Dice QUÉ tono corresponde a cada cosa; las clases CSS que lo pintan están en
 * `src/components/operations/planner-tone-classes.ts` (Tailwind no escanea `src/lib`, así que ahí no
 * pueden vivir clases).
 *
 * Reglas del sistema:
 *  - Verde = hecho · azul = en curso · ámbar = atención / hoy · rojo = atrasado o no cumplido ·
 *    gris = sin empezar.
 *  - Las tipologías (SM2, FV…) usan una paleta categórica aparte, distinta de la de estados, para
 *    que un color de tipología nunca se lea como un estado.
 */

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/**
 * Color de un avance (0 a 1): gris sin empezar, ámbar recién iniciado, azul avanzado, verde terminado.
 * Es la misma escala en el parte diario, el tren y los resúmenes: el mismo porcentaje siempre se ve igual.
 */
export function toneForProgress(avance: number): Tone {
  if (avance >= 0.999) return 'success';
  if (avance >= 0.5) return 'info';
  if (avance > 0) return 'warning';
  return 'neutral';
}

/** Color del PPC semanal: por debajo de 70 % es alarma, hasta 85 % atención, desde ahí va bien. */
export function toneForPpc(ppc: number | null): Tone {
  if (ppc === null) return 'neutral';
  if (ppc < 70) return 'danger';
  if (ppc < 85) return 'warning';
  return 'success';
}

/** Cuántos colores distintos hay antes de repetir. Los tokens `--cat-1…8` viven en globals.css. */
export const CATEGORIAS = 8;

/**
 * Asigna un color (0 a 7) a cada tipología distinta. El orden es alfabético, así que una misma
 * obra siempre pinta cada tipología del mismo color, sin importar el orden en que se cargaron.
 * Las unidades sin tipología no entran: se dibujan neutras.
 */
export function paletaDeTipologias(tipologias: Array<string | null | undefined>): Map<string, number> {
  const distintas = Array.from(new Set(
    tipologias.map((t) => t?.trim()).filter((t): t is string => Boolean(t)),
  )).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  return new Map(distintas.map((t, i) => [t, i % CATEGORIAS]));
}
