/**
 * Mutaciones de Oficina Técnica: contrato de la obra y garantías.
 *
 * La ficha del contrato es dato contractual, no de dinero en movimiento: se
 * escribe desde el cliente como el resto del módulo y la autorización real la
 * pone la RLS (`contracts:manage` / `guarantees:manage`, migración 019). Lo que
 * SÍ irá al servidor en la Fase 2 es aprobar un estado de pago, porque ahí se
 * congelan montos que se cobran.
 */

import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import type {
  Amendment, Contract, Guarantee, PaymentCertificate, PaymentCertificateLine,
} from '@/modules/core/lib/data';

type Context = {
  user: any;
  tenantId: string | null | undefined;
  projectId?: string | null;
  db?: any;
};

/* ── Contrato ─────────────────────────────────────────────────────────── */

export async function addContract(
  data: Partial<Contract>,
  { tenantId }: Context,
): Promise<string> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { data: row, error } = await sb.from('contracts').insert({
    type: 'suma_alzada',
    currency: 'CLP',
    amountNet: 0,
    feePercent: 0,
    advancePercent: 0,
    retentionPercent: 0,
    multaMode: 'permil_contrato',
    multaValue: 0,
    reajusteType: 'none',
    taxPercent: 19,
    status: 'draft',
    ...data,
    tenantId,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return row.id as string;
}

export async function updateContract(
  id: string,
  data: Partial<Contract>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('contracts').update(data).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Borra el contrato y, en cascada (FK), sus garantías. */
export async function deleteContract(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('contracts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── Garantías ────────────────────────────────────────────────────────── */

export async function addGuarantee(data: Partial<Guarantee>, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!data.contractId) throw new Error('La garantía debe pertenecer a un contrato.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('guarantees').insert({
    type: 'fiel_cumplimiento',
    instrument: 'boleta_bancaria',
    amount: 0,
    currency: 'CLP',
    status: 'vigente',
    ...data,
    tenantId,
  });
  if (error) throw new Error(error.message);
}

export async function updateGuarantee(
  id: string,
  data: Partial<Guarantee>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('guarantees').update(data).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteGuarantee(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('guarantees').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── Adicionales y aumentos de obra ───────────────────────────────────── */

export async function addAmendment(
  data: Partial<Amendment>,
  { user, tenantId }: Context,
): Promise<string> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!data.contractId) throw new Error('El adicional debe pertenecer a un contrato.');
  const sb = getSupabaseBrowserClient();
  const { data: row, error } = await sb.from('amendments').insert({
    type: 'obra_extraordinaria',
    cause: 'otra',
    amountNet: 0,
    currency: 'CLP',
    extraDays: 0,
    status: 'borrador',
    ...data,
    createdBy: user?.id ?? null,
    tenantId,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return row.id as string;
}

/**
 * Edita el adicional. Un aprobado no puede cambiar de monto, plazo ni
 * presupuesto: lo bloquea un trigger en la base (migración 022), porque esa
 * cifra ya se incorporó al contrato vigente y a los estados de pago emitidos
 * después.
 */
export async function updateAmendment(
  id: string,
  data: Partial<Amendment>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('amendments').update(data).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Mueve el adicional por el trámite: borrador → presentado → aprobado o
 * rechazado, y anulado como salida en cualquier momento.
 *
 * Aprobar y rechazar exigen `amendments:approve`, y eso lo verifica un trigger
 * en la base: esconder el botón no es seguridad.
 */
export async function setAmendmentStatus(
  id: string,
  status: Amendment['status'],
  extra: { rejectionReason?: string | null; reference?: string | null } | undefined,
  { user, tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const ahora = new Date().toISOString();

  const patch: Record<string, unknown> = { status, ...extra };
  if (status === 'presentado') patch.presentedAt = ahora;
  if (status === 'aprobado') { patch.approvedAt = ahora; patch.approvedBy = user?.id ?? null; }

  const { error } = await sb.from('amendments').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Solo se borra lo que no llegó a aprobarse; el trigger bloquea el resto. */
export async function deleteAmendment(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('amendments').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── Estados de pago al mandante ──────────────────────────────────────── */

/**
 * Crea el EEPP con su detalle. Se inserta la carátula primero y luego las
 * líneas: si las líneas fallan, se borra la carátula para no dejar un estado de
 * pago vacío ocupando un correlativo (no hay transacciones desde el cliente).
 */
export async function addPaymentCertificate(
  data: { certificate: Partial<PaymentCertificate>; lines: Partial<PaymentCertificateLine>[] },
  { user, tenantId }: Context,
): Promise<string> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();

  const { data: row, error } = await sb.from('paymentCertificates').insert({
    status: 'borrador',
    ...data.certificate,
    createdBy: user?.id ?? null,
    tenantId,
  }).select('id').single();
  if (error) throw new Error(error.message);

  const certificateId = row.id as string;

  if (data.lines.length > 0) {
    const { error: linesErr } = await sb.from('paymentCertificateLines').insert(
      data.lines.map((l, i) => ({ sortOrder: i, ...l, certificateId, tenantId })),
    );
    if (linesErr) {
      await sb.from('paymentCertificates').delete().eq('id', certificateId);
      throw new Error(linesErr.message);
    }
  }

  return certificateId;
}

/**
 * Reemplaza carátula y detalle de un EEPP en borrador. El trigger de la base
 * rechaza esto si ya salió de borrador, así que no hace falta chequearlo acá.
 */
export async function updatePaymentCertificate(
  id: string,
  data: { certificate: Partial<PaymentCertificate>; lines?: Partial<PaymentCertificateLine>[] },
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();

  const { error } = await sb.from('paymentCertificates').update(data.certificate).eq('id', id);
  if (error) throw new Error(error.message);

  if (data.lines) {
    const { error: delErr } = await sb.from('paymentCertificateLines')
      .delete().eq('certificateId', id);
    if (delErr) throw new Error(delErr.message);

    if (data.lines.length > 0) {
      const { error: insErr } = await sb.from('paymentCertificateLines').insert(
        data.lines.map((l, i) => ({ sortOrder: i, ...l, certificateId: id, tenantId })),
      );
      if (insErr) throw new Error(insErr.message);
    }
  }
}

/**
 * Mueve el EEPP por el trámite: borrador → presentado → aprobado → facturado →
 * pagado, o rechazado de vuelta a borrador.
 *
 * Aprobar exige `payment_certificates:approve`, y eso lo verifica un trigger en
 * la base: esconder el botón no es seguridad, cualquiera con sesión puede
 * escribir por REST.
 */
export async function setPaymentCertificateStatus(
  id: string,
  status: PaymentCertificate['status'],
  extra: { rejectionReason?: string; invoiceNumber?: string } | undefined,
  { user, tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const ahora = new Date().toISOString();

  const patch: Record<string, unknown> = { status, ...extra };
  if (status === 'presentado') patch.presentedAt = ahora;
  if (status === 'aprobado') { patch.approvedAt = ahora; patch.approvedBy = user?.id ?? null; }
  if (status === 'facturado') patch.invoicedAt = ahora;
  if (status === 'pagado') patch.paidAt = ahora;

  const { error } = await sb.from('paymentCertificates').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Solo se borra un borrador; el trigger bloquea el resto. */
export async function deletePaymentCertificate(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('paymentCertificates').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── Indicadores (UF / UTM / IPC) ─────────────────────────────────────── */

/**
 * `marketIndices` es tabla global y solo el servidor la escribe, así que estas
 * dos van por `/api/indices` con el token de sesión (mismo patrón que
 * `genericMutations.addTenant`).
 */
async function postIndices(body: unknown): Promise<{ guardados: number; origen: string }> {
  const sb = getSupabaseBrowserClient();
  const { data: { session } } = await sb.auth.getSession();

  const res = await fetch('/api/indices', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'No se pudieron actualizar los indicadores.');
  return json;
}

/** Trae UF, UTM e IPC del día desde mindicador.cl. */
export async function syncMarketIndices(_ctx: Context) {
  return postIndices({});
}

/** Respaldo manual: si la API externa falla, el valor se ingresa a mano. */
export async function setMarketIndex(
  manual: { type: 'uf' | 'utm' | 'ipc'; date: string; value: number },
  _ctx: Context,
) {
  return postIndices({ manual });
}
