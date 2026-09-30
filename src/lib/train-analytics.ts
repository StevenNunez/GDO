/**
 * Los números que salen del tren y del parte diario: curva de avance,
 * desviación, rendimiento por cuadrilla y Pareto de lo que frena la obra.
 *
 * Lógica pura, sin React ni acceso a datos, con tests (`train-analytics.test.ts`).
 *
 * ESTA CURVA NO ES LA CURVA S DE `curva-s.ts`
 *   Aquella mide PLATA sobre la EDT: valor planificado contra valor ganado, y
 *   de ahí SPI y CPI. Es la que mira la oficina técnica y el mandante.
 *
 *   Esta mide UNIDADES sobre el tren: cuántos deptos deberían estar listos hoy
 *   contra cuántos lo están. Es la que mira el jefe de terreno, y es la que el
 *   usuario lleva hoy en una hoja de Excel por cada actividad (parcial y
 *   acumulado programado contra real, semana a semana).
 *
 *   Se parecen en la forma y no en el dato. Juntarlas obligaría a ponerle
 *   precio a cada depto para poder dibujar una línea, que es exactamente lo
 *   que el jefe de terreno no tiene ni necesita.
 */

import type {
  DailyProgress, TrainActivity, WorkUnit, WorkCalendarException,
  NonComplianceCause,
} from '@/modules/core/lib/data';
import { toCalendarDay, addCalendarDays } from '@/lib/date-utils';
import { claveDia } from '@/lib/work-calendar';
import { celdasDeActividad, unidadesDeActividad } from '@/lib/train';
import { claveCelda } from '@/lib/daily-report';
import { construirPareto, lunesDeLaSemana } from '@/lib/last-planner';

type Calendario = Map<string, WorkCalendarException['type']>;

/* ── Avance a una fecha ───────────────────────────────────────────────── */

/**
 * El avance vigente de cada unidad **a una fecha dada**, ignorando lo
 * reportado después.
 *
 * Es lo que distingue una curva de una foto: para dibujar cómo iba la obra
 * hace tres semanas hay que mirar solo los partes que existían entonces. Usar
 * el avance de hoy para todos los puntos daría una línea plana y perfecta.
 */
export function avanceVigenteA(
  progresos: DailyProgress[],
  fecha: Date | string,
): Map<string, DailyProgress> {
  const limite = claveDia(fecha);
  const mapa = new Map<string, DailyProgress>();

  for (const p of progresos) {
    const dia = claveDia(p.date);
    if (dia > limite) continue;
    const clave = claveCelda(p.activityId, p.unitId);
    const actual = mapa.get(clave);
    if (!actual || dia > claveDia(actual.date)) mapa.set(clave, p);
  }
  return mapa;
}

/* ── Curva de avance de una actividad ─────────────────────────────────── */

export interface PuntoCurvaTren {
  fecha: Date;
  /** Unidades que a esa fecha DEBERÍAN estar terminadas, según el tren. */
  programado: number;
  /** Unidades equivalentes realmente terminadas a esa fecha. */
  real: number | null;
}

/**
 * La curva de una actividad, semana a semana: programado contra real.
 *
 * Los puntos son semanales y no diarios porque es la cadencia a la que se
 * revisa una obra —y es la que tiene el Excel del usuario, «Fecha Control
 * (Semanal)»—; con puntos diarios la línea se llena de escalones que no
 * significan nada.
 *
 * El real es `null` para las semanas FUTURAS. Dibujarlas como cero haría que
 * la línea real se desplome a la derecha y pareciera un atraso brutal cuando
 * lo que pasa es que esa semana todavía no llega.
 */
