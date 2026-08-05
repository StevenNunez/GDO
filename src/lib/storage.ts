/**
 * Archivos de obra sobre Supabase Storage (bucket `obra-docs`, migración 023).
 *
 * Es el primer almacenamiento real de la app: hasta acá todo lo que se subía
 * (firmas, fotos de checklist) se guardaba como base64 dentro de una columna de
 * Postgres. Eso funciona para una firma de 20 KB, pero un plano en PDF pesa
 * megas: guardarlo en la base la infla, hace lentas todas las consultas de esa
 * tabla y termina reventando el límite de fila. Los archivos van al bucket; en
 * la base queda solo la ruta.
 *
 * **La ruta empieza SIEMPRE por el tenant**: `{tenantId}/{projectId}/…`. La RLS
 * del bucket compara esa primera carpeta con la empresa de quien pide, así que
 * una ruta mal armada no es un detalle estético: es lo que impide que una
 * empresa lea los archivos de otra.
 */

import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { isDemoMode } from '@/modules/core/lib/demo/demo-config';

export const BUCKET_OBRA = 'obra-docs';

/** Tope del bucket (migración 023). Se valida acá para avisar antes de subir. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const MENSAJE_DEMO =
  'El modo demo no guarda archivos: funciona sobre el navegador, sin servidor. '
  + 'Puedes registrar el plano o la RDI igual, pero sin adjunto.';

/** Tamaño legible para mostrar en pantalla. */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Limpia un nombre de archivo para usarlo como parte de una ruta: Storage
 * rechaza varios caracteres y los acentos rompen las URL firmadas.
 */
export function slugFileName(name: string): string {
  // NFD separa la letra de su tilde y \p{M} borra las marcas sueltas, así
  // "Plano Ampliación.pdf" queda "Plano-Ampliacion.pdf" y no "Plano-Ampliaci-n".
  const sinAcentos = name.normalize('NFD').replace(/\p{M}+/gu, '');
  return sinAcentos
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'archivo';
}

/**
 * Arma la ruta dentro del bucket. El prefijo de tiempo evita que dos archivos
 * con el mismo nombre se pisen (subir "Plano.pdf" dos veces es lo normal).
 */
export function buildObraPath(opts: {
  tenantId: string;
  projectId?: string | null;
  carpeta: string;
  fileName: string;
}): string {
  const { tenantId, projectId, carpeta, fileName } = opts;
  return [
    tenantId,
    projectId || 'sin-obra',
    carpeta,
    `${Date.now()}-${slugFileName(fileName)}`,
  ].join('/');
}

export interface ArchivoSubido {
  path: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

/**
 * Sube un archivo y devuelve lo que hay que guardar en la fila. No hace
 * `upsert`: cada subida es una ruta nueva, así una revisión no sobrescribe el
 * archivo de la anterior (que es justamente lo que hay que poder auditar).
 */
export async function uploadObraFile(
  file: File,
  opts: { tenantId: string; projectId?: string | null; carpeta: string },
): Promise<ArchivoSubido> {
  if (isDemoMode()) throw new Error(MENSAJE_DEMO);

  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `El archivo pesa ${formatFileSize(file.size)} y el máximo son ${formatFileSize(MAX_FILE_BYTES)}.`,
    );
  }

  const path = buildObraPath({ ...opts, fileName: file.name });

  const sb = getSupabaseBrowserClient();
  const { error } = await sb.storage.from(BUCKET_OBRA).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw new Error(error.message);

  return {
    path,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || 'application/octet-stream',
  };
}

/**
 * URL temporal para abrir o descargar un archivo del bucket privado. Se pide
 * una nueva cada vez: una URL firmada que durara para siempre sería lo mismo
 * que tener el bucket público.
 */
export async function getObraFileUrl(
  path: string,
  segundos = 60 * 10,
): Promise<string> {
  if (isDemoMode()) throw new Error(MENSAJE_DEMO);

  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb.storage
    .from(BUCKET_OBRA)
    .createSignedUrl(path, segundos);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? 'No se pudo abrir el archivo.');
  }
  return data.signedUrl;
}

/** Abre el archivo en una pestaña nueva. */
export async function openObraFile(path: string): Promise<void> {
  const url = await getObraFileUrl(path);
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Borra un archivo del bucket. Se usa al eliminar la fila que lo referencia;
 * si falla, no se corta la operación: un archivo huérfano en el bucket es
 * molesto, pero dejar la fila apuntando a un archivo ya borrado es peor.
 */
export async function removeObraFile(path: string): Promise<void> {
  if (isDemoMode()) return;
  const sb = getSupabaseBrowserClient();
  await sb.storage.from(BUCKET_OBRA).remove([path]);
}
