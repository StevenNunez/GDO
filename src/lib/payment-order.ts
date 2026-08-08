/**
 * Orden de Pago y cierre del contrato (migración 035).
 *
 * La OP es el documento con el que Finanzas paga: entre aprobar un estado de
 * pago y que la plata salga hay un papel con vida propia — se emite, se manda,
 * a veces se anula y se reemite. El cierre es el otro extremo: liquidar el
 * contrato cuando ya no queda nada pendiente.
 *
 * Lógica pura, con tests.
 */

import { toCalendarDay } from '@/lib/date-utils';
import type {
  PaymentOrder, Reception, Subcontract, SubcontractCertificate, Supplier,
} from '@/modules/core/lib/data';

/* ── Etiquetas ─────────────────────────────────────────────────────────── */

export const ESTADOS_OP: Record<PaymentOrder['status'], string> = {
  emitida: 'Emitida',
  enviada: 'Enviada al contratista',
  pagada: 'Pagada',
  anulada: 'Anulada',
};

export const TONO_OP: Record<PaymentOrder['status'], 'neutral' | 'info' | 'success' | 'danger'> = {
  emitida: 'neutral',
  enviada: 'info',
  pagada: 'success',
  anulada: 'danger',
};

/* ── Emisión ───────────────────────────────────────────────────────────── */

/**
 * ¿Se puede emitir la orden de pago de este estado de pago?
 *
 * Espejo de `payment_order_guard` en la base. Las dos condiciones que importan:
 * el estado de pago tiene que estar aprobado, y —en subcontratos que lo
 * exijan— el F30-1 del período tiene que estar cargado. La orden es justamente
 * el papel con el que sale la plata: pagar sin F30-1 es el riesgo que la Ley
 * 20.123 le traspasa a quien paga.
 */
export function puedeEmitirseOP(
  certificate: Pick<SubcontractCertificate, 'status' | 'f30_1Date' | 'totalAmount'>,
  subcontract: Pick<Subcontract, 'requiresLaborCompliance'>,
  ordenesExistentes: PaymentOrder[] = [],
): { puede: boolean; motivo?: string } {
  if (certificate.status !== 'aprobado' && certificate.status !== 'pagado') {
    return {
      puede: false,
      motivo: 'Solo se emite una orden de pago de un estado de pago aprobado.',
    };
  }

  if (subcontract.requiresLaborCompliance && !certificate.f30_1Date) {
    return {
      puede: false,
      motivo: 'Falta el certificado F30-1 del período: sin él la empresa responde por las '
        + 'deudas laborales del subcontratista (Ley 20.123).',
    };
  }

  if ((certificate.totalAmount ?? 0) <= 0) {
    return { puede: false, motivo: 'El estado de pago no tiene monto a pagar.' };
  }

  if (ordenesExistentes.some((o) => o.status !== 'anulada')) {
    return {
      puede: false,
      motivo: 'Este estado de pago ya tiene una orden de pago vigente. Anúlala antes de reemitir.',
    };
  }

  return { puede: true };
}

/** Las órdenes de UN estado de pago. */
export function ordenesDe(
  orders: PaymentOrder[],
  certificateType: 'subcontract' | 'contract',
  certificateId: string,
): PaymentOrder[] {
  return orders.filter(
    (o) => o.certificateType === certificateType && o.certificateId === certificateId,
  );
}

/** La orden vigente (no anulada), si existe. */
export function ordenVigente(
  orders: PaymentOrder[],
  certificateType: 'subcontract' | 'contract',
  certificateId: string,
): PaymentOrder | null {
  return ordenesDe(orders, certificateType, certificateId)
    .find((o) => o.status !== 'anulada') ?? null;
}

/**
 * Datos bancarios con los que se paga, tomados de la ficha del contratista.
 * Se copian a la orden en vez de referenciarlos: si mañana cambia de banco,
 * esta orden tiene que seguir diciendo a dónde se transfirió de verdad.
 */
