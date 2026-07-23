import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { Client, Budget } from '@/modules/core/lib/data';

type Context = {
  user: any;
  tenantId: string | null | undefined;
  projectId?: string | null;
  db?: any;
};

/* ── Clientes ─────────────────────────────────────────────────────────── */

export async function addClient(data: Partial<Client>, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('clients').insert({ ...data, tenantId, isActive: true });
  if (error) throw new Error(error.message);
}

export async function updateClient(id: string, data: Partial<Client>, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('clients').update(data).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Borrar un cliente no borra sus obras: la FK es `ON DELETE SET NULL`, así que
 * quedan como "Sin asignar" y no se pierde ni una compra ni un pago. Aun así se
 * avisa cuando tiene obras, porque el usuario suele querer reasignarlas antes.
 */
export async function deleteClient(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();

  const { count, error: countError } = await sb
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('clientId', id);
  if (countError) throw new Error(countError.message);
  if (count && count > 0) {
    throw new Error(
      `Este cliente tiene ${count} obra${count === 1 ? '' : 's'} asignada${count === 1 ? '' : 's'}. ` +
      'Reasígnalas a otro cliente antes de eliminarlo.'
    );
  }

  const { error } = await sb.from('clients').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── Presupuestos ─────────────────────────────────────────────────────── */

/**
 * Crea un presupuesto y devuelve su id. `projectId` es opcional: un Contrato de
 * la EDT nace sin obra y se asigna después desde el panel de presupuestos.
 */
export async function addBudget(data: Partial<Budget>, { tenantId }: Context): Promise<string> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { data: row, error } = await sb.from('budgets').insert({
    type: 'principal',
    status: 'draft',
    projectId: null,
    ...data,
    tenantId,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return row.id as string;
}

export async function updateBudget(id: string, data: Partial<Budget>, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('budgets').update(data).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Borra el presupuesto y, en cascada (FK), todas sus partidas. */
export async function deleteBudget(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('budgets').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
