import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { nanoid } from 'nanoid';

type Context = {
  user: any;
  tenantId: string | null | undefined;
  projectId: string | null;
  db?: any;
};

export async function addTool(
  data: { name: string; brand?: string; model?: string; serialNumber?: string; invoiceNumber?: string; purchaseDate?: string; notes?: string },
  { tenantId, projectId }: Context
) {
  if (!projectId) throw new Error('Debe seleccionar una obra antes de agregar herramientas.');
  const sb = getSupabaseBrowserClient();
  const qrCode = `TOOL-${nanoid(10).toUpperCase()}`;
  const { name, ...rest } = data;
  const payload: Record<string, any> = { name, qrCode, status: 'available', tenantId, projectId };
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined && v !== '') payload[k] = v;
  }
  const { error } = await sb.from('tools').insert(payload);
  if (error) throw new Error(error.message);
}

export async function updateTool(toolId: string, data: any, _ctx: Context) {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('tools').update(data).eq('id', toolId);
  if (error) throw new Error(error.message);
}

export async function deleteTool(toolId: string, _ctx: Context) {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('tools').delete().eq('id', toolId);
  if (error) throw new Error(error.message);
}

export async function checkoutTool(
  toolId: string,
  userId: string,
  supervisorId: string,
  { tenantId }: Context
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();

  const [{ data: userRow }, { data: supervisorRow }] = await Promise.all([
    sb.from('users').select('name').eq('id', userId).single(),
    sb.from('users').select('name').eq('id', supervisorId).single(),
  ]);

  const { error } = await sb.rpc('checkout_tool', {
    p_tool_id: toolId,
    p_user_id: userId,
    p_user_name: userRow?.name || 'Desconocido',
    p_supervisor_id: supervisorId,
    p_supervisor_name: supervisorRow?.name || 'Desconocido',
    p_tenant_id: tenantId,
  });
  if (error) throw new Error(error.message);
}

export async function returnTool(
  logId: string,
  status: 'ok' | 'damaged',
  notes: string,
  { user, tenantId }: Context
) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.rpc('return_tool', {
    p_log_id: logId,
    p_status: status,
    p_notes: notes,
    p_user_id: user.id,
    p_user_name: user.name,
    p_tenant_id: tenantId,
  });
  if (error) throw new Error(error.message);
}

export async function transferToolToProject(toolId: string, targetProjectId: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!targetProjectId) throw new Error('Obra de destino no válida.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('tools').update({ projectId: targetProjectId }).eq('id', toolId);
  if (error) throw new Error(error.message);
}

export async function findActiveLogForTool(toolId: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb
    .from('toolLogs')
    .select('*')
    .eq('toolId', toolId)
    .is('returnDate', null)
    .limit(1)
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data ?? null;
}
