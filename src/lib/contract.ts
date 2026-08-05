/**
 * Lógica contractual pura: plazos, multas, reajustes, conversión UF y estado de
 * las garantías. Sin React ni acceso a datos, para poder cubrirla con tests
 * (`contract.test.ts`) — igual que `payroll.ts` o `budget-costs.ts`.
 *
 * Regla de fondo: los porcentajes de anticipo, retención y multa NO son ley
 * chilena, son de cada contrato. Acá no se asume ningún "estándar": todo sale
 * de la ficha del contrato.
 */

import type { Contract, Guarantee, MarketIndex } from '@/modules/core/lib/data';
import {
  toDate, toCalendarDay, addCalendarDays, diffCalendarDays,
} from '@/lib/date-utils';

/**
 * Milisegundos de una fecha, o `null` si no es válida. `toDate` ya devuelve
 * `null` ante basura; esto evita repetir el guard en cada comparación.
 */
function ms(value: Date | string | null | undefined): number | null {
  const d = toDate(value);
  return d ? d.getTime() : null;
}

/* ── Fechas contractuales: día calendario, sin hora ─────────────────────
 *
 * Las fechas de un contrato (inicio, término, vencimiento de una boleta) son
 * DÍAS, no instantes. La aritmética de calendario vive en `date-utils` porque la
 * comparten el contrato, las RDI y todo lo que tenga plazo; acá solo se le
 * ponen nombres cortos.
 */

const aDia = toCalendarDay;
const sumarDias = addCalendarDays;
const diffDias = diffCalendarDays;

/* ── Plazo ────────────────────────────────────────────────────────────── */

/**
 * Fecha de término contractual = inicio + plazo + aumentos de plazo aprobados.
 *
 * El día de inicio cuenta como día 1 del plazo (un contrato que parte el 1 con
 * 30 días termina el 30, no el 31), que es como se lee un plazo en obra.
 */
export function calcFechaTermino(
  startDate: Date | string | null | undefined,
  plazoDias: number | null | undefined,
  diasDeAumento = 0,
): Date | null {
  const inicio = aDia(startDate);
  if (!inicio || !plazoDias) return null;
  return sumarDias(inicio, plazoDias + diasDeAumento - 1);
}

/**
 * Días de atraso a la fecha de corte. Nunca negativo: si aún no vence el plazo
 * no hay atraso, y adelantarse no genera crédito.
 */
export function calcDiasAtraso(
  fechaTermino: Date | null,
  fechaCorte: Date | string,
): number {
  const corte = aDia(fechaCorte);
  const termino = aDia(fechaTermino);
  if (!termino || !corte) return 0;
  return Math.max(0, diffDias(corte, termino));
}

/* ── Multas ───────────────────────────────────────────────────────────── */

/**
 * Multa acumulada por atraso.
 *
 * `permil_contrato`: multaValue está en ‰ (por mil) del monto del contrato, por
 * día — la forma más común de redactarlo en Chile ("1‰ del valor del contrato
 * por cada día de atraso").
 * `monto_fijo`: multaValue es un monto por día, tal cual.
 *
 * `baseContrato` permite calcularla sobre el **monto vigente** (original más
 * adicionales aprobados), que es lo que dice el contrato cuando habla de "el
 * valor del contrato". Si no se pasa, se usa el monto original.
 */
export function calcMulta(
  contract: Pick<Contract, 'amountNet' | 'multaMode' | 'multaValue'>,
  diasAtraso: number,
  baseContrato?: number | null,
): number {
  if (diasAtraso <= 0) return 0;
  const valor = contract.multaValue ?? 0;
  if (valor <= 0) return 0;

  const base = baseContrato ?? contract.amountNet ?? 0;

  return contract.multaMode === 'monto_fijo'
    ? valor * diasAtraso
    : base * (valor / 1000) * diasAtraso;
}

/* ── Reajuste ─────────────────────────────────────────────────────────── */

