/**
 * Programación Last Planner: lookahead, programa semanal, PPC y causas de no
 * cumplimiento.
 *
 * Lógica pura, sin React ni acceso a datos, para poder cubrirla con tests
 * (`last-planner.test.ts`).
 *
 * Tres reglas de fondo, que son las que hacen que el sistema sirva:
 *
 * 1. **El PPC es binario.** Una tarea comprometida se cumplió o no se cumplió;
 *    "iba en el 80%" cuenta como NO cumplida. Un PPC que premia los avances
 *    parciales sube solo y deja de medir la confiabilidad de los compromisos,
 *    que es exactamente lo único que el indicador existe para medir.
 * 2. **Sin compromisos no hay PPC** (`null`, no 0%). Una semana sin programa no
 *    es una semana con 0% de cumplimiento: es una semana sin medición, y
 *    mostrarla como 0 arruina la tendencia.
 * 3. **Solo se debería comprometer lo liberado.** Una tarea con restricciones
 *    pendientes no está lista. Acá no se prohíbe —en obra a veces se compromete
 *    sabiendo que la restricción se levanta mañana— pero se cuenta y se muestra:
 *    es el número que explica un PPC malo.
 */

import type {
  LookaheadTask, NonComplianceCause, TaskConstraint, TaskConstraintType,
} from '@/modules/core/lib/data';
import { toCalendarDay, addCalendarDays, diffCalendarDays } from '@/lib/date-utils';

/* ── Semanas ──────────────────────────────────────────────────────────── */

/**
 * Lunes de la semana de una fecha, a medianoche local. Es la clave con que se
 * agrupa todo: guardar "semana 32 de 2026" obliga a inventar reglas de
 * calendario a fin de año, y una fecha se ordena y se compara sola.
 */
export function lunesDeLaSemana(fecha: Date | string = new Date()): Date | null {
  const dia = toCalendarDay(fecha);
  if (!dia) return null;
  // getDay(): 0 = domingo. El domingo pertenece a la semana que termina.
  const desplazamiento = (dia.getDay() + 6) % 7;
  return addCalendarDays(dia, -desplazamiento);
}

/** Clave estable de semana (`YYYY-MM-DD` del lunes) para agrupar y comparar. */
export function claveSemana(fecha: Date | string): string {
  const lunes = lunesDeLaSemana(fecha);
  if (!lunes) return '';
  const mm = String(lunes.getMonth() + 1).padStart(2, '0');
  const dd = String(lunes.getDate()).padStart(2, '0');
  return `${lunes.getFullYear()}-${mm}-${dd}`;
}

/**
 * Corre N semanas (negativo hacia atrás) partiendo del lunes de la fecha dada.
 * Lo usan la navegación de semanas y el mover una tarea a la semana siguiente.
 */
export function addSemanas(fecha: Date | string, semanas: number): Date {
  const lunes = lunesDeLaSemana(fecha);
  // Sin fecha válida no hay semana que correr; se devuelve la de hoy para que
  // la navegación no quede en un estado imposible.
  if (!lunes) return lunesDeLaSemana(new Date()) as Date;
  return addCalendarDays(lunes, semanas * 7);
}

/** Domingo de la semana: el último día del programa semanal. */
export function domingoDeLaSemana(fecha: Date | string = new Date()): Date | null {
  const lunes = lunesDeLaSemana(fecha);
  return lunes ? addCalendarDays(lunes, 6) : null;
}

/**
 * Las N semanas del lookahead a partir de una fecha (incluida la suya). Seis
 * semanas es el horizonte habitual: más allá, las restricciones que se detectan
 * cambian antes de que llegue la semana.
 */
export function semanasDeLookahead(
  desde: Date | string = new Date(),
  cantidad = 6,
): Date[] {
  const lunes = lunesDeLaSemana(desde);
  if (!lunes) return [];
  return Array.from({ length: Math.max(0, cantidad) }, (_, i) =>
    addCalendarDays(lunes, i * 7));
}

/** Tareas asignadas a una semana. */
export function tareasDeLaSemana(tasks: LookaheadTask[], semana: Date | string): LookaheadTask[] {
  const clave = claveSemana(semana);
  return tasks.filter((t) => claveSemana(t.weekStart) === clave);
}

/* ── Restricciones ────────────────────────────────────────────────────── */

/** Restricciones que siguen bloqueando (las anuladas y liberadas no cuentan). */
export function restriccionesPendientes(constraints: TaskConstraint[]): TaskConstraint[] {
  return constraints.filter((c) => c.status === 'pendiente');
}

