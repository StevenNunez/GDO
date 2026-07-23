import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import type { Apu, ApuItem, BudgetOverhead, Resource } from '@/modules/core/lib/data';

type Context = {
  user: any;
  tenantId: string | null | undefined;
  projectId?: string | null;
  db?: any;
};

function requireTenant(tenantId: string | null | undefined): string {
  if (!tenantId) throw new Error('Inquilino no válido.');
  return tenantId;
}

/* ── Catálogo de recursos ─────────────────────────────────────────────── */

export async function addResource(data: Partial<Resource>, { tenantId }: Context) {
  const t = requireTenant(tenantId);
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('resources').insert({ ...data, tenantId: t, isActive: true });
  if (error) throw new Error(error.message);
}

export async function updateResource(id: string, data: Partial<Resource>, { tenantId }: Context) {
  requireTenant(tenantId);
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('resources').update(data).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteResource(id: string, { tenantId }: Context) {
  requireTenant(tenantId);
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('resources').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Propaga el precio nuevo de un recurso a las líneas de APU que lo usan.
 *
 * No es automático a propósito: `apuItems.unitPrice` es una foto del precio, así
 * que un presupuesto ya entregado no se mueve solo. Esto se llama cuando el
 * usuario decide actualizar.
 */
export async function refreshApuPricesFromResource(resourceId: string, { tenantId }: Context) {
  requireTenant(tenantId);
  const sb = getSupabaseBrowserClient();

  const { data: resource, error: resErr } = await sb
    .from('resources').select('unitPrice').eq('id', resourceId).single();
  if (resErr) throw new Error(resErr.message);

  const { error, count } = await sb
    .from('apuItems')
    .update({ unitPrice: resource.unitPrice }, { count: 'exact' })
    .eq('resourceId', resourceId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/* ── APU ──────────────────────────────────────────────────────────────── */

export async function addApu(data: Partial<Apu>, { tenantId }: Context): Promise<string> {
  const t = requireTenant(tenantId);
  const sb = getSupabaseBrowserClient();
  const { data: row, error } = await sb.from('apus').insert({
    isTemplate: true,
    isActive: true,
    unit: 'un',
    ...data,
    tenantId: t,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return row.id as string;
}

export async function updateApu(id: string, data: Partial<Apu>, { tenantId }: Context) {
  requireTenant(tenantId);
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('apus').update(data).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Borra el APU y, en cascada, sus líneas. */
export async function deleteApu(id: string, { tenantId }: Context) {
  requireTenant(tenantId);
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('apus').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── Líneas del APU ───────────────────────────────────────────────────── */

export async function addApuItem(data: Partial<ApuItem>, { tenantId }: Context) {
  const t = requireTenant(tenantId);
  if (!data.apuId) throw new Error('La línea debe pertenecer a un APU.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('apuItems').insert({
    kind: 'material',
    calcMode: 'quantity',
    quantity: 0,
    unitPrice: 0,
    unit: 'un',
    sortOrder: 0,
    ...data,
    tenantId: t,
  });
  if (error) throw new Error(error.message);
}

export async function updateApuItem(id: string, data: Partial<ApuItem>, { tenantId }: Context) {
  requireTenant(tenantId);
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('apuItems').update(data).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteApuItem(id: string, { tenantId }: Context) {
  requireTenant(tenantId);
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('apuItems').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Aplica un APU de la biblioteca a una partida: **copia** el APU y sus líneas.
 *
 * Se copia y no se referencia para que retocar el APU de una obra no altere el
 * de las demás ni el de la biblioteca. Si la partida ya tenía un APU, se
 * reemplaza. Devuelve el precio unitario resultante para que quien llame pueda
 * escribirlo en la partida.
 */
export async function applyApuToWorkItem(
  templateApuId: string,
  workItemId: string,
  { tenantId }: Context
): Promise<string> {
  const t = requireTenant(tenantId);
  const sb = getSupabaseBrowserClient();

  const { data: template, error: tplErr } = await sb
    .from('apus').select('*').eq('id', templateApuId).single();
  if (tplErr) throw new Error(tplErr.message);

  const { data: templateItems, error: itemsErr } = await sb
    .from('apuItems').select('*').eq('apuId', templateApuId).order('sortOrder');
  if (itemsErr) throw new Error(itemsErr.message);

  // La partida solo puede tener un APU (índice único): se borra el anterior.
  const { error: delErr } = await sb.from('apus').delete().eq('workItemId', workItemId);
  if (delErr) throw new Error(delErr.message);

  const { data: copy, error: copyErr } = await sb.from('apus').insert({
    tenantId: t,
    name: template.name,
    unit: template.unit,
    code: template.code,
    notes: template.notes,
    isTemplate: false,
    isActive: true,
    workItemId,
    sourceApuId: templateApuId,
  }).select('id').single();
  if (copyErr) throw new Error(copyErr.message);

  if (templateItems && templateItems.length > 0) {
    const { error: insErr } = await sb.from('apuItems').insert(
      templateItems.map((i: any) => ({
        tenantId: t,
        apuId: copy.id,
        resourceId: i.resourceId,
        name: i.name,
        kind: i.kind,
        unit: i.unit,
        calcMode: i.calcMode,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        percentValue: i.percentValue,
        percentOf: i.percentOf,
        sortOrder: i.sortOrder,
      }))
    );
    if (insErr) throw new Error(insErr.message);
  }

  return copy.id as string;
}

/** Guarda en la partida el precio unitario que resultó de su APU. */
export async function setWorkItemUnitPrice(workItemId: string, unitPrice: number, { tenantId }: Context) {
  requireTenant(tenantId);
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('workItems').update({ unitPrice }).eq('id', workItemId);
  if (error) throw new Error(error.message);
}

/* ── Gastos generales del presupuesto ─────────────────────────────────── */

export async function addBudgetOverhead(data: Partial<BudgetOverhead>, { tenantId }: Context) {
  const t = requireTenant(tenantId);
  if (!data.budgetId) throw new Error('El gasto general debe pertenecer a un presupuesto.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('budgetOverheads').insert({
    mode: 'amount', amount: 0, percent: 0, sortOrder: 0, ...data, tenantId: t,
  });
  if (error) throw new Error(error.message);
}

export async function updateBudgetOverhead(id: string, data: Partial<BudgetOverhead>, { tenantId }: Context) {
  requireTenant(tenantId);
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('budgetOverheads').update(data).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteBudgetOverhead(id: string, { tenantId }: Context) {
  requireTenant(tenantId);
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('budgetOverheads').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
