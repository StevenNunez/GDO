/**
 * Curva S y valor ganado: qué se planificó, qué se ejecutó y qué costó, en el
 * tiempo.
 *
 * LAS TRES LÍNEAS
 *   · PV (valor planificado)  — lo que el programa dice que debería estar hecho
 *                               a una fecha, valorizado a precio de venta.
 *   · EV (valor ganado)       — lo que REALMENTE está hecho a esa fecha, al
 *                               mismo precio. Comparable con PV renglón a renglón.
 *   · AC (costo real)         — lo que efectivamente se gastó.
 *
 * De ahí salen los dos índices que resumen la obra en un número:
 *   · SPI = EV / PV → bajo 1, se va atrasado.
 *   · CPI = EV / AC → bajo 1, se está gastando de más.
 *
 * POR QUÉ EL AVANCE SE MIDE EN PLATA Y NO EN DÍAS
 *   Un SPI de días diría que una obra al 50% del plazo va «al día» aunque solo
 *   haya ejecutado el 20% de la obra. Comparando VALOR contra VALOR, atrasarse
 *   en una partida cara pesa lo que tiene que pesar.
 *
 * EL SUPUESTO QUE HAY QUE SABER
 *   El valor planificado de cada partida se reparte LINEALMENTE entre su fecha
 *   de inicio y su fecha de término programadas. Es la convención habitual y la
 *   única posible sin una curva de avance cargada partida por partida. Está
 *   dicho acá y en pantalla porque cambia cómo se lee la curva.
 *
 * Lógica pura, con tests.
 */

import { toCalendarDay } from '@/lib/date-utils';
import { getLeafItems } from '@/lib/budget-costs';
import type { ProgressLog, WorkItem } from '@/modules/core/lib/data';

const MS_DIA = 86_400_000;

/* ── Valor planificado ─────────────────────────────────────────────────── */

/**
 * Qué fracción de una partida debería estar hecha a la fecha, según programa.
 *
 * Antes de la fecha de inicio, 0. Después del término, 1. En medio, la
 * proporción del plazo transcurrida. Una partida de un solo día vale 1 desde su
 * fecha: dividir por un plazo de cero días daría infinito.
 *
 * `null` si la partida no tiene fechas programadas — y eso NO es lo mismo que
 * 0: una partida sin programa no se puede juzgar, y contarla como 0 haría
 * aparecer un atraso que no existe.
 */
export function fraccionPlanificada(
  item: Pick<WorkItem, 'plannedStartDate' | 'plannedEndDate'>,
  fecha: Date | string,
): number | null {
  const inicio = toCalendarDay(item.plannedStartDate);
  const fin = toCalendarDay(item.plannedEndDate);
  const dia = toCalendarDay(fecha);
  if (!inicio || !fin || !dia) return null;

  if (dia.getTime() < inicio.getTime()) return 0;
  if (dia.getTime() >= fin.getTime()) return 1;

  const total = (fin.getTime() - inicio.getTime()) / MS_DIA;
  if (total <= 0) return 1;

  const transcurrido = (dia.getTime() - inicio.getTime()) / MS_DIA;
  return Math.min(1, Math.max(0, transcurrido / total));
}

/** Valor de venta de una partida: cantidad × precio unitario. */
export function valorPartida(item: Pick<WorkItem, 'quantity' | 'unitPrice'>): number {
  return (item.quantity || 0) * (item.unitPrice || 0);
}

export interface ValorPlanificado {
  pv: number;
  /** Partidas sin fechas programadas: no entran al PV y hay que decirlo. */
  sinProgramar: number;
  /** Valor de esas partidas, para saber cuánta obra queda fuera de la curva. */
  valorSinProgramar: number;
}

/**
 * PV a una fecha. Solo partidas hoja: sumar también las fases duplicaría el
 * monto, porque el valor de una fase ya está en sus partidas.
 */
export function valorPlanificadoA(
  items: WorkItem[],
  fecha: Date | string,
): ValorPlanificado {
  let pv = 0;
  let sinProgramar = 0;
  let valorSinProgramar = 0;

  for (const item of getLeafItems(items)) {
    const valor = valorPartida(item);
    const fraccion = fraccionPlanificada(item, fecha);
    if (fraccion === null) {
      sinProgramar += 1;
      valorSinProgramar += valor;
      continue;
    }
    pv += valor * fraccion;
  }

  return { pv, sinProgramar, valorSinProgramar };
}

