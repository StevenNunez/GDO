/**
 * Calendario laboral de la obra: qué día se trabaja y qué día no.
 *
 * Lógica pura, sin React ni acceso a datos, para poder cubrirla con tests
 * (`work-calendar.test.ts`).
 *
 * PARA QUÉ EXISTE
 *   El tren de actividades no se programa en días corridos. Si la cerámica
 *   avanza un depto por día y arranca el jueves, el depto siguiente NO es el
 *   viernes y el subsiguiente el sábado: es el viernes y después el lunes. Con
 *   un 18 de septiembre en medio, la diferencia entre contar días corridos y
 *   días hábiles son dos semanas de error al final de un piso.
 *
 * TRES REGLAS, EN ESTE ORDEN
 *   1. Una excepción `trabajado` manda sobre todo: si la obra trabajó ese
 *      sábado, ese sábado es hábil aunque sea sábado y aunque sea feriado.
 *   2. Una excepción `feriado` bloquea el día aunque sea día de semana.
 *   3. Si no hay excepción, decide `workDays` de la obra (lunes a viernes por
 *      omisión).
 *
 *   El orden importa y es el que resuelve el caso real de la obra que recupera
 *   atraso trabajando un feriado: se anota como `trabajado` y el programa lo
 *   cuenta, sin tener que borrar el feriado para todas las demás obras.
 */

import type { WorkCalendarException } from '@/modules/core/lib/data';
import { toCalendarDay, addCalendarDays } from '@/lib/date-utils';

/** Lunes a viernes: lo que rige si la obra no configuró otra cosa. */
export const DIAS_HABILES_POR_DEFECTO = [1, 2, 3, 4, 5];

export const NOMBRE_DIA: Record<number, string> = {
  1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves',
  5: 'Viernes', 6: 'Sábado', 7: 'Domingo',
};

/**
 * Día de la semana en ISO (1 = lunes … 7 = domingo). `getDay()` devuelve 0
 * para el domingo, que ordena mal y no coincide con lo que se guarda.
 */
export function diaIso(fecha: Date): number {
  const d = fecha.getDay();
  return d === 0 ? 7 : d;
}

/** `YYYY-MM-DD` de un día calendario, que es como viaja una columna DATE. */
export function claveDia(fecha: Date | string): string {
  const dia = toCalendarDay(fecha);
  if (!dia) return '';
  const mm = String(dia.getMonth() + 1).padStart(2, '0');
  const dd = String(dia.getDate()).padStart(2, '0');
  return `${dia.getFullYear()}-${mm}-${dd}`;
}

/**
 * Índice de excepciones por fecha, ya filtrado a la obra que interesa.
 *
 * Se arma una vez y se reusa: sin esto, calcular las fechas de una matriz de
 * 14.000 celdas recorre la lista completa de feriados una vez por celda.
 *
 * Una excepción propia de la obra le gana a la de la empresa para el mismo
 * día: es el caso de la obra que sí trabaja un feriado que el resto no trabaja.
 */
export function indexarExcepciones(
  excepciones: WorkCalendarException[],
  projectId?: string | null,
): Map<string, WorkCalendarException['type']> {
  const mapa = new Map<string, WorkCalendarException['type']>();

  // Primero las de la empresa, después las de la obra, para que las de la obra
  // sobrescriban.
  const generales = excepciones.filter((e) => !e.projectId);
  const propias = projectId
    ? excepciones.filter((e) => e.projectId === projectId)
    : [];

  for (const e of [...generales, ...propias]) {
    const clave = claveDia(e.date);
    if (clave) mapa.set(clave, e.type);
  }
  return mapa;
}

/**
 * ¿Se trabaja ese día? Ver el orden de las tres reglas arriba.
 *
 * `workDays` vacío o nulo cae en lunes a viernes: una obra sin configurar no
 * puede quedar sin ningún día hábil, porque cualquier cálculo de fechas se
 * colgaría buscando el próximo día que nunca llega.
 */
export function esDiaHabil(
  fecha: Date | string,
  workDays: number[] | null | undefined,
  excepciones: Map<string, WorkCalendarException['type']>,
): boolean {
  const dia = toCalendarDay(fecha);
  if (!dia) return false;

  const excepcion = excepciones.get(claveDia(dia));
  if (excepcion === 'trabajado') return true;
  if (excepcion === 'feriado') return false;

  const dias = workDays && workDays.length > 0 ? workDays : DIAS_HABILES_POR_DEFECTO;
  return dias.includes(diaIso(dia));
}

/**
 * El primer día hábil desde la fecha dada (la misma fecha, si ya lo es).
 *
 * El tope de 400 días es una red de seguridad, no una regla de negocio: una
 * obra mal configurada (todos los días feriados) colgaría el navegador en un
 * `while` infinito. Si se llega al tope se devuelve `null` y la pantalla avisa.
 */
