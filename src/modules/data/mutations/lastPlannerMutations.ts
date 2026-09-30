/**
 * Módulo Last Planner — unidades de obra y calendario laboral (migración 037),
 * y actividades del tren (migración 038).
 *
 * La autorización real la pone la RLS (`planning:manage`). Acá solo se arman
 * las filas y se traducen los errores de la base a algo que se entienda en
 * pantalla.
 *
 * POR QUÉ LAS UNIDADES SE INSERTAN EN TANDA
 *   Un edificio son 240 unidades. Insertarlas de a una son 240 viajes al
 *   servidor y una obra a medio cargar si se corta en el 150. Van en un solo
 *   `insert`, que en Postgres es una sola transacción: entran todas o no entra
 *   ninguna.
 */

import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import type {
  WorkUnit, WorkCalendarException, TrainActivity, NonComplianceCause,
} from '@/modules/core/lib/data';
import type { UnidadNueva } from '@/lib/work-units';
import { finDelDiaEnChile, tokenVigente } from '@/lib/public-daily-report';

type Context = {
  user: any;
  tenantId: string | null | undefined;
  projectId?: string | null;
  db?: any;
};

/* ── Unidades de obra ─────────────────────────────────────────────────── */

/**
 * Carga una tanda de unidades. Devuelve cuántas quedaron.
 *
 * El `sortOrder` que trae cada una es relativo a la tanda (0, 1, 2…); acá se
 * corre con `ordenBase` para que se ubique después de lo que la obra ya tiene
 * en vez de pisarle el orden.
 */
export async function addWorkUnits(
  nuevas: UnidadNueva[],
  ordenBase: number,
  { user, tenantId, projectId }: Context,
): Promise<number> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!projectId) throw new Error('Selecciona una obra antes de cargar unidades.');
  if (nuevas.length === 0) return 0;

  const sb = getSupabaseBrowserClient();
  const filas = nuevas.map((u, i) => ({
    tenantId,
    projectId,
    name: u.name.trim(),
    groupName: u.groupName?.trim() || null,
    typology: u.typology?.trim() || null,
    area: u.area,
    sortOrder: ordenBase + (Number.isFinite(u.sortOrder) ? u.sortOrder : i),
    status: 'activa',
    createdBy: user?.id ?? null,
  }));

  const { error } = await sb.from('workUnits').insert(filas);
  if (error) throw new Error(traducir(error.message));
  return filas.length;
}

export async function updateWorkUnit(
  id: string,
  data: Partial<WorkUnit>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('workUnits').update(data).eq('id', id);
  if (error) throw new Error(traducir(error.message));
}

export async function deleteWorkUnit(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('workUnits').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Vacía las unidades de una obra. Es para volver a empezar cuando la carga
 * quedó mal: la pantalla lo pide confirmando por nombre, porque más adelante
 * de acá cuelga el avance diario.
 */
export async function deleteWorkUnitsOfProject(projectId: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!projectId) throw new Error('Obra no válida.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('workUnits')
    .delete().eq('projectId', projectId).eq('tenantId', tenantId);
  if (error) throw new Error(error.message);
}

/**
 * Intercambia el orden de dos unidades: es el "subir/bajar" de la lista.
 *
 * Se hace con dos updates y no con un upsert en tanda porque un upsert parcial
 * borraría el resto de las columnas de la fila.
 */
export async function swapWorkUnitOrder(
  a: { id: string; sortOrder: number },
  b: { id: string; sortOrder: number },
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('workUnits').update({ sortOrder: b.sortOrder }).eq('id', a.id);
  if (error) throw new Error(error.message);
  const { error: error2 } = await sb.from('workUnits').update({ sortOrder: a.sortOrder }).eq('id', b.id);
  if (error2) throw new Error(error2.message);
}

/* ── Calendario laboral ───────────────────────────────────────────────── */

/**
 * Carga excepciones del calendario en tanda: los feriados del año, o un día
 * suelto que se trabajó.
 *
 * `projectId` en `null` las deja a nivel de empresa, que es como se cargan los
 * feriados legales: una vez y valen para todas las obras.
 */
export async function addCalendarExceptions(
  excepciones: { date: string; name: string; type?: 'feriado' | 'trabajado' }[],
  projectId: string | null,
  { user, tenantId }: Context,
): Promise<number> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (excepciones.length === 0) return 0;

  const sb = getSupabaseBrowserClient();
  const filas = excepciones.map((e) => ({
    tenantId,
    projectId,
    date: e.date,
    name: e.name.trim(),
    type: e.type ?? 'feriado',
    createdBy: user?.id ?? null,
  }));

  const { error } = await sb.from('workCalendarExceptions').insert(filas);
  if (error) throw new Error(traducir(error.message));
  return filas.length;
}