export function curvaDeActividad(
  actividad: Pick<TrainActivity, 'id' | 'startDate' | 'daysPerUnit' | 'unitGroups'>,
  unidades: WorkUnit[],
  progresos: DailyProgress[],
  workDays: number[] | null | undefined,
  calendario: Calendario,
  hoy: Date | string = new Date(),
): PuntoCurvaTren[] {
  const celdas = celdasDeActividad(actividad, unidades, workDays, calendario);
  if (celdas.length === 0) return [];

  const recorrido = unidadesDeActividad(actividad, unidades);
  const inicio = lunesDeLaSemana(celdas[0].inicio);
  const fin = lunesDeLaSemana(celdas[celdas.length - 1].termino);
  if (!inicio || !fin) return [];

  const claveHoy = claveDia(hoy);
  const delActividad = progresos.filter((p) => p.activityId === actividad.id);

  const puntos: PuntoCurvaTren[] = [];
  let semana = inicio;
  let guardia = 0;

  // Se corta el domingo de cada semana: es la fecha contra la que se compara
  // lo hecho en esos siete días.
  while (semana <= fin && guardia < 520) {
    const corte = addCalendarDays(semana, 6);
    const claveCorte = claveDia(corte);

    const programado = celdas.filter((c) => claveDia(c.termino) <= claveCorte).length;

    let real: number | null = null;
    if (claveCorte <= claveHoy || claveDia(semana) <= claveHoy) {
      const vigentes = avanceVigenteA(delActividad, corte);
      real = recorrido.reduce(
        (t, u) => t + (vigentes.get(claveCelda(actividad.id, u.id))?.progress ?? 0),
        0,
      );
    }

    puntos.push({ fecha: corte, programado, real });
    semana = addCalendarDays(semana, 7);
    guardia++;
  }

  return puntos;
}

/* ── Desviación: cuánto se va atrasado ────────────────────────────────── */

export interface DesviacionActividad {
  /** Unidades que deberían estar listas hoy. */
  programadas: number;
  /** Unidades equivalentes realmente terminadas. */
  reales: number;
  /** Total de unidades que recorre la actividad. */
  total: number;
  /** `reales − programadas`. Negativo = atrasado. */
  diferencia: number;
  /**
   * La diferencia traducida a días hábiles, usando el ritmo de la actividad.
   * Negativo = atrasado.
   */
  diasDeAtraso: number;
}

/**
 * Cuánto va atrasada una actividad, en unidades y en días.
 *
 * Los días salen de multiplicar las unidades que faltan por el ritmo: si la
 * cuadrilla hace dos deptos por día y va cuatro deptos atrás, son dos días.
 * Es una traducción, no una medición — pero es la que el jefe de terreno hace
 * de cabeza y la que sirve para decidir si se recupera o no.
 */
export function desviacionDeActividad(
  actividad: Pick<TrainActivity, 'id' | 'startDate' | 'daysPerUnit' | 'unitGroups'>,
  unidades: WorkUnit[],
  progresos: DailyProgress[],
  workDays: number[] | null | undefined,
  calendario: Calendario,
  hoy: Date | string = new Date(),
): DesviacionActividad {
  const celdas = celdasDeActividad(actividad, unidades, workDays, calendario);
  const recorrido = unidadesDeActividad(actividad, unidades);
  const claveHoy = claveDia(hoy);

  const programadas = celdas.filter((c) => claveDia(c.termino) <= claveHoy).length;

  const vigentes = avanceVigenteA(
    progresos.filter((p) => p.activityId === actividad.id),
    hoy,
  );
  const reales = recorrido.reduce(
    (t, u) => t + (vigentes.get(claveCelda(actividad.id, u.id))?.progress ?? 0),
    0,
  );

  const diferencia = reales - programadas;
  const ritmo = actividad.daysPerUnit > 0 ? actividad.daysPerUnit : 1;

  return {
    programadas,
    reales,
    total: recorrido.length,
    diferencia,
    diasDeAtraso: Math.round(diferencia * ritmo * 10) / 10,
  };
}

/* ── Rendimiento por cuadrilla ────────────────────────────────────────── */

export interface RendimientoResponsable {
  responsable: string;
  actividades: number;
  /** Unidades equivalentes terminadas. */
  unidades: number;
  /** Jornadas gastadas. */
  jornadas: number;
  /** Unidades por jornada. `null` si no se cargaron jornadas. */
  rendimiento: number | null;
}