/* ── Valor ganado ──────────────────────────────────────────────────────── */

/**
 * EV a una fecha: cantidad realmente ejecutada hasta ese día, al precio de
 * venta de la partida.
 *
 * Se topa en la cantidad contratada: avanzar más de lo contratado no genera
 * valor ganado extra — eso es un aumento de obra, y se cobra por una adenda,
 * no inflando la curva.
 */
export function valorGanadoA(
  items: WorkItem[],
  logs: ProgressLog[],
  fecha: Date | string,
): number {
  const corte = toCalendarDay(fecha);
  if (!corte) return 0;

  const ejecutado = new Map<string, number>();
  for (const l of logs) {
    const d = toCalendarDay(l.date);
    if (!d || d.getTime() > corte.getTime()) continue;
    ejecutado.set(l.workItemId, (ejecutado.get(l.workItemId) ?? 0) + (l.quantity || 0));
  }

  let ev = 0;
  for (const item of getLeafItems(items)) {
    const cantidad = Math.min(ejecutado.get(item.id) ?? 0, item.quantity || 0);
    ev += cantidad * (item.unitPrice || 0);
  }
  return ev;
}

/* ── Costo real ────────────────────────────────────────────────────────── */

/** Un gasto imputado, con su fecha. */
export interface GastoConFecha {
  fecha: Date | string;
  amount: number;
}

/** AC a una fecha: lo efectivamente gastado hasta ese día. */
export function costoRealA(gastos: GastoConFecha[], fecha: Date | string): number {
  const corte = toCalendarDay(fecha);
  if (!corte) return 0;

  return gastos.reduce((s, g) => {
    const d = toCalendarDay(g.fecha);
    if (!d || d.getTime() > corte.getTime()) return s;
    return s + (g.amount || 0);
  }, 0);
}

/* ── La curva ──────────────────────────────────────────────────────────── */

export interface PuntoCurvaS {
  fecha: Date;
  pv: number;
  ev: number;
  ac: number;
  /** Los mismos tres, como % del presupuesto total. Es lo que se grafica. */
  pvPct: number;
  evPct: number;
  acPct: number;
}

export interface CurvaS {
  puntos: PuntoCurvaS[];
  /** Budget At Completion: el valor total contratado. */
  bac: number;
  /** Partidas sin fechas programadas: la curva planificada las deja fuera. */
  sinProgramar: number;
  valorSinProgramar: number;
}

/**
 * Serie de puntos entre dos fechas. `pasoDias` controla la resolución: 7 para
 * una obra de meses, 1 para una semana concreta.
 *
 * El último punto siempre es `hasta`, aunque no caiga justo en el paso: sin él,
 * el gráfico terminaría antes de la fecha que se pidió y parecería que la obra
 * se detuvo.
 */
export function construirCurvaS(
  items: WorkItem[],
  logs: ProgressLog[],
  gastos: GastoConFecha[],
  opts: {
    desde: Date | string;
    hasta: Date | string;
    pasoDias?: number;
  },
): CurvaS {
  const desde = toCalendarDay(opts.desde);
  const hasta = toCalendarDay(opts.hasta);
  const paso = Math.max(1, opts.pasoDias ?? 7);

  const hojas = getLeafItems(items);
  const bac = hojas.reduce((s, i) => s + valorPartida(i), 0);
  const { sinProgramar, valorSinProgramar } = valorPlanificadoA(items, hasta ?? new Date());

  if (!desde || !hasta || hasta.getTime() < desde.getTime()) {
    return { puntos: [], bac, sinProgramar, valorSinProgramar };
  }

  const fechas: Date[] = [];
  for (
    let d = new Date(desde);
    d.getTime() <= hasta.getTime();
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + paso)
  ) {
    fechas.push(d);
  }
  const ultimo = fechas[fechas.length - 1];
  if (!ultimo || ultimo.getTime() !== hasta.getTime()) fechas.push(hasta);

  const puntos = fechas.map((fecha) => {
    const pv = valorPlanificadoA(items, fecha).pv;
    const ev = valorGanadoA(items, logs, fecha);
    const ac = costoRealA(gastos, fecha);
    return {
      fecha,
      pv, ev, ac,
      pvPct: bac > 0 ? (pv / bac) * 100 : 0,
      evPct: bac > 0 ? (ev / bac) * 100 : 0,
      acPct: bac > 0 ? (ac / bac) * 100 : 0,
    };
  });

  return { puntos, bac, sinProgramar, valorSinProgramar };
}

