/**
 * Enganches del tren con el resto de la obra (Fase 5).
 *
 * El tren sabe lo que pasó depto por depto, todos los días. El resto de la app
 * necesita ese mismo dato en otros cuatro formatos: el avance de la partida en
 * la EDT, el compromiso de la semana en el Last Planner, la entrada de la
 * bitácora y el asiento del libro de obra.
 *
 * Acá se calculan esos cuatro, y en ninguno se guarda una copia del avance:
 * todo sale del parte diario, que es el único lugar donde el dato se escribe.
 *
 * EL TRASPASO A LA EDT ES UNA PROPUESTA, NO UN AUTOMATISMO
 *   Sería fácil escribir el avance de la partida cada vez que entra un parte.
 *   No se hace: la EDT es lo que se le cobra al mandante, y el parte diario es
 *   lo que el capataz vio desde el pasillo. Entre los dos tiene que haber
 *   alguien que mire y apriete el botón — el mismo criterio del protocolo de
 *   calidad, que tampoco se aprueba solo.
 *
 * Lógica pura, sin React ni acceso a datos, con tests (`train-links.test.ts`).
 */

import type {
  DailyProgress, LookaheadTask, NonComplianceCause, TrainActivity,
  WorkCalendarException, WorkItem, WorkUnit,
} from '@/modules/core/lib/data';
import { addCalendarDays } from '@/lib/date-utils';
import { claveDia } from '@/lib/work-calendar';
import { celdasDeActividad, unidadesDeActividad } from '@/lib/train';
import {
  avanceVigente, claveCelda, comoPorcentaje, incrementoDelDia, progresosDelDia,
} from '@/lib/daily-report';
import { claveSemana, lunesDeLaSemana } from '@/lib/last-planner';

type Calendario = Map<string, WorkCalendarException['type']>;

/**
 * Bajo esta diferencia no se propone nada: es ruido de redondeo de repartir
 * deptos entre metros cuadrados, y ofrecer «registrar 0,0003 m2» convierte la
 * pantalla en una lista de botones que no hay que apretar.
 */
const TOLERANCIA = 0.005;

/* ── 1 · Avance para la EDT ───────────────────────────────────────────── */

export interface PropuestaEDT {
  workItemId: string;
  /** Nombre de la partida, para no tener que buscarla otra vez en pantalla. */
  partida: string;
  unidadDeMedida: string;
  /** Actividades del tren que alimentan esta partida. */
  actividades: { id: string; name: string }[];
  /** Unidades equivalentes terminadas entre todas esas actividades. */
  equivalentes: number;
  /** Unidades que recorren esas actividades en total. */
  totalUnidades: number;
  /** Avance físico según el tren, de 0 a 1. */
  fraccion: number;
  /** Cantidad ejecutada, en la unidad de medida de la partida. */
  cantidadEjecutada: number;
  /** Cantidad que la EDT ya tiene registrada. */
  cantidadRegistrada: number;
  /** Lo que falta por registrar. Nunca negativo: ver la nota de abajo. */
  porRegistrar: number;
  /** La EDT va MÁS ADELANTE que el tren: se registró de más, o a mano. */
  adelantada: boolean;
}

/**
 * Cuánto avance tiene cada partida de la EDT según el tren.
 *
 * La cantidad ejecutada sale de la cubicación por unidad (`quantityPerUnit`)
 * cuando la actividad la tiene —es el dato exacto: 240 deptos × 45 m2— y del
 * prorrateo sobre la cantidad de la partida cuando no. Mezclar los dos
 * criterios dentro de una misma partida daría un número que no cuadra con
 * ninguno, así que si ALGUNA de sus actividades no tiene cubicación, se
 * prorratea todo.
 *
 * `porRegistrar` nunca es negativo: la EDT registra avance sumando cantidades
 * (`add_work_item_progress`), y no existe forma de descontar. Cuando la EDT va
 * más adelante que el tren se marca `adelantada` y se muestra —que es lo que
 * hay que revisar—; lo que no se hace es proponer un número imposible.
 */
