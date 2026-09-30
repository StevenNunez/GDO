/**
 * Parte diario: lo que pasó de verdad en la obra, unidad por unidad, día por
 * día.
 *
 * Lógica pura, sin React ni acceso a datos, para poder cubrirla con tests
 * (`daily-report.test.ts`).
 *
 * `progress` ES ACUMULADO
 *   Es la decisión de fondo de la migración 039. Cada parte dice EN CUÁNTO
 *   QUEDÓ la unidad al final de ese día (0 a 1), no cuánto avanzó. Por eso el
 *   avance actual de una unidad es simplemente su parte más reciente, y no una
 *   suma que se pueda descuadrar. El incremento, cuando se necesita, se
 *   calcula restando contra el parte anterior.
 *
 * `crewDays` ES INCREMENTO
 *   Las jornadas gastadas ese día. Esas sí se suman, y contra el avance dan el
 *   rendimiento: la columna HD del programa de terminaciones del usuario.
 */

import type {
  DailyProgress, TrainActivity, WorkUnit, NonComplianceCause,
} from '@/modules/core/lib/data';
import { claveDia } from '@/lib/work-calendar';
import { celdasDeActividad, unidadesDeActividad } from '@/lib/train';
import type { WorkCalendarException } from '@/modules/core/lib/data';

type Calendario = Map<string, WorkCalendarException['type']>;

/**
 * Los pasos de avance que se ofrecen en el teléfono.
 *
 * Son los mismos del Excel del usuario, y son seis y no un deslizador continuo
 * a propósito: en terreno nadie distingue 63% de 67%, y un deslizador obliga a
 * apuntar con el dedo en un bus. Seis botones grandes se tocan sin mirar.
 */
export const ESCALA_AVANCE = [0, 0.2, 0.5, 0.75, 0.9, 1] as const;

export const ETIQUETA_AVANCE: Record<number, string> = {
  0: 'No se hizo',
  0.2: 'Empezado',
  0.5: 'A medias',
  0.75: 'Avanzado',
  0.9: 'Casi listo',
  1: 'Terminado',
};

/** Porcentaje entero para mostrar. */
export function comoPorcentaje(progress: number): number {
  return Math.round(Math.max(0, Math.min(1, progress)) * 100);
}

/* ── Índices ──────────────────────────────────────────────────────────── */

/** Clave de una celda del parte: actividad + unidad (o la actividad sola). */
export function claveCelda(activityId: string, unitId: string | null | undefined): string {
  return `${activityId}|${unitId ?? ''}`;
}

/**
 * El parte MÁS RECIENTE de cada celda. Es el avance vigente de esa unidad.
 *
 * Se compara por fecha y, a igualdad de fecha, por `updatedAt`: dos partes del
 * mismo día solo existen si la base los dejó (no debería, hay índice único),
 * pero si pasa vale la corrección más nueva y no la primera que llegó.
 */
export function avanceVigente(progresos: DailyProgress[]): Map<string, DailyProgress> {
  const mapa = new Map<string, DailyProgress>();
  for (const p of progresos) {
    const clave = claveCelda(p.activityId, p.unitId);
    const actual = mapa.get(clave);
    if (!actual || esMasReciente(p, actual)) mapa.set(clave, p);
  }
  return mapa;
}

function esMasReciente(a: DailyProgress, b: DailyProgress): boolean {
  const fa = claveDia(a.date);
  const fb = claveDia(b.date);
  if (fa !== fb) return fa > fb;
  return (a.updatedAt ?? a.createdAt) > (b.updatedAt ?? b.createdAt);
}

/** Partes de una obra, de la más nueva a la más vieja. */
export function progresosDeObra(
  progresos: DailyProgress[],
  projectId: string | null | undefined,
): DailyProgress[] {
  if (!projectId) return [];
  return progresos
    .filter((p) => p.projectId === projectId)
    .sort((a, b) => claveDia(b.date).localeCompare(claveDia(a.date)));
}

