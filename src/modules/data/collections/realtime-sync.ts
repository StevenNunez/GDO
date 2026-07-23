import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { toDate } from '@/lib/date-utils';

type WithId = { id: string };

export interface IncrementalSyncOptions<T extends WithId> {
  /**
   * Client-side membership filter (e.g. projectId match or a date window).
   * Rows failing it are excluded — so an UPDATE that moves a row out of scope
   * removes it locally, and an INSERT/UPDATE that doesn't belong is ignored.
   * The realtime channel already filters by tenantId; use this for the rest.
   */
  predicate?: (row: T) => boolean;
  /** Sort order re-applied after every change (keep it identical to the fetch order). */
  compare?: (a: T, b: T) => number;
  /** Max rows to keep after sorting (keep it identical to the fetch `.limit()`). */
  limit?: number;
}

/**
 * Applies a single Supabase realtime change to a local array immutably, instead
 * of re-downloading the whole table. Returns the same array reference when nothing
 * changed so downstream render-tracking can skip re-rendering.
 *
 * DELETE payloads only carry the primary key (`old.id`) under the default replica
 * identity, which is enough to drop the row. Any residual drift from missed events
 * is healed by the full refetch the hooks run on (re)subscribe.
 */
export function applyRealtimeChange<T extends WithId>(
  current: T[],
  payload: RealtimePostgresChangesPayload<T>,
  { predicate = () => true, compare, limit }: IncrementalSyncOptions<T> = {}
): T[] {
  let next: T[];

  if (payload.eventType === 'DELETE') {
    const id = (payload.old as Partial<T>)?.id;
    if (id == null || !current.some(r => r.id === id)) return current;
    next = current.filter(r => r.id !== id);
  } else {
    // INSERT or UPDATE — payload.new holds the full row.
    const row = payload.new as T;
    if (!row || row.id == null) return current;
    const without = current.filter(r => r.id !== row.id);
    if (predicate(row)) {
      next = [...without, row];
    } else if (without.length === current.length) {
      // Row didn't belong and wasn't present — nothing to do, keep the reference.
      return current;
    } else {
      next = without; // an UPDATE moved the row out of scope.
    }
  }

  if (compare) next = [...next].sort(compare);
  if (limit != null && next.length > limit) next = next.slice(0, limit);
  return next;
}

/** Descending comparator by an ISO/Date field, tolerant of string|Date|null. */
export function byDateDesc<T>(field: keyof T) {
  return (a: T, b: T) =>
    (toDate(b[field] as never)?.getTime() ?? 0) - (toDate(a[field] as never)?.getTime() ?? 0);
}
