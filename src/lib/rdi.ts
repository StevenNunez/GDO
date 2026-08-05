/**
 * RDI (Requerimientos de Información): plazos de respuesta y qué está en
 * riesgo.
 *
 * Lógica pura, sin React ni acceso a datos, para poder cubrirla con tests
 * (`rdi.test.ts`).
 *
 * Dos reglas de fondo:
 *
 * 1. **"Vencida" se deriva de la fecha, no se guarda.** Una RDI marcada como
 *    "abierta" seguiría diciéndolo tres semanas después de vencer el plazo —
 *    el mismo criterio que las garantías en `contract.ts`.
 * 2. **Una RDI respondida con impacto y sin adicional es plata que se está
 *    perdiendo.** Es el hallazgo que la pantalla tiene que gritar: alguien
 *    contestó "sí, hay que hacer obra extra" y nadie la cobró.
 */

import type { Rdi } from '@/modules/core/lib/data';
import { toCalendarDay, diffCalendarDays, toDate } from '@/lib/date-utils';

/** Días antes del vencimiento en que una RDI empieza a avisar. */
export const DIAS_AVISO_RDI = 3;

export type EstadoRdi =
  | 'abierta'
  | 'por-vencer'
  | 'vencida'
  | 'sin-plazo'
  | 'respondida'
  | 'cerrada'
  | 'anulada';

/**
 * Días que quedan para responder. Negativo = ya venció; `null` si no se pactó
 * plazo (no todas las RDI lo tienen, y suponer uno sería inventarlo).
 */
export function diasParaResponder(
  rdi: Pick<Rdi, 'dueDate'>,
  hoy: Date | string = new Date(),
): number | null {
  const vence = toCalendarDay(rdi.dueDate);
  const ahora = toCalendarDay(hoy);
  if (!vence || !ahora) return null;
  return diffCalendarDays(vence, ahora);
}

/**
 * Estado real de la RDI. Lo que alguien decidió (respondida, cerrada, anulada)
 * manda sobre la fecha: una RDI ya respondida no está "vencida", está cerrada.
 */
export function estadoRdi(
  rdi: Pick<Rdi, 'status' | 'dueDate'>,
  hoy: Date | string = new Date(),
): EstadoRdi {
  if (rdi.status !== 'abierta') return rdi.status;

  const dias = diasParaResponder(rdi, hoy);
  if (dias === null) return 'sin-plazo';
  if (dias < 0) return 'vencida';
  if (dias <= DIAS_AVISO_RDI) return 'por-vencer';
  return 'abierta';
}

/** Una RDI que sigue esperando respuesta. */
export function estaPendiente(rdi: Pick<Rdi, 'status'>): boolean {
  return rdi.status === 'abierta';
}

/**
 * RDI que exigen acción, de la más urgente a la menos: primero las vencidas,
 * después las que están por vencer, y al final las que no tienen plazo.
 */
export function rdisPendientes(rdis: Rdi[], hoy: Date | string = new Date()): Rdi[] {
  return rdis
    .filter(estaPendiente)
    .sort((a, b) => {
      const da = diasParaResponder(a, hoy);
      const db = diasParaResponder(b, hoy);
      // Sin plazo va al final: no se puede decir que esté atrasada.
      if (da === null && db === null) return a.number - b.number;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    });
}

/**
 * RDI respondidas que declararon impacto en costo o plazo y todavía no
 * generaron un adicional. Es obra reconocida por escrito y sin cobrar.
 */
export function rdisConImpactoSinAdicional(rdis: Rdi[]): Rdi[] {
  return rdis.filter((r) => (
    (r.status === 'respondida' || r.status === 'cerrada')
    && (r.impactCost || r.impactTime)
    && !r.amendmentId
  ));
}

/* ── Resumen ──────────────────────────────────────────────────────────── */

export interface ResumenRdi {
  total: number;
  pendientes: number;
  vencidas: number;
  porVencer: number;
  respondidas: number;
  /** Respondidas con impacto declarado y sin adicional asociado. */
  impactoSinCobrar: number;
}

export function resumenRdi(rdis: Rdi[], hoy: Date | string = new Date()): ResumenRdi {
  let pendientes = 0;
  let vencidas = 0;
  let porVencer = 0;
  let respondidas = 0;

  for (const r of rdis) {
    const estado = estadoRdi(r, hoy);
    if (estado === 'respondida' || estado === 'cerrada') respondidas += 1;
    if (r.status === 'abierta') {
      pendientes += 1;
      if (estado === 'vencida') vencidas += 1;
      if (estado === 'por-vencer') porVencer += 1;
    }
  }

  return {
    total: rdis.length,
    pendientes,
    vencidas,
    porVencer,
    respondidas,
    impactoSinCobrar: rdisConImpactoSinAdicional(rdis).length,
  };
}

/** Siguiente correlativo de la obra. */
export function siguienteNumeroRdi(anteriores: { number: number }[]): number {
  return anteriores.reduce((max, r) => Math.max(max, r.number ?? 0), 0) + 1;
}

/**
 * Días que tardó en responderse. `null` si le falta alguna de las dos fechas:
 * un cero sería mentira, no "respondida el mismo día".
 */
export function diasDeRespuesta(rdi: Pick<Rdi, 'askedAt' | 'answeredAt'>): number | null {
  const pregunta = toCalendarDay(rdi.askedAt);
  const respuesta = toCalendarDay(toDate(rdi.answeredAt));
  if (!pregunta || !respuesta) return null;
  return Math.max(0, diffCalendarDays(respuesta, pregunta));
}

/**
 * Cuánto se demora en promedio el mandante en responder. Solo cuenta las que
 * tienen las dos fechas; `null` si no hay ninguna medible.
 */
export function promedioRespuesta(rdis: Rdi[]): number | null {
  const dias = rdis
    .map(diasDeRespuesta)
    .filter((d): d is number => d !== null);
  if (dias.length === 0) return null;
  return dias.reduce((s, d) => s + d, 0) / dias.length;
}

/* ── Etiquetas ────────────────────────────────────────────────────────── */

export const PRIORIDADES_RDI: Record<Rdi['priority'], string> = {
  baja: 'Baja',
  normal: 'Normal',
  alta: 'Alta',
};
