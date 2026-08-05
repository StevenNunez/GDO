/**
 * Recepción de obra: provisoria, definitiva, y la lista de observaciones que
 * hay que subsanar antes de cerrar.
 *
 * Lógica pura, sin React ni acceso a datos (`reception.test.ts`).
 *
 * Dos reglas de fondo:
 *
 * 1. **El estado real de una recepción se deduce de sus observaciones.** Una
 *    recepción marcada "aceptada" con cinco observaciones críticas pendientes
 *    es exactamente lo que nadie quiere descubrir seis meses después.
 * 2. **La recepción definitiva no se puede firmar con observaciones
 *    pendientes.** Es la que libera el resto de la retención y cierra la
 *    responsabilidad: firmarla con defectos abiertos es regalar el saldo.
 */

import type { Reception, ReceptionObservation } from '@/modules/core/lib/data';
import { toCalendarDay, addCalendarDays, diffCalendarDays } from '@/lib/date-utils';

/* ── Observaciones ────────────────────────────────────────────────────── */

/** Observaciones de una recepción, dentro de una lista de todas. */
export function observacionesDe(
  observations: ReceptionObservation[],
  receptionId: string,
): ReceptionObservation[] {
  return observations.filter((o) => o.receptionId === receptionId);
}

/** Las que siguen abiertas. Las anuladas no cuentan: se descartaron. */
export function observacionesPendientes(
  observations: ReceptionObservation[],
): ReceptionObservation[] {
  return observations.filter((o) => o.status === 'pendiente');
}

/** Pendientes cuya fecha comprometida ya pasó. */
export function observacionesVencidas(
  observations: ReceptionObservation[],
  hoy: Date | string = new Date(),
): ReceptionObservation[] {
  const ahora = toCalendarDay(hoy);
  if (!ahora) return [];
  return observacionesPendientes(observations).filter((o) => {
    const vence = toCalendarDay(o.dueDate);
    return vence !== null && diffCalendarDays(vence, ahora) < 0;
  });
}

/** Pendientes que además son graves: son las que bloquean de verdad. */
export function observacionesCriticas(
  observations: ReceptionObservation[],
): ReceptionObservation[] {
  return observacionesPendientes(observations)
    .filter((o) => o.severity === 'critica' || o.severity === 'mayor');
}

/* ── Estado real ──────────────────────────────────────────────────────── */

export type EstadoRecepcion =
  | 'borrador'
  | 'con_observaciones'
  | 'subsanada'
  | 'aceptada'
  | 'rechazada';

/**
 * Estado real de la recepción, cruzando lo que alguien declaró con sus
 * observaciones.
 *
 * Una recepción "aceptada" con observaciones pendientes se reporta como
 * `con_observaciones`: el dato duro manda sobre la casilla marcada.
 * `subsanada` = ya se levantaron todas, falta aceptarla formalmente.
 */
export function estadoRecepcion(
  reception: Pick<Reception, 'status'>,
  observations: ReceptionObservation[],
): EstadoRecepcion {
  if (reception.status === 'rechazada') return 'rechazada';
  if (reception.status === 'borrador') return 'borrador';

  const pendientes = observacionesPendientes(observations);
  if (pendientes.length > 0) return 'con_observaciones';

  return reception.status === 'aceptada' ? 'aceptada' : 'subsanada';
}

/**
 * Si se puede firmar la recepción definitiva.
 *
 * Exige que exista una provisoria previa —la definitiva certifica que lo
 * observado en aquella quedó resuelto— y que no queden observaciones
 * pendientes en ninguna de las recepciones anteriores.
 */
export function puedeRecepcionDefinitiva(
  recepcionesPrevias: Reception[],
  observaciones: ReceptionObservation[],
): { puede: boolean; motivo?: string } {
  const provisorias = recepcionesPrevias.filter((r) => r.type === 'provisoria');
  if (provisorias.length === 0) {
    return {
      puede: false,
      motivo: 'Primero hay que recibir provisoriamente: la definitiva certifica que lo observado se resolvió.',
    };
  }

  const pendientes = observacionesPendientes(observaciones);
  if (pendientes.length > 0) {
    return {
      puede: false,
      motivo: `Quedan ${pendientes.length} observación(es) sin subsanar. Firmar la definitiva las da por aceptadas.`,
    };
  }

  return { puede: true };
}

/**
 * Fecha en que vence el plazo de garantía que abrió la recepción provisoria.
 * `null` si falta la fecha o el plazo — no se inventa.
 */
export function finDeGarantia(reception: Pick<Reception, 'receptionDate' | 'warrantyDays'>): Date | null {
  const inicio = toCalendarDay(reception.receptionDate);
  if (!inicio || !reception.warrantyDays) return null;
  return addCalendarDays(inicio, reception.warrantyDays);
}

/** Días que faltan para que termine la garantía. Negativo = ya venció. */
export function diasDeGarantia(
  reception: Pick<Reception, 'receptionDate' | 'warrantyDays'>,
  hoy: Date | string = new Date(),
): number | null {
  const fin = finDeGarantia(reception);
  const ahora = toCalendarDay(hoy);
  if (!fin || !ahora) return null;
  return diffCalendarDays(fin, ahora);
}

/* ── Resumen ──────────────────────────────────────────────────────────── */

export interface ResumenRecepcion {
  observaciones: number;
  pendientes: number;
  vencidas: number;
  criticas: number;
  /** 0–100 de observaciones cerradas; `null` si no hay ninguna que medir. */
  avanceSubsanacion: number | null;
}

export function resumenRecepcion(observations: ReceptionObservation[]): ResumenRecepcion {
  const vivas = observations.filter((o) => o.status !== 'anulada');
  const pendientes = observacionesPendientes(vivas);

  return {
    observaciones: vivas.length,
    pendientes: pendientes.length,
    vencidas: observacionesVencidas(vivas).length,
    criticas: observacionesCriticas(vivas).length,
    avanceSubsanacion: vivas.length > 0
      ? ((vivas.length - pendientes.length) / vivas.length) * 100
      : null,
  };
}

/* ── Etiquetas ────────────────────────────────────────────────────────── */

export const TIPOS_RECEPCION: Record<Reception['type'], string> = {
  provisoria: 'Recepción provisoria',
  definitiva: 'Recepción definitiva',
};

export const SEVERIDADES: Record<ReceptionObservation['severity'], string> = {
  menor: 'Menor',
  mayor: 'Mayor',
  critica: 'Crítica',
};

export const ESTADOS_OBSERVACION: Record<ReceptionObservation['status'], string> = {
  pendiente: 'Pendiente',
  subsanada: 'Subsanada',
  aceptada: 'Aceptada',
  anulada: 'Anulada',
};