/* ── Índices de desempeño ──────────────────────────────────────────────── */

export interface IndicadoresEV {
  pv: number;
  ev: number;
  ac: number;
  bac: number;
  /** EV / PV. `null` si no hay nada planificado a la fecha: dividir por cero. */
  spi: number | null;
  /** EV / AC. `null` si todavía no se ha gastado nada. */
  cpi: number | null;
  /** EV − PV. Negativo = atrasado, en plata. */
  sv: number;
  /** EV − AC. Negativo = sobrecosto. */
  cv: number;
  /** Estimate At Completion: cuánto va a costar la obra al ritmo actual. */
  eac: number | null;
  /** Lo que falta gastar según ese ritmo. */
  etc: number | null;
  /** BAC − EAC. Negativo = se va a pasar del presupuesto. */
  vac: number | null;
}

/**
 * Los índices a una fecha de corte.
 *
 * El EAC usa el CPI acumulado (`BAC / CPI`), que es la fórmula estándar cuando
 * se asume que el desvío de costo va a seguir igual — el supuesto más honesto
 * a mitad de obra. Con CPI nulo (nada gastado) no se proyecta nada en vez de
 * devolver un número inventado.
 */
export function indicadoresEV(datos: {
  pv: number; ev: number; ac: number; bac: number;
}): IndicadoresEV {
  const { pv, ev, ac, bac } = datos;

  const spi = pv > 0 ? ev / pv : null;
  const cpi = ac > 0 ? ev / ac : null;
  const eac = cpi && cpi > 0 ? bac / cpi : null;

  return {
    pv, ev, ac, bac,
    spi, cpi,
    sv: ev - pv,
    cv: ev - ac,
    eac,
    etc: eac !== null ? eac - ac : null,
    vac: eac !== null ? bac - eac : null,
  };
}

export type Semaforo = 'bien' | 'atencion' | 'critico' | 'sin_datos';

/**
 * Lectura de un índice en tres colores. Los cortes son los que se usan en
 * control de proyectos: bajo 0,90 es crítico, entre 0,90 y 0,95 es atención.
 * Un índice sobre 1 no se pinta de «excelente»: adelantarse mucho respecto del
 * programa suele significar que el programa estaba mal, no que se va bien.
 */
export function semaforo(indice: number | null): Semaforo {
  if (indice === null) return 'sin_datos';
  if (indice < 0.9) return 'critico';
  if (indice < 0.95) return 'atencion';
  return 'bien';
}

export const SEMAFORO_TONO: Record<Semaforo, 'success' | 'warning' | 'danger' | 'neutral'> = {
  bien: 'success',
  atencion: 'warning',
  critico: 'danger',
  sin_datos: 'neutral',
};

/** Frase corta que explica el índice a quien no sabe qué es un SPI. */
export function leerSpi(spi: number | null): string {
  if (spi === null) return 'Sin programa cargado: no se puede medir el atraso.';
  if (spi >= 1) return 'La obra va al día o adelantada respecto del programa.';
  const pct = Math.round((1 - spi) * 100);
  return `La obra va ${pct}% por debajo de lo programado a la fecha.`;
}

export function leerCpi(cpi: number | null): string {
  if (cpi === null) return 'Todavía no hay costo imputado: no se puede medir el gasto.';
  if (cpi >= 1) return 'Se está gastando menos de lo que vale lo ejecutado.';
  const pct = Math.round((1 / cpi - 1) * 100);
  return `Se está gastando ${pct}% más de lo que vale lo ejecutado.`;
}
