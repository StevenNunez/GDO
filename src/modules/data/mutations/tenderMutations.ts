/**
 * Licitación y firma del subcontrato (migración 032): cotizaciones, adjunción
 * de archivos y firma entre las dos partes.
 *
 * Las reglas duras las pone la base: el trigger `sq_guard_award_reason` no deja
 * adjudicar una oferta más cara sin justificarla, y los índices únicos impiden
 * dos adjudicadas o dos firmas de la misma parte. Acá se valida antes solo para
 * que el mensaje salga en cristiano.
 */

import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { removeObraFile } from '@/lib/storage';
import { validarAdjudicacion } from '@/lib/tender';
import type {
  DocumentSignature, SubcontractAttachment, SubcontractQuote,
} from '@/modules/core/lib/data';

type Context = {
  user: any;
  tenantId: string | null | undefined;
  projectId?: string | null;
  db?: any;
};

/* ── Cotizaciones ──────────────────────────────────────────────────────── */

export async function addSubcontractQuote(
  data: Partial<SubcontractQuote>,
  { user, tenantId }: Context,
): Promise<string> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!data.subcontractId) throw new Error('La oferta tiene que ser de un subcontrato.');
  if (!data.supplierName?.trim()) throw new Error('Falta el nombre del oferente.');

  const sb = getSupabaseBrowserClient();
  const { data: row, error } = await sb.from('subcontractQuotes').insert({
    currency: 'CLP',
    amountNet: 0,
    awarded: false,
    ...data,
    supplierName: data.supplierName.trim(),
    createdBy: user?.id ?? null,
    tenantId,
  }).select('id').single();

  if (error) throw new Error(traducir(error.message));
  return row.id as string;
}

export async function updateSubcontractQuote(
  id: string,
  data: Partial<SubcontractQuote>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('subcontractQuotes').update(data).eq('id', id);
  if (error) throw new Error(traducir(error.message));
}

export async function deleteSubcontractQuote(
  id: string,
  filePath: string | null | undefined,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  if (filePath) await removeObraFile(filePath).catch(() => { /* huérfano tolerable */ });
  const { error } = await sb.from('subcontractQuotes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Adjudica una oferta y deja al subcontrato con SUS condiciones (monto, plazo
 * y contratista).
 *
 * Se desmarca primero la adjudicada anterior: el índice único no admite dos, y
 * si se intentara al revés la base rechazaría el cambio de ganador. Cambiar de
 * adjudicataria es una decisión legítima —hasta que el contrato se firma—, así
 * que tiene que poder hacerse sin borrar y volver a crear las ofertas.
 */
export async function awardSubcontractQuote(
  data: { quoteId: string; awardReason?: string | null },
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();

  const { data: quote, error: qErr } = await sb
    .from('subcontractQuotes').select('*').eq('id', data.quoteId).single();
  if (qErr) throw new Error(qErr.message);

  const { data: todas, error: allErr } = await sb
    .from('subcontractQuotes').select('*')
    .eq('subcontractId', (quote as SubcontractQuote).subcontractId);
  if (allErr) throw new Error(allErr.message);

  const candidata = { ...(quote as SubcontractQuote), awardReason: data.awardReason ?? null };
  const errores = validarAdjudicacion(candidata, (todas ?? []) as SubcontractQuote[]);
  if (errores.length > 0) throw new Error(errores[0]);

  const { error: limpiarErr } = await sb.from('subcontractQuotes')
    .update({ awarded: false })
    .eq('subcontractId', candidata.subcontractId)
    .neq('id', data.quoteId);
  if (limpiarErr) throw new Error(limpiarErr.message);

  const { error } = await sb.from('subcontractQuotes').update({
    awarded: true,
    awardReason: data.awardReason?.trim() || null,
  }).eq('id', data.quoteId);
  if (error) throw new Error(traducir(error.message));

  // El contrato hereda las condiciones de la oferta ganadora. Sin esto habría
  // que copiarlas a mano y el contrato terminaría diciendo otra cosa que el
  // cuadro comparativo.
  const patch: Record<string, unknown> = {
    amountNet: candidata.amountNet,
    currency: candidata.currency,
    supplierName: candidata.supplierName,
  };
  if (candidata.supplierId) patch.supplierId = candidata.supplierId;
  if (candidata.plazoDias) patch.plazoDias = candidata.plazoDias;

  const { error: subErr } = await sb.from('subcontracts')
    .update(patch).eq('id', candidata.subcontractId);
  if (subErr) throw new Error(subErr.message);
}

/* ── Adjuntos ──────────────────────────────────────────────────────────── */

export async function addSubcontractAttachment(
  data: Partial<SubcontractAttachment>,
  { user, tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!data.subcontractId) throw new Error('El adjunto tiene que ser de un subcontrato.');
  if (!data.filePath) throw new Error('Falta el archivo.');

  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('subcontractAttachments').insert({
    kind: 'otro',
    ...data,
    name: data.name?.trim() || data.fileName || 'Documento',
    uploadedBy: user?.id ?? null,
    tenantId,
  });
  if (error) throw new Error(error.message);
}

export async function deleteSubcontractAttachment(
  id: string,
  filePath: string | null | undefined,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  if (filePath) await removeObraFile(filePath).catch(() => { /* huérfano tolerable */ });
  const { error } = await sb.from('subcontractAttachments').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── Firma entre las partes ────────────────────────────────────────────── */

/**
 * Firma un documento por una de las dos partes.
 *
 * Es `upsert` sobre (documento, parte): volver a firmar REEMPLAZA la firma
 * anterior en vez de agregar una segunda. Dos firmas de la misma parte dejan
 * la pregunta de cuál vale, que es exactamente lo que un documento firmado no
 * puede tener.
 *
 * La contraparte no necesita usuario en la app: su identidad va como texto.
 */
export async function signDocument(
  data: {
    documentType: DocumentSignature['documentType'];
    documentId: string;
    party: 'empresa' | 'contraparte';
    signerName: string;
    signerRut?: string | null;
    signerRole?: string | null;
    signature?: string | null;
    documentHash?: string | null;
  },
  { user, tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!data.signerName?.trim()) {
    throw new Error('Falta el nombre de quien firma: una firma sin nombre no acredita nada.');
  }

  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('documentSignatures').upsert({
    tenantId,
    documentType: data.documentType,
    documentId: data.documentId,
    party: data.party,
    signerName: data.signerName.trim(),
    signerRut: data.signerRut?.trim() || null,
    signerRole: data.signerRole?.trim() || null,
    // Solo la parte «empresa» se puede atribuir a un usuario de la sesión; la
    // contraparte firma en persona, sin cuenta.
    signedBy: data.party === 'empresa' ? (user?.id ?? null) : null,
    signature: data.signature ?? null,
    documentHash: data.documentHash ?? null,
    signedAt: new Date().toISOString(),
  }, { onConflict: 'documentType,documentId,party' });

  if (error) throw new Error(traducir(error.message));
}

/** Quita una firma. Sirve para corregir un error antes de que firme la otra parte. */
export async function removeDocumentSignature(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('documentSignatures').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── Mensajes ──────────────────────────────────────────────────────────── */

function traducir(mensaje: string): string {
  if (mensaje.includes('subcontract_quotes_awarded_uniq')) {
    return 'Este subcontrato ya tiene una oferta adjudicada.';
  }
  if (mensaje.includes('document_signatures_party_uniq')) {
    return 'Esa parte ya firmó este documento.';
  }
  if (mensaje.includes('no es la más económica')) {
    return 'Adjudicaste una oferta que no es la más económica: indica por qué.';
  }
  return mensaje;
}