export function avancesParaEDT(
  actividades: TrainActivity[],
  unidades: WorkUnit[],
  progresos: DailyProgress[],
  workItems: WorkItem[],
): PropuestaEDT[] {
  const vigentes = avanceVigente(progresos);
  const porPartida = new Map<string, TrainActivity[]>();

  for (const act of actividades) {
    if (act.status !== 'activa' || !act.workItemId) continue;
    const lista = porPartida.get(act.workItemId) ?? [];
    lista.push(act);
    porPartida.set(act.workItemId, lista);
  }

  const propuestas: PropuestaEDT[] = [];

  for (const [workItemId, delGrupo] of porPartida) {
    const partida = workItems.find((w) => w.id === workItemId);
    if (!partida) continue;

    let equivalentes = 0;
    let totalUnidades = 0;
    let cantidadPorCubicacion = 0;
    let todasConCubicacion = true;

    for (const act of delGrupo) {
      const recorrido = unidadesDeActividad(act, unidades);
      totalUnidades += recorrido.length;

      const hechas = recorrido.reduce(
        (t, u) => t + (vigentes.get(claveCelda(act.id, u.id))?.progress ?? 0),
        0,
      );
      equivalentes += hechas;

      if (act.quantityPerUnit && act.quantityPerUnit > 0) {
        cantidadPorCubicacion += hechas * act.quantityPerUnit;
      } else {
        todasConCubicacion = false;
      }
    }

    if (totalUnidades === 0) continue;

    const fraccion = equivalentes / totalUnidades;
    const cantidadEjecutada = todasConCubicacion
      ? cantidadPorCubicacion
      : fraccion * (partida.quantity ?? 0);

    const cantidadRegistrada = ((partida.progress ?? 0) / 100) * (partida.quantity ?? 0);
    const diferencia = cantidadEjecutada - cantidadRegistrada;

    propuestas.push({
      workItemId,
      partida: partida.name,
      unidadDeMedida: partida.unit || 'un',
      actividades: delGrupo.map((a) => ({ id: a.id, name: a.name })),
      equivalentes,
      totalUnidades,
      fraccion,
      cantidadEjecutada,
      cantidadRegistrada,
      porRegistrar: diferencia > 0 ? diferencia : 0,
      adelantada: diferencia < -TOLERANCIA,
    });
  }

  return propuestas.sort(
    (a, b) => b.porRegistrar - a.porRegistrar || a.partida.localeCompare(b.partida),
  );
}

/** Las que de verdad tienen algo que traspasar. */
export function propuestasConAvance(propuestas: PropuestaEDT[]): PropuestaEDT[] {
  return propuestas.filter((p) => p.porRegistrar > TOLERANCIA);
}

/** «72%» a partir de la fracción de avance de una partida. */
export function porcentajeDePropuesta(propuesta: PropuestaEDT): number {
  return comoPorcentaje(propuesta.fraccion);
}

/* ── 2 · Compromisos de la semana desde el tren ───────────────────────── */

export interface CompromisoPropuesto {
  trainActivityId: string;
  name: string;
  responsibleName: string | null;
  workItemId: string | null;
  unit: string;
  quantityPlanned: number;
  /** Unidades que el tren programa esa semana, en orden de recorrido. */
  unidades: WorkUnit[];
  /** Ya existe una tarea de esta actividad en esta semana. */
  yaExiste: boolean;
}

/**
 * Lo que el tren dice que le toca a cada cuadrilla esta semana, listo para
 * entrar como compromiso del programa semanal.
 *
 * El compromiso se arma con las unidades cuyo TÉRMINO cae dentro de la semana:
 * comprometerse con un depto que recién se empieza el viernes y se termina el
 * lunes siguiente es prometer algo que no se puede cumplir, y el PPC lo
 * castigaría sin que nadie hubiera hecho nada mal.
 *
 * La cantidad va en la cubicación de la actividad cuando la tiene (m2, ml) y
 * en unidades cuando no: es lo que después se compara contra lo ejecutado.
 */
