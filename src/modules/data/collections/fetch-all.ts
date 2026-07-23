/** PostgREST corta en 1000 filas por respuesta, así que se pide de a 1000. */
const PAGE_SIZE = 1000;

/** Freno de emergencia: sin esto, una consulta mal armada que devuelva siempre
 *  las mismas filas dejaría el bucle girando para siempre. */
const MAX_PAGES = 200;

/** Lo único que se necesita de la consulta: que se pueda esperar y traiga
 *  `data`/`error`. Se evita el genérico de PostgrestFilterBuilder, que cambia
 *  entre versiones del cliente y obliga a castear en cada llamada. */
type AwaitableQuery = PromiseLike<{ data: unknown[] | null; error: unknown }>;

/**
 * Trae TODAS las filas de una consulta, paginando con `.range()`.
 *
 * Se usa donde la completitud es parte de la corrección: si un `.limit(N)` deja
 * fuera partidas, el presupuesto de la obra sale mal y nadie se entera. No hace
 * falta en colecciones ordenadas por fecha donde solo interesan las últimas N.
 *
 * `buildQuery` recibe el rango y debe devolver la consulta YA ordenada por una
 * columna estable (id sirve): sin orden, paginar puede repetir u omitir filas.
 */
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => AwaitableQuery
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;

  // Se avanza por las filas realmente recibidas y se corta solo con una página
  // vacía. Cortar al ver una página "incompleta" sería frágil: si el servidor
  // topa las filas por debajo de PAGE_SIZE, la primera página ya vendría corta
  // y se perdería el resto en silencio.
  for (let guard = 0; guard < MAX_PAGES; guard++) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    if (rows.length === 0) return all;
    all.push(...rows);
    from += rows.length;
  }

  throw new Error(`fetchAllRows superó ${MAX_PAGES} páginas; ¿la consulta no está ordenada?`);
}
