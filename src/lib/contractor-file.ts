/**
 * Expediente documental del contratista — lógica pura (migración 031).
 *
 * El «enrolamiento» no es un dato que se guarde: es el estado de una carpeta de
 * papeles, y cambia solo. Un contratista deja de estar enrolado el día que se
 * le vence el F30-1, sin que nadie toque nada. Por eso todo acá se CALCULA a
 * partir de los documentos y de la fecha de hoy.
 *
 * Espejo de `contractor_enrollment_status` en Postgres. Si los dos discrepan,
 * gana la base; esto existe para que la pantalla no tenga que preguntar.
 */

import { toCalendarDay } from '@/lib/date-utils';
import type {
  ContractorDocument, ContractorDocumentType,
} from '@/modules/core/lib/data';

/* ── Estados ───────────────────────────────────────────────────────────── */

/** Estado de UN papel dentro del expediente. */
export type EstadoDocumento =
  | 'faltante'     // nunca se cargó
  | 'observado'    // se devolvió con motivo
  | 'vencido'      // la fecha ya pasó
  | 'por_vencer'   // vence dentro del plazo de aviso
  | 'en_revision'  // cargado, esperando el visto bueno de oficina central
  | 'vigente';     // aprobado y dentro de fecha

/** Estado de la carpeta completa. Es lo que decide si se le puede contratar. */
export type EstadoEnrolamiento =
  | 'sin_expediente'
  | 'incompleto'
  | 'observado'
  | 'vencido'
  | 'enrolado';

export const ESTADO_DOCUMENTO_LABEL: Record<EstadoDocumento, string> = {
  faltante: 'Falta',
  observado: 'Observado',
  vencido: 'Vencido',
  por_vencer: 'Por vencer',
  en_revision: 'En revisión',
  vigente: 'Vigente',
};

export const ESTADO_ENROLAMIENTO_LABEL: Record<EstadoEnrolamiento, string> = {
  sin_expediente: 'Sin expediente',
  incompleto: 'Incompleto',
  observado: 'Con observaciones',
  vencido: 'Documentos vencidos',
  enrolado: 'Enrolado',
};

export const ESTADO_DOCUMENTO_TONO: Record<EstadoDocumento, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  faltante: 'neutral',
  observado: 'danger',
  vencido: 'danger',
  por_vencer: 'warning',
  en_revision: 'info',
  vigente: 'success',
};

export const ESTADO_ENROLAMIENTO_TONO: Record<EstadoEnrolamiento, 'success' | 'warning' | 'danger' | 'neutral'> = {
  sin_expediente: 'neutral',
  incompleto: 'warning',
  observado: 'danger',
  vencido: 'danger',
  enrolado: 'success',
};

/** Días antes del vencimiento en que un documento empieza a avisar. */
export const AVISO_VENCIMIENTO_DIAS = 30;

/* ── Vigencia ──────────────────────────────────────────────────────────── */

/**
 * Días que faltan para que venza. Negativo = ya venció. `null` si no tiene
 * fecha (una escritura de constitución no caduca).
 *
 * Compara días calendario, no instantes: un certificado que vence «hoy» sirve
 * hoy, no dejó de servir a medianoche.
 */
export function diasParaVencer(
  expiryDate: Date | string | null | undefined,
  hoy: Date = new Date(),
): number | null {
  const vence = toCalendarDay(expiryDate);
  const dia = toCalendarDay(hoy);
  if (!vence || !dia) return null;
  return Math.round((vence.getTime() - dia.getTime()) / 86_400_000);
}

/**
 * Estado de un papel. El orden de las preguntas es el orden de gravedad: lo
 * que se muestra es el peor problema, no el primero que aparece.
 *
 * Un documento observado se marca observado aunque esté vigente: la fecha no
 * arregla que oficina central lo haya devuelto.
 */
export function estadoDocumento(
  doc: ContractorDocument | null | undefined,
  tipo: Pick<ContractorDocumentType, 'hasExpiry' | 'warnDays'>,
  hoy: Date = new Date(),
): EstadoDocumento {
  if (!doc) return 'faltante';
  if (doc.status === 'observado') return 'observado';

  if (tipo.hasExpiry) {
    const dias = diasParaVencer(doc.expiryDate, hoy);
    // Un documento que caduca y no dice cuándo no se puede controlar: se
    // trata como si faltara, que es lo que en la práctica significa.
    if (dias === null) return 'faltante';
    if (dias < 0) return 'vencido';
    if (doc.status !== 'aprobado') return 'en_revision';
    if (dias <= (tipo.warnDays ?? AVISO_VENCIMIENTO_DIAS)) return 'por_vencer';
    return 'vigente';
  }

  return doc.status === 'aprobado' ? 'vigente' : 'en_revision';
}

/* ── El expediente completo ────────────────────────────────────────────── */

export interface LineaExpediente {
  tipo: ContractorDocumentType;
  documento: ContractorDocument | null;
  estado: EstadoDocumento;
  /** Negativo = vencido. `null` si el tipo no caduca o falta la fecha. */
  diasParaVencer: number | null;
}

export interface Expediente {
  lineas: LineaExpediente[];
  estado: EstadoEnrolamiento;
  /** Solo los obligatorios: son los que bloquean. */
  faltantes: LineaExpediente[];
  observados: LineaExpediente[];
  vencidos: LineaExpediente[];
  porVencer: LineaExpediente[];
  /** Obligatorios resueltos / obligatorios totales, en %. */
  avance: number;
}

/**
 * Arma el expediente de un contratista: una línea por cada papel que la
 * empresa exige, esté cargado o no.
 *
 * Se recorren los TIPOS y no los documentos, a propósito: la lista de lo que
 * falta es tan importante como la de lo que hay, y recorriendo los documentos
 * los faltantes serían invisibles.
 */
