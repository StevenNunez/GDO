/**
 * Logs a Supabase collection fetch error, but only when it carries real detail
 * (message / code / details). An empty error object (`{}`) is almost always an
 * aborted request (dev HMR / fast navigation) — benign — so it is ignored to keep
 * the console clean while still surfacing genuine Postgres/RLS errors.
 */
export function logCollectionError(tag: string, error: unknown): void {
  const e = error as { message?: string; code?: string; details?: string } | null;
  const detail = e?.message || e?.code || e?.details;
  if (detail) console.error(`${tag}:`, detail);
}