/** Partes de un día concreto. */
export function progresosDelDia(
  progresos: DailyProgress[],
  fecha: Date | string,
): DailyProgress[] {
  const clave = claveDia(fecha);
  return progresos.filter((p) => claveDia(p.date) === clave);
}

/* ── Avance ───────────────────────────────────────────────────────────── */

/**
 * Avance de una actividad completa: el promedio de sus unidades, contando como
 * cero las que todavía no tienen ningún parte.
 *
 * Promedio simple y no ponderado por superficie a propósito: en un tren lo que
 * importa es cuántos deptos quedaron listos, y ponderar por m2 haría que
 * terminar el depto grande "valga más" cuando la cuadrilla avanza igual.
 */
export function avanceDeActividad(
  actividad: Pick<TrainActivity, 'id' | 'unitGroups'>,
  unidades: WorkUnit[],
  vigentes: Map<string, DailyProgress>,
): { avance: number; conParte: number; total: number } {
  const recorrido = unidadesDeActividad(actividad, unidades);
  if (recorrido.length === 0) return { avance: 0, conParte: 0, total: 0 };

  let suma = 0;
  let conParte = 0;
  for (const u of recorrido) {
    const parte = vigentes.get(claveCelda(actividad.id, u.id));
    if (parte) {
      suma += parte.progress;
      conParte++;
    }
  }
  return { avance: suma / recorrido.length, conParte, total: recorrido.length };
}

/**
 * Cuánto avanzó una unidad ESE día: la diferencia contra el parte anterior.
 *
 * El primer parte de una unidad cuenta entero. Un valor negativo —alguien
 * corrigió a la baja— se devuelve tal cual: esconderlo dejaría el total del
 * día sin cuadrar con el acumulado.
 */
export function incrementoDelDia(
  parte: DailyProgress,
  progresos: DailyProgress[],
): number {
  const clave = claveCelda(parte.activityId, parte.unitId);
  const fecha = claveDia(parte.date);

  let anterior: DailyProgress | null = null;
  for (const p of progresos) {
    if (claveCelda(p.activityId, p.unitId) !== clave) continue;
    if (claveDia(p.date) >= fecha) continue;
    if (!anterior || claveDia(p.date) > claveDia(anterior.date)) anterior = p;
  }
  return parte.progress - (anterior?.progress ?? 0);
}

/* ── Rendimiento (la columna HD del Excel) ────────────────────────────── */

export interface Rendimiento {
  /** Unidades equivalentes terminadas (la suma de los avances). */
  unidades: number;
  /** Jornadas gastadas. */
  jornadas: number;
  /** Unidades por jornada. `null` cuando no se cargaron jornadas. */
  rendimiento: number | null;
}

/**
 * Rendimiento real de una actividad: unidades equivalentes por jornada.
 *
 * Es el dato que el usuario hoy saca a mano de las columnas HD y UN de su
 * Excel, y el que permite decir si una cuadrilla rinde o no.
 *
 * Devuelve `null` en vez de cero cuando no hay jornadas cargadas: un
 * rendimiento de cero significaría que la cuadrilla no rinde, y lo que pasa es
 * que nadie anotó cuánta gente puso.
 */
export function rendimientoDeActividad(
  activityId: string,
  progresos: DailyProgress[],
  vigentes: Map<string, DailyProgress>,
  unidades: WorkUnit[],
  actividad: Pick<TrainActivity, 'id' | 'unitGroups'>,
): Rendimiento {
  const jornadas = progresos
    .filter((p) => p.activityId === activityId)
    .reduce((t, p) => t + (p.crewDays ?? 0), 0);

  const recorrido = unidadesDeActividad(actividad, unidades);
  const equivalentes = recorrido.reduce(
    (t, u) => t + (vigentes.get(claveCelda(activityId, u.id))?.progress ?? 0),
    0,
  );

  return {
    unidades: equivalentes,
    jornadas,
    rendimiento: jornadas > 0 ? equivalentes / jornadas : null,
  };
}