/** Restricciones de una tarea, dentro de una lista de todas. */
export function restriccionesDe(
  constraints: TaskConstraint[],
  taskId: string,
): TaskConstraint[] {
  return constraints.filter((c) => c.taskId === taskId);
}

/**
 * Una tarea está liberada cuando no le queda ninguna restricción pendiente.
 * Una tarea sin restricciones registradas se considera liberada: no tener
 * restricciones no es lo mismo que estar bloqueado.
 */
export function estaLiberada(taskId: string, constraints: TaskConstraint[]): boolean {
  return restriccionesPendientes(restriccionesDe(constraints, taskId)).length === 0;
}

/** Días que quedan para levantar una restricción. Negativo = vencida. */
export function diasParaLevantar(
  constraint: Pick<TaskConstraint, 'dueDate'>,
  hoy: Date | string = new Date(),
): number | null {
  const vence = toCalendarDay(constraint.dueDate);
  const ahora = toCalendarDay(hoy);
  if (!vence || !ahora) return null;
  return diffCalendarDays(vence, ahora);
}

/** Restricciones pendientes cuya fecha comprometida ya pasó. */
export function restriccionesVencidas(
  constraints: TaskConstraint[],
  hoy: Date | string = new Date(),
): TaskConstraint[] {
  return restriccionesPendientes(constraints).filter((c) => {
    const dias = diasParaLevantar(c, hoy);
    return dias !== null && dias < 0;
  });
}

/* ── PPC ──────────────────────────────────────────────────────────────── */

export interface Ppc {
  /** Tareas que alguien se comprometió a hacer en la semana. */
  comprometidas: number;
  cumplidas: number;
  noCumplidas: number;
  /** Todavía sin cerrar: la semana no ha terminado o falta evaluarlas. */
  pendientesDeCierre: number;
  /** 0–100, o `null` si no hubo compromisos que medir. */
  ppc: number | null;
}

/**
 * PPC de un conjunto de tareas: cumplidas sobre comprometidas.
 *
 * Cuentan como comprometidas las que se comprometieron y ya se evaluaron
 * (cumplidas + no cumplidas), más las que siguen en 'comprometida' sin evaluar.
 * Las 'planificada' (todavía en lookahead) y las 'anulada' no entran: no fueron
 * un compromiso.
 */
export function calcPpc(tasks: LookaheadTask[]): Ppc {
  let cumplidas = 0;
  let noCumplidas = 0;
  let pendientes = 0;

  for (const t of tasks) {
    if (t.status === 'cumplida') cumplidas += 1;
    else if (t.status === 'no_cumplida') noCumplidas += 1;
    else if (t.status === 'comprometida') pendientes += 1;
  }

  const comprometidas = cumplidas + noCumplidas + pendientes;
  const evaluadas = cumplidas + noCumplidas;

  return {
    comprometidas,
    cumplidas,
    noCumplidas,
    pendientesDeCierre: pendientes,
    // Se mide sobre lo evaluado: contar como incumplidas las que aún no se
    // revisan daría un PPC falsamente malo a mitad de semana.
    ppc: evaluadas > 0 ? (cumplidas / evaluadas) * 100 : null,
  };
}

/** PPC de una semana concreta. */
export function ppcDeLaSemana(tasks: LookaheadTask[], semana: Date | string): Ppc {
  return calcPpc(tareasDeLaSemana(tasks, semana));
}

export interface PuntoTendencia {
  semana: string;
  /** Lunes de esa semana, para mostrarlo con formato. */
  fecha: Date;
  ppc: number | null;
  comprometidas: number;
  cumplidas: number;
}

/**
 * Tendencia del PPC, semana a semana y en orden cronológico. Es el gráfico que
 * importa: un PPC aislado no dice nada, la serie muestra si la obra está
 * aprendiendo a comprometerse bien.
 */
export function tendenciaPpc(tasks: LookaheadTask[]): PuntoTendencia[] {
  const porSemana = new Map<string, LookaheadTask[]>();

  for (const t of tasks) {
    const clave = claveSemana(t.weekStart);
    if (!clave) continue;
    const lista = porSemana.get(clave);
    if (lista) lista.push(t);
    else porSemana.set(clave, [t]);
  }

  return [...porSemana.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([semana, lista]) => {
      const p = calcPpc(lista);
      return {
        semana,
        fecha: lunesDeLaSemana(semana) as Date,
        ppc: p.ppc,
        comprometidas: p.comprometidas,
        cumplidas: p.cumplidas,
      };
    })
    // Una semana sin compromisos no es un punto de la serie: es un hueco.
    .filter((p) => p.comprometidas > 0);
}

