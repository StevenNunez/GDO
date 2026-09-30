/**
 * Tren de actividades: la matriz del programa de terminaciones.
 *
 * Filas = actividades (`TrainActivity`), columnas = unidades (`WorkUnit`), y
 * cada celda es el día que le toca esa actividad a esa unidad.
 *
 * Lógica pura, sin React ni acceso a datos, para poder cubrirla con tests
 * (`train.test.ts`).
 *
 * LAS FECHAS DE LAS CELDAS SE CALCULAN, NO SE GUARDAN
 *   Es la decisión de fondo de la migración 038. Una obra son ~14.400 celdas;
 *   guardarlas obliga a reescribirlas enteras cada vez que alguien corre una
 *   fecha de inicio un día, y basta que una quede vieja para que ya no se sepa
 *   cuál es el programa. Acá se guarda lo que alguien decide —dónde empieza y
 *   a qué ritmo avanza— y la celda sale de ahí.
 *
 * CÓMO SE CALCULA UNA CELDA
 *   La cuadrilla recorre las unidades en el orden del tren (`sortOrder`, que
 *   es el recorrido real y no el orden numérico). Para la unidad en la
 *   posición `i`:
 *
 *       inicio(i)  = startDate + piso(i × daysPerUnit) días HÁBILES
 *       término(i) = inicio(i) + (techo(daysPerUnit) − 1) días hábiles
 *
 *   El piso es lo que hace que `daysPerUnit = 0.5` dé dos unidades por día
 *   —las posiciones 0 y 1 caen el mismo día, la 2 al día hábil siguiente—,
 *   que es exactamente el ritmo del programa de Los Fundadores. Y contar en
 *   días hábiles es lo que hace que el tren salte fines de semana y feriados
 *   solo: en ese mismo programa, la cerámica salta el Viernes Santo sin que
 *   nadie lo anote.
 */

import type { TrainActivity, WorkUnit, WorkCalendarException } from '@/modules/core/lib/data';
import { toCalendarDay } from '@/lib/date-utils';
import {
  sumarDiasHabiles, diasHabilesEntre, claveDia, esDiaHabil,
} from '@/lib/work-calendar';
import { unidadesActivas } from '@/lib/work-units';

/** Excepciones ya indexadas por fecha, como las devuelve `indexarExcepciones`. */
type Calendario = Map<string, WorkCalendarException['type']>;

/* ── Qué unidades recorre una actividad ───────────────────────────────── */

/**
 * Unidades sobre las que corre la actividad, en el orden del recorrido.
 *
 * Sin `unitGroups` recorre todas las unidades activas. Con grupos, solo esos:
 * hay actividades que van únicamente en los zócalos o en los primeros pisos, y
 * obligarlas a recorrer el edificio entero daría fechas que nadie reconoce.
 *
 * Las unidades excluidas quedan fuera siempre: para eso existe el estado.
 */
export function unidadesDeActividad(
  actividad: Pick<TrainActivity, 'unitGroups'>,
  unidades: WorkUnit[],
): WorkUnit[] {
  const activas = unidadesActivas(unidades);
  const grupos = actividad.unitGroups?.filter((g) => g?.trim()) ?? [];
  if (grupos.length === 0) return activas;

  const buscados = new Set(grupos.map((g) => g.trim().toLowerCase()));
  return activas.filter((u) => buscados.has((u.groupName ?? '').trim().toLowerCase()));
}

/* ── Las fechas de una fila ───────────────────────────────────────────── */

export interface CeldaDelTren {
  unitId: string;
  /** Posición en el recorrido de la actividad, no en el de la obra. */
  posicion: number;
  inicio: Date;
  termino: Date;
}

/**
 * Días hábiles que ocupa una unidad. Con ritmos menores a un día por unidad
 * (`0.5`) la unidad igual ocupa el día en que se trabaja: no existe media
 * jornada que termine antes de que el día termine.
 */
function diasDeUnaUnidad(daysPerUnit: number): number {
  return Math.max(1, Math.ceil(daysPerUnit));
}

/**
 * Fechas de todas las celdas de una actividad, en orden de recorrido.
 *
 * Devuelve lista vacía si la actividad no tiene fecha de inicio o no le toca
 * ninguna unidad: una fila sin inicio no está programada todavía, y eso es un
 * estado válido mientras se arma la carta, no un error.
 */
