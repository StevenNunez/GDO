/**
 * Unidades de obra: las columnas de la matriz del tren de actividades.
 *
 * Lógica pura, sin React ni acceso a datos, para poder cubrirla con tests
 * (`work-units.test.ts`).
 *
 * EL PROBLEMA QUE RESUELVE ESTE ARCHIVO
 *   Un edificio de 16 pisos con 15 deptos son 240 unidades. Cargarlas a mano
 *   es media jornada y garantiza errores de tipeo justo en el dato con que
 *   después se identifica todo el avance. Acá hay dos caminos para cargarlas
 *   de golpe: generarlas por patrón, o pegar la fila del Excel que la obra ya
 *   tiene.
 *
 * POR QUÉ EL ORDEN ES UN NÚMERO EXPLÍCITO Y NO EL ALFABÉTICO
 *   El orden de las columnas es el RECORRIDO de la cuadrilla, y no coincide
 *   con el orden numérico. En el programa de Los Fundadores el piso 1 va 112,
 *   113, 114, 111, 110, 115, 108, 101… porque así se recorre el pasillo. Si la
 *   pantalla ordenara sola por nombre, el tren mostraría un avance que no es
 *   el que ocurre en terreno.
 */

import type { WorkUnit } from '@/modules/core/lib/data';

/** Una unidad recién generada, todavía sin id ni obra: lo que se va a insertar. */
export interface UnidadNueva {
  name: string;
  groupName: string | null;
  typology: string | null;
  area: number | null;
  sortOrder: number;
}

/* ── Generador por patrón ─────────────────────────────────────────────── */

export type FormatoUnidad = 'piso-numero' | 'correlativo' | 'letra';

export interface OpcionesGenerador {
  /** Cómo se llama el grupo: "PISO", "TORRE", "FRENTE". */
  grupoEtiqueta: string;
  grupoDesde: number;
  grupoHasta: number;
  /** Cuántas unidades numeradas tiene cada grupo. */
  unidadesPorGrupo: number;
  formato: FormatoUnidad;
  /** Desde qué número parte la numeración dentro del grupo. */
  desdeNumero?: number;
  /** Unidades que se repiten en cada grupo sin numerar: "PASILLO", "ESCALA". */
  extras?: string[];
}

const ABECEDARIO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Nombre de una unidad según el formato elegido.
 *
 * `piso-numero` es el de los edificios chilenos: el 12 del piso 3 es el 312, y
 * el del piso 16 es el 1612. El relleno a dos dígitos es lo que hace que 101 y
 * 110 ordenen bien como texto.
 */
function nombreDeUnidad(
  formato: FormatoUnidad,
  grupo: number,
  numero: number,
  correlativo: number,
): string {
  if (formato === 'correlativo') return String(correlativo);
  if (formato === 'letra') {
    // Más allá de la Z se sigue con AA, AB… en vez de romperse.
    const i = numero - 1;
    const letra = i < 26
      ? ABECEDARIO[i]
      : ABECEDARIO[Math.floor(i / 26) - 1] + ABECEDARIO[i % 26];
    return `${grupo}-${letra}`;
  }
  return `${grupo}${String(numero).padStart(2, '0')}`;
}

/**
 * Genera las unidades de una obra a partir de un patrón.
 *
 * Devuelve lista vacía ante un rango imposible (hasta < desde, cero unidades)
 * en vez de lanzar: la pantalla previsualiza mientras el usuario todavía está
 * escribiendo los números, y un error a medio tipear no ayuda a nadie.
 */
export function generarUnidades(opciones: OpcionesGenerador): UnidadNueva[] {
  const {
    grupoEtiqueta, grupoDesde, grupoHasta, unidadesPorGrupo,
    formato, desdeNumero = 1, extras = [],
  } = opciones;

  if (!Number.isFinite(grupoDesde) || !Number.isFinite(grupoHasta)) return [];
  if (grupoHasta < grupoDesde) return [];
  if (unidadesPorGrupo < 0) return [];

  const unidades: UnidadNueva[] = [];
  let orden = 0;
  let correlativo = desdeNumero;

  for (let grupo = grupoDesde; grupo <= grupoHasta; grupo++) {
    const groupName = grupoEtiqueta.trim()
      ? `${grupoEtiqueta.trim().toUpperCase()} ${grupo}`
      : String(grupo);

    for (let i = 0; i < unidadesPorGrupo; i++) {
      unidades.push({
        name: nombreDeUnidad(formato, grupo, desdeNumero + i, correlativo),
        groupName,
        typology: null,
        area: null,
        sortOrder: orden++,
      });
      correlativo++;
    }

    // Los extras van al final de su grupo: el pasillo se termina cuando ya se
    // hicieron los deptos que dan a él.
    for (const extra of extras) {
      const limpio = extra.trim();
      if (!limpio) continue;
      unidades.push({
        name: limpio.toUpperCase(),
        groupName,
        typology: null,
        area: null,
        sortOrder: orden++,
      });
    }
  }

  return unidades;
}

/* ── Pegar desde Excel ────────────────────────────────────────────────── */

/**
 * Interpreta lo que se pegó desde una planilla.
 *
 * Formato por línea, separado por tabulaciones (lo que produce copiar celdas
 * de Excel): `nombre · grupo · tipología · superficie`. Solo el nombre es
 * obligatorio; las columnas que falten quedan vacías.
 *
 * Se aceptan también `;` y `|` como separadores para el que arma la lista a
 * mano. La coma NO separa: en Chile es el separador decimal de la superficie y
 * partiría "42,5" en dos columnas.
 *
 * Las líneas en blanco se descartan y los duplicados —mismo nombre en el mismo
 * grupo— se quedan con el primero: pegar dos veces la misma columna no puede
 * terminar en una obra con el depto 312 repetido.
 */
