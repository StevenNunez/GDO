/**
 * Descuentos del estado de pago (migración 034).
 *
 * Las líneas son la fuente: un trigger recalcula `otherDeductions` y, con él,
 * el neto, el IVA y el total del estado de pago. Por eso acá no se toca ninguna
 * de esas columnas — hacerlo desde el cliente terminaría en dos versiones del
 * mismo número.
 */

import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import type { CertificateDeduction } from '@/modules/core/lib/data';

type Context = {
  user: any;
  tenantId: string | null | undefined;
  projectId?: string | null;
  db?: any;
};

export async function addCertificateDeduction(
  data: Partial<CertificateDeduction>,
  { user, tenantId }: Context,
): Promise<string> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!data.certificateId || !data.certificateType) {
    throw new Error('El descuento tiene que ser de un estado de pago.');
  }
  if (!data.description?.trim()) {
    throw new Error('Escribe qué se le está descontando.');
  }
  if (!data.amount || data.amount <= 0) {
    throw new Error('El monto tiene que ser mayor que cero.');
  }

  const sb = getSupabaseBrowserClient();
  const { data: row, error } = await sb.from('certificateDeductions').insert({
    kind: 'otro',
    ...data,
    description: data.description.trim(),
    createdBy: user?.id ?? null,
    tenantId,
  }).select('id').single();

  if (error) throw new Error(traducir(error.message));
  return row.id as string;
}

export async function updateCertificateDeduction(
  id: string,
  data: Partial<CertificateDeduction>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('certificateDeductions').update(data).eq('id', id);
  if (error) throw new Error(traducir(error.message));
}

export async function deleteCertificateDeduction(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('certificateDeductions').delete().eq('id', id);
  if (error) throw new Error(traducir(error.message));
}

function traducir(mensaje: string): string {
  if (mensaje.includes('cert_deductions_source_uniq')) {
    return 'Ese origen ya se descontó en otro estado de pago.';
  }
  if (mensaje.includes('cert_deduction_needs_description')) {
    return 'Escribe qué se le está descontando.';
  }
  if (mensaje.includes('salió de borrador')) {
    return 'Este estado de pago ya salió de borrador: sus descuentos no se pueden cambiar.';
  }
  return mensaje;
}
