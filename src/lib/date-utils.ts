/**
 * Converts any date-like value (ISO string, Date object, number) to a Date.
 * Returns null for null/undefined/invalid values.
 * Supabase returns dates as ISO 8601 strings — this is the single entry point for conversion.
 */
export function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/* ── Días calendario ──────────────────────────────────────────────────────
 *
 * Fechas contractuales (inicio de obra, vencimiento de una boleta, plazo de
 * respuesta de una RDI) son DÍAS, no instantes: en la base son columnas DATE.
 * Sumarles milisegundos rompe cuando el intervalo cruza el cambio de horario
 * chileno (abril y septiembre): la fecha se corre una hora y puede saltar de
 * día, o sea plazos y multas equivocados.
 *
 * Todo se normaliza a **medianoche local** y se opera con aritmética de
 * calendario, que el motor de JS ajusta solo ante el horario de verano.
 * Medianoche local y no UTC porque estas fechas se muestran en pantalla: en
 * Chile (UTC−4) una medianoche UTC se vería como el día anterior.
 */

const MS_DIA = 86_400_000;
const SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Lleva un valor al día calendario que representa, a medianoche local.
 *
 * Un string `YYYY-MM-DD` (lo que devuelve Supabase para una columna DATE) se
 * lee literal de sus dígitos, sin pasar por UTC. Un objeto `Date` —típicamente
 * de un selector de fecha— se lee por sus campos locales, que es el día que el
 * usuario eligió.
 */
export function toCalendarDay(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;

  if (typeof value === 'string') {
    const m = SOLO_FECHA.exec(value);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  }

  const d = toDate(value);
  if (!d) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Suma días calendario. El desborde de mes/año lo normaliza el propio `Date`. */
export function addCalendarDays(day: Date, days: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + days);
}

/**
 * Diferencia en días calendario entre dos medianoches locales. El `round`
 * absorbe la hora que sobra o falta cuando el intervalo cruza un cambio de hora.
 */
export function diffCalendarDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / MS_DIA);
}

/**
 * Formats a date value for display in Spanish (Chile locale).
 * Returns 'N/A' for null/invalid values.
 */
export function formatDate(
  value: Date | string | number | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = toDate(value);
  if (!d) return 'N/A';
  return d.toLocaleDateString('es-CL', options);
}

/**
 * Fecha con hora, para lo que se firma o se sella: en un documento aprobado,
 * el día sin la hora no alcanza para ordenar quién firmó antes que quién.
 */
export function formatDateTime(
  value: Date | string | number | null | undefined
): string {
  const d = toDate(value);
  if (!d) return 'N/A';
  return d.toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
