/**
 * Descuentos del estado de pago (migración 034).
 *
 * Antes «otros descuentos» era un número suelto con una nota al lado: servía
 * para que la resta cuadrara y para nada más. Con los descuentos como líneas
 * tipificadas se puede responder la pregunta que aparece cuando el contratista
 * reclama — «¿cuánto me has descontado en herramientas este año?» — que es
 * justamente la que nunca se podía contestar.
 *
 * Lógica pura, con tests.
 */

import { toCalendarDay } from '@/lib/date-utils';
import type {
  CertificateDeduction, DeductionKind, ToolLog,
} from '@/modules/core/lib/data';

/* ── Etiquetas ─────────────────────────────────────────────────────────── */

export const TIPOS_DESCUENTO: Record<DeductionKind, string> = {
  herramienta: 'Herramienta no devuelta o dañada',
  epp: 'Elementos de protección personal',
  combustible: 'Combustible',
  materiales: 'Materiales de bodega',
  servicios: 'Servicios (luz, agua, grúa, aseo)',
  danos: 'Daños a la obra o a terceros',
  anticipo_extra: 'Adelanto fuera de contrato',
  garantia: 'Retención adicional pactada',
  otro: 'Otro',
};

/** Orden en que se ofrecen en el selector: primero los más frecuentes. */
export const TIPOS_DESCUENTO_ORDEN: DeductionKind[] = [
  'herramienta', 'materiales', 'epp', 'combustible', 'servicios',
  'danos', 'anticipo_extra', 'garantia', 'otro',
];

/* ── Totales ───────────────────────────────────────────────────────────── */

/** Los descuentos de UN estado de pago. */
export function descuentosDe(
  deductions: CertificateDeduction[],
  certificateType: 'subcontract' | 'contract',
  certificateId: string,
): CertificateDeduction[] {
  return deductions.filter(
    (d) => d.certificateType === certificateType && d.certificateId === certificateId,
  );
}

/**
 * Suma de las líneas. Es el valor que el trigger deja en `otherDeductions`;
 * acá se recalcula para que la pantalla no tenga que esperar el refetch.
 */
export function totalDescuentos(deductions: CertificateDeduction[]): number {
  return deductions.reduce((s, d) => s + (d.amount ?? 0), 0);
}

export interface DescuentoPorTipo {
  kind: DeductionKind;
  label: string;
  monto: number;
  lineas: number;
}

/**
 * Agrupado por tipo, de mayor a menor. Es lo que se muestra arriba de la lista
 * cuando hay muchas líneas: el detalle importa, pero primero hay que ver de
 * qué se trata la mayor parte.
 */
export function descuentosPorTipo(
  deductions: CertificateDeduction[],
): DescuentoPorTipo[] {
  const mapa = new Map<DeductionKind, DescuentoPorTipo>();

  for (const d of deductions) {
    const kind = d.kind;
    const actual = mapa.get(kind);
    if (actual) {
      actual.monto += d.amount ?? 0;
      actual.lineas += 1;
    } else {
      mapa.set(kind, {
        kind,
        label: TIPOS_DESCUENTO[kind] ?? kind,
        monto: d.amount ?? 0,
        lineas: 1,
      });
    }
  }

  return [...mapa.values()].sort((a, b) => b.monto - a.monto);
}

/* ── La pregunta que motivó todo esto ──────────────────────────────────── */

export interface HistorialDescuentos {
  total: number;
  porTipo: DescuentoPorTipo[];
  /** Cuántos estados de pago distintos llevaron descuentos. */
  estadosDePago: number;
}

/**
 * «¿Cuánto le he descontado a este contratista, y en qué?»
 *
 * Cruza los descuentos con los estados de pago del contratista. `desde` y
 * `hasta` acotan el período (el año en curso, normalmente); sin ellos, todo el
 * historial.
 *
 * Se filtra por la fecha del DESCUENTO y no por la del estado de pago a
 * propósito: es la fecha en que se decidió el descuento, que es la que el
 * contratista va a discutir.
 */
