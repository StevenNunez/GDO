/**
 * Motor del Estado de Pago al mandante (EEPP).
 *
 * Lógica pura, sin React ni acceso a datos, para poder cubrirla con tests
 * (`payment-certificate.test.ts`). Es la plata que la obra cobra: nada de esto
 * debe vivir dentro de un componente.
 *
 * Dos piezas:
 *   1. `calcLineas`   — cuánto se cobra por cada partida en este período.
 *   2. `calcCaratula` — la portada: avance, reajuste, descuentos, neto, IVA y
 *                       total a pagar.
 *
 * Cómo se cobra depende del tipo de contrato (ver `ContractType`), por eso el
 * cálculo de la línea recibe el tipo en vez de asumir uno.
 */

import type { Contract, ContractType } from '@/modules/core/lib/data';
import {
  amortizacionAnticipo,
  montoRetencion,
  calcReajuste,
} from '@/lib/contract';

/* ── Líneas ───────────────────────────────────────────────────────────── */

export interface LineaEntrada {
  workItemId: string;
  name: string;
  unit?: string | null;
  /** Cantidad contratada de la partida (de la EDT). */
  quantityContract: number;
  /** Precio unitario de contrato. */
  unitPrice: number;
  /** Cantidad ya cobrada en EEPP anteriores aprobados. */
  previousQuantity: number;
  /**
   * Cantidad acumulada que se declara a este período. Para suma alzada la UI
   * trabaja en % y la convierte con `cantidadDesdePorcentaje`.
   */
  accumulatedQuantity: number;
}

export interface LineaCalculada extends LineaEntrada {
  /** Valor total de la partida en el contrato. */
  contractAmount: number;
  periodQuantity: number;
  previousAmount: number;
  periodAmount: number;
  accumulatedAmount: number;
  /** % acumulado sobre lo contratado (0–100). 0 si la partida no tiene cantidad. */
  accumulatedPercent: number;
}

/** Cantidad equivalente a un % de avance. Suma alzada se cobra así. */
export function cantidadDesdePorcentaje(quantityContract: number, percent: number): number {
  return (quantityContract * percent) / 100;
}

/** % de avance que representa una cantidad. Inverso del anterior. */
export function porcentajeDesdeCantidad(quantityContract: number, quantity: number): number {
  if (!quantityContract) return 0;
  return (quantity / quantityContract) * 100;
}

/**
 * Calcula una línea del estado de pago.
 *
 * Suma alzada y serie de precios unitarios comparten la aritmética
 * (cantidad × PU); lo que cambia es de dónde sale la cantidad — un % pactado en
 * suma alzada, la cubicación real en precios unitarios. La diferencia vive en la
 * UI, no acá.
 *
 * **Administración delegada no pasa por acá**: no se cobra por partida sino por
 * el costo real del período más el honorario (ver `calcCaratula`).
 *
 * La cantidad acumulada se topa a la contratada: sin ese tope, cargar una
 * cubicación mayor a la del contrato haría cobrar de más sin que nadie lo note.
 * Lo que exceda el contrato es una obra extraordinaria y va por adicional
 * (Fase 4), no escondido dentro de una partida.
 */
export function calcLinea(linea: LineaEntrada, _tipo?: ContractType): LineaCalculada {
  const quantityContract = linea.quantityContract ?? 0;
  const unitPrice = linea.unitPrice ?? 0;
  const previousQuantity = Math.max(0, linea.previousQuantity ?? 0);

  const tope = quantityContract > 0 ? quantityContract : Infinity;
  const accumulatedQuantity = Math.min(
    Math.max(0, linea.accumulatedQuantity ?? 0),
    tope,
  );

  // Nunca negativa: un EEPP no "descobra" lo ya cobrado. Una corrección a la
  // baja se hace con una nota de crédito, no con un período negativo.
  const periodQuantity = Math.max(0, accumulatedQuantity - previousQuantity);

  return {
    ...linea,
    quantityContract,
    unitPrice,
    previousQuantity,
    accumulatedQuantity,
    contractAmount: quantityContract * unitPrice,
    periodQuantity,
    previousAmount: previousQuantity * unitPrice,
    periodAmount: periodQuantity * unitPrice,
    accumulatedAmount: accumulatedQuantity * unitPrice,
    accumulatedPercent: porcentajeDesdeCantidad(quantityContract, accumulatedQuantity),
  };
}