/* ── Qué le toca reportar hoy ─────────────────────────────────────────── */

export interface PendienteDeReporte {
  unidad: WorkUnit;
  /** Día en que el tren dice que le toca. */
  programada: Date;
  /** Avance vigente de la unidad, 0 si nunca se reportó. */
  avance: number;
  /** Ya se reportó hoy (y por lo tanto se está corrigiendo, no creando). */
  reportadaHoy: boolean;
  /** El tren la daba por hecha antes de hoy y no está terminada. */
  atrasada: boolean;
}

/**
 * Las unidades que el supervisor tiene que mirar hoy para esta actividad.
 *
 * NO son todas las unidades: son las que el tren programó hasta hoy y que
 * todavía no están terminadas, más las que ya reportó hoy (para poder
 * corregirse). Mostrarle las 240 de la obra en un teléfono es garantizar que
 * no cargue el parte.
 *
 * Salen las atrasadas primero: son las que explican el atraso y las que hay
 * que preguntar.
 */
export function pendientesDeHoy(
  actividad: Pick<TrainActivity, 'id' | 'startDate' | 'daysPerUnit' | 'unitGroups'>,
  unidades: WorkUnit[],
  vigentes: Map<string, DailyProgress>,
  progresos: DailyProgress[],
  fecha: Date | string,
  workDays: number[] | null | undefined,
  calendario: Calendario,
): PendienteDeReporte[] {
  const hoy = claveDia(fecha);
  const celdas = celdasDeActividad(actividad, unidades, workDays, calendario);
  const porId = new Map(unidades.map((u) => [u.id, u]));

  const reportadasHoy = new Set(
    progresosDelDia(progresos, fecha)
      .filter((p) => p.activityId === actividad.id && p.unitId)
      .map((p) => p.unitId as string),
  );

  const pendientes: PendienteDeReporte[] = [];
  for (const celda of celdas) {
    const unidad = porId.get(celda.unitId);
    if (!unidad) continue;

    const avance = vigentes.get(claveCelda(actividad.id, celda.unitId))?.progress ?? 0;
    const yaReportadaHoy = reportadasHoy.has(celda.unitId);
    const inicio = claveDia(celda.inicio);

    // Todavía no le toca: no tiene sentido pedirle avance de un depto que la
    // cuadrilla no ha pisado.
    if (inicio > hoy && !yaReportadaHoy) continue;
    // Ya está terminada y no se está corrigiendo hoy: fuera de la lista.
    if (avance >= 1 && !yaReportadaHoy) continue;

    pendientes.push({
      unidad,
      programada: celda.inicio,
      avance,
      reportadaHoy: yaReportadaHoy,
      atrasada: claveDia(celda.termino) < hoy && avance < 1,
    });
  }

  return pendientes.sort((a, b) => {
    if (a.atrasada !== b.atrasada) return a.atrasada ? -1 : 1;
    return a.unidad.sortOrder - b.unidad.sortOrder;
  });
}

/**
 * Actividades que hoy tienen algo que reportar, para armar la pantalla del
 * supervisor sin que tenga que buscar la suya.
 *
 * Con `soloDe` se limita a un responsable: es lo que hace que el
 * subcontratista vea únicamente lo suyo.
 */
export function actividadesDeHoy(
  actividades: TrainActivity[],
  unidades: WorkUnit[],
  vigentes: Map<string, DailyProgress>,
  progresos: DailyProgress[],
  fecha: Date | string,
  workDays: number[] | null | undefined,
  calendario: Calendario,
  soloDe?: string | null,
): { actividad: TrainActivity; pendientes: PendienteDeReporte[] }[] {
  const filtradas = soloDe
    ? actividades.filter(
        (a) => (a.responsibleName ?? '').trim().toLowerCase() === soloDe.trim().toLowerCase(),
      )
    : actividades;

  return filtradas
    .map((actividad) => ({
      actividad,
      pendientes: pendientesDeHoy(
        actividad, unidades, vigentes, progresos, fecha, workDays, calendario,
      ),
    }))
    .filter((x) => x.pendientes.length > 0);
}

