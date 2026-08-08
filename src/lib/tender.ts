/**
 * Licitación de un subcontrato: cotizaciones, cuadro comparativo, adjudicación
 * y firma del contrato entre las dos partes (migración 032).
 *
 * Lógica pura, con tests. El cuadro comparativo se CALCULA de las ofertas
 * cargadas en vez de adjuntarse como imagen: un cuadro escaneado sirve para
 * archivar, pero no se le puede preguntar nada ni se puede auditar.
 */

import { toCalendarDay } from '@/lib/date-utils';
import type {
  DocumentSignature, Subcontract, SubcontractQuote,
} from '@/modules/core/lib/data';

/* ── Cuadro comparativo ────────────────────────────────────────────────── */

export interface LineaComparativa {
  quote: SubcontractQuote;
  /** Puesto por precio, 1 = la más económica. */
  posicion: number;
  /** Diferencia en pesos contra la más económica. 0 en la más económica. */
  diferencia: number;
  /** Esa misma diferencia en %, sobre la más económica. */
  diferenciaPct: number;
  /** Contra el presupuesto de referencia. Negativo = más barata. `null` sin referencia. */
  vsReferencia: number | null;
  esLaMasEconomica: boolean;
  /** La oferta venció y ya no se puede adjudicar sin pedirla de nuevo. */
  vencida: boolean;
}

export interface CuadroComparativo {
  lineas: LineaComparativa[];
  /** Monto de la más económica; `null` si no hay ofertas comparables. */
  menor: number | null;
  mayor: number | null;
  promedio: number | null;
  /** La adjudicada, si ya se decidió. */
  adjudicada: SubcontractQuote | null;
  /**
   * Ofertas en una moneda distinta a la del subcontrato. NO entran al cuadro:
   * comparar UF con pesos exige el valor del día, y adivinarlo produciría un
   * ranking falso que igual se vería convincente.
   */
  fueraDeMoneda: SubcontractQuote[];
}

/**
 * Arma el cuadro. `referencia` es el presupuesto meta de la partida, si existe:
 * saber que la oferta más barata igual está 30% sobre el presupuesto es tan
 * importante como saber cuál es la más barata.
 */
export function cuadroComparativo(
  quotes: SubcontractQuote[],
  opts: { moneda: 'CLP' | 'UF'; referencia?: number | null; hoy?: Date } = { moneda: 'CLP' },
): CuadroComparativo {
  const hoy = opts.hoy ?? new Date();

  const comparables = quotes.filter((q) => q.currency === opts.moneda && q.amountNet > 0);
  const fueraDeMoneda = quotes.filter((q) => q.currency !== opts.moneda);

  if (comparables.length === 0) {
    return {
      lineas: [],
      menor: null,
      mayor: null,
      promedio: null,
      adjudicada: quotes.find((q) => q.awarded) ?? null,
      fueraDeMoneda,
    };
  }

  const montos = comparables.map((q) => q.amountNet);
  const menor = Math.min(...montos);
  const mayor = Math.max(...montos);
  const promedio = montos.reduce((a, b) => a + b, 0) / montos.length;

  const ordenadas = [...comparables].sort((a, b) => a.amountNet - b.amountNet);

  const lineas: LineaComparativa[] = ordenadas.map((quote, i) => ({
    quote,
    posicion: i + 1,
    diferencia: quote.amountNet - menor,
    diferenciaPct: menor > 0 ? ((quote.amountNet - menor) / menor) * 100 : 0,
    vsReferencia: opts.referencia && opts.referencia > 0
      ? quote.amountNet - opts.referencia
      : null,
    esLaMasEconomica: quote.amountNet === menor,
    vencida: ofertaVencida(quote, hoy),
  }));

  return {
    lineas,
    menor,
    mayor,
    promedio,
    adjudicada: quotes.find((q) => q.awarded) ?? null,
    fueraDeMoneda,
  };
}

/**
 * ¿Se le pasó la validez? Una oferta sin fecha de validez NO se marca vencida:
 * no se sabe, y suponerlo bloquearía adjudicaciones legítimas.
 */
export function ofertaVencida(
  quote: Pick<SubcontractQuote, 'validUntil'>,
  hoy: Date = new Date(),
): boolean {
  const hasta = toCalendarDay(quote.validUntil);
  const dia = toCalendarDay(hoy);
  if (!hasta || !dia) return false;
  return hasta.getTime() < dia.getTime();
}

/* ── Adjudicación ──────────────────────────────────────────────────────── */