export function calcLineas(lineas: LineaEntrada[], tipo?: ContractType): LineaCalculada[] {
  return lineas.map((l) => calcLinea(l, tipo));
}

/* ── Carátula ─────────────────────────────────────────────────────────── */

export interface EntradaCaratula {
  contract: Pick<Contract,
    | 'type' | 'amountNet' | 'advancePercent' | 'retentionPercent'
    | 'retentionCapPercent' | 'taxPercent' | 'feePercent' | 'reajusteType'>;
  /** Líneas ya calculadas. Vacío en administración delegada. */
  lineas: LineaCalculada[];
  /** Acumulado amortizado del anticipo en EEPP anteriores. */
  previousAmortization?: number;
  /** Acumulado retenido en EEPP anteriores. */
  previousRetention?: number;
  /** Acumulado cobrado en EEPP anteriores (para el avance acumulado). */
  previousAmount?: number;

  /** Solo administración delegada: costo real del período. */
  realCostAmount?: number;

  /** Índices para el reajuste. En polinómico se ingresa `reajusteManual`. */
  indiceBase?: number | null;
  indiceActual?: number | null;
  reajusteManual?: number | null;

  /** Descuentos que decide el mandante: no se aplican solos. */
  penaltyAmount?: number;
  otherDeductions?: number;
}

export interface Caratula {
  /** Avance del período (obra ejecutada), neto. */
  periodAmount: number;
  /** Avance acumulado incluyendo este período. */
  accumulatedAmount: number;
  /** Honorario del período. Solo administración delegada. */
  feeAmount: number;
  reajusteAmount: number;
  advanceAmortization: number;
  retentionAmount: number;
  penaltyAmount: number;
  otherDeductions: number;
  /** Lo que se factura, antes de IVA. */
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
}

/**
 * Arma la carátula del estado de pago.
 *
 * Orden de la cascada, que es como se lee una carátula chilena:
 *
 *   Avance del período (+ honorario en adm. delegada)
 *   + Reajuste
 *   − Amortización del anticipo
 *   − Retención
 *   − Multas y otros descuentos
 *   = Neto  →  + IVA  =  Total a pagar
 *
 * Decisiones que conviene tener a la vista:
 * - **Anticipo y retención se calculan sobre el avance del período, no sobre el
 *   subtotal con reajuste.** Es lo habitual y evita retener sobre una corrección
 *   inflacionaria. Si un contrato dijera lo contrario, hay que parametrizarlo.
 * - **La multa no se aplica sola.** La decide el mandante/ITO; acá solo entra lo
 *   que efectivamente se descontó. La sugerencia se calcula aparte con
 *   `calcMulta` y se muestra en pantalla.
 * - **El neto nunca baja de cero**: si los descuentos superan el avance, el EEPP
 *   queda en cero y la diferencia se arrastra — no se emite un cobro negativo.
 */