export async function updateCalendarException(
  id: string,
  data: Partial<WorkCalendarException>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('workCalendarExceptions').update(data).eq('id', id);
  if (error) throw new Error(traducir(error.message));
}

export async function deleteCalendarException(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('workCalendarExceptions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── Traducción de errores de la base ─────────────────────────────────── */

function traducir(mensaje: string): string {
  if (mensaje.includes('work_units_unicidad_idx')) {
    return 'Ya existe una unidad con ese nombre en ese grupo. Revisa la lista antes de cargarla.';
  }
  if (mensaje.includes('daily_progress_unicidad_idx')) {
    return 'Ya hay un parte de esa unidad para ese día. Ábrelo para corregirlo.';
  }
  if (mensaje.includes('dailyReportTokens_token_key')) {
    return 'No se pudo generar el enlace. Inténtalo de nuevo.';
  }
  if (mensaje.includes('work_calendar_unicidad_idx')) {
    return 'Esa fecha ya está en el calendario. Bórrala primero si quieres cambiarla.';
  }
  return mensaje;
}

/* ── Tren de actividades (migración 038) ──────────────────────────────── */

/**
 * Crea una actividad del tren.
 *
 * No recibe las fechas de las celdas y no hay dónde guardarlas: se calculan
 * desde `startDate` y `daysPerUnit` (ver `src/lib/train.ts`). Es la decisión
 * de fondo de la migración 038.
 */
export async function addTrainActivity(
  data: Partial<TrainActivity>,
  { user, tenantId, projectId }: Context,
): Promise<string> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!projectId) throw new Error('Selecciona una obra antes de crear actividades.');
  if (!data.name?.trim()) throw new Error('La actividad necesita un nombre.');

  const sb = getSupabaseBrowserClient();
  const { data: row, error } = await sb.from('trainActivities').insert({
    daysPerUnit: 1,
    sortOrder: 0,
    status: 'activa',
    ...data,
    name: data.name.trim(),
    projectId,
    createdBy: user?.id ?? null,
    tenantId,
  }).select('id').single();

  if (error) throw new Error(traducir(error.message));
  return row.id as string;
}

export async function updateTrainActivity(
  id: string,
  data: Partial<TrainActivity>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('trainActivities').update(data).eq('id', id);
  if (error) throw new Error(traducir(error.message));
}

export async function deleteTrainActivity(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('trainActivities').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Aplica el escalonado: corre la fecha de inicio de varias actividades de una
 * pasada. Los cambios los calcula `escalonarActividades`, que ya devuelve solo
 * las que se mueven — acá no se vuelve a decidir nada.
 *
 * Van de a una y no en un upsert en tanda porque un upsert parcial borraría
 * el resto de las columnas de cada fila.
 */
export async function applyTrainSchedule(
  cambios: { id: string; startDate: string }[],
  { tenantId }: Context,
): Promise<number> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (cambios.length === 0) return 0;

  const sb = getSupabaseBrowserClient();
  for (const c of cambios) {
    const { error } = await sb.from('trainActivities')
      .update({ startDate: c.startDate }).eq('id', c.id);
    if (error) throw new Error(traducir(error.message));
  }
  return cambios.length;
}

/** El subir/bajar de la lista: intercambia el orden de dos actividades. */
export async function swapTrainActivityOrder(
  a: { id: string; sortOrder: number },
  b: { id: string; sortOrder: number },
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('trainActivities').update({ sortOrder: b.sortOrder }).eq('id', a.id);
  if (error) throw new Error(error.message);
  const { error: error2 } = await sb.from('trainActivities').update({ sortOrder: a.sortOrder }).eq('id', b.id);
  if (error2) throw new Error(error2.message);
}

