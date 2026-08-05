/**
 * Mutaciones de control documental (planos y sus revisiones) y de RDI.
 *
 * Los ARCHIVOS no pasan por acá: van al bucket `obra-docs` con
 * `src/lib/storage.ts` y lo que se guarda en la fila es la ruta. Estas
 * funciones solo escriben metadatos.
 *
 * La autorización real la pone la RLS (`documents:manage`, `rdi:create`,
 * `rdi:answer`; migración 023) más el trigger que protege la respuesta de una
 * RDI: la UI no es seguridad.
 */

import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { removeObraFile } from '@/lib/storage';
import type { DocumentRevision, ProjectDocument, Rdi } from '@/modules/core/lib/data';

type Context = {
  user: any;
  tenantId: string | null | undefined;
  projectId?: string | null;
  db?: any;
};

/* ── Documentos ───────────────────────────────────────────────────────── */

export async function addDocument(
  data: Partial<ProjectDocument>,
  { user, tenantId, projectId }: Context,
): Promise<string> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { data: row, error } = await sb.from('documents').insert({
    type: 'plano',
    discipline: 'general',
    projectId: projectId ?? null,
    ...data,
    createdBy: user?.id ?? null,
    tenantId,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return row.id as string;
}

export async function updateDocument(
  id: string,
  data: Partial<ProjectDocument>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('documents').update(data).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Borra el documento y, en cascada (FK), todas sus revisiones. Los archivos del
 * bucket se borran antes: si se hiciera al revés, un fallo dejaría archivos sin
 * nadie que sepa a qué pertenecen.
 */
export async function deleteDocument(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();

  const { data: revs } = await sb
    .from('documentRevisions').select('filePath').eq('documentId', id);
  for (const r of (revs ?? []) as { filePath: string | null }[]) {
    if (r.filePath) await removeObraFile(r.filePath);
  }

  const { error } = await sb.from('documents').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── Revisiones ───────────────────────────────────────────────────────── */

export async function addDocumentRevision(
  data: Partial<DocumentRevision>,
  { user, tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  if (!data.documentId) throw new Error('La revisión debe pertenecer a un documento.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('documentRevisions').insert({
    status: 'activa',
    ...data,
    uploadedBy: user?.id ?? null,
    tenantId,
  });
  if (error) throw new Error(error.message);
}

export async function updateDocumentRevision(
  id: string,
  data: Partial<DocumentRevision>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('documentRevisions').update(data).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteDocumentRevision(
  id: string,
  filePath: string | null | undefined,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  if (filePath) await removeObraFile(filePath);
  const { error } = await sb.from('documentRevisions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── RDI ──────────────────────────────────────────────────────────────── */

export async function addRdi(
  data: Partial<Rdi>,
  { user, tenantId, projectId }: Context,
): Promise<string> {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { data: row, error } = await sb.from('rdis').insert({
    discipline: 'general',
    priority: 'normal',
    status: 'abierta',
    impactCost: false,
    impactTime: false,
    projectId: projectId ?? null,
    ...data,
    createdBy: user?.id ?? null,
    tenantId,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return row.id as string;
}

export async function updateRdi(
  id: string,
  data: Partial<Rdi>,
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('rdis').update(data).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Registra la respuesta. Exige `rdi:answer`, y eso lo verifica un trigger en la
 * base — quien pregunta no es quien contesta.
 */
export async function answerRdi(
  id: string,
  data: {
    answer: string;
    impactCost?: boolean;
    impactTime?: boolean;
    answerFilePath?: string | null;
    answerFileName?: string | null;
  },
  { user, tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('rdis').update({
    ...data,
    status: 'respondida',
    answeredAt: new Date().toISOString(),
    answeredBy: user?.id ?? null,
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setRdiStatus(
  id: string,
  status: Rdi['status'],
  { tenantId }: Context,
) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();
  const { error } = await sb.from('rdis').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteRdi(id: string, { tenantId }: Context) {
  if (!tenantId) throw new Error('Inquilino no válido.');
  const sb = getSupabaseBrowserClient();

  const { data: row } = await sb
    .from('rdis').select('filePath, answerFilePath').eq('id', id).single();
  const adjuntos = row as { filePath: string | null; answerFilePath: string | null } | null;
  if (adjuntos?.filePath) await removeObraFile(adjuntos.filePath);
  if (adjuntos?.answerFilePath) await removeObraFile(adjuntos.answerFilePath);

  const { error } = await sb.from('rdis').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
