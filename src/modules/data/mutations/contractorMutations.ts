/**
 * Expediente documental del contratista (migración 031).
 *
 * El estado de enrolamiento NO se escribe en ninguna parte: se calcula de los
 * documentos y de la fecha (`src/lib/contractor-file.ts` y su gemela en
 * Postgres). Acá solo se cargan, revisan y borran papeles.
 */

import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { removeObraFile } from '@/lib/storage';
import type {
  ContractorDocument, ContractorDocumentType,
} from '@/modules/core/lib/data';

type Context = {
  user: any;
  tenantId: string | null | undefined;
  projectId?: string | null;
  db?: any;
};

/* ── Catálogo: qué papeles exige la empresa ────────────────────────────── */

/**
 * Carga la lista estándar chilena (e-RUT, F30, F30-1, mutual, póliza…).
 * Se salta los códigos que la empresa ya tenga, así que llamarla dos veces no
 * duplica nada. Devuelve cuántos agregó.
 */
export async function seedContractorDocumentTypes(
  _: void,
  { tenantId }: Context,
): Promise<number> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb.rpc('seed_contractor_document_types', {
    p_tenant_id: tenantId,
  });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

export async function addContractorDocumentType(
  data: Partial<ContractorDocumentType>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!data.name?.trim()) throw new Error('El documento necesita un nombre.');

  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('contractorDocumentTypes').insert({
    required: true,
    hasExpiry: false,
    sortOrder: 0,
    active: true,
    ...data,
    name: data.name.trim(),
    tenantId,
  });
  if (error) throw new Error(traducir(error.message));
}

export async function updateContractorDocumentType(
  id: string,
  data: Partial<ContractorDocumentType>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('contractorDocumentTypes').update(data).eq('id', id);
  if (error) throw new Error(traducir(error.message));
}

/**
 * Borra un tipo del catálogo. Los documentos ya cargados de ese tipo NO se
 * borran (quedan con `documentTypeId` nulo): son papeles reales que alguien
 * subió, y borrarlos por cambiar el catálogo sería perder respaldo.
 * Para dejar de exigir un papel, mejor desactivarlo que borrarlo.
 */
export async function deleteContractorDocumentType(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('contractorDocumentTypes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── Los papeles de cada contratista ───────────────────────────────────── */

/**
 * Carga (o reemplaza) el documento de un tipo para un contratista.
 *
 * Hay UN documento vigente por tipo: subir el F30-1 nuevo pisa al anterior, y
 * el archivo viejo se borra del bucket. Así el expediente dice siempre cuál es
 * el papel que vale hoy, en vez de dejar cinco versiones para que alguien
 * adivine. La versión anterior no se archiva a propósito: lo que importa aquí
 * es la vigencia, no la historia.
 */
export async function upsertContractorDocument(
  data: Partial<ContractorDocument>,
  { user, tenantId }: Context,
): Promise<string> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!data.supplierId) throw new Error('El documento tiene que ser de un contratista.');
  if (!data.documentTypeId) throw new Error('Falta indicar qué documento es.');

  const sb = getSupabaseBrowserClient();

  const { data: previo } = await sb
    .from('contractorDocuments')
    .select('id, filePath')
    .eq('supplierId', data.supplierId)
    .eq('documentTypeId', data.documentTypeId)
    .maybeSingle();

  const fila = {
    ...data,
    // Un papel recién cargado vuelve a revisión: reemplazarlo no hereda el
    // visto bueno del anterior.
    status: data.status ?? 'en_revision',
    observations: data.status === 'observado' ? data.observations : null,
    uploadedBy: user?.id ?? null,
    tenantId,
  };

  if (previo?.id) {
    const { error } = await sb.from('contractorDocuments').update(fila).eq('id', previo.id);
    if (error) throw new Error(traducir(error.message));

    // El archivo viejo se borra DESPUÉS de que la fila apunte al nuevo: si se
    // borrara antes y fallara el update, quedaría una fila apuntando a nada.
    if (previo.filePath && data.filePath && previo.filePath !== data.filePath) {
      await removeObraFile(previo.filePath).catch(() => { /* huérfano tolerable */ });
    }
    return previo.id as string;
  }

  const { data: row, error } = await sb
    .from('contractorDocuments').insert(fila).select('id').single();
  if (error) throw new Error(traducir(error.message));
  return row.id as string;
}

/**
 * Revisión de oficina central: aprueba o devuelve con observaciones.
 * Observar sin decir qué está mal deja al contratista adivinando, así que el
 * motivo es obligatorio (también lo exige la base).
 */
export async function reviewContractorDocument(
  id: string,
  data: { status: 'aprobado' | 'observado'; observations?: string | null },
  { user, tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (data.status === 'observado' && !data.observations?.trim()) {
    throw new Error('Para observar un documento hay que decir qué está mal.');
  }

  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('contractorDocuments').update({
    status: data.status,
    observations: data.status === 'observado' ? data.observations!.trim() : null,
    reviewedBy: user?.id ?? null,
    reviewedAt: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error(traducir(error.message));
}

export async function deleteContractorDocument(
  id: string,
  filePath: string | null | undefined,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  if (filePath) await removeObraFile(filePath).catch(() => { /* huérfano tolerable */ });
  const { error } = await sb.from('contractorDocuments').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── Mensajes ──────────────────────────────────────────────────────────── */

function traducir(mensaje: string): string {
  if (mensaje.includes('contractor_doc_types_code_uniq')) {
    return 'Ya existe un documento con ese código en el catálogo.';
  }
  if (mensaje.includes('contractor_docs_type_uniq')) {
    return 'Este contratista ya tiene cargado ese documento.';
  }
  if (mensaje.includes('contractor_doc_expiry_after_issue')) {
    return 'La fecha de vencimiento no puede ser anterior a la de emisión.';
  }
  if (mensaje.includes('contractor_doc_observation_needs_reason')) {
    return 'Para observar un documento hay que decir qué está mal.';
  }
  return mensaje;
}
