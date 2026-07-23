/**
 * Lógica pura de remuneraciones (Chile): liquidación de sueldo y finiquito.
 *
 * Vivía copiada dentro de tres pantallas (`attendance/monthly-report`,
 * `attendance/severance` y `worker/liquidacion`) con constantes ligeramente
 * distintas. Está acá, sin JSX ni acceso a datos, para poder cubrirla con tests
 * y para que las tres pantallas calculen exactamente lo mismo.
 *
 * Son estimaciones: la liquidación real puede llevar otros haberes, y los topes
 * legales (IMM, tope imponible) cambian por ley. Los valores por defecto se
 * dejan visibles como constantes para ajustarlos en un solo lugar.
 */

import { differenceInDays, differenceInMonths, differenceInYears } from 'date-fns';

/** Ingreso Mínimo Mensual usado como base del tope de gratificación. */
export const SUELDO_MINIMO = 460_000;
/** Tope legal de la gratificación: 4,75 IMM al año, prorrateado al mes (Art. 50). */
export const TOPE_GRATIFICACION_MENSUAL = (4.75 * SUELDO_MINIMO) / 12;
/** Jornada mensual de referencia para el valor de la hora (45 h/sem ≈ 180 h/mes). */
export const HORAS_MENSUALES = 180;
/** Recargo mínimo legal de la hora extraordinaria (Art. 32): 50%. */
export const FACTOR_HORA_EXTRA = 1.5;
/** Gratificación legal: 25% de lo devengado, con tope (Art. 50). */
export const GRATIFICACION_RATE = 0.25;

/* ── Liquidación de sueldo ────────────────────────────────────────────── */

export interface LiquidacionInput {
  sueldoBase: number;
  /** Si se entrega (no null/undefined), se usa tal cual; si no, se calcula la
   *  gratificación legal (25% con tope). */
  gratificacionManual?: number | null;
  /** Cantidad de horas extra del período. */
  overtimeHours?: number;
  /** Valor pactado de la hora extra; si es 0/omitido se usa el legal
   *  (valor hora × 1,5). */
  valorHoraExtraManual?: number | null;
  /** Otros haberes imponibles (bonos, aguinaldo, etc.). */
  bonoImponible?: number;
  /** Haberes no imponibles (movilización, colación). */
  noImponible?: number;
  /** % de cotización AFP sobre el imponible (ej. 10.77). */
  afpPercent?: number;
  /** % de cotización de salud (ej. 7). */
  saludPercent?: number;
  /** % de seguro de cesantía a cargo del trabajador (ej. 0.6). */
  cesantiaPercent?: number;
  /** Anticipos, adelantos u otros descuentos ya pagados. */
  otrosDescuentos?: number;
}

export interface LiquidacionResult {
  gratificacion: number;
  valorHoraExtra: number;
  overtimePay: number;
  totalImponible: number;
  totalNoImponible: number;
  totalHaberes: number;
  descuentoAfp: number;
  descuentoSalud: number;
  descuentoCesantia: number;
  descuentosLegales: number;
  otrosDescuentos: number;
  totalDescuentos: number;
  liquido: number;
}

/** `Number(x) || 0`: null/undefined/NaN caen a 0 (los datos vienen parciales). */
const n = (v: number | null | undefined): number => (Number.isFinite(v as number) ? (v as number) : 0);

export function computeLiquidacion(input: LiquidacionInput): LiquidacionResult {
  const sueldoBase = n(input.sueldoBase);
  const bonoImponible = n(input.bonoImponible);
  const noImponible = n(input.noImponible);
  const otrosDescuentos = n(input.otrosDescuentos);

  const gratificacion =
    input.gratificacionManual != null
      ? n(input.gratificacionManual)
      : Math.min(sueldoBase * GRATIFICACION_RATE, TOPE_GRATIFICACION_MENSUAL);

  const valorHoraNormal = sueldoBase / HORAS_MENSUALES;
  const manualHE = n(input.valorHoraExtraManual);
  const valorHoraExtra = manualHE > 0 ? manualHE : valorHoraNormal * FACTOR_HORA_EXTRA;
  const overtimePay = n(input.overtimeHours) * valorHoraExtra;

  const totalImponible = sueldoBase + gratificacion + overtimePay + bonoImponible;
  const totalNoImponible = noImponible;
  const totalHaberes = totalImponible + totalNoImponible;

  const descuentoAfp = (totalImponible * n(input.afpPercent)) / 100;
  const descuentoSalud = (totalImponible * n(input.saludPercent)) / 100;
  const descuentoCesantia = (totalImponible * n(input.cesantiaPercent)) / 100;
  const descuentosLegales = descuentoAfp + descuentoSalud + descuentoCesantia;
  const totalDescuentos = descuentosLegales + otrosDescuentos;

  return {
    gratificacion,
    valorHoraExtra,
    overtimePay,
    totalImponible,
    totalNoImponible,
    totalHaberes,
    descuentoAfp,
    descuentoSalud,
    descuentoCesantia,
    descuentosLegales,
    otrosDescuentos,
    totalDescuentos,
    liquido: totalHaberes - totalDescuentos,
  };
}

