/**
 * Subcontratos: lo que la obra le paga a sus subcontratistas.
 *
 * Lógica pura, sin React ni acceso a datos (`subcontract.test.ts`).
 *
 * **Acá no se reimplementa ninguna matemática de plata.** El anticipo, la
 * retención, la multa y la carátula salen de `contract.ts` y
 * `payment-certificate.ts`, que ya están probados con el contrato del mandante:
 * un subcontrato es el mismo mecanismo al revés. Lo que sí vive acá es lo
 * propio del subcontrato: el cumplimiento laboral y el saldo de retención por
 * devolver.
 */

import type {
  Reception, Subcontract, SubcontractCertificate, SubcontractItem,
} from '@/modules/core/lib/data';
import { toCalendarDay, diffCalendarDays } from '@/lib/date-utils';

/* ── Estados firmes ───────────────────────────────────────────────────── */

/** Estados en que un estado de pago ya cuenta para los acumulados. */
const ESTADOS_FIRMES = ['aprobado', 'pagado'];

export function esFirme(status: string): boolean {
  return ESTADOS_FIRMES.includes(status);
}

/**
 * Acumulados de los estados de pago firmes, para armar el siguiente. Mismo
 * criterio que en el EEPP al mandante: un borrador no cuenta, o dos borradores
 * abiertos se descontarían anticipo el uno al otro.
 */
export function acumuladosSubcontrato(certificates: SubcontractCertificate[]) {
  const firmes = certificates.filter((c) => esFirme(c.status));
  return {
    previousAmount: firmes.reduce((s, c) => s + (c.periodAmount ?? 0), 0),
    previousAmortization: firmes.reduce((s, c) => s + (c.advanceAmortization ?? 0), 0),
    previousRetention: firmes.reduce((s, c) => s + (c.retentionAmount ?? 0), 0),
  };
}

/** Siguiente correlativo del subcontrato. */
export function siguienteCorrelativo(anteriores: { number: number }[]): number {
  return anteriores.reduce((max, c) => Math.max(max, c.number ?? 0), 0) + 1;
}

/** Valor del itemizado del subcontrato: Σ cantidad × PU. */
export function montoItemizado(items: SubcontractItem[]): number {
  return items.reduce((s, i) => s + (i.quantity ?? 0) * (i.unitPrice ?? 0), 0);
}

/* ── Cumplimiento laboral (Ley 20.123) ────────────────────────────────── */

export type EstadoCumplimiento = 'ok' | 'falta_f30_1' | 'falta_f30' | 'no_exigido';

/**
 * Días que puede tener un certificado F30-1 y seguir sirviendo para el período
 * que se paga. Uno de hace ocho meses no acredita nada.
 */
export const DIAS_VIGENCIA_F30 = 60;

/**
 * Estado del cumplimiento laboral de un estado de pago.
 *
 * El F30-1 es el que importa para pagar (acredita las deudas laborales y
 * previsionales del subcontratista con SUS trabajadores). El F30 —certificado
 * de antecedentes laborales— se pide de todos modos, pero su ausencia no
 * bloquea el pago: se informa.
 */
export function estadoCumplimiento(
  certificate: Pick<SubcontractCertificate, 'f30Date' | 'f30_1Date' | 'periodEnd'>,
  subcontract: Pick<Subcontract, 'requiresLaborCompliance'>,
): EstadoCumplimiento {
  if (!subcontract.requiresLaborCompliance) return 'no_exigido';
  if (!certificate.f30_1Date) return 'falta_f30_1';
  if (!certificate.f30Date) return 'falta_f30';
  return 'ok';
}

/**
 * Un certificado sirve si es posterior al período que se paga (o del mismo
 * mes) y no está vencido. `null` si falta alguna de las dos fechas: sin
 * período no se puede juzgar la vigencia, y decir "vigente" a ciegas sería
 * exactamente lo que la ley castiga.
 */
export function certificadoVigente(
  fechaCertificado: Date | string | null | undefined,
  finDelPeriodo: Date | string | null | undefined,
): boolean | null {
  const cert = toCalendarDay(fechaCertificado);
  const fin = toCalendarDay(finDelPeriodo);
  if (!cert || !fin) return null;

  const dias = diffCalendarDays(cert, fin);
  // Anterior al cierre del período: no acredita ese período.
  if (dias < 0) return false;
  return dias <= DIAS_VIGENCIA_F30;
}