export function compromisosDelTren(
  actividades: TrainActivity[],
  unidades: WorkUnit[],
  semana: Date | string,
  workDays: number[] | null | undefined,
  calendario: Calendario,
  existentes: LookaheadTask[],
): CompromisoPropuesto[] {
  const lunes = lunesDeLaSemana(semana);
  if (!lunes) return [];

  const desde = claveDia(lunes);
  const hasta = claveDia(addCalendarDays(lunes, 6));
  const claveDeLaSemana = claveSemana(lunes);

  const yaGeneradas = new Set(
    existentes
      .filter((t) => t.trainActivityId && claveSemana(t.weekStart) === claveDeLaSemana)
      .map((t) => t.trainActivityId as string),
  );

  const porId = new Map(unidades.map((u) => [u.id, u]));
  const propuestas: CompromisoPropuesto[] = [];

  for (const act of actividades) {
    if (act.status !== 'activa') continue;

    const celdas = celdasDeActividad(act, unidades, workDays, calendario);
    const deLaSemana = celdas.filter((c) => {
      const termino = claveDia(c.termino);
      return termino >= desde && termino <= hasta;
    });
    if (deLaSemana.length === 0) continue;

    const suyas = deLaSemana
      .map((c) => porId.get(c.unitId))
      .filter((u): u is WorkUnit => Boolean(u));

    const cubicacion = act.quantityPerUnit && act.quantityPerUnit > 0
      ? act.quantityPerUnit
      : null;

    propuestas.push({
      trainActivityId: act.id,
      name: nombreDelCompromiso(act.name, suyas),
      responsibleName: act.responsibleName?.trim() || null,
      workItemId: act.workItemId ?? null,
      unit: cubicacion ? (act.unit || 'un') : 'un',
      quantityPlanned: cubicacion ? suyas.length * cubicacion : suyas.length,
      unidades: suyas,
      yaExiste: yaGeneradas.has(act.id),
    });
  }

  return propuestas;
}

/**
 * «Cerámica · 312 a 318 (7 unidades)». El rango importa más que el total: es
 * lo que el maestro reconoce cuando lee el programa de la semana.
 */
function nombreDelCompromiso(actividad: string, unidades: WorkUnit[]): string {
  if (unidades.length === 0) return actividad;
  if (unidades.length === 1) return `${actividad} · ${unidades[0].name}`;
  const primera = unidades[0].name;
  const ultima = unidades[unidades.length - 1].name;
  return `${actividad} · ${primera} a ${ultima} (${unidades.length} unidades)`;
}

/* ── 3 · Cerrar la semana con el parte diario ─────────────────────────── */

export interface CierreSugerido {
  /** Unidades equivalentes terminadas, de las comprometidas. */
  hechas: number;
  comprometidas: number;
  /** Cantidad ejecutada, en la unidad de medida del compromiso. */
  quantityDone: number;
  cumplida: boolean;
  /** La causa más repetida en los partes de la semana. */
  causaSugerida: NonComplianceCause | null;
  /** Hay partes de esa actividad en la semana. Sin esto no se sugiere nada. */
  conDatos: boolean;
}

/**
 * Qué dice el parte diario sobre un compromiso de la semana.
 *
 * Se mira el avance vigente AL DOMINGO de esa semana y no el de hoy: cerrar la
 * semana pasada con el avance de hoy premiaría el trabajo hecho el martes
 * siguiente, que es exactamente lo que el PPC existe para no dejar pasar.
 *
 * El compromiso se da por cumplido solo si TODAS las unidades quedaron
 * terminadas. El PPC es binario a propósito (ver `last-planner.ts`): «casi» es
 * no cumplido, y esa es la mitad del valor de la medición.
 */
