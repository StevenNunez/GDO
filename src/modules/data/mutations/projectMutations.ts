import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { Project } from '@/modules/core/lib/data';

type Context = {
  user: any;
  tenantId: string | null | undefined;
  db?: any;
};

export async function addProject(data: Partial<Project>, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('projects').insert({ ...data, tenantId, isActive: true });
  if (error) throw new Error(error.message);
}

export async function updateProject(id: string, data: Partial<Project>, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('projects').update(data).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteProject(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('projects').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function migrateLegacyDataToProject(projectId: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!projectId) throw new Error('ID de obra de destino no válido.');
  const sb = getSupabaseBrowserClient();

  const tablesToMigrate = [
    'materials',
    'tools',
    'materialRequests',
    'purchaseRequests',
    'stockMovements',
    'toolLogs',
    'workItems',
    'dailyTalks',
    'returnRequests',
    'purchaseLots',
    'purchaseOrders',
  ];

  let totalUpdated = 0;

  for (const table of tablesToMigrate) {
    const { data: rows, error } = await sb
      .from(table)
      .select('id')
      .eq('tenantId', tenantId)
      .is('projectId', null);

    if (error) { console.error(`Error migrating ${table}:`, error); continue; }
    if (!rows?.length) continue;

    const ids = rows.map((r: any) => r.id);
    const { error: updateErr } = await sb
      .from(table)
      .update({ projectId })
      .in('id', ids);

    if (updateErr) { console.error(`Error updating ${table}:`, updateErr); continue; }
    console.log(`Migrados ${ids.length} registros en ${table}`);
    totalUpdated += ids.length;
  }

  return totalUpdated;
}