/* ── Finiquito ────────────────────────────────────────────────────────── */

/** Causales de término (Código del Trabajo) y su glosa para el PDF/UI. */
export const TERMINATION_CAUSES = {
  necesidades_empresa: 'Art. 161 inc. 1: Necesidades de la empresa',
  desahucio: 'Art. 161 inc. 2: Desahucio del empleador',
  mutuo_acuerdo: 'Art. 159 n° 1: Mutuo acuerdo de las partes',
  renuncia: 'Art. 159 n° 2: Renuncia del trabajador',
  vencimiento_plazo: 'Art. 159 n° 4: Vencimiento del plazo convenido',
  conclusion_trabajo: 'Art. 159 n° 5: Conclusión del trabajo o servicio',
} as const;

export type TerminationCause = keyof typeof TERMINATION_CAUSES;

/** Solo estas causales (Art. 161) dan derecho a indemnización por años de
 *  servicio y a la sustitutiva del aviso previo. */
const CAUSES_WITH_INDEMNITY: readonly TerminationCause[] = ['necesidades_empresa', 'desahucio'];

/** Tope legal de la indemnización por años de servicio (Art. 163): 11 años. */
export const MAX_INDEMNITY_YEARS = 11;
/** Días de feriado legal que se devengan por año trabajado (Art. 67). */
export const VACATION_DAYS_PER_YEAR = 15;

export interface FiniquitoInput {
  /** Última remuneración mensual imponible. */
  lastSalary: number;
  startDate: Date;
  endDate: Date;
  terminationCause: TerminationCause;
  /** ¿Se dio el aviso previo de 30 días? Si sí, no se paga la sustitutiva. */
  noticeGiven: boolean;
  /** Días de vacaciones ya tomados, para descontar del feriado proporcional. */
  vacationDaysTaken: number;
}

export interface FiniquitoResult {
  /** Años de servicio topados a 11, con la fracción ≥ 6 meses redondeada a año. */
  yearsForIndemnity: number;
  indemnityPerYear: number;
  noticeIndemnity: number;
  pendingVacationDays: number;
  vacationPay: number;
  totalSeverance: number;
}

export function computeFiniquito(input: FiniquitoInput): FiniquitoResult {
  const { startDate, endDate, terminationCause, noticeGiven } = input;
  const lastSalary = n(input.lastSalary);
  const vacationDaysTaken = n(input.vacationDaysTaken);

  // Años de servicio: fracción superior a 6 meses se cuenta como año completo.
  const fullYears = differenceInYears(endDate, startDate);
  const monthsRemainder = differenceInMonths(endDate, startDate) % 12;
  const computedYears = fullYears + (monthsRemainder >= 6 ? 1 : 0);
  const yearsForIndemnity = Math.min(computedYears, MAX_INDEMNITY_YEARS);

  const paysYears = CAUSES_WITH_INDEMNITY.includes(terminationCause);
  const paysNotice = paysYears && !noticeGiven;

  const indemnityPerYear = paysYears ? lastSalary * yearsForIndemnity : 0;
  const noticeIndemnity = paysNotice ? lastSalary : 0;

  const totalDaysWorked = differenceInDays(endDate, startDate) + 1;
  const vacationEarned = (totalDaysWorked / 365) * VACATION_DAYS_PER_YEAR;
  const pendingVacationDays = Math.max(0, vacationEarned - vacationDaysTaken);
  const vacationPay = (lastSalary / 30) * pendingVacationDays;

  return {
    yearsForIndemnity,
    indemnityPerYear,
    noticeIndemnity,
    pendingVacationDays,
    vacationPay,
    totalSeverance: indemnityPerYear + noticeIndemnity + vacationPay,
  };
}
