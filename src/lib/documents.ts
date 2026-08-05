/**
 * Control documental: qué revisión de un plano es la que manda.
 *
 * Lógica pura, sin React ni acceso a datos, para poder cubrirla con tests
 * (`documents.test.ts`).
 *
 * **La revisión vigente se deduce, no se guarda.** Una bandera "vigente"
 * escrita a mano se desincroniza el día que alguien sube la revisión C y olvida
 * bajar la B: quedan dos vigentes, que es peor que no tener ninguna. Acá la
 * vigente es siempre la más nueva no anulada, y eso no se puede contradecir.
 */

import type { Discipline, DocumentRevision, ProjectDocument } from '@/modules/core/lib/data';
import { toDate } from '@/lib/date-utils';

/** Milisegundos de una fecha, o `null`. */
function ms(value: Date | string | null | undefined): number | null {
  const d = toDate(value);
  return d ? d.getTime() : null;
}

/**
 * Orden entre revisiones: primero la fecha de emisión (es la del proyectista,
 * la que define cuál reemplaza a cuál) y, si dos comparten fecha o ninguna la
 * tiene, la de carga más reciente.
 *
 * NO se comparan los nombres ("B" > "A"): las oficinas numeran de maneras
 * distintas —A/B/C, 0/1/2, R0/R1— y "10" sería menor que "9" como texto.
 */
function orden(a: DocumentRevision, b: DocumentRevision): number {
  const fa = ms(a.issueDate);
  const fb = ms(b.issueDate);
  if (fa !== fb) {
    if (fa === null) return -1;
    if (fb === null) return 1;
    return fa - fb;
  }
  return (ms(a.createdAt) ?? 0) - (ms(b.createdAt) ?? 0);
}

/** Revisiones de un documento, de la más nueva a la más antigua. */
export function revisionesOrdenadas(revisions: DocumentRevision[]): DocumentRevision[] {
  return [...revisions].sort((a, b) => orden(b, a));
}

/**
 * La revisión que hay que usar en obra: la más nueva que no esté anulada.
 * `null` si el documento no tiene ninguna revisión utilizable.
 */
export function revisionVigente(revisions: DocumentRevision[]): DocumentRevision | null {
  const activas = revisions.filter((r) => r.status !== 'anulada');
  if (activas.length === 0) return null;
  return revisionesOrdenadas(activas)[0];
}

export type EstadoRevision = 'vigente' | 'superada' | 'anulada';

/** Estado de una revisión respecto de la vigente del mismo documento. */
export function estadoRevision(
  revision: DocumentRevision,
  vigente: DocumentRevision | null,
): EstadoRevision {
  if (revision.status === 'anulada') return 'anulada';
  return vigente && vigente.id === revision.id ? 'vigente' : 'superada';
}

/** Revisiones de un documento dado, dentro de una lista de todas. */
export function revisionesDe(
  revisions: DocumentRevision[],
  documentId: string,
): DocumentRevision[] {
  return revisions.filter((r) => r.documentId === documentId);
}

/* ── Resumen ──────────────────────────────────────────────────────────── */

export interface ResumenDocumentos {
  documentos: number;
  /** Con al menos una revisión utilizable. */
  conVigente: number;
  /** Registrados pero sin ninguna revisión cargada todavía. */
  sinRevision: number;
  /** Su revisión vigente no tiene archivo adjunto: en obra no sirve de nada. */
  sinArchivo: number;
}

export function resumenDocumentos(
  documents: ProjectDocument[],
  revisions: DocumentRevision[],
): ResumenDocumentos {
  let conVigente = 0;
  let sinRevision = 0;
  let sinArchivo = 0;

  for (const d of documents) {
    const propias = revisionesDe(revisions, d.id);
    if (propias.length === 0) { sinRevision += 1; continue; }

    const vigente = revisionVigente(propias);
    if (!vigente) { sinRevision += 1; continue; }

    conVigente += 1;
    if (!vigente.filePath) sinArchivo += 1;
  }

  return { documentos: documents.length, conVigente, sinRevision, sinArchivo };
}

/* ── Etiquetas ────────────────────────────────────────────────────────── */

export const DISCIPLINAS: Record<Discipline, string> = {
  general: 'General',
  arquitectura: 'Arquitectura',
  estructura: 'Estructura / Cálculo',
  sanitario: 'Sanitario',
  electrico: 'Eléctrico',
  clima: 'Climatización',
  gas: 'Gas',
  urbanizacion: 'Urbanización',
  otro: 'Otra',
};

export const TIPOS_DOCUMENTO: Record<ProjectDocument['type'], string> = {
  plano: 'Plano',
  especificacion: 'Especificación técnica',
  memoria: 'Memoria de cálculo',
  otro: 'Otro',
};