/** Si la base va a dejar pagar este estado de pago, y por qué no. */
export function puedePagarse(
  certificate: Pick<SubcontractCertificate, 'status' | 'f30_1Date'>,
  subcontract: Pick<Subcontract, 'requiresLaborCompliance'>,
): { puede: boolean; motivo?: string } {
  if (certificate.status !== 'aprobado') {
    return { puede: false, motivo: 'Solo se paga un estado de pago aprobado.' };
  }
  if (subcontract.requiresLaborCompliance && !certificate.f30_1Date) {
    return {
      puede: false,
      motivo: 'Falta el certificado F30-1 del período: sin él la empresa responde por las deudas laborales del subcontratista (Ley 20.123).',
    };
  }
  return { puede: true };
}

/* ── Retención ────────────────────────────────────────────────────────── */

/**
 * Saldo de retención del subcontrato: lo retenido en los estados de pago
 * firmes menos lo ya devuelto en las recepciones.
 *
 * Es la cifra que se le debe al subcontratista y que solo se libera cuando
 * recibe la obra. Sin este número, la retención queda en la planilla para
 * siempre y nadie la reclama.
 */
export function saldoRetencion(
  certificates: SubcontractCertificate[],
  receptions: Reception[],
): { retenido: number; devuelto: number; saldo: number } {
  const retenido = certificates
    .filter((c) => esFirme(c.status))
    .reduce((s, c) => s + (c.retentionAmount ?? 0), 0);

  const devuelto = receptions.reduce((s, r) => s + (r.retentionReleased ?? 0), 0);

  return { retenido, devuelto, saldo: Math.max(0, retenido - devuelto) };
}

/* ── Resumen ──────────────────────────────────────────────────────────── */

export interface ResumenSubcontratos {
  vigentes: number;
  contratado: number;
  /** Avance cobrado por los subcontratistas en estados de pago firmes. */
  ejecutado: number;
  pagado: number;
  retenido: number;
  /** Aprobados que no se pueden pagar porque falta el F30-1. */
  bloqueadosPorF30: number;
}

/**
 * Los números de la lista de subcontratos. `ejecutado` es lo devengado (firme),
 * `pagado` solo lo que efectivamente salió de caja: son dos cosas distintas y
 * mezclarlas esconde la deuda con los subcontratistas.
 */
export function resumenSubcontratos(
  subcontracts: Subcontract[],
  certificates: SubcontractCertificate[],
): ResumenSubcontratos {
  const porId = new Map(subcontracts.map((s) => [s.id, s]));
  const propios = certificates.filter((c) => porId.has(c.subcontractId));

  const firmes = propios.filter((c) => esFirme(c.status));

  return {
    vigentes: subcontracts.filter((s) => s.status === 'vigente').length,
    contratado: subcontracts
      .filter((s) => s.status !== 'borrador')
      .reduce((s, x) => s + (x.amountNet ?? 0), 0),
    ejecutado: firmes.reduce((s, c) => s + (c.periodAmount ?? 0), 0),
    pagado: propios
      .filter((c) => c.status === 'pagado')
      .reduce((s, c) => s + (c.totalAmount ?? 0), 0),
    retenido: firmes.reduce((s, c) => s + (c.retentionAmount ?? 0), 0),
    bloqueadosPorF30: propios.filter((c) => {
      if (c.status !== 'aprobado') return false;
      const sub = porId.get(c.subcontractId);
      return !!sub && !puedePagarse(c, sub).puede;
    }).length,
  };
}

/* ── Etiquetas ────────────────────────────────────────────────────────── */

export const ESTADOS_SUBCONTRATO: Record<Subcontract['status'], string> = {
  borrador: 'Borrador',
  vigente: 'Vigente',
  suspendido: 'Suspendido',
  terminado: 'Terminado',
  liquidado: 'Liquidado',
};

export const ESTADOS_EEPP_SUBCONTRATO: Record<SubcontractCertificate['status'], string> = {
  borrador: 'Borrador',
  presentado: 'Presentado',
  aprobado: 'Aprobado',
  pagado: 'Pagado',
  rechazado: 'Rechazado',
};