export function cierreDesdeElParte(
  tarea: Pick<LookaheadTask, 'trainActivityId' | 'weekStart'>,
  actividades: TrainActivity[],
  unidades: WorkUnit[],
  progresos: DailyProgress[],
  workDays: number[] | null | undefined,
  calendario: Calendario,
): CierreSugerido | null {
  if (!tarea.trainActivityId) return null;

  const act = actividades.find((a) => a.id === tarea.trainActivityId);
  if (!act) return null;

  const lunes = lunesDeLaSemana(tarea.weekStart);
  if (!lunes) return null;
  const claveDesde = claveDia(lunes);
  const claveHasta = claveDia(addCalendarDays(lunes, 6));

  const celdas = celdasDeActividad(act, unidades, workDays, calendario);
  const comprometidas = celdas.filter((c) => {
    const termino = claveDia(c.termino);
    return termino >= claveDesde && termino <= claveHasta;
  });
  if (comprometidas.length === 0) return null;

  // El avance que había al domingo, no el de hoy.
  const hastaElDomingo = progresos.filter(
    (p) => p.activityId === act.id && claveDia(p.date) <= claveHasta,
  );
  const vigentes = avanceVigente(hastaElDomingo);

  let hechas = 0;
  let terminadas = 0;
  for (const celda of comprometidas) {
    const avance = vigentes.get(claveCelda(act.id, celda.unitId))?.progress ?? 0;
    hechas += avance;
    if (avance >= 1) terminadas++;
  }

  const deLaSemana = hastaElDomingo.filter((p) => claveDia(p.date) >= claveDesde);
  const cubicacion = act.quantityPerUnit && act.quantityPerUnit > 0 ? act.quantityPerUnit : null;
  const quantityDone = cubicacion ? hechas * cubicacion : hechas;

  return {
    hechas,
    comprometidas: comprometidas.length,
    quantityDone: Math.round(quantityDone * 100) / 100,
    cumplida: terminadas === comprometidas.length,
    causaSugerida: causaMasRepetida(deLaSemana),
    conDatos: deLaSemana.length > 0,
  };
}

/** La causa que más veces frenó la actividad en el período. */
function causaMasRepetida(progresos: DailyProgress[]): NonComplianceCause | null {
  const conteo = new Map<NonComplianceCause, number>();
  for (const p of progresos) {
    if (!p.causeCode) continue;
    conteo.set(p.causeCode, (conteo.get(p.causeCode) ?? 0) + 1);
  }
  let mejor: NonComplianceCause | null = null;
  let veces = 0;
  for (const [causa, n] of conteo) {
    if (n > veces) { mejor = causa; veces = n; }
  }
  return mejor;
}

/* ── 4 · El día en palabras: bitácora y libro de obra ─────────────────── */

export interface BorradorDelDia {
  /** Qué se hizo, actividad por actividad. Va a `workPerformed`. */
  trabajos: string;
  /** Lo que no avanzó y por qué. Va a `incidents`. */
  incidencias: string;
  /** Jornadas cargadas ese día, redondeadas: es gente en terreno. */
  jornadas: number;
  /** Unidades que quedaron terminadas ese día. */
  terminadas: number;
  /** Unidades equivalentes avanzadas ese día. */
  avanceEquivalente: number;
  /** Hay algo que traspasar. */
  hayDatos: boolean;
}

/**
 * El día del parte diario escrito en prosa, para la bitácora de obra.
 *
 * No se guarda solo: se ofrece como borrador y alguien lo revisa antes de
 * grabarlo. La bitácora es un documento que se firma y que se lee en un
 * arbitraje — que la escriba una función sin que nadie la mire es exactamente
 * lo que la deja sin valor.
 */