/**
 * Rendimiento real de cada cuadrilla: unidades equivalentes por jornada.
 *
 * Es el dato que hoy se saca a mano de las columnas HD y UN del Excel, y el
 * que permite decir si un subcontratista rinde. Se agrupa por responsable
 * —texto libre— porque es lo que el jefe de terreno escribe en el tren, con o
 * sin contrato cargado.
 *
 * Sale ordenado de mayor a menor rendimiento, y las cuadrillas sin jornadas
 * cargadas van al final: no rinden cero, es que nadie anotó cuánta gente puso.
 */
export function rendimientoPorResponsable(
  actividades: TrainActivity[],
  unidades: WorkUnit[],
  progresos: DailyProgress[],
): RendimientoResponsable[] {
  const porResponsable = new Map<string, RendimientoResponsable>();

  for (const actividad of actividades) {
    const nombre = actividad.responsibleName?.trim() || 'Sin asignar';
    const recorrido = unidadesDeActividad(actividad, unidades);
    const delActividad = progresos.filter((p) => p.activityId === actividad.id);
    const vigentes = avanceVigenteA(delActividad, new Date(8640000000000000));

    const equivalentes = recorrido.reduce(
      (t, u) => t + (vigentes.get(claveCelda(actividad.id, u.id))?.progress ?? 0),
      0,
    );
    const jornadas = delActividad.reduce((t, p) => t + (p.crewDays ?? 0), 0);

    const actual = porResponsable.get(nombre) ?? {
      responsable: nombre, actividades: 0, unidades: 0, jornadas: 0, rendimiento: null,
    };
    actual.actividades += 1;
    actual.unidades += equivalentes;
    actual.jornadas += jornadas;
    porResponsable.set(nombre, actual);
  }

  return [...porResponsable.values()]
    .map((r) => ({
      ...r,
      unidades: Math.round(r.unidades * 100) / 100,
      rendimiento: r.jornadas > 0 ? r.unidades / r.jornadas : null,
    }))
    .sort((a, b) => {
      if (a.rendimiento === null && b.rendimiento === null) {
        return a.responsable.localeCompare(b.responsable);
      }
      if (a.rendimiento === null) return 1;
      if (b.rendimiento === null) return -1;
      return b.rendimiento - a.rendimiento;
    });
}

/* ── Pareto de lo que frena la obra ───────────────────────────────────── */

/**
 * Qué frenó la obra, de lo que más se repite a lo que menos, según el parte
 * diario.
 *
 * Usa el mismo núcleo que el Pareto del programa semanal
 * (`construirPareto`) para que los dos den números comparables: uno cuenta
 * compromisos caídos por semana, este cuenta deptos frenados por día, pero la
 * lista de causas y cómo se ordenan son las mismas.
 *
 * Cuenta CADA parte, no cada unidad: si un depto se frenó tres días seguidos
 * por falta de material, eso son tres días de obra perdidos y tienen que pesar
 * tres veces.
 */
export function paretoDiario(
  progresos: DailyProgress[],
  desde?: Date | string | null,
  hasta?: Date | string | null,
) {
  const claveDesde = desde ? claveDia(desde) : null;
  const claveHasta = hasta ? claveDia(hasta) : null;

  const conCausa: NonComplianceCause[] = [];
  let sinCausa = 0;

  for (const p of progresos) {
    const dia = claveDia(p.date);
    if (claveDesde && dia < claveDesde) continue;
    if (claveHasta && dia > claveHasta) continue;
    // Solo interesa lo que NO avanzó: un depto terminado no tiene causa que
    // analizar aunque alguien haya dejado el campo escrito.
    if (p.progress >= 1) continue;

    if (p.causeCode) { conCausa.push(p.causeCode); continue; }

    // Un parte en 0% sin causa es la unidad que no se hizo y nadie dijo por
    // qué. No se reparte entre las causas conocidas ni se inventa una: se
    // informa aparte, porque es justamente lo que hay que salir a preguntar.
    // Un parte en 50% sin causa no cuenta acá: puede haber avanzado bien.
    if (p.progress === 0) sinCausa += 1;
  }

  return construirPareto(conCausa, sinCausa);
}

