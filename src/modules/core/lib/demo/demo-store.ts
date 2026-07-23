/**
 * Almacén del modo demo: una "base de datos" en localStorage con un pub/sub por
 * tabla que hace las veces de realtime. Lo usa el cliente falso de Supabase
 * (`demo-client.ts`). No accede a `localStorage` en el tope del módulo para no
 * romper el render en servidor; todo pasa por funciones llamadas en el cliente.
 */

export type Row = Record<string, any>;
export type DemoDB = Record<string, Row[]>;

const DB_KEY = 'gdo_demo_db';

/** Listeners por tabla — simulan el canal realtime de Supabase. */
const listeners = new Map<string, Set<() => void>>();

function readDB(): DemoDB {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(DB_KEY) || '{}') as DemoDB;
  } catch {
    return {};
  }
}

function writeDB(db: DemoDB) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DB_KEY, JSON.stringify(db));
}

/** Reemplaza toda la base (se usa al sembrar el demo). */
export function seedDB(db: DemoDB) {
  writeDB(db);
}

/** Borra la base demo por completo. */
export function clearDB() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(DB_KEY);
}

export function getRows(table: string): Row[] {
  return readDB()[table] ?? [];
}

export function setRows(table: string, rows: Row[]) {
  const db = readDB();
  db[table] = rows;
  writeDB(db);
}

/** Notifica a los suscriptores de una tabla que hubo un cambio. */
export function emit(table: string) {
  listeners.get(table)?.forEach((cb) => {
    try {
      cb();
    } catch {
      /* un listener que falla no debe frenar a los demás */
    }
  });
}

/** Suscribe un callback a los cambios de una tabla. Devuelve el desuscriptor. */
export function subscribeTable(table: string, cb: () => void): () => void {
  if (!listeners.has(table)) listeners.set(table, new Set());
  listeners.get(table)!.add(cb);
  return () => {
    listeners.get(table)?.delete(cb);
  };
}

/* ── CRUD que usa el cliente falso ─────────────────────────────────────── */

export function insertRows(table: string, rows: Row[]): Row[] {
  const current = getRows(table);
  const nowIso = new Date().toISOString();
  const withIds = rows.map((r) => {
    // Emula los DEFAULT del esquema: id uuid, createdAt now(). Se copia primero
    // la fila para no pisar el id generado si viene `id: undefined` explícito.
    const row: Row = { ...r };
    if (row.id == null) row.id = cryptoRandomId();
    if (row.createdAt == null) row.createdAt = nowIso;
    return row;
  });
  setRows(table, [...current, ...withIds]);
  emit(table);
  return withIds;
}

export function updateRows(table: string, match: (r: Row) => boolean, patch: Row): Row[] {
  const current = getRows(table);
  const updated: Row[] = [];
  const next = current.map((r) => {
    if (match(r)) {
      const merged = { ...r, ...patch };
      updated.push(merged);
      return merged;
    }
    return r;
  });
  setRows(table, next);
  emit(table);
  return updated;
}

export function deleteRows(table: string, match: (r: Row) => boolean): Row[] {
  const current = getRows(table);
  const removed = current.filter(match);
  setRows(table, current.filter((r) => !match(r)));
  emit(table);
  return removed;
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'demo-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