/* ── Causas de no cumplimiento ────────────────────────────────────────── */

export interface CausaContada {
  cause: NonComplianceCause;
  cantidad: number;
  /** % sobre el total de incumplimientos con causa registrada. */
  porcentaje: number;
}

/**
 * Pareto de causas: de la que más se repite a la que menos. Es el entregable
 * que hace útil al sistema — la lista de lo que hay que arreglar, ordenada.
 *
 * Las tareas no cumplidas **sin causa registrada** no se reparten ni se
 * inventan: se informan aparte con `sinCausa`.
 */
export function paretoDeCausas(tasks: LookaheadTask[]): {
  causas: CausaContada[];
  sinCausa: number;
  total: number;
} {
  const conteo = new Map<NonComplianceCause, number>();
  let sinCausa = 0;

  for (const t of tasks) {
    if (t.status !== 'no_cumplida') continue;
    if (!t.causeCode) { sinCausa += 1; continue; }
    conteo.set(t.causeCode, (conteo.get(t.causeCode) ?? 0) + 1);
  }

  const conCausa = [...conteo.values()].reduce((s, n) => s + n, 0);

  const causas = [...conteo.entries()]
    .map(([cause, cantidad]) => ({
      cause,
      cantidad,
      porcentaje: conCausa > 0 ? (cantidad / conCausa) * 100 : 0,
    }))
    .sort((a, b) => b.cantidad - a.cantidad || a.cause.localeCompare(b.cause));

  return { causas, sinCausa, total: conCausa + sinCausa };
}

/* ── Salud del programa ───────────────────────────────────────────────── */

export interface SaludPrograma {
  ppc: Ppc;
  /** Comprometidas que todavía arrastran una restricción pendiente. */
  comprometidasConRestriccion: number;
  /** Tareas del lookahead que ya están listas para comprometerse. */
  liberadasSinComprometer: number;
  restriccionesPendientes: number;
  restriccionesVencidas: number;
}

/**
 * Los cuatro números que se miran al abrir la pantalla. `comprometidasConRestriccion`
 * es el que más explica un PPC malo: se prometió trabajo que no estaba listo.
 */
export function saludPrograma(
  tasksDeLaSemana: LookaheadTask[],
  tasksDelLookahead: LookaheadTask[],
  constraints: TaskConstraint[],
  hoy: Date | string = new Date(),
): SaludPrograma {
  const comprometidasConRestriccion = tasksDeLaSemana.filter((t) =>
    t.status === 'comprometida' && !estaLiberada(t.id, constraints)).length;

  const liberadasSinComprometer = tasksDelLookahead.filter((t) =>
    t.status === 'planificada' && estaLiberada(t.id, constraints)).length;

  const delLookahead = new Set(tasksDelLookahead.map((t) => t.id));
  const relevantes = constraints.filter((c) => delLookahead.has(c.taskId));

  return {
    ppc: calcPpc(tasksDeLaSemana),
    comprometidasConRestriccion,
    liberadasSinComprometer,
    restriccionesPendientes: restriccionesPendientes(relevantes).length,
    restriccionesVencidas: restriccionesVencidas(relevantes, hoy).length,
  };
}

/* ── Etiquetas ────────────────────────────────────────────────────────── */

export const CAUSAS_CNC: Record<NonComplianceCause, string> = {
  materiales: 'Falta de materiales',
  mano_obra: 'Falta de mano de obra',
  equipos: 'Equipos o herramientas',
  informacion: 'Falta de información (planos, RDI)',
  cancha: 'No había cancha (prerrequisito sin terminar)',
  subcontrato: 'Incumplimiento del subcontrato',
  clima: 'Clima',
  cambio_mandante: 'Cambio pedido por el mandante',
  mala_programacion: 'Mala programación',
  otra: 'Otra',
};

export const TIPOS_RESTRICCION: Record<TaskConstraintType, string> = {
  materiales: 'Materiales',
  mano_obra: 'Mano de obra',
  equipos: 'Equipos',
  informacion: 'Información / planos',
  cancha: 'Cancha (prerrequisito)',
  permisos: 'Permisos',
  subcontrato: 'Subcontrato',
  seguridad: 'Seguridad',
  otra: 'Otra',
};

export const ESTADOS_TAREA: Record<LookaheadTask['status'], string> = {
  planificada: 'En lookahead',
  comprometida: 'Comprometida',
  cumplida: 'Cumplida',
  no_cumplida: 'No cumplida',
  anulada: 'Anulada',
};
