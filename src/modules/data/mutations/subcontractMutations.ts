/**
 * Mutaciones de subcontratos, sus estados de pago y la recepción de obra.
 *
 * La autorización real la pone la RLS (`subcontracts:*`, `receptions:manage`;
 * migración 025) más dos triggers: el que congela los montos al aprobar y el
 * que impide pagar sin F30-1. Ninguna de esas dos reglas se repite acá: si la
 * app las duplicara, tarde o temprano dirían cosas distintas.
 */

import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { removeObraFile } from '@/lib/storage';
import type {
  Reception, ReceptionObservation, Subcontract, SubcontractCertificate,
  SubcontractCertificateLine, SubcontractItem,
} from '@/modules/core/lib/data';

type Context = {
  user: any;
  tenantId: string | null | undefined;
  projectId?: string | null;
  db?: any;
};

/* ── Subcontratos ─────────────────────────────────────────────────────── */

export async function addSubcontract(
  data: Partial<Subcontract>,
  { user, tenantId, projectId }: Context,
): Promise<string> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { data: row, error } = await sb.from('subcontracts').insert({
    type: 'suma_alzada',
    currency: 'CLP',
    amountNet: 0,
    advancePercent: 0,
    retentionPercent: 0,
    multaMode: 'permil_contrato',
    multaValue: 0,
    taxPercent: 19,
    requiresLaborCompliance: true,
    status: 'vigente',
    projectId: projectId ?? null,
    ...data,
    createdBy: user?.id ?? null,
    tenantId,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return row.id as string;
}

export async function updateSubcontract(
  id: string,
  data: Partial<Subcontract>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('subcontracts').update(data).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Borra el subcontrato y, en cascada, su itemizado y sus estados de pago. */
export async function deleteSubcontract(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('subcontracts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── Itemizado ────────────────────────────────────────────────────────── */

export async function addSubcontractItem(
  data: Partial<SubcontractItem>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!data.subcontractId) throw new Error('La partida debe pertenecer a un subcontrato.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('subcontractItems').insert({
    quantity: 0, unitPrice: 0, sortOrder: 0, ...data, tenantId,
  });
  if (error) throw new Error(error.message);
}

export async function updateSubcontractItem(
  id: string,
  data: Partial<SubcontractItem>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('subcontractItems').update(data).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteSubcontractItem(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('subcontractItems').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── Estados de pago del subcontrato ──────────────────────────────────── */

/**
 * Crea el estado de pago con su detalle. Misma compensación que en el EEPP al
 * mandante: si fallan las líneas se borra la carátula, para no dejar un
 * correlativo ocupado por un documento vacío.
 */
export async function addSubcontractCertificate(
  data: {
    certificate: Partial<SubcontractCertificate>;
    lines: Partial<SubcontractCertificateLine>[];
  },
  { user, tenantId }: Context,
): Promise<string> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();

  const { data: row, error } = await sb.from('subcontractCertificates').insert({
    status: 'borrador',
    ...data.certificate,
    createdBy: user?.id ?? null,
    tenantId,
  }).select('id').single();
  if (error) throw new Error(error.message);

  const certificateId = row.id as string;

  if (data.lines.length > 0) {
    const { error: linesErr } = await sb.from('subcontractCertificateLines').insert(
      data.lines.map((l, i) => ({ sortOrder: i, ...l, certificateId, tenantId })),
    );
    if (linesErr) {
      await sb.from('subcontractCertificates').delete().eq('id', certificateId);
      throw new Error(linesErr.message);
    }
  }

  return certificateId;
}

export async function updateSubcontractCertificate(
  id: string,
  data: Partial<SubcontractCertificate>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('subcontractCertificates').update(data).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Mueve el estado de pago por el trámite. Pagar sin F30-1 lo rechaza la base
 * (Ley 20.123): acá solo se propaga el mensaje.
 */
export async function setSubcontractCertificateStatus(
  id: string,
  status: SubcontractCertificate['status'],
  extra: { invoiceNumber?: string | null } | undefined,
  { user, tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const ahora = new Date().toISOString();

  const patch: Record<string, unknown> = { status, ...extra };
  if (status === 'aprobado') { patch.approvedAt = ahora; patch.approvedBy = user?.id ?? null; }
  if (status === 'pagado') patch.paidAt = ahora;

  const { error } = await sb.from('subcontractCertificates').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteSubcontractCertificate(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('subcontractCertificates').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── Recepción de obra ────────────────────────────────────────────────── */

export async function addReception(
  data: Partial<Reception>,
  { user, tenantId, projectId }: Context,
): Promise<string> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!data.contractId && !data.subcontractId) {
    throw new Error('La recepción tiene que ser de la obra o de un subcontrato.');
  }
  const sb = getSupabaseBrowserClient();
  const { data: row, error } = await sb.from('receptions').insert({
    type: 'provisoria',
    status: 'borrador',
    retentionReleased: 0,
    projectId: projectId ?? null,
    ...data,
    createdBy: user?.id ?? null,
    tenantId,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return row.id as string;
}

export async function updateReception(
  id: string,
  data: Partial<Reception>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('receptions').update(data).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Borra la recepción y, en cascada, sus observaciones (y sus fotos). */
export async function deleteReception(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();

  const { data: obs } = await sb
    .from('receptionObservations').select('photoPath').eq('receptionId', id);
  for (const o of (obs ?? []) as { photoPath: string | null }[]) {
    if (o.photoPath) await removeObraFile(o.photoPath);
  }

  const { error } = await sb.from('receptions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── Observaciones ────────────────────────────────────────────────────── */

export async function addReceptionObservation(
  data: Partial<ReceptionObservation>,
  { user, tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!data.receptionId) throw new Error('La observación debe pertenecer a una recepción.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('receptionObservations').insert({
    severity: 'menor',
    status: 'pendiente',
    ...data,
    createdBy: user?.id ?? null,
    tenantId,
  });
  if (error) throw new Error(error.message);
}

export async function updateReceptionObservation(
  id: string,
  data: Partial<ReceptionObservation>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('receptionObservations').update(data).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteReceptionObservation(
  id: string,
  photoPath: string | null | undefined,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  if (photoPath) await removeObraFile(photoPath);
  const { error } = await sb.from('receptionObservations').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
