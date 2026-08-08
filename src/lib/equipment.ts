/**
 * Equipos y maquinaria en arriendo (migración 036).
 *
 * El arriendo es de los pocos costos que crecen SOLOS: todos los días, sin que
 * nadie apruebe nada. La grúa que quedó tres semanas de más en obra no aparece
 * en ninguna orden de compra hasta que llega la factura del mes.
 *
 * Por eso el costo acumulado se CALCULA en vez de guardarse: una columna con
 * ese número estaría desactualizada apenas se escribe. Lo que se guarda es lo
 * que alguien decidió — la tarifa, las fechas y cuándo se devolvió.
 *
 * Lógica pura, con tests.
 */

import { toCalendarDay } from '@/lib/date-utils';
import type { EquipmentRental } from '@/modules/core/lib/data';

const MS_DIA = 86_400_000;

/* ── Etiquetas ─────────────────────────────────────────────────────────── */

export const CATEGORIAS_EQUIPO: Record<EquipmentRental['category'], string> = {
  grua: 'Grúa',
  andamio: 'Andamios',
  moldaje: 'Moldajes',
  maquinaria: 'Maquinaria',
  vehiculo: 'Vehículo',
  generador: 'Generador',
  contenedor: 'Contenedor',
  herramienta_mayor: 'Herramienta mayor',
  otro: 'Otro',
};

export const MODOS_TARIFA: Record<EquipmentRental['rateMode'], string> = {
  hora: 'Por hora',
  dia: 'Por día',
  semana: 'Por semana',
  mes: 'Por mes',
};

/** Cuántos días cubre una unidad de cada tarifa. El mes comercial son 30. */
const DIAS_POR_UNIDAD: Record<EquipmentRental['rateMode'], number> = {
  hora: 1, // se resuelve aparte con `hoursPerDay`
  dia: 1,
  semana: 7,
  mes: 30,
};

/* ── Tiempo transcurrido ───────────────────────────────────────────────── */

/**
 * Días que el equipo lleva (o llevó) en obra, contando el primero.
 *
 * Un equipo que entra y sale el mismo día costó un día, no cero — así se cobra
 * en la práctica. Si ya se devolvió, se cuenta hasta la devolución; si no,
 * hasta la fecha de corte, porque sigue costando.
 */
export function diasDeArriendo(
  rental: Pick<EquipmentRental, 'startDate' | 'returnedAt'>,
  hasta: Date | string = new Date(),
): number {
  const inicio = toCalendarDay(rental.startDate);
  if (!inicio) return 0;

  const devuelto = toCalendarDay(rental.returnedAt);
  const corte = toCalendarDay(hasta);
  if (!corte) return 0;

  const fin = devuelto && devuelto.getTime() < corte.getTime() ? devuelto : corte;
  if (fin.getTime() < inicio.getTime()) return 0;

  return Math.round((fin.getTime() - inicio.getTime()) / MS_DIA) + 1;
}

/**
 * Unidades facturables según el modo de tarifa, respetando el mínimo pactado.
 *
 * Las fracciones se redondean hacia arriba: nadie arrienda «media semana» —
 * empezada la semana, se cobra entera. Es como se factura y como hay que
 * proyectarlo para no llevarse la sorpresa al cierre de mes.
 */
export function unidadesFacturables(
  rental: Pick<EquipmentRental, 'startDate' | 'returnedAt' | 'rateMode' | 'hoursPerDay' | 'minimumUnits'>,
  hasta: Date | string = new Date(),
): number {
  const dias = diasDeArriendo(rental, hasta);
  if (dias <= 0) return 0;

  const brutas = rental.rateMode === 'hora'
    // Por hora, las unidades son horas: días × jornada pactada. Sin jornada no
    // se puede convertir, y suponer 8 horas inventaría el costo.
    ? dias * (rental.hoursPerDay ?? 0)
    : Math.ceil(dias / DIAS_POR_UNIDAD[rental.rateMode]);

  return Math.max(brutas, rental.minimumUnits ?? 0);
}

/* ── Costo ─────────────────────────────────────────────────────────────── */

/** Lo que lleva costando a la fecha de corte. */
export function costoAcumulado(
  rental: EquipmentRental,
  hasta: Date | string = new Date(),
): number {
  if (rental.status === 'cancelado') return 0;
  return unidadesFacturables(rental, hasta) * (rental.rate || 0);
}

/**
 * Lo que va a costar si se devuelve en la fecha programada.
 *
 * `null` si no tiene fecha de término: un arriendo abierto no se puede
 * proyectar, y poner un número sería peor que no ponerlo.
 */
export function costoProyectado(rental: EquipmentRental): number | null {
  if (!rental.endDate) return null;
  return unidadesFacturables(rental, rental.endDate) * (rental.rate || 0);
}

/**
 * Cuánto se pasó del presupuesto del arriendo: lo que va corriendo contra lo
 * que se proyectó. Positivo = ya cuesta más de lo previsto.
 */
export function sobrecosto(
  rental: EquipmentRental,
  hasta: Date | string = new Date(),
): number | null {
  const proyectado = costoProyectado(rental);
  if (proyectado === null) return null;
  return costoAcumulado(rental, hasta) - proyectado;
}

/* ── El aviso que importa ──────────────────────────────────────────────── */

export interface ArriendoAtrasado {
  rental: EquipmentRental;
  /** Días pasados de la fecha programada de devolución. */
  diasDeMas: number;
  /** Lo que han costado esos días de más. */
  costoDeMas: number;
}