export function historialDeContratista(
  deductions: CertificateDeduction[],
  /** Ids de los estados de pago de ESE contratista (de todos sus subcontratos). */
  certificateIds: string[],
  rango: { desde?: Date | string | null; hasta?: Date | string | null } = {},
): HistorialDescuentos {
  const ids = new Set(certificateIds);

  const desde = toCalendarDay(rango.desde)?.getTime() ?? null;
  const hasta = toCalendarDay(rango.hasta)?.getTime() ?? null;

  const propios = deductions.filter((d) => {
    if (d.certificateType !== 'subcontract') return false;
    if (!ids.has(d.certificateId)) return false;

    const dia = toCalendarDay(d.createdAt)?.getTime();
    if (dia === undefined) return true;
    if (desde !== null && dia < desde) return false;
    if (hasta !== null && dia > hasta) return false;
    return true;
  });

  return {
    total: totalDescuentos(propios),
    porTipo: descuentosPorTipo(propios),
    estadosDePago: new Set(propios.map((d) => d.certificateId)).size,
  };
}

/* ── Validación ────────────────────────────────────────────────────────── */

export function validarDescuento(
  d: Pick<CertificateDeduction, 'description' | 'amount' | 'kind'>,
  opts: { netoAntesDeDescuentos: number; yaDescontado: number },
): string[] {
  const errores: string[] = [];

  if (!d.description?.trim()) {
    errores.push('Escribe qué se le está descontando: un descuento sin glosa termina en discusión.');
  }

  if (!d.amount || d.amount <= 0) {
    errores.push('El monto tiene que ser mayor que cero.');
  }

  // Descontar más de lo que se le está pagando deja el estado de pago en
  // negativo: eso no es un descuento, es una deuda que hay que arrastrar al
  // período siguiente.
  const disponible = opts.netoAntesDeDescuentos - opts.yaDescontado;
  if (d.amount > 0 && d.amount > disponible) {
    errores.push(
      'El descuento deja el estado de pago en negativo. Descuenta hasta el saldo '
      + 'disponible y deja el resto para el período siguiente.',
    );
  }

  return errores;
}

/* ── Sugerencia desde Bodega ───────────────────────────────────────────── */

export interface HerramientaPendiente {
  log: ToolLog;
  /** Días que lleva sin devolverse. */
  dias: number;
}

/**
 * Herramientas que esta persona tiene sin devolver, para ofrecerlas como
 * descuento en vez de que alguien las escriba de memoria.
 *
 * **Alcance real, para no prometer de más:** las herramientas se prestan a un
 * USUARIO de la app, no a una empresa. Así que esto solo encuentra algo cuando
 * el subcontrato tiene un usuario asociado (`contactUserId`, el del portal del
 * subcontratista). Si el contratista no tiene cuenta, la lista viene vacía y el
 * descuento se carga a mano — que es lo honesto, en vez de inventar un cruce
 * que no existe.
 */
export function herramientasPendientesDe(
  toolLogs: ToolLog[],
  userId: string | null | undefined,
  hoy: Date = new Date(),
): HerramientaPendiente[] {
  if (!userId) return [];

  return toolLogs
    .filter((l) => l.userId === userId && !l.returnDate)
    .map((log) => {
      const salida = toCalendarDay(log.checkoutDate);
      const dia = toCalendarDay(hoy);
      return {
        log,
        dias: salida && dia
          ? Math.max(0, Math.round((dia.getTime() - salida.getTime()) / 86_400_000))
          : 0,
      };
    })
    .sort((a, b) => b.dias - a.dias);
}

/**
 * ¿Este origen ya se descontó? Evita el error clásico: la misma herramienta
 * perdida aparece en el estado de pago de agosto y otra vez en el de
 * septiembre porque nadie se acordó. La base también lo impide con un índice
 * único; esto es para avisar antes en pantalla.
 */
export function yaSeDesconto(
  deductions: CertificateDeduction[],
  sourceType: CertificateDeduction['sourceType'],
  sourceId: string,
): boolean {
  return deductions.some((d) => d.sourceType === sourceType && d.sourceId === sourceId);
}