/* ── Resumen del día ──────────────────────────────────────────────────── */

export interface ResumenDelDia {
  /** Cuántas unidades se reportaron. */
  reportes: number;
  /** Unidades equivalentes avanzadas hoy (la suma de los incrementos). */
  avanceEquivalente: number;
  /** Jornadas gastadas hoy. */
  jornadas: number;
  /** Unidades que quedaron terminadas hoy. */
  terminadas: number;
  /** Reportes que dijeron "no se hizo" y por qué. */
  sinAvance: number;
  causas: { code: NonComplianceCause; label: string; veces: number }[];
}

/**
 * El resumen del día, que es lo que va al PDF y a la reunión de la mañana.
 *
 * Las causas salen ordenadas de la que más se repite a la que menos: es el
 * Pareto en chico, y sirve para atacar mañana lo que hoy frenó más deptos.
 */
export function resumenDelDia(
  progresos: DailyProgress[],
  fecha: Date | string,
  etiquetas: Record<NonComplianceCause, string>,
): ResumenDelDia {
  const delDia = progresosDelDia(progresos, fecha);

  const conteo = new Map<NonComplianceCause, number>();
  let avanceEquivalente = 0;
  let jornadas = 0;
  let terminadas = 0;
  let sinAvance = 0;

  for (const p of delDia) {
    avanceEquivalente += incrementoDelDia(p, progresos);
    jornadas += p.crewDays ?? 0;
    if (p.progress >= 1) terminadas++;
    if (p.causeCode) {
      sinAvance++;
      conteo.set(p.causeCode, (conteo.get(p.causeCode) ?? 0) + 1);
    }
  }

  const causas = Array.from(conteo, ([code, veces]) => ({
    code,
    label: etiquetas[code] ?? code,
    veces,
  })).sort((a, b) => b.veces - a.veces || a.label.localeCompare(b.label));

  return {
    reportes: delDia.length,
    avanceEquivalente,
    jornadas,
    terminadas,
    sinAvance,
    causas,
  };
}

/* ── Validación ───────────────────────────────────────────────────────── */

/**
 * Revisa un parte antes de guardarlo.
 *
 * La regla que importa: si no avanzó, hay que decir por qué. Un parte de "0%"
 * sin causa es exactamente el dato que no sirve para nada — se sabe que el
 * depto no avanzó, que es lo que ya se veía, y no se sabe qué arreglar.
 */
export function validarParte(parte: {
  progress: number;
  avanceAnterior?: number;
  causeCode?: NonComplianceCause | null;
  crewDays?: number | null;
}): string[] {
  const errores: string[] = [];

  if (!Number.isFinite(parte.progress) || parte.progress < 0 || parte.progress > 1) {
    errores.push('El avance tiene que estar entre 0% y 100%.');
  }

  const anterior = parte.avanceAnterior ?? 0;
  if (parte.progress <= anterior && !parte.causeCode) {
    errores.push('No avanzó respecto del último parte: elige por qué.');
  }

  if (parte.crewDays != null && (!Number.isFinite(parte.crewDays) || parte.crewDays < 0)) {
    errores.push('Las jornadas no pueden ser negativas.');
  }

  if (parte.progress < anterior) {
    errores.push('Ojo: estás dejando la unidad más atrás de lo que ya estaba reportado.');
  }

  return errores;
}

/** ¿El mensaje de `validarParte` impide guardar, o es solo un aviso? */
export function esAviso(mensaje: string): boolean {
  return mensaje.startsWith('Ojo:');
}
