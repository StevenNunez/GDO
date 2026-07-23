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
