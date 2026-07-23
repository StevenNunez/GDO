/**
 * Cliente Supabase FALSO para el modo demo. Implementa el subconjunto de la API
 * que la app realmente usa (query builder encadenable y *thenable*, auth,
 * canales realtime y rpc), respaldado por el store en localStorage. Se enchufa
 * en `getSupabaseBrowserClient()` cuando el modo demo está activo, así los ~27
 * hooks de colección, las mutaciones y el AuthProvider funcionan sin cambios.
 */
import { getRows, insertRows, updateRows, deleteRows, subscribeTable } from './demo-store';
import { runDemoRpc } from './demo-rpc';
import { DEMO_USER_ID, DEMO_EMAIL } from './demo-seed';
import { endDemo } from './demo-config';

type Result = { data: any; error: any };
type Row = Record<string, any>;

function cmp(a: any, b: any): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/** Query builder que imita a PostgREST lo justo para esta app. Es *thenable*:
 *  `await sb.from('x').select().eq(...)` resuelve `{ data, error }`. */
class DemoQuery implements PromiseLike<Result> {
  private mode: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: any = null;
  private returning = false;
  private preds: Array<(r: Row) => boolean> = [];
  private orders: Array<{ col: string; asc: boolean }> = [];
  private rFrom?: number;
  private rTo?: number;
  private rLimit?: number;
  private one: false | 'single' | 'maybe' = false;

  constructor(private table: string) {}

  select(_cols?: string) {
    if (this.mode !== 'select') this.returning = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.mode = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: Row) {
    this.mode = 'update';
    this.payload = patch;
    return this;
  }
  upsert(rows: Row | Row[]) {
    this.mode = 'upsert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  delete() {
    this.mode = 'delete';
    return this;
  }

  eq(c: string, v: any) { this.preds.push((r) => r[c] === v); return this; }
  neq(c: string, v: any) { this.preds.push((r) => r[c] !== v); return this; }
  in(c: string, vs: any[]) { this.preds.push((r) => vs.includes(r[c])); return this; }
  is(c: string, v: any) { this.preds.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
  gte(c: string, v: any) { this.preds.push((r) => r[c] >= v); return this; }
  lte(c: string, v: any) { this.preds.push((r) => r[c] <= v); return this; }
  gt(c: string, v: any) { this.preds.push((r) => r[c] > v); return this; }
  lt(c: string, v: any) { this.preds.push((r) => r[c] < v); return this; }
  filter(c: string, op: string, v: any) {
    const map: Record<string, (c: string, v: any) => this> = {
      eq: this.eq, neq: this.neq, gte: this.gte, lte: this.lte, gt: this.gt, lt: this.lt,
    };
    return (map[op] ?? (() => this)).call(this, c, v);
  }
  order(c: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col: c, asc: opts?.ascending !== false });
    return this;
  }
  range(from: number, to: number) { this.rFrom = from; this.rTo = to; return this; }
  limit(n: number) { this.rLimit = n; return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }

  private matches(r: Row) { return this.preds.every((p) => p(r)); }

  private exec(): Result {
    try {
      if (this.mode === 'insert') {
        const inserted = insertRows(this.table, this.payload);
        return this.shape(this.returning ? inserted : null);
      }
      if (this.mode === 'upsert') {
        const out: Row[] = [];
        (this.payload as Row[]).forEach((row) => {
          const exists = row.id && getRows(this.table).some((r) => r.id === row.id);
          if (exists) out.push(...updateRows(this.table, (r) => r.id === row.id, row));
          else out.push(...insertRows(this.table, [row]));
        });
        return this.shape(this.returning ? out : null);
      }
      if (this.mode === 'update') {
        const updated = updateRows(this.table, (r) => this.matches(r), this.payload);
        return this.shape(this.returning ? updated : null);
      }
      if (this.mode === 'delete') {
        deleteRows(this.table, (r) => this.matches(r));
        return this.shape(null);
      }
      // select
      let rows = getRows(this.table).filter((r) => this.matches(r));
      if (this.orders.length) {
        rows = [...rows].sort((a, b) => {
          for (const o of this.orders) {
            const c = cmp(a[o.col], b[o.col]) * (o.asc ? 1 : -1);
            if (c !== 0) return c;
          }
          return 0;
        });
      }
      if (this.rFrom !== undefined && this.rTo !== undefined) rows = rows.slice(this.rFrom, this.rTo + 1);
      if (this.rLimit !== undefined) rows = rows.slice(0, this.rLimit);
      return this.shape(rows);
    } catch (e: any) {
      return { data: this.one ? null : [], error: { message: e?.message || 'Error demo' } };
    }
  }

  private shape(rows: Row[] | null): Result {
    if (this.one) return { data: rows && rows.length ? rows[0] : null, error: null };
    return { data: rows, error: null };
  }

  then<TR1 = Result, TR2 = never>(
    onF?: ((v: Result) => TR1 | PromiseLike<TR1>) | null,
    onR?: ((reason: any) => TR2 | PromiseLike<TR2>) | null,
  ): PromiseLike<TR1 | TR2> {
    return Promise.resolve(this.exec()).then(onF, onR);
  }
}

function demoUser() {
  return {
    id: DEMO_USER_ID,
    email: DEMO_EMAIL,
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date(0).toISOString(),
  };
}

function demoSession() {
  return {
    access_token: 'demo-token',
    refresh_token: 'demo-refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: demoUser(),
  };
}

function makeChannel(_name: string) {
  const unsubs: Array<() => void> = [];
  const chan: any = {
    on(_event: string, opts: any, cb: (payload: any) => void) {
      const table = opts?.table;
      if (table) unsubs.push(subscribeTable(table, () => cb({ eventType: '*' })));
      return chan;
    },
    subscribe(cb?: (status: string) => void) {
      cb?.('SUBSCRIBED');
      return chan;
    },
    _teardown() {
      unsubs.forEach((u) => u());
      unsubs.length = 0;
    },
  };
  return chan;
}

/** Crea una instancia del cliente demo (duck-typed al cliente real). */
export function createDemoClient() {
  const auth = {
    async getSession() {
      return { data: { session: demoSession() }, error: null };
    },
    async getUser() {
      return { data: { user: demoUser() }, error: null };
    },
    async signInWithPassword() {
      return { data: { session: demoSession(), user: demoUser() }, error: null };
    },
    async signOut() {
      endDemo();
      return { error: null };
    },
    onAuthStateChange() {
      return { data: { subscription: { unsubscribe() {} } } };
    },
    async updateUser(attrs: any) {
      if (attrs?.email) updateRows('users', (u) => u.id === DEMO_USER_ID, { email: attrs.email });
      return { data: { user: demoUser() }, error: null };
    },
    async resetPasswordForEmail() {
      return { data: {}, error: null };
    },
  };

  return {
    from: (table: string) => new DemoQuery(table),
    rpc: async (name: string, args?: Record<string, any>) => runDemoRpc(name, args ?? {}),
    channel: (name: string) => makeChannel(name),
    removeChannel: (chan: any) => chan?._teardown?.(),
    auth,
  };
}