/**
 * Reajuste de un monto por variación de índice entre la fecha base del contrato
 * y la del período: `monto × (índiceActual / índiceBase − 1)`.
 *
 * Devuelve **solo el diferencial** (lo que se suma al monto), no el monto
 * reajustado, porque en la carátula del estado de pago el reajuste va como una
 * línea aparte.
 *
 * `polinomico` no se calcula acá: la fórmula la define cada contrato con sus
 * propios factores, así que se ingresa a mano en el estado de pago. Devolver 0
 * en silencio sería peor que obligar a escribirlo.
 */
export function calcReajuste(
  monto: number,
  indiceBase: number | null | undefined,
  indiceActual: number | null | undefined,
  tipo: Contract['reajusteType'],
): number {
  if (tipo === 'none' || tipo === 'polinomico') return 0;
  if (!indiceBase || !indiceActual || indiceBase <= 0) return 0;
  return monto * (indiceActual / indiceBase - 1);
}

/* ── UF ───────────────────────────────────────────────────────────────── */

export function ufToClp(montoUf: number, valorUf: number): number {
  return montoUf * valorUf;
}

export function clpToUf(montoClp: number, valorUf: number): number {
  if (!valorUf) return 0;
  return montoClp / valorUf;
}

/**
 * Monto del contrato expresado en pesos. Un contrato en CLP se devuelve tal
 * cual; uno en UF necesita el valor de la UF del día — si no lo hay devuelve
 * `null` en vez de un 0 engañoso que se vería como "contrato sin monto".
 */
export function contractAmountClp(
  contract: Pick<Contract, 'amountNet' | 'currency'>,
  valorUf: number | null | undefined,
): number | null {
  if (contract.currency === 'CLP') return contract.amountNet ?? 0;
  if (!valorUf) return null;
  return ufToClp(contract.amountNet ?? 0, valorUf);
}

/** Último valor conocido de un índice a una fecha dada (o el más reciente). */
export function indiceALaFecha(
  indices: MarketIndex[],
  tipo: MarketIndex['type'],
  fecha?: Date | string | null,
): number | null {
  const corte = (fecha ? ms(fecha) : null) ?? Infinity;
  const candidatos = indices
    .map((i) => ({ i, t: ms(i.date) }))
    .filter((x): x is { i: MarketIndex; t: number } =>
      x.i.type === tipo && x.t !== null && x.t <= corte)
    .sort((a, b) => b.t - a.t);
  return candidatos.length ? candidatos[0].i.value : null;
}

/* ── Garantías ────────────────────────────────────────────────────────── */

export type EstadoGarantia = 'vigente' | 'por-vencer' | 'vencida' | 'devuelta' | 'cobrada' | 'anulada';

/** Días antes del vencimiento en que una garantía empieza a avisar. */
export const DIAS_AVISO_GARANTIA = 30;

/**
 * Estado real de una garantía. "Por vencer" y "vencida" se derivan de la fecha
 * y no se guardan en la base: una boleta guardada como "vigente" seguiría
 * diciéndolo tres meses después de vencer.
 *
 * Los estados que alguien decidió (devuelta, cobrada, anulada) mandan sobre la
 * fecha: una boleta ya devuelta no está "vencida", está cerrada.
 */
export function estadoGarantia(
  guarantee: Pick<Guarantee, 'status' | 'expiryDate'>,
  hoy: Date | string = new Date(),
): EstadoGarantia {
  if (guarantee.status !== 'vigente') return guarantee.status;

  const vence = aDia(guarantee.expiryDate);
  const ahora = aDia(hoy);
  if (!vence || !ahora) return 'vigente';

  const dias = diffDias(vence, ahora);
  if (dias < 0) return 'vencida';
  if (dias <= DIAS_AVISO_GARANTIA) return 'por-vencer';
  return 'vigente';
}