export function celdasDeActividad(
  actividad: Pick<TrainActivity, 'startDate' | 'daysPerUnit' | 'unitGroups'>,
  unidades: WorkUnit[],
  workDays: number[] | null | undefined,
  calendario: Calendario,
): CeldaDelTren[] {
  const inicio = toCalendarDay(actividad.startDate ?? null);
  if (!inicio) return [];

  const recorrido = unidadesDeActividad(actividad, unidades);
  if (recorrido.length === 0) return [];

  const ritmo = actividad.daysPerUnit > 0 ? actividad.daysPerUnit : 1;
  const duracion = diasDeUnaUnidad(ritmo);

  const celdas: CeldaDelTren[] = [];
  for (let i = 0; i < recorrido.length; i++) {
    const desplazamiento = Math.floor(i * ritmo);
    const dIni = sumarDiasHabiles(inicio, desplazamiento, workDays, calendario);
    if (!dIni) break; // calendario sin días hábiles: se corta en vez de colgarse

    const dFin = duracion > 1
      ? sumarDiasHabiles(dIni, duracion - 1, workDays, calendario)
      : dIni;

    celdas.push({
      unitId: recorrido[i].id,
      posicion: i,
      inicio: dIni,
      termino: dFin ?? dIni,
    });
  }
  return celdas;
}

/** Celdas indexadas por unidad, para pintar la matriz sin recorrer la lista. */
export function celdasPorUnidad(celdas: CeldaDelTren[]): Map<string, CeldaDelTren> {
  return new Map(celdas.map((c) => [c.unitId, c]));
}

/* ── Resumen de una actividad ─────────────────────────────────────────── */

export interface ResumenActividad {
  /** Cuántas unidades recorre. */
  unidades: number;
  inicio: Date | null;
  /** Término sobre la ÚLTIMA unidad del recorrido. */
  termino: Date | null;
  /** Días hábiles de punta a punta, contando las dos. */
  duracionDias: number;
}

/**
 * Cuándo empieza y cuándo termina la actividad completa.
 *
 * El término es el de la última unidad, no `inicio + unidades × ritmo`: con
 * feriados en medio esas dos cuentas dan distinto, y la que vale es la que
 * pasó por el calendario.
 */
export function resumenDeActividad(
  actividad: Pick<TrainActivity, 'startDate' | 'daysPerUnit' | 'unitGroups'>,
  unidades: WorkUnit[],
  workDays: number[] | null | undefined,
  calendario: Calendario,
): ResumenActividad {
  const celdas = celdasDeActividad(actividad, unidades, workDays, calendario);
  if (celdas.length === 0) {
    return {
      unidades: unidadesDeActividad(actividad, unidades).length,
      inicio: null,
      termino: null,
      duracionDias: 0,
    };
  }

  const inicio = celdas[0].inicio;
  const termino = celdas[celdas.length - 1].termino;
  return {
    unidades: celdas.length,
    inicio,
    termino,
    duracionDias: diasHabilesEntre(inicio, termino, workDays, calendario),
  };
}

/* ── La matriz completa ───────────────────────────────────────────────── */

export interface FilaDelTren {
  actividad: TrainActivity;
  celdas: Map<string, CeldaDelTren>;
  resumen: ResumenActividad;
}

/** Actividades de una obra que entran al tren, en orden de recorrido. */
export function actividadesDeObra(
  actividades: TrainActivity[],
  projectId: string | null | undefined,
): TrainActivity[] {
  if (!projectId) return [];
  return actividades
    .filter((a) => a.projectId === projectId && a.status === 'activa')
    .sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
}

/**
 * La matriz entera, lista para pintar: una fila por actividad, con sus celdas
 * ya indexadas por unidad.
 *
 * Se calcula de una vez y no celda por celda desde el render: una obra de 60
 * actividades por 240 unidades son 14.400 celdas, y recalcular cada una dentro
 * del bucle de pintado vuelve la pantalla inusable.
 */
export function matrizDelTren(
  actividades: TrainActivity[],
  unidades: WorkUnit[],
  workDays: number[] | null | undefined,
  calendario: Calendario,
): FilaDelTren[] {
  return actividades.map((actividad) => {
    const celdas = celdasDeActividad(actividad, unidades, workDays, calendario);
    return {
      actividad,
      celdas: celdasPorUnidad(celdas),
      resumen: resumenDeActividad(actividad, unidades, workDays, calendario),
    };
  });
}

/**
 * Cuándo termina la obra según el tren: el término más tardío de todas sus
 * actividades. `null` si todavía no hay ninguna programada.
 */
export function terminoDelTren(filas: FilaDelTren[]): Date | null {
  let ultimo: Date | null = null;
  for (const f of filas) {
    if (f.resumen.termino && (!ultimo || f.resumen.termino > ultimo)) {
      ultimo = f.resumen.termino;
    }
  }
  return ultimo;
}

/* ── Escalonar las actividades ────────────────────────────────────────── */

/**
 * Corre las fechas de inicio para que cada actividad arranque `desfase` días
 * hábiles después de la anterior.
 *
 * Es lo que arma la carta de una pasada en vez de escribir 60 fechas a mano.
 * No se guarda una dependencia entre actividades a propósito (ver la migración
 * 038): esto calcula fechas concretas y después cada una se puede corregir
 * sola sin arrastrar a las demás.
 *
 * Devuelve solo las que CAMBIAN, para no mandar 60 updates cuando se movieron
 * tres.
 */
