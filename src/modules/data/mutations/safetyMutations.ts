import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { AssignedSafetyTask, ChecklistTemplate, DailyTalk } from '../../core/lib/data';

type Context = {
  user: any;
  tenantId: string | null | undefined;
  db?: any;
};

export async function addChecklistTemplate(
  template: Pick<ChecklistTemplate, 'title' | 'items'>,
  { user, tenantId }: Context
) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('checklistTemplates').insert({
    ...template,
    createdBy: user.id,
    tenantId,
  });
  if (error) throw new Error(error.message);
}

export async function deleteChecklistTemplate(templateId: string, _ctx: Context) {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('checklistTemplates').delete().eq('id', templateId);
  if (error) throw new Error(error.message);
}

export async function assignChecklistToSupervisors(
  template: ChecklistTemplate,
  supervisorIds: string[],
  workArea: string,
  { user, tenantId }: Context
) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  const sb = getSupabaseBrowserClient();
  const rows = supervisorIds.map((supervisorId) => ({
    templateId: template.id,
    templateTitle: template.title,
    supervisorId,
    assignerId: user.id,
    assignerName: user.name,
    status: 'assigned',
    area: workArea,
    items: template.items,
    tenantId,
  }));
  const { error } = await sb.from('assignedChecklists').insert(rows);
  if (error) throw new Error(error.message);
}

export async function completeAssignedChecklist(checklist: AssignedSafetyTask, _ctx: Context) {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb
    .from('assignedChecklists')
    .update({ ...checklist, status: 'completed', completedAt: new Date().toISOString() })
    .eq('id', checklist.id);
  if (error) throw new Error(error.message);
}

export async function reviewAssignedChecklist(
  checklistId: string,
  status: 'approved' | 'rejected',
  notes: string,
  signature: string,
  { user, tenantId }: Context
) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('assignedChecklists').update({
    status,
    rejectionNotes: status === 'rejected' ? notes : null,
    reviewedBy: {
      id: user.id,
      name: user.name,
      signature,
      date: new Date().toISOString(),
    },
  }).eq('id', checklistId);
  if (error) throw new Error(error.message);
}

export async function deleteAssignedChecklist(checklistId: string, _ctx: Context) {
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('assignedChecklists').delete().eq('id', checklistId);
  if (error) throw new Error(error.message);
}

export async function addSafetyInspection(data: any, { user, tenantId }: Context) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('safetyInspections').insert({
    ...data,
    inspectorId: user.id,
    inspectorName: user.name,
    date: new Date().toISOString(),
    status: 'open',
    tenantId,
  });
  if (error) throw new Error(error.message);
}

export async function completeSafetyInspection(
  inspectionId: string,
  data: any,
  { user, tenantId }: Context
) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('safetyInspections').update({
    ...data,
    status: 'completed',
    completedAt: new Date().toISOString(),
    completionExecutor: user.name,
  }).eq('id', inspectionId);
  if (error) throw new Error(error.message);
}

export async function reviewSafetyInspection(
  inspectionId: string,
  status: 'approved' | 'rejected',
  notes: string,
  signature: string,
  { user, tenantId }: Context
) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('safetyInspections').update({
    status,
    rejectionNotes: status === 'rejected' ? notes : null,
    reviewedBy: {
      id: user.id,
      name: user.name,
      signature,
      date: new Date().toISOString(),
    },
  }).eq('id', inspectionId);
  if (error) throw new Error(error.message);
}

export async function addBehaviorObservation(data: any, { user, tenantId }: Context) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('behaviorObservations').insert({
    ...data,
    observerId: user.id,
    observerName: user.name,
    tenantId,
  });
  if (error) throw new Error(error.message);
}

export async function addDailyTalk(
  data: Omit<DailyTalk, 'id' | 'createdAt' | 'tenantId'>,
  { user, tenantId }: Context
) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  const sb = getSupabaseBrowserClient();
  const { foto, ...rest } = data as any;
  const payload: any = { ...rest, tenantId };
  if (foto) payload.foto = foto;
  const { error } = await sb.from('dailyTalks').insert(payload);
  if (error) throw new Error(error.message);
}

export async function signDailyTalk(talkId: string, { user, tenantId }: Context) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  const sb = getSupabaseBrowserClient();

  const { data: userRow } = await sb.from('users').select('signature').eq('id', user.id).single();

  const { error } = await sb.rpc('sign_daily_talk', {
    p_talk_id: talkId,
    p_user_id: user.id,
    p_signature: userRow?.signature || '',
    p_tenant_id: tenantId,
  });
  if (error) throw new Error(error.message);
}