/**
 * Revisa una adjudicación antes de guardarla. Espejo del trigger
 * `sq_guard_award_reason`: adjudicar a quien no es el más barato exige decir
 * por qué. Es el dato que nunca está cuando alguien pregunta seis meses después.
 */
export function validarAdjudicacion(
  quote: Pick<SubcontractQuote, 'amountNet' | 'currency' | 'awardReason' | 'validUntil'>,
  todas: SubcontractQuote[],
  hoy: Date = new Date(),
): string[] {
  const errores: string[] = [];

  const comparables = todas.filter(
    (q) => q.currency === quote.currency && q.amountNet > 0,
  );
  const menor = comparables.length > 0
    ? Math.min(...comparables.map((q) => q.amountNet))
    : null;

  if (menor !== null && quote.amountNet > menor && !quote.awardReason?.trim()) {
    errores.push(
      'Esta no es la oferta más económica: escribe por qué la adjudicas '
      + '(plazo, experiencia, alcance distinto…).',
    );
  }

  if (ofertaVencida(quote, hoy)) {
    errores.push('La validez de esta oferta ya venció: pídela de nuevo antes de adjudicar.');
  }

  return errores;
}

/**
 * Cuánto se ahorró (o se pasó) contra el presupuesto de referencia.
 * Negativo = se gastó menos de lo presupuestado.
 */
export function ahorroVsReferencia(
  adjudicada: Pick<SubcontractQuote, 'amountNet'> | null,
  referencia: number | null | undefined,
): { monto: number; pct: number } | null {
  if (!adjudicada || !referencia || referencia <= 0) return null;
  const monto = adjudicada.amountNet - referencia;
  return { monto, pct: (monto / referencia) * 100 };
}

/* ── Firma del contrato entre las dos partes ───────────────────────────── */

export type ParteFirmante = 'empresa' | 'contraparte';

export const PARTE_LABEL: Record<ParteFirmante, string> = {
  empresa: 'Mi empresa',
  contraparte: 'El contratista',
};

export interface EstadoFirmas {
  empresa: DocumentSignature | null;
  contraparte: DocumentSignature | null;
  /** Firmaron las dos partes. */
  completo: boolean;
  /** Las que faltan, para decirlo en pantalla. */
  faltan: ParteFirmante[];
  /**
   * El documento cambió después de alguna firma. Se compara contra la huella
   * guardada al firmar; sin huella no se acusa (ver `documentoAlterado`).
   */
  alterado: boolean;
}

export function estadoFirmas(
  firmas: DocumentSignature[],
  documentType: DocumentSignature['documentType'],
  documentId: string,
  huellaActual?: string | null,
): EstadoFirmas {
  const propias = firmas.filter(
    (f) => f.documentType === documentType && f.documentId === documentId,
  );

  const empresa = propias.find((f) => f.party === 'empresa') ?? null;
  const contraparte = propias.find((f) => f.party === 'contraparte') ?? null;

  const faltan: ParteFirmante[] = [];
  if (!empresa) faltan.push('empresa');
  if (!contraparte) faltan.push('contraparte');

  const alterado = !!huellaActual && propias.some(
    (f) => !!f.documentHash && f.documentHash !== huellaActual,
  );

  return { empresa, contraparte, completo: faltan.length === 0, faltan, alterado };
}

/**
 * ¿Se puede mandar a firmar este contrato?
 *
 * Es la última puerta del proceso. Firmar un contrato sin monto o sin
 * itemizado deja un documento que después nadie puede cobrar ni pagar contra
 * nada. El expediente del contratista se revisa aparte
 * (`puedeContratarse`), en la etapa anterior.
 */
export function puedeFirmarse(
  sub: Pick<Subcontract, 'amountNet' | 'plazoDias' | 'startDate'>,
  opts: { tieneItemizado: boolean; aprobadoInternamente: boolean },
): { puede: boolean; motivo?: string } {
  if (!opts.aprobadoInternamente) {
    return {
      puede: false,
      motivo: 'El contrato todavía no pasó la cadena de aprobación interna de la empresa.',
    };
  }
  if (!sub.amountNet || sub.amountNet <= 0) {
    return { puede: false, motivo: 'El contrato no tiene monto.' };
  }
  if (!opts.tieneItemizado) {
    return {
      puede: false,
      motivo: 'Sin itemizado no se pueden cubicar los estados de pago después.',
    };
  }
  if (!sub.startDate) {
    return { puede: false, motivo: 'Falta la fecha de inicio.' };
  }
  if (!sub.plazoDias || sub.plazoDias <= 0) {
    return { puede: false, motivo: 'Falta el plazo: sin él no se puede calcular la multa por atraso.' };
  }
  return { puede: true };
}