export function escalonarActividades(
  actividades: TrainActivity[],
  desde: Date | string,
  desfase: number,
  workDays: number[] | null | undefined,
  calendario: Calendario,
): { id: string; startDate: string }[] {
  const arranque = toCalendarDay(desde);
  if (!arranque) return [];

  const paso = Math.max(0, Math.floor(desfase));
  const cambios: { id: string; startDate: string }[] = [];

  let fecha = sumarDiasHabiles(arranque, 0, workDays, calendario);
  for (const actividad of actividades) {
    if (!fecha) break;
    const nueva = claveDia(fecha);
    if (nueva !== claveDia(actividad.startDate ?? '')) {
      cambios.push({ id: actividad.id, startDate: nueva });
    }
    fecha = sumarDiasHabiles(fecha, paso, workDays, calendario);
  }
  return cambios;
}

/* ── Estado de una celda para pintarla ────────────────────────────────── */

export type EstadoCelda = 'pasada' | 'hoy' | 'proxima' | 'futura';

/**
 * En qué está una celda respecto de hoy. Es solo para el color de la matriz:
 * el avance de verdad llega con el parte diario en la Fase 3.
 *
 * «Próxima» son los días hábiles que vienen dentro de la semana de lookahead,
 * que es el tramo que el jefe de terreno tiene que estar mirando.
 */
export function estadoDeCelda(
  celda: Pick<CeldaDelTren, 'inicio' | 'termino'>,
  hoy: Date | string = new Date(),
  workDays?: number[] | null,
  calendario?: Calendario,
): EstadoCelda {
  const dia = toCalendarDay(hoy);
  if (!dia) return 'futura';

  const claveHoy = claveDia(dia);
  if (claveDia(celda.termino) < claveHoy) return 'pasada';
  if (claveDia(celda.inicio) <= claveHoy) return 'hoy';

  const cal = calendario ?? new Map<string, WorkCalendarException['type']>();
  const limite = sumarDiasHabiles(dia, 5, workDays ?? null, cal);
  if (limite && claveDia(celda.inicio) <= claveDia(limite)) return 'proxima';
  return 'futura';
}

/**
 * El ritmo en palabras. Se guarda como días por unidad, pero en obra se habla
 * de las dos formas y "0,5 días por unidad" no se lo dice a nadie.
 */
export function ritmoEnPalabras(daysPerUnit: number): string {
  if (!Number.isFinite(daysPerUnit) || daysPerUnit <= 0) return '';
  if (daysPerUnit === 1) return '1 por día';
  if (daysPerUnit < 1) {
    const porDia = 1 / daysPerUnit;
    const redondo = Number.isInteger(porDia) ? porDia : porDia.toFixed(1).replace('.', ',');
    return `${redondo} por día`;
  }
  const dias = Number.isInteger(daysPerUnit)
    ? daysPerUnit
    : daysPerUnit.toFixed(1).replace('.', ',');
  return `${dias} días c/u`;
}

/* ── Validación ───────────────────────────────────────────────────────── */

/**
 * Revisa una actividad antes de guardarla. Devuelve los mensajes a mostrar;
 * lista vacía = se puede guardar.
 */
export function validarActividad(
  actividad: Partial<TrainActivity>,
  unidades: WorkUnit[],
  workDays?: number[] | null,
  calendario?: Calendario,
): string[] {
  const errores: string[] = [];

  if (!actividad.name?.trim()) errores.push('La actividad necesita un nombre.');

  const ritmo = actividad.daysPerUnit;
  if (ritmo == null || !Number.isFinite(ritmo) || ritmo <= 0) {
    errores.push('El ritmo tiene que ser mayor que cero.');
  }

  if (unidadesDeActividad({ unitGroups: actividad.unitGroups ?? null }, unidades).length === 0) {
    errores.push('Ninguna unidad activa de la obra cae en los grupos elegidos.');
  }

  // Un inicio en día no hábil no es un error —se corre solo al próximo día
  // hábil— pero conviene avisarlo: si no, la primera fecha de la carta no es
  // la que la persona escribió y parece un error de la app.
  if (actividad.startDate && calendario) {
    if (!esDiaHabil(actividad.startDate, workDays ?? null, calendario)) {
      errores.push('Ojo: ese día no se trabaja, así que la actividad va a partir el día hábil siguiente.');
    }
  }

  return errores;
}

/** ¿El mensaje de `validarActividad` impide guardar, o es solo un aviso? */
export function esSoloAviso(mensaje: string): boolean {
  return mensaje.startsWith('Ojo:');
}
