import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';

type Context = {
  user: any;
  tenantId: string | null | undefined;
  projectId?: string | null;
  db?: any;
};

export async function addSupplierPayment(data: any, { tenantId, projectId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  // Sin `projectId` la factura no se puede imputar a un cliente. Se toma la obra
  // activa salvo que el formulario mande una explícita.
  const { error } = await sb.from('supplierPayments').insert({
    projectId: projectId ?? null,
    ...data,
    status: 'pending',
    tenantId,
  });
  if (error) throw new Error(error.message);
}

export async function updateSupplierPayment(paymentId: string, data: any, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('supplierPayments').update(data).eq('id', paymentId);
  if (error) throw new Error(error.message);
}

export async function markPaymentAsPaid(
  paymentId: string,
  details: { paymentDate: Date; paymentMethod: string },
  { tenantId }: Context
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('supplierPayments').update({
    status: 'paid',
    paymentDate: details.paymentDate.toISOString(),
    paymentMethod: details.paymentMethod,
  }).eq('id', paymentId);
  if (error) throw new Error(error.message);
}

export async function deleteSupplierPayment(paymentId: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('supplierPayments').delete().eq('id', paymentId);
  if (error) throw new Error(error.message);
}

export async function addSalaryAdvanceRequest(
  data: { workerId: string; workerName: string; amount: number },
  { user, tenantId }: Context
) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('salaryAdvances').insert({
    ...data,
    status: 'pending',
    tenantId,
    requestedAt: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function approveSalaryAdvance(advanceId: string, { user, tenantId }: Context) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('salaryAdvances').update({
    status: 'approved',
    processedAt: new Date().toISOString(),
    approverId: user.id,
    approverName: user.name,
  }).eq('id', advanceId);
  if (error) throw new Error(error.message);
}

export async function rejectSalaryAdvance(advanceId: string, { user, tenantId }: Context) {
  if (!user || !tenantId) throw new Error('No autenticado o sin inquilino.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('salaryAdvances').update({
    status: 'rejected',
    processedAt: new Date().toISOString(),
    approverId: user.id,
    approverName: user.name,
  }).eq('id', advanceId);
  if (error) throw new Error(error.message);
}