/**
 * Equipos que ya pasaron su fecha de devolución y siguen en obra.
 *
 * Es el punto del módulo: nadie devuelve una grúa porque se acordó, la devuelve
 * porque alguien tenía la fecha a la vista. Ordenados por el costo que están
 * generando de más, no por antigüedad: tres días de grúa duelen más que tres
 * semanas de un contenedor.
 */
export function arriendosAtrasados(
  rentals: EquipmentRental[],
  hoy: Date | string = new Date(),
): ArriendoAtrasado[] {
  const corte = toCalendarDay(hoy);
  if (!corte) return [];

  const atrasados: ArriendoAtrasado[] = [];

  for (const r of rentals) {
    if (r.status !== 'activo' || !r.endDate) continue;
    const fin = toCalendarDay(r.endDate);
    if (!fin || fin.getTime() >= corte.getTime()) continue;

    const diasDeMas = Math.round((corte.getTime() - fin.getTime()) / MS_DIA);
    const proyectado = costoProyectado(r) ?? 0;
    atrasados.push({
      rental: r,
      diasDeMas,
      costoDeMas: Math.max(0, costoAcumulado(r, corte) - proyectado),
    });
  }

  return atrasados.sort((a, b) => b.costoDeMas - a.costoDeMas || b.diasDeMas - a.diasDeMas);
}

/* ── Vista de conjunto ─────────────────────────────────────────────────── */

export interface ResumenArriendos {
  activos: number;
  devueltos: number;
  /** Lo que llevan costando todos los arriendos de la obra. */
  costoAcumulado: number;
  /** Lo que costarían si todos se devolvieran en su fecha programada. */
  costoProyectado: number;
  /** Cuántos ya pasaron su fecha y siguen en obra. */
  atrasados: number;
  /** Lo que están costando de más esos atrasados. */
  costoDeMas: number;
  porCategoria: {
    categoria: EquipmentRental['category'];
    label: string;
    cantidad: number;
    costo: number;
  }[];
}

export function resumenArriendos(
  rentals: EquipmentRental[],
  hasta: Date | string = new Date(),
): ResumenArriendos {
  const vivos = rentals.filter((r) => r.status !== 'cancelado');
  const atrasados = arriendosAtrasados(rentals, hasta);

  const porCategoria = new Map<EquipmentRental['category'], { cantidad: number; costo: number }>();
  let acumulado = 0;
  let proyectado = 0;

  for (const r of vivos) {
    const costo = costoAcumulado(r, hasta);
    acumulado += costo;
    proyectado += costoProyectado(r) ?? costo;

    const actual = porCategoria.get(r.category);
    if (actual) {
      actual.cantidad += 1;
      actual.costo += costo;
    } else {
      porCategoria.set(r.category, { cantidad: 1, costo });
    }
  }

  return {
    activos: vivos.filter((r) => r.status === 'activo').length,
    devueltos: vivos.filter((r) => r.status === 'devuelto').length,
    costoAcumulado: acumulado,
    costoProyectado: proyectado,
    atrasados: atrasados.length,
    costoDeMas: atrasados.reduce((s, a) => s + a.costoDeMas, 0),
    porCategoria: [...porCategoria.entries()]
      .map(([categoria, v]) => ({
        categoria,
        label: CATEGORIAS_EQUIPO[categoria],
        cantidad: v.cantidad,
        costo: v.costo,
      }))
      .sort((a, b) => b.costo - a.costo),
  };
}

/* ── Enlace con el control de costos ───────────────────────────────────── */

/**
 * Costo de arriendo devengado por partida, en el formato que consume
 * `cost-control.ts`. Es lo que hace que un moldaje olvidado aparezca en el
 * margen de SU partida y no como un gasto general que nadie mira.
 *
 * Los arriendos sin partida imputada quedan bajo `workItemId: null`, igual que
 * cualquier otro gasto sin imputar: se ven, pero apartados.
 */
export function imputacionesDeArriendo(
  rentals: EquipmentRental[],
  hasta: Date | string = new Date(),
): { workItemId: string | null; amount: number }[] {
  return rentals
    .filter((r) => r.status !== 'cancelado')
    .map((r) => ({
      workItemId: r.workItemId ?? null,
      amount: costoAcumulado(r, hasta),
    }))
    .filter((i) => i.amount > 0);
}

/* ── Validación ────────────────────────────────────────────────────────── */

export function validarArriendo(
  r: Pick<EquipmentRental, 'name' | 'rate' | 'rateMode' | 'hoursPerDay' | 'startDate' | 'endDate'>,
): string[] {
  const errores: string[] = [];

  if (!r.name?.trim()) errores.push('Ponle un nombre al equipo.');
  if (!r.rate || r.rate <= 0) errores.push('La tarifa tiene que ser mayor que cero.');

  if (r.rateMode === 'hora' && (!r.hoursPerDay || r.hoursPerDay <= 0)) {
    errores.push(
      'Con tarifa por hora hay que indicar las horas por jornada: sin eso no se '
      + 'puede calcular lo que va costando.',
    );
  }

  const inicio = toCalendarDay(r.startDate);
  const fin = toCalendarDay(r.endDate);
  if (!inicio) errores.push('Falta la fecha de inicio del arriendo.');
  if (inicio && fin && fin.getTime() < inicio.getTime()) {
    errores.push('La fecha de término no puede ser anterior a la de inicio.');
  }

  return errores;
}
