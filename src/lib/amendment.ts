/**
 * Adicionales y aumentos de obra: cómo una modificación al contrato cambia el
 * monto y el plazo vigentes.
 *
 * Lógica pura, sin React ni acceso a datos, para poder cubrirla con tests
 * (`amendment.test.ts`) — igual que `contract.ts` o `payment-certificate.ts`.
 *
 * Dos reglas mandan sobre todo lo demás:
 *
 * 1. **El signo lo pone el tipo, no el usuario.** `amountNet` se guarda siempre
 *    positivo; que una disminución de obra reste es decisión de `type`. Pedir
 *    el signo a mano terminaba, tarde o temprano, en un aumento cargado en
 *    negativo o una disminución que sumaba.
 * 2. **Solo lo aprobado cuenta.** Un adicional presentado y no resuelto no
 *    cambia el contrato: el mandante todavía puede rechazarlo. Se muestra
 *    aparte como expectativa, nunca mezclado con lo vigente.
 */

import type { Amendment, AmendmentStatus, AmendmentType, Contract, WorkItem } from '@/modules/core/lib/data';
import { sumBudgetValue } from '@/lib/budget-costs';
import { calcFechaTermino, montoContratoVigente } from '@/lib/contract';

/* ── Estados ──────────────────────────────────────────────────────────── */

/** Un adicional aprobado ya es parte del contrato. */
export function esAprobado(a: Pick<Amendment, 'status'>): boolean {
  return a.status === 'aprobado';
}

/** En trámite = presentado al mandante y todavía sin respuesta. */
export function enTramite(a: Pick<Amendment, 'status'>): boolean {
  return a.status === 'presentado';
}

/**
 * Mientras es borrador se edita libremente. Después no: un adicional
 * presentado ya está en manos del mandante, y uno aprobado cambió el monto del
 * contrato contra el que se emitieron los estados de pago siguientes (un
 * trigger en la base lo bloquea, esto es solo la UI).
 */
export function puedeEditar(a: Pick<Amendment, 'status'>): boolean {
  return a.status === 'borrador';
}

/**
 * Trámite: borrador → presentado → aprobado o rechazado. Un rechazo vuelve a
 * borrador para corregirlo y volver a presentarlo. Anular cierra el adicional
 * dejando el rastro, y por eso está disponible en todos los estados vivos: es
 * la única salida de un aprobado.
 */
export function siguientesEstados(status: AmendmentStatus): AmendmentStatus[] {
  switch (status) {
    case 'borrador':   return ['presentado', 'anulado'];
    case 'presentado': return ['aprobado', 'rechazado', 'anulado'];
    case 'rechazado':  return ['borrador', 'anulado'];
    case 'aprobado':   return ['anulado'];
    default:           return [];
  }
}

/* ── Monto ────────────────────────────────────────────────────────────── */

/**
 * Monto con el signo que le corresponde al tipo:
 * una disminución resta, un aumento de plazo puro no mueve plata.
 */
export function montoConSigno(
  a: Pick<Amendment, 'type' | 'amountNet'>,
): number {
  if (a.type === 'aumento_plazo') return 0;
  const magnitud = Math.abs(a.amountNet ?? 0);
  return a.type === 'disminucion_obra' ? -magnitud : magnitud;
}

/** Montos (con signo) de los adicionales aprobados. Alimenta `montoContratoVigente`. */
export function montosAprobados(amendments: Amendment[]): number[] {
  return amendments.filter(esAprobado).map(montoConSigno);
}

/** Días de aumento de plazo ya aprobados. Corren la fecha de término contractual. */
export function diasAumentoAprobados(amendments: Amendment[]): number {
  return amendments
    .filter(esAprobado)
    .reduce((s, a) => s + (a.extraDays ?? 0), 0);
}

/**
 * Valor que arroja el presupuesto del adicional: Σ cantidad × PU de las
 * partidas hoja, igual que cualquier presupuesto. Es una **sugerencia** para el
 * formulario, no el monto: lo que se firma con el mandante puede ser otro
 * (una suma alzada negociada, un descuento por volumen).
 */
export function montoDesdePresupuesto(items: WorkItem[]): number {
  return sumBudgetValue(items);
}

/** Siguiente correlativo del contrato. */
export function siguienteNumeroAdicional(anteriores: { number: number }[]): number {
  return anteriores.reduce((max, a) => Math.max(max, a.number ?? 0), 0) + 1;
}

/* ── Resumen ──────────────────────────────────────────────────────────── */

export interface ResumenAdicionales {
  aprobados: number;
  enTramite: number;
  /** Suma con signo de los aprobados: lo que ya cambió el contrato. */
  montoAprobado: number;
  /** Suma con signo de los presentados sin respuesta: expectativa, no contrato. */
  montoEnTramite: number;
  diasAprobados: number;
  diasEnTramite: number;
}

