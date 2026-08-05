/**
 * Mutaciones de programación (Last Planner): tareas del lookahead / programa
 * semanal y sus restricciones.
 *
 * La autorización real la pone la RLS (`planning:manage`, migración 024).
 *
 * Acá NO se valida que una tarea esté liberada antes de comprometerla: es una
 * regla de conducta, no de integridad. La app la muestra y la cuenta; ver la
 * nota en la migración 024.
 */

import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import type { LookaheadTask, TaskConstraint } from '@/modules/core/lib/data';

type Context = {
  user: any;
  tenantId: string | null | undefined;
  projectId?: string | null;
  db?: any;
};

/* ── Tareas ───────────────────────────────────────────────────────────── */

export async function addLookaheadTask(
  data: Partial<LookaheadTask>,
  { user, tenantId, projectId }: Context,
): Promise<string> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!data.weekStart) throw new Error('La tarea necesita una semana.');
  const sb = getSupabaseBrowserClient();
  const { data: row, error } = await sb.from('lookaheadTasks').insert({
    status: 'planificada',
    quantityPlanned: 0,
    quantityDone: 0,
    projectId: projectId ?? null,
    ...data,
    createdBy: user?.id ?? null,
    tenantId,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return row.id as string;
}

export async function updateLookaheadTask(
  id: string,
  data: Partial<LookaheadTask>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('lookaheadTasks').update(data).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Cierra una tarea de la semana: cumplida, o no cumplida con su causa.
 *
 * La causa se limpia al marcar cumplida — si no, una tarea que se cerró como
 * "no cumplida por falta de materiales" y después se corrige a cumplida
 * quedaría contaminando el Pareto de causas.
 */
export async function cerrarTareaSemanal(
  id: string,
  data: {
    cumplida: boolean;
    causeCode?: LookaheadTask['causeCode'];
    causeNote?: string | null;
    quantityDone?: number;
  },
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!data.cumplida && !data.causeCode) {
    throw new Error('Una tarea no cumplida necesita su causa: es el dato que hace útil al sistema.');
  }
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('lookaheadTasks').update({
    status: data.cumplida ? 'cumplida' : 'no_cumplida',
    causeCode: data.cumplida ? null : data.causeCode,
    causeNote: data.cumplida ? null : (data.causeNote ?? null),
    ...(data.quantityDone !== undefined ? { quantityDone: data.quantityDone } : {}),
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Borra la tarea y, en cascada (FK), sus restricciones. */
export async function deleteLookaheadTask(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('lookaheadTasks').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── Restricciones ────────────────────────────────────────────────────── */

export async function addTaskConstraint(
  data: Partial<TaskConstraint>,
  { user, tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!data.taskId) throw new Error('La restricción debe pertenecer a una tarea.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('taskConstraints').insert({
    type: 'otra',
    status: 'pendiente',
    ...data,
    createdBy: user?.id ?? null,
    tenantId,
  });
  if (error) throw new Error(error.message);
}

export async function updateTaskConstraint(
  id: string,
  data: Partial<TaskConstraint>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('taskConstraints').update(data).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteTaskConstraint(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('taskConstraints').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