/* ── Serie diaria: el pulso de la obra ────────────────────────────────── */

export interface PuntoDiario {
  fecha: Date;
  /** Unidades equivalentes avanzadas ese día. */
  unidades: number;
  jornadas: number;
}

/**
 * Lo avanzado día a día en los últimos `dias` días, para ver el pulso de la
 * obra: si la cuadrilla mantiene el ritmo o se está cayendo.
 *
 * Se calcula por diferencia entre el acumulado del día y el del día anterior,
 * y no sumando los partes: así una corrección de un parte viejo no se cuenta
 * dos veces.
 */
export function serieDiaria(
  progresos: DailyProgress[],
  actividades: TrainActivity[],
  unidades: WorkUnit[],
  dias = 14,
  hoy: Date | string = new Date(),
): PuntoDiario[] {
  const fin = toCalendarDay(hoy);
  if (!fin) return [];

  const recorridos = actividades.map((a) => ({
    id: a.id,
    unidades: unidadesDeActividad(a, unidades),
  }));

  const acumuladoA = (fecha: Date): number => {
    const vigentes = avanceVigenteA(progresos, fecha);
    let total = 0;
    for (const r of recorridos) {
      for (const u of r.unidades) {
        total += vigentes.get(claveCelda(r.id, u.id))?.progress ?? 0;
      }
    }
    return total;
  };

  const puntos: PuntoDiario[] = [];
  const cantidad = Math.max(1, Math.floor(dias));
  let anterior = acumuladoA(addCalendarDays(fin, -cantidad));

  for (let i = cantidad - 1; i >= 0; i--) {
    const fecha = addCalendarDays(fin, -i);
    const acumulado = acumuladoA(fecha);
    const clave = claveDia(fecha);

    const jornadas = progresos
      .filter((p) => claveDia(p.date) === clave)
      .reduce((t, p) => t + (p.crewDays ?? 0), 0);

    puntos.push({
      fecha,
      unidades: Math.round((acumulado - anterior) * 100) / 100,
      jornadas,
    });
    anterior = acumulado;
  }

  return puntos;
}

/* ── Resumen de la obra ───────────────────────────────────────────────── */

export interface ResumenDelTren {
  actividades: number;
  /** Unidades equivalentes terminadas sobre el total del tren. */
  avance: number;
  programadas: number;
  reales: number;
  total: number;
  /** Actividades atrasadas, de la más atrasada a la menos. */
  atrasadas: { actividad: TrainActivity; desviacion: DesviacionActividad }[];
}

/**
 * El estado del tren completo: cuánto se lleva, y qué actividades están
 * arrastrando el atraso.
 *
 * «Atrasada» es media unidad o más de diferencia, no cualquier decimal: con
 * ritmos fraccionarios casi todas las actividades quedan con un resto mínimo y
 * marcarlas todas en rojo hace que el rojo deje de significar algo.
 */
export function resumenDelTren(
  actividades: TrainActivity[],
  unidades: WorkUnit[],
  progresos: DailyProgress[],
  workDays: number[] | null | undefined,
  calendario: Calendario,
  hoy: Date | string = new Date(),
): ResumenDelTren {
  let programadas = 0;
  let reales = 0;
  let total = 0;
  const atrasadas: { actividad: TrainActivity; desviacion: DesviacionActividad }[] = [];

  for (const actividad of actividades) {
    const d = desviacionDeActividad(actividad, unidades, progresos, workDays, calendario, hoy);
    programadas += d.programadas;
    reales += d.reales;
    total += d.total;
    if (d.diferencia <= -0.5) atrasadas.push({ actividad, desviacion: d });
  }

  atrasadas.sort((a, b) => a.desviacion.diferencia - b.desviacion.diferencia);

  return {
    actividades: actividades.length,
    avance: total > 0 ? reales / total : 0,
    programadas,
    reales: Math.round(reales * 100) / 100,
    total,
    atrasadas,
  };
}