/**
 * Cuenta y suma los adicionales separando lo firme de lo que está en trámite.
 * Rechazados y anulados no aparecen en ninguna de las dos: no son ni contrato
 * ni expectativa.
 */
export function resumenAdicionales(amendments: Amendment[]): ResumenAdicionales {
  const aprobados = amendments.filter(esAprobado);
  const tramite = amendments.filter(enTramite);

  const suma = (xs: Amendment[]) => xs.reduce((s, a) => s + montoConSigno(a), 0);
  const dias = (xs: Amendment[]) => xs.reduce((s, a) => s + (a.extraDays ?? 0), 0);

  return {
    aprobados: aprobados.length,
    enTramite: tramite.length,
    montoAprobado: suma(aprobados),
    montoEnTramite: suma(tramite),
    diasAprobados: dias(aprobados),
    diasEnTramite: dias(tramite),
  };
}

/* ── Impacto en el contrato ───────────────────────────────────────────── */

export interface ImpactoContrato {
  montoOriginal: number;
  /** Suma con signo de los adicionales aprobados. */
  montoAdicionales: number;
  /** Original + adicionales aprobados: la cifra contra la que se mide todo. */
  montoVigente: number;
  /**
   * Cuánto creció (o se achicó) el contrato, en %. `null` si el contrato no
   * tiene monto: dividir por cero daría un "Infinity%" en pantalla.
   */
  variacionPercent: number | null;
  plazoOriginal: number | null;
  diasAumento: number;
  /** Plazo original + días aprobados. `null` si el contrato no fijó plazo. */
  plazoVigente: number | null;
  fechaTerminoOriginal: Date | null;
  fechaTerminoVigente: Date | null;
  /** Los que están presentados y sin respuesta, para mostrarlos aparte. */
  montoEnTramite: number;
  diasEnTramite: number;
}

/**
 * Foto del contrato después de los adicionales. Es lo que hay que mirar antes
 * de emitir un estado de pago: el avance se mide contra el monto vigente, y la
 * multa por atraso contra la fecha de término vigente.
 */
export function impactoContrato(
  contract: Pick<Contract, 'amountNet' | 'startDate' | 'plazoDias'>,
  amendments: Amendment[],
): ImpactoContrato {
  const resumen = resumenAdicionales(amendments);

  const montoOriginal = contract.amountNet ?? 0;
  const montoVigente = montoContratoVigente(contract, montosAprobados(amendments));

  const plazoOriginal = contract.plazoDias ?? null;
  const diasAumento = resumen.diasAprobados;

  return {
    montoOriginal,
    montoAdicionales: resumen.montoAprobado,
    montoVigente,
    variacionPercent: montoOriginal > 0
      ? (resumen.montoAprobado / montoOriginal) * 100
      : null,
    plazoOriginal,
    diasAumento,
    plazoVigente: plazoOriginal !== null ? plazoOriginal + diasAumento : null,
    fechaTerminoOriginal: calcFechaTermino(contract.startDate, contract.plazoDias),
    fechaTerminoVigente: calcFechaTermino(contract.startDate, contract.plazoDias, diasAumento),
    montoEnTramite: resumen.montoEnTramite,
    diasEnTramite: resumen.diasEnTramite,
  };
}

/* ── Partidas cobrables ───────────────────────────────────────────────── */

/**
 * Presupuestos cuyas partidas se pueden cobrar en un estado de pago: el del
 * contrato más el de cada adicional **aprobado**.
 *
 * Un adicional en trámite no entra: cobrar obra que el mandante todavía no
 * aprobó es la forma más común de que un estado de pago vuelva rechazado.
 */
export function budgetIdsCobrables(
  contract: Pick<Contract, 'budgetId'>,
  amendments: Amendment[],
): string[] {
  const ids = new Set<string>();
  if (contract.budgetId) ids.add(contract.budgetId);
  for (const a of amendments) {
    if (esAprobado(a) && a.budgetId) ids.add(a.budgetId);
  }
  return [...ids];
}

/* ── Etiquetas ────────────────────────────────────────────────────────── */

export const TIPOS_ADICIONAL: Record<AmendmentType, string> = {
  aumento_obra: 'Aumento de obra',
  obra_extraordinaria: 'Obra extraordinaria',
  disminucion_obra: 'Disminución de obra',
  aumento_plazo: 'Aumento de plazo',
};

export const CAUSAS_ADICIONAL: Record<Amendment['cause'], string> = {
  modificacion_proyecto: 'Modificación de proyecto',
  error_proyecto: 'Error o falta del proyecto',
  solicitud_mandante: 'Solicitud del mandante',
  imprevisto_terreno: 'Imprevisto de terreno',
  fuerza_mayor: 'Fuerza mayor',
  otra: 'Otra',
};

export const ESTADOS_ADICIONAL: Record<AmendmentStatus, string> = {
  borrador: 'Borrador',
  presentado: 'Presentado',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  anulado: 'Anulado',
};