export function datosDePago(supplier: Supplier | null | undefined): {
  bank: string | null;
  accountType: string | null;
  accountNumber: string | null;
  email: string | null;
  faltantes: string[];
} {
  const faltantes: string[] = [];
  if (!supplier?.bank) faltantes.push('banco');
  if (!supplier?.accountNumber) faltantes.push('número de cuenta');
  if (!supplier?.email) faltantes.push('correo');

  return {
    bank: supplier?.bank ?? null,
    accountType: supplier?.accountType ?? null,
    accountNumber: supplier?.accountNumber ?? null,
    email: supplier?.email ?? null,
    faltantes,
  };
}

/** Vencimiento sugerido: emisión + días de pago pactados (30 por defecto). */
export function vencimientoSugerido(
  issueDate: Date | string,
  diasDePago = 30,
): Date | null {
  const dia = toCalendarDay(issueDate);
  if (!dia) return null;
  return new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + diasDePago);
}

/* ── Cierre del contrato ───────────────────────────────────────────────── */

export interface EstadoCierre {
  puede: boolean;
  /** Lo que falta para poder liquidar, en palabras. */
  pendientes: string[];
  /** Cuánto se le ha pagado en total (estados de pago pagados). */
  totalPagado: number;
  /** Retención que todavía no se devuelve. */
  retencionPorDevolver: number;
  /** Estados de pago que no están pagados todavía. */
  eeppPendientes: number;
}

/**
 * ¿Se puede liquidar el subcontrato?
 *
 * Liquidar es decir «con este contratista no queda nada pendiente». Cerrarlo
 * con retención sin devolver o con estados de pago sin pagar deja plata
 * colgando que después nadie reclama — y la retención, en particular, se queda
 * en la planilla para siempre.
 */
export function estadoCierre(
  eepps: SubcontractCertificate[],
  opts: {
    retencionPorDevolver: number;
    recepciones: Reception[];
    /** Adendas presentadas sin resolver: cerrar con una abierta la deja en el aire. */
    adendasEnTramite?: number;
  },
): EstadoCierre {
  const pendientes: string[] = [];

  const vivos = eepps.filter((e) => e.status !== 'rechazado');
  const sinPagar = vivos.filter((e) => e.status !== 'pagado');
  const totalPagado = vivos
    .filter((e) => e.status === 'pagado')
    .reduce((s, e) => s + (e.totalAmount ?? 0), 0);

  if (sinPagar.length > 0) {
    pendientes.push(
      `${sinPagar.length} estado(s) de pago sin pagar.`,
    );
  }

  if (opts.retencionPorDevolver > 0) {
    pendientes.push(
      'Queda retención sin devolver: se libera con la recepción definitiva.',
    );
  }

  const definitiva = opts.recepciones.some(
    (r) => r.type === 'definitiva' && r.status !== 'borrador',
  );
  if (!definitiva) {
    pendientes.push('Falta la recepción definitiva de los trabajos.');
  }

  if ((opts.adendasEnTramite ?? 0) > 0) {
    pendientes.push(
      `${opts.adendasEnTramite} adenda(s) presentadas sin resolver.`,
    );
  }

  return {
    puede: pendientes.length === 0,
    pendientes,
    totalPagado,
    retencionPorDevolver: opts.retencionPorDevolver,
    eeppPendientes: sinPagar.length,
  };
}

/**
 * Resumen final del contrato, para el acta de liquidación: lo que se pactó,
 * lo que se pagó de verdad y la diferencia.
 */
export interface LiquidacionFinal {
  montoContratado: number;
  montoVigente: number;
  totalPagado: number;
  /** Pagado − vigente. Negativo = se pagó menos de lo contratado. */
  diferencia: number;
  /** Esa diferencia en %, sobre el monto vigente. `null` si el vigente es 0. */
  diferenciaPct: number | null;
}

export function liquidacionFinal(
  montoContratado: number,
  montoVigente: number,
  totalPagado: number,
): LiquidacionFinal {
  const diferencia = totalPagado - montoVigente;
  return {
    montoContratado,
    montoVigente,
    totalPagado,
    diferencia,
    diferenciaPct: montoVigente > 0 ? (diferencia / montoVigente) * 100 : null,
  };
}