export function parsearUnidadesPegadas(texto: string): UnidadNueva[] {
  if (!texto?.trim()) return [];

  const unidades: UnidadNueva[] = [];
  const vistos = new Set<string>();
  let orden = 0;

  for (const linea of texto.split(/\r?\n/)) {
    if (!linea.trim()) continue;

    const campos = linea.split(/[\t;|]/).map((c) => c.trim());
    const name = campos[0];
    if (!name) continue;

    const groupName = campos[1] ? campos[1].toUpperCase() : null;
    const typology = campos[2] || null;
    const area = parsearSuperficie(campos[3]);

    const clave = `${(groupName ?? '').toLowerCase()}|${name.toLowerCase()}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);

    unidades.push({ name, groupName, typology, area, sortOrder: orden++ });
  }

  return unidades;
}

/**
 * Superficie escrita como sea que la escriba una planilla chilena: "42,5",
 * "42.5", "1.234,56" o "42,5 m2". Devuelve `null` si no hay número.
 */
function parsearSuperficie(valor: string | undefined): number | null {
  if (!valor) return null;

  // Solo el PRIMER número de la celda. Barrer todo lo que no sea dígito
  // pegaría el "2" de "42,5 m2" al final del número y daría 42,52.
  const encontrado = /-?\d[\d.,]*/.exec(valor);
  if (!encontrado) return null;

  let limpio = encontrado[0].replace(/[.,]+$/, '');
  if (!limpio) return null;

  const ultimaComa = limpio.lastIndexOf(',');
  const ultimoPunto = limpio.lastIndexOf('.');

  if (ultimaComa > ultimoPunto) {
    // Formato chileno: el punto es miles y la coma es el decimal.
    limpio = limpio.replace(/\./g, '').replace(',', '.');
  } else if (ultimaComa !== -1 && ultimoPunto === -1) {
    limpio = limpio.replace(',', '.');
  } else {
    limpio = limpio.replace(/,/g, '');
  }

  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/* ── Consultas sobre las unidades ya cargadas ─────────────────────────── */

/** Unidades de una obra, en el orden del recorrido. */
export function unidadesDeObra(unidades: WorkUnit[], projectId: string | null | undefined): WorkUnit[] {
  if (!projectId) return [];
  return unidades
    .filter((u) => u.projectId === projectId)
    .sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
}

/** Las que entran al tren y al parte diario. Las excluidas quedan fuera. */
export function unidadesActivas(unidades: WorkUnit[]): WorkUnit[] {
  return unidades.filter((u) => u.status === 'activa');
}

export interface GrupoDeUnidades {
  groupName: string;
  unidades: WorkUnit[];
}

/**
 * Agrupa para pintar la matriz: "PISO 1" con sus 15 deptos, "PISO 2" con los
 * suyos. Los grupos salen en el orden en que aparece su primera unidad, no en
 * orden alfabético — si no, "PISO 10" iría antes que "PISO 2".
 */
export function agruparUnidades(unidades: WorkUnit[]): GrupoDeUnidades[] {
  const grupos = new Map<string, WorkUnit[]>();

  for (const u of unidadesOrdenadas(unidades)) {
    const clave = u.groupName?.trim() || 'Sin grupo';
    const actual = grupos.get(clave);
    if (actual) actual.push(u);
    else grupos.set(clave, [u]);
  }

  return Array.from(grupos, ([groupName, lista]) => ({ groupName, unidades: lista }));
}

function unidadesOrdenadas(unidades: WorkUnit[]): WorkUnit[] {
  return [...unidades].sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
}

/**
 * El siguiente `sortOrder` libre, para agregar una unidad suelta al final sin
 * pisar el orden de las que ya están.
 */
export function siguienteOrden(unidades: WorkUnit[]): number {
  if (unidades.length === 0) return 0;
  return Math.max(...unidades.map((u) => u.sortOrder)) + 1;
}

/**
 * Revisa una tanda antes de insertarla. Devuelve los mensajes a mostrar; lista
 * vacía = se puede guardar.
 *
 * Choca contra el índice único de la migración 037, así que conviene avisarlo
 * antes de que la base rechace la tanda entera por una unidad repetida.
 */
export function validarTanda(
  nuevas: UnidadNueva[],
  existentes: WorkUnit[],
): string[] {
  const errores: string[] = [];
  if (nuevas.length === 0) {
    errores.push('No hay unidades que agregar.');
    return errores;
  }

  const clave = (grupo: string | null | undefined, nombre: string) =>
    `${(grupo ?? '').trim().toLowerCase()}|${nombre.trim().toLowerCase()}`;

  const yaEnObra = new Set(existentes.map((u) => clave(u.groupName, u.name)));
  const repetidasEnObra = nuevas.filter((n) => yaEnObra.has(clave(n.groupName, n.name)));

  if (repetidasEnObra.length > 0) {
    const muestra = repetidasEnObra.slice(0, 3).map((u) => u.name).join(', ');
    errores.push(
      `${repetidasEnObra.length} unidad(es) ya existen en la obra: ${muestra}${
        repetidasEnObra.length > 3 ? '…' : ''}`,
    );
  }

  const sinNombre = nuevas.filter((n) => !n.name.trim()).length;
  if (sinNombre > 0) errores.push(`${sinNombre} unidad(es) sin nombre.`);

  return errores;
}