export function proximoDiaHabil(
  desde: Date | string,
  workDays: number[] | null | undefined,
  excepciones: Map<string, WorkCalendarException['type']>,
): Date | null {
  let dia = toCalendarDay(desde);
  if (!dia) return null;

  for (let i = 0; i < 400; i++) {
    if (esDiaHabil(dia, workDays, excepciones)) return dia;
    dia = addCalendarDays(dia, 1);
  }
  return null;
}

/**
 * Suma `cantidad` días HÁBILES a una fecha.
 *
 * Sumar 0 no es no hacer nada: devuelve el primer día hábil desde la fecha,
 * porque una actividad no puede empezar un domingo. Es lo que hace que el tren
 * calcule bien cuando la fecha de inicio que alguien escribió cae en fin de
 * semana.
 */
export function sumarDiasHabiles(
  desde: Date | string,
  cantidad: number,
  workDays: number[] | null | undefined,
  excepciones: Map<string, WorkCalendarException['type']>,
): Date | null {
  let dia = proximoDiaHabil(desde, workDays, excepciones);
  if (!dia) return null;

  let restantes = Math.max(0, Math.floor(cantidad));
  let guardia = 0;
  while (restantes > 0 && guardia < 4000) {
    dia = addCalendarDays(dia, 1);
    if (esDiaHabil(dia, workDays, excepciones)) restantes--;
    guardia++;
  }
  return restantes === 0 ? dia : null;
}

/**
 * Días hábiles entre dos fechas, contando las dos puntas.
 *
 * Contar las puntas es lo correcto acá: una actividad que empieza y termina el
 * mismo día dura un día, no cero. Si el término es anterior al inicio devuelve
 * 0 en vez de un negativo, que no significa nada como duración.
 */
export function diasHabilesEntre(
  desde: Date | string,
  hasta: Date | string,
  workDays: number[] | null | undefined,
  excepciones: Map<string, WorkCalendarException['type']>,
): number {
  const a = toCalendarDay(desde);
  const b = toCalendarDay(hasta);
  if (!a || !b || b < a) return 0;

  let total = 0;
  let dia = a;
  let guardia = 0;
  while (dia <= b && guardia < 4000) {
    if (esDiaHabil(dia, workDays, excepciones)) total++;
    dia = addCalendarDays(dia, 1);
    guardia++;
  }
  return total;
}

/* ── El mes en pantalla ───────────────────────────────────────────────── */

/** Qué es un día para el programa, en el orden en que se decide (ver las tres reglas arriba). */
export type TipoDeDia = 'habil' | 'no-laboral' | 'feriado' | 'trabajado';

export interface DiaDelMes {
  /** `YYYY-MM-DD`. */
  clave: string;
  numero: number;
  /** `false` para los días del mes anterior o siguiente que completan la primera y la última semana. */
  delMes: boolean;
  tipo: TipoDeDia;
  hoy: boolean;
}

/**
 * Un mes en filas de semana (lunes a domingo), con el tipo de cada día ya resuelto.
 *
 * `trabajado` y `feriado` se muestran siempre que existan como excepción, aunque coincidan con lo que
 * diría la regla de la semana: una excepción es justo lo que hay que poder ver de un vistazo.
 */
export function mesEnSemanas(
  anio: number,
  mes: number,
  workDays: number[] | null | undefined,
  excepciones: Map<string, WorkCalendarException['type']>,
  hoy: Date | string = new Date(),
): DiaDelMes[][] {
  const claveHoy = claveDia(hoy);
  const dias = workDays && workDays.length > 0 ? workDays : DIAS_HABILES_POR_DEFECTO;
  const desfase = diaIso(new Date(anio, mes, 1)) - 1; // cuántos días del mes anterior caben antes del 1

  const semanas: DiaDelMes[][] = [];
  for (let s = 0; s < 6; s++) {
    const fila: DiaDelMes[] = [];
    for (let d = 0; d < 7; d++) {
      const fecha = new Date(anio, mes, 1 - desfase + s * 7 + d);
      const clave = claveDia(fecha);
      const excepcion = excepciones.get(clave);
      const tipo: TipoDeDia = excepcion === 'feriado'
        ? 'feriado'
        : excepcion === 'trabajado'
          ? 'trabajado'
          : dias.includes(diaIso(fecha)) ? 'habil' : 'no-laboral';
      fila.push({
        clave,
        numero: fecha.getDate(),
        delMes: fecha.getMonth() === mes,
        tipo,
        hoy: clave === claveHoy,
      });
    }
    if (!fila.some((c) => c.delMes)) break;
    semanas.push(fila);
  }
  return semanas;
}