/* ── Parte diario (migración 039) ─────────────────────────────────────── */

/**
 * Guarda el parte de una unidad para un día.
 *
 * Va con `upsert` contra el índice único (actividad + unidad + día): reportar
 * dos veces el mismo depto en el mismo día CORRIGE, no duplica. Es lo que hace
 * que el supervisor pueda equivocarse y volver atrás sin dejar el avance en
 * 140%, que es exactamente lo que pasaba en la planilla.
 *
 * `progress` es acumulado —en cuánto quedó la unidad—, no el incremento. Ver
 * la migración 039.
 */
export async function saveDailyProgress(
  data: {
    activityId: string;
    unitId: string | null;
    date: string;
    progress: number;
    crewDays?: number | null;
    quantity?: number | null;
    causeCode?: NonComplianceCause | null;
    photoPath?: string | null;
    notes?: string | null;
  },
  { user, tenantId, projectId }: Context,
): Promise<void> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!projectId) throw new Error('Selecciona una obra antes de cargar el parte.');
  if (!data.activityId) throw new Error('El parte necesita una actividad.');
  if (!data.date) throw new Error('El parte necesita una fecha.');
  if (!Number.isFinite(data.progress) || data.progress < 0 || data.progress > 1) {
    throw new Error('El avance debe estar entre 0 y 100%.');
  }
  for (const value of [data.crewDays, data.quantity]) {
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      throw new Error('Las jornadas y cantidades deben ser números mayores o iguales a cero.');
    }
  }

  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('dailyProgress').upsert({
    tenantId,
    projectId,
    activityId: data.activityId,
    unitId: data.unitId,
    date: data.date,
    progress: data.progress,
    crewDays: data.crewDays ?? null,
    quantity: data.quantity ?? null,
    // La causa se limpia sola cuando la unidad quedó terminada: si no, un
    // depto que se cerró como "no había materiales" y después se completó
    // seguiría contaminando el Pareto de causas.
    causeCode: data.progress >= 1 ? null : (data.causeCode ?? null),
    photoPath: data.photoPath ?? null,
    notes: data.notes ?? null,
    reportedBy: user?.id ?? null,
    reportedByName: user?.name ?? null,
  }, { onConflict: 'activityId,unitId,date' });

  if (error) throw new Error(traducir(error.message));
}

export async function deleteDailyProgress(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('dailyProgress').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Crea el enlace de un día para que un capataz sin cuenta cargue su parte.
 *
 * El token se genera con `crypto.getRandomValues` y no con un id incremental
 * ni con el id de la actividad: el enlace viaja por WhatsApp y tiene que ser
 * imposible de adivinar a partir de otro que alguien ya haya visto.
 *
 * Vence al final del día que cubre. Un enlace reenviado mañana no sirve, que
 * es lo que impide que se escriba sobre el día equivocado.
 */
export async function createDailyReportToken(
  data: { activityId: string; foremanName: string; validFor: string },
  { user, tenantId, projectId }: Context,
): Promise<string> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!projectId) throw new Error('Selecciona una obra.');
  if (!data.foremanName?.trim()) throw new Error('Escribe el nombre del capataz.');

  const token = generarToken();
  const vence = finDelDiaEnChile(data.validFor);
  if (!tokenVigente({ validFor: data.validFor, expiresAt: vence })) {
    throw new Error('El enlace para el capataz solo se puede generar para el día de hoy.');
  }

  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('dailyReportTokens').insert({
    tenantId,
    projectId,
    activityId: data.activityId,
    token,
    foremanName: data.foremanName.trim(),
    validFor: data.validFor,
    expiresAt: vence,
    createdBy: user?.id ?? null,
  });

  if (error) throw new Error(traducir(error.message));
  return token;
}

export async function deleteDailyReportToken(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('dailyReportTokens').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** 32 caracteres de aleatoriedad del sistema. No usar `Math.random` acá. */
function generarToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