export function borradorDelDia(
  fecha: Date | string,
  actividades: TrainActivity[],
  unidades: WorkUnit[],
  progresos: DailyProgress[],
  etiquetas: Record<NonComplianceCause, string>,
): BorradorDelDia {
  const delDia = progresosDelDia(progresos, fecha);
  const porActividad = new Map(actividades.map((a) => [a.id, a]));
  const porUnidad = new Map(unidades.map((u) => [u.id, u]));

  const trabajos: string[] = [];
  const incidencias: string[] = [];
  let jornadas = 0;
  let terminadas = 0;
  let avanceEquivalente = 0;

  // Agrupado por actividad: una línea por cuadrilla, que es como se cuenta en
  // la reunión de la mañana. Una línea por depto serían cuarenta ilegibles.
  const grupos = new Map<string, DailyProgress[]>();
  for (const p of delDia) {
    jornadas += p.crewDays ?? 0;
    avanceEquivalente += incrementoDelDia(p, progresos);
    if (p.progress >= 1) terminadas++;
    const lista = grupos.get(p.activityId) ?? [];
    lista.push(p);
    grupos.set(p.activityId, lista);
  }

  for (const [activityId, partes] of grupos) {
    const act = porActividad.get(activityId);
    if (!act) continue;

    const avanzaron = partes.filter((p) => incrementoDelDia(p, progresos) > 0);
    const cerradas = partes.filter((p) => p.progress >= 1);
    const frenadas = partes.filter((p) => p.causeCode);

    if (avanzaron.length > 0) {
      const nombres = avanzaron
        .map((p) => (p.unitId ? porUnidad.get(p.unitId)?.name : null))
        .filter((n): n is string => Boolean(n));
      const responsable = act.responsibleName?.trim();
      const detalle = nombres.length > 0 ? ` en ${nombres.join(', ')}` : '';
      const cierre = cerradas.length > 0
        ? ` Se terminaron ${cerradas.length} unidad(es).`
        : '';
      trabajos.push(
        `${act.name}${responsable ? ` (${responsable})` : ''}: avance${detalle}.${cierre}`,
      );
    }

    for (const p of frenadas) {
      const unidad = p.unitId ? porUnidad.get(p.unitId)?.name : null;
      const causa = p.causeCode ? etiquetas[p.causeCode] ?? p.causeCode : 'sin causa';
      incidencias.push(
        `${act.name}${unidad ? ` · ${unidad}` : ''}: ${causa}`
        + (p.notes?.trim() ? ` — ${p.notes.trim()}` : ''),
      );
    }
  }

  return {
    trabajos: trabajos.join('\n'),
    incidencias: incidencias.join('\n'),
    jornadas: Math.round(jornadas),
    terminadas,
    avanceEquivalente,
    hayDatos: delDia.length > 0,
  };
}

/**
 * El asiento de avance para el libro de obra.
 *
 * El libro no es la bitácora: lo lee el ITO y queda como registro legal de la
 * obra, así que el asiento va con los números del día —cuántas unidades
 * quedaron terminadas, cuántas jornadas— y no con el detalle depto por depto,
 * que es lo que le corresponde a la bitácora.
 */
export function asientoDeAvance(
  fecha: Date | string,
  borrador: BorradorDelDia,
): string {
  const equivalente = (Math.round(borrador.avanceEquivalente * 100) / 100).toFixed(2);
  const partes: string[] = [
    `Avance del día ${claveDia(fecha)}: ${borrador.terminadas} unidad(es) terminada(s), `
    + `${equivalente} unidades equivalentes de avance`
    + (borrador.jornadas > 0 ? `, ${borrador.jornadas} jornada(s) en terreno.` : '.'),
  ];

  if (borrador.trabajos) partes.push(`\nTrabajos ejecutados:\n${borrador.trabajos}`);
  if (borrador.incidencias) partes.push(`\nSin avance:\n${borrador.incidencias}`);

  return partes.join('\n');
}