export function expedienteDe(
  supplierId: string,
  tipos: ContractorDocumentType[],
  documentos: ContractorDocument[],
  hoy: Date = new Date(),
): Expediente {
  const activos = tipos
    .filter((t) => t.active !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const delContratista = documentos.filter((d) => d.supplierId === supplierId);

  const lineas: LineaExpediente[] = activos.map((tipo) => {
    const documento = delContratista.find((d) => d.documentTypeId === tipo.id) ?? null;
    return {
      tipo,
      documento,
      estado: estadoDocumento(documento, tipo, hoy),
      diasParaVencer: tipo.hasExpiry ? diasParaVencer(documento?.expiryDate, hoy) : null,
    };
  });

  const obligatorias = lineas.filter((l) => l.tipo.required);
  const conEstado = (e: EstadoDocumento) => obligatorias.filter((l) => l.estado === e);

  const faltantes = conEstado('faltante');
  const observados = conEstado('observado');
  const vencidos = conEstado('vencido');
  const porVencer = obligatorias.filter((l) => l.estado === 'por_vencer');
  const enRevision = conEstado('en_revision');

  // Mismo orden de gravedad que la función de Postgres.
  let estado: EstadoEnrolamiento;
  if (obligatorias.length === 0) estado = 'sin_expediente';
  else if (vencidos.length > 0) estado = 'vencido';
  else if (observados.length > 0) estado = 'observado';
  else if (faltantes.length > 0 || enRevision.length > 0) estado = 'incompleto';
  else estado = 'enrolado';

  const resueltas = obligatorias.filter(
    (l) => l.estado === 'vigente' || l.estado === 'por_vencer',
  ).length;

  return {
    lineas,
    estado,
    faltantes,
    observados,
    vencidos,
    porVencer,
    avance: obligatorias.length === 0
      ? 0
      : Math.round((resueltas / obligatorias.length) * 100),
  };
}

/* ── La puerta ─────────────────────────────────────────────────────────── */

/**
 * ¿Se le puede firmar un contrato a este contratista?
 *
 * Es la regla de la pizarra: «asociar contrato a un subcontrato enrolado». El
 * mensaje dice QUÉ falta, no solo que falta — quien lo lee tiene que poder
 * arreglarlo sin llamar a nadie.
 *
 * Un contratista con papeles POR VENCER sí puede contratarse: todavía están
 * vigentes. Avisar es distinto de bloquear.
 */
export function puedeContratarse(exp: Expediente): { puede: boolean; motivo?: string } {
  if (exp.estado === 'enrolado') return { puede: true };

  if (exp.estado === 'sin_expediente') {
    return {
      puede: false,
      motivo: 'Esta empresa todavía no exige documentos a sus contratistas. '
        + 'Carga el listado en Contratistas → Documentos exigidos.',
    };
  }

  if (exp.vencidos.length > 0) {
    return {
      puede: false,
      motivo: `Documentos vencidos: ${nombres(exp.vencidos)}.`,
    };
  }

  if (exp.observados.length > 0) {
    return {
      puede: false,
      motivo: `Documentos devueltos con observaciones: ${nombres(exp.observados)}.`,
    };
  }

  if (exp.faltantes.length > 0) {
    return { puede: false, motivo: `Faltan por cargar: ${nombres(exp.faltantes)}.` };
  }

  return {
    puede: false,
    motivo: 'Hay documentos cargados que oficina central todavía no revisa.',
  };
}

function nombres(lineas: LineaExpediente[]): string {
  return lineas.map((l) => l.tipo.name).join(', ');
}

/* ── Vista de conjunto ─────────────────────────────────────────────────── */

export interface AlertaVencimiento {
  supplierId: string;
  supplierName: string;
  linea: LineaExpediente;
}

/**
 * Todo lo que vence pronto o ya venció, en todos los contratistas, ordenado
 * por urgencia. Es lo que alimenta el aviso: sin esta lista, un F30-1 vencido
 * se descubre el día que hay que pagar.
 */
export function vencimientosProximos(
  contratistas: { id: string; name: string }[],
  tipos: ContractorDocumentType[],
  documentos: ContractorDocument[],
  hoy: Date = new Date(),
): AlertaVencimiento[] {
  const alertas: AlertaVencimiento[] = [];

  for (const c of contratistas) {
    const exp = expedienteDe(c.id, tipos, documentos, hoy);
    for (const linea of [...exp.vencidos, ...exp.porVencer]) {
      alertas.push({ supplierId: c.id, supplierName: c.name, linea });
    }
  }

  // Lo más vencido primero; los sin fecha, al final.
  return alertas.sort((a, b) => {
    const da = a.linea.diasParaVencer ?? Number.MAX_SAFE_INTEGER;
    const db = b.linea.diasParaVencer ?? Number.MAX_SAFE_INTEGER;
    return da - db;
  });
}

/**
 * Resumen para la lista de contratistas: cuántos hay en cada estado. Es el
 * número que va arriba de la pantalla, para no tener que abrir uno por uno.
 */
export function resumenContratistas(
  contratistas: { id: string }[],
  tipos: ContractorDocumentType[],
  documentos: ContractorDocument[],
  hoy: Date = new Date(),
): Record<EstadoEnrolamiento, number> {
  const base: Record<EstadoEnrolamiento, number> = {
    sin_expediente: 0, incompleto: 0, observado: 0, vencido: 0, enrolado: 0,
  };
  for (const c of contratistas) {
    base[expedienteDe(c.id, tipos, documentos, hoy).estado] += 1;
  }
  return base;
}
