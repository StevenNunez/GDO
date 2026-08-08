/**
 * Orden de Pago y cierre del contrato (migración 035).
 *
 * El correlativo lo pone la base, no el navegador: calcularlo acá (MAX + 1)
 * funciona hasta que dos personas emiten a la vez y las dos leen el mismo
 * máximo. Las guardas duras —no emitir sin aprobación, no emitir sin F30-1, no
 * cambiar una orden ya pagada— también son de la base; acá solo se traducen.
 */

import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import type { PaymentOrder, Subcontract } from '@/modules/core/lib/data';

type Context = {
  user: any;
  tenantId: string | null | undefined;
  projectId?: string | null;
  db?: any;
};

export async function addPaymentOrder(
  data: Partial<PaymentOrder>,
  { user, tenantId, projectId }: Context,
): Promise<string> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!data.certificateId || !data.certificateType) {
    throw new Error('La orden de pago tiene que ser de un estado de pago.');
  }
  if (!data.supplierName?.trim()) {
    throw new Error('Falta a quién se le paga.');
  }

  const sb = getSupabaseBrowserClient();
  const { data: row, error } = await sb.from('paymentOrders').insert({
    currency: 'CLP',
    status: 'emitida',
    projectId: data.projectId ?? projectId ?? null,
    ...data,
    // `number` NO se manda: lo asigna el trigger dentro de la transacción.
    number: undefined,
    supplierName: data.supplierName.trim(),
    createdBy: user?.id ?? null,
    tenantId,
  }).select('id').single();

  if (error) throw new Error(traducir(error.message));
  return row.id as string;
}

export async function updatePaymentOrder(
  id: string,
  data: Partial<PaymentOrder>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  // El correlativo no se reasigna nunca: es el número con el que Finanzas ya
  // registró el pago.
  const { number: _ignorado, ...resto } = data;
  const { error } = await sb.from('paymentOrders').update(resto).eq('id', id);
  if (error) throw new Error(traducir(error.message));
}

/**
 * Marca la orden como pagada y arrastra el estado de pago con ella: pagar la
 * orden ES pagar el estado de pago, y dejarlos desincronizados obliga a
 * acordarse de hacer dos cosas.
 */
export async function markPaymentOrderPaid(
  id: string,
  data: { paidAt?: string | null; paymentMethod?: string | null; paymentReference?: string | null },
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const ahora = data.paidAt ?? new Date().toISOString();

  const { data: order, error: getErr } = await sb
    .from('paymentOrders').select('*').eq('id', id).single();
  if (getErr) throw new Error(getErr.message);

  const { error } = await sb.from('paymentOrders').update({
    status: 'pagada',
    paidAt: ahora,
    paymentMethod: data.paymentMethod ?? null,
    paymentReference: data.paymentReference ?? null,
  }).eq('id', id);
  if (error) throw new Error(traducir(error.message));

  const o = order as PaymentOrder;
  const tabla = o.certificateType === 'subcontract'
    ? 'subcontractCertificates'
    : 'paymentCertificates';

  const { error: certErr } = await sb.from(tabla)
    .update({ status: 'pagado', paidAt: ahora })
    .eq('id', o.certificateId);
  // Si esto falla, la orden ya quedó pagada. Se avisa en vez de silenciarlo:
  // el estado de pago quedaría diciendo que no se pagó.
  if (certErr) {
    throw new Error(
      'La orden quedó pagada, pero no se pudo marcar el estado de pago: ' + certErr.message,
    );
  }
}

/** Anular exige motivo: un hueco en el correlativo hay que poder explicarlo. */
export async function voidPaymentOrder(
  id: string,
  voidReason: string,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!voidReason?.trim()) {
    throw new Error('Para anular una orden de pago hay que indicar el motivo.');
  }
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('paymentOrders').update({
    status: 'anulada',
    voidReason: voidReason.trim(),
  }).eq('id', id);
  if (error) throw new Error(traducir(error.message));
}

/**
 * Manda la orden al correo del contratista. Pasa por el servidor porque las
 * credenciales SMTP no pueden salir de ahí, y porque el `sentAt` tiene que
 * escribirlo quien realmente mandó el correo.
 */
export async function sendPaymentOrder(
  data: { orderId: string; pdfBase64: string; mensaje?: string },
  { tenantId }: Context,
): Promise<{ sentTo: string; warning?: string }> {
  if (!tenantId) throw new Error('Inquilino no válido.');

  const sb = getSupabaseBrowserClient();
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.access_token) throw new Error('Sesión no válida.');

  const res = await fetch('/api/payment-orders/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(data),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'No se pudo enviar la orden.');
  return { sentTo: json.sentTo, warning: json.warning };
}

/* ── Cierre del contrato ───────────────────────────────────────────────── */

/**
 * Liquida el subcontrato. Lo que decide si se puede está en
 * `estadoCierre()`; acá solo se registra, con fecha y observación, porque un
 * contrato que pasa a «liquidado» sin fecha no se puede auditar después.
 */
export async function closeSubcontract(
  id: string,
  closureNotes: string | null,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('subcontracts').update({
    status: 'liquidado' as Subcontract['status'],
    closedAt: new Date().toISOString(),
    closureNotes: closureNotes?.trim() || null,
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Reabre un contrato cerrado por error. Deja `closedAt` en null. */
export async function reopenSubcontract(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('subcontracts').update({
    status: 'vigente' as Subcontract['status'],
    closedAt: null,
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── Mensajes ──────────────────────────────────────────────────────────── */

function traducir(mensaje: string): string {
  if (mensaje.includes('payment_orders_cert_uniq')) {
    return 'Este estado de pago ya tiene una orden de pago vigente. Anúlala antes de reemitir.';
  }
  if (mensaje.includes('payment_orders_number_uniq')) {
    return 'Se generaron dos órdenes al mismo tiempo. Vuelve a intentar.';
  }
  if (mensaje.includes('payment_order_void_needs_reason')) {
    return 'Para anular una orden de pago hay que indicar el motivo.';
  }
  return mensaje;
}