export function calcCaratula(e: EntradaCaratula): Caratula {
  const { contract } = e;
  const esDelegada = contract.type === 'administracion_delegada';

  const realCost = Math.max(0, e.realCostAmount ?? 0);

  // En administración delegada el "avance" es el costo real del período; en el
  // resto, la suma de las partidas cobradas.
  const periodAmount = esDelegada
    ? realCost
    : e.lineas.reduce((s, l) => s + l.periodAmount, 0);

  const feeAmount = esDelegada ? realCost * ((contract.feePercent ?? 0) / 100) : 0;

  const accumulatedAmount = esDelegada
    ? (e.previousAmount ?? 0) + periodAmount
    : e.lineas.reduce((s, l) => s + l.accumulatedAmount, 0);

  // Base de facturación del período, antes de reajuste y descuentos.
  const basePeriodo = periodAmount + feeAmount;

  const reajusteAmount = e.reajusteManual != null
    ? e.reajusteManual
    : calcReajuste(basePeriodo, e.indiceBase, e.indiceActual, contract.reajusteType);

  const advanceAmortization = amortizacionAnticipo(
    { amountNet: contract.amountNet, advancePercent: contract.advancePercent },
    basePeriodo,
    e.previousAmortization ?? 0,
  );

  const retentionAmount = montoRetencion(
    {
      amountNet: contract.amountNet,
      retentionPercent: contract.retentionPercent,
      retentionCapPercent: contract.retentionCapPercent,
    },
    basePeriodo,
    e.previousRetention ?? 0,
  );

  const penaltyAmount = Math.max(0, e.penaltyAmount ?? 0);
  const otherDeductions = Math.max(0, e.otherDeductions ?? 0);

  const netAmount = Math.max(
    0,
    basePeriodo + reajusteAmount - advanceAmortization - retentionAmount
      - penaltyAmount - otherDeductions,
  );

  const taxAmount = netAmount * ((contract.taxPercent ?? 0) / 100);

  return {
    periodAmount,
    accumulatedAmount,
    feeAmount,
    reajusteAmount,
    advanceAmortization,
    retentionAmount,
    penaltyAmount,
    otherDeductions,
    netAmount,
    taxAmount,
    totalAmount: netAmount + taxAmount,
  };
}

/* ── Acumulados de EEPP anteriores ────────────────────────────────────── */

/** Lo mínimo que hace falta saber de un EEPP anterior para armar el siguiente. */
export interface EepAnterior {
  status: string;
  periodAmount: number;
  feeAmount?: number;
  advanceAmortization: number;
  retentionAmount: number;
}

/** Estados en que un EEPP ya cuenta como cobrado para el siguiente. */
const ESTADOS_FIRMES = ['aprobado', 'facturado', 'pagado'];

export function esFirme(status: string): boolean {
  return ESTADOS_FIRMES.includes(status);
}

/**
 * Suma lo acumulado en los EEPP anteriores que ya están firmes.
 *
 * Un borrador o un EEPP rechazado NO cuenta: si contara, dos borradores
 * abiertos al mismo tiempo se descontarían anticipo el uno al otro y el
 * acumulado saldría inflado.
 */
export function acumuladosAnteriores(anteriores: EepAnterior[]) {
  const firmes = anteriores.filter((a) => esFirme(a.status));
  return {
    previousAmount: firmes.reduce((s, a) => s + a.periodAmount + (a.feeAmount ?? 0), 0),
    previousAmortization: firmes.reduce((s, a) => s + a.advanceAmortization, 0),
    previousRetention: firmes.reduce((s, a) => s + a.retentionAmount, 0),
  };
}

/**
 * Cantidad ya cobrada por partida en los EEPP firmes. Es el punto de partida de
 * cada línea nueva: lo que se cobra ahora es lo acumulado menos esto.
 */
export function cantidadesCobradas(
  lineasAnteriores: { certificateStatus: string; workItemId: string | null; accumulatedQuantity: number }[],
): Map<string, number> {
  const porPartida = new Map<string, number>();
  for (const l of lineasAnteriores) {
    if (!l.workItemId || !esFirme(l.certificateStatus)) continue;
    // Se queda con el MAYOR acumulado, no la suma: cada línea ya trae el
    // acumulado a su fecha, sumarlas contaría dos veces lo mismo.
    const previo = porPartida.get(l.workItemId) ?? 0;
    porPartida.set(l.workItemId, Math.max(previo, l.accumulatedQuantity));
  }
  return porPartida;
}

/** Siguiente correlativo del contrato. */
export function siguienteCorrelativo(anteriores: { number: number }[]): number {
  return anteriores.reduce((max, a) => Math.max(max, a.number ?? 0), 0) + 1;
}