/** Garantías que exigen acción: vencidas o por vencer dentro del plazo de aviso. */
export function garantiasPorVencer(
  guarantees: Guarantee[],
  hoy: Date | string = new Date(),
): Guarantee[] {
  return guarantees
    .filter((g) => {
      const e = estadoGarantia(g, hoy);
      return e === 'vencida' || e === 'por-vencer';
    })
    .sort((a, b) => (ms(a.expiryDate) ?? Infinity) - (ms(b.expiryDate) ?? Infinity));
}

/* ── Monto vigente ────────────────────────────────────────────────────── */

/**
 * Monto vigente del contrato = original + adicionales aprobados. Es la cifra
 * contra la que se mide el avance y el tope de retención, no el monto original.
 *
 * Recibe los montos de los adicionales ya aprobados (un aumento de obra suma,
 * una disminución viene en negativo).
 */
export function montoContratoVigente(
  contract: Pick<Contract, 'amountNet'>,
  montosAdicionalesAprobados: number[] = [],
): number {
  return (contract.amountNet ?? 0) + montosAdicionalesAprobados.reduce((a, b) => a + b, 0);
}

/* ── Anticipo y retención ─────────────────────────────────────────────── */

/** Monto del anticipo pactado. */
export function montoAnticipo(
  contract: Pick<Contract, 'amountNet' | 'advancePercent'>,
): number {
  return (contract.amountNet ?? 0) * ((contract.advancePercent ?? 0) / 100);
}

/**
 * Amortización del anticipo en un estado de pago, **proporcional al avance**
 * (decisión del usuario): si en este período se cobra el 20% del contrato, se
 * devuelve el 20% del anticipo.
 *
 * Se topa al saldo pendiente para que el acumulado amortizado nunca supere el
 * anticipo entregado — sin ese tope, un aumento de obra que suba el avance por
 * sobre el 100% del contrato original haría devolver de más.
 *
 * A diferencia de la multa y de la retención, acá **no** entra el monto
 * vigente: el anticipo que se entregó fue un % del contrato original, y un
 * adicional posterior no aumenta plata que nunca se recibió. Calcularlo sobre
 * el vigente devolvería más de lo prestado.
 */
export function amortizacionAnticipo(
  contract: Pick<Contract, 'amountNet' | 'advancePercent'>,
  avanceDelPeriodo: number,
  yaAmortizado = 0,
): number {
  const anticipo = montoAnticipo(contract);
  if (anticipo <= 0) return 0;

  const base = contract.amountNet ?? 0;
  if (base <= 0) return 0;

  const proporcional = anticipo * (avanceDelPeriodo / base);
  const saldo = Math.max(0, anticipo - yaAmortizado);
  return Math.max(0, Math.min(proporcional, saldo));
}

/**
 * Retención de un estado de pago, respetando el tope acumulado del contrato.
 * `retentionCapPercent` es % del monto del contrato; `null` = sin tope.
 *
 * `baseContrato` permite aplicar el tope sobre el **monto vigente**: la
 * retención garantiza toda la obra que se está ejecutando, adicionales
 * incluidos, así que un contrato que creció retiene proporcionalmente más. Si
 * no se pasa, el tope se calcula sobre el monto original.
 */
export function montoRetencion(
  contract: Pick<Contract, 'amountNet' | 'retentionPercent' | 'retentionCapPercent'>,
  avanceDelPeriodo: number,
  yaRetenido = 0,
  baseContrato?: number | null,
): number {
  const pct = (contract.retentionPercent ?? 0) / 100;
  if (pct <= 0) return 0;

  const retencion = Math.max(0, avanceDelPeriodo) * pct;

  const capPct = contract.retentionCapPercent;
  if (capPct == null) return retencion;

  const tope = (baseContrato ?? contract.amountNet ?? 0) * (capPct / 100);
  const margen = Math.max(0, tope - yaRetenido);
  return Math.min(retencion, margen);
}
