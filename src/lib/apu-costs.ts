import type { ApuItem, Budget, BudgetOverhead, WorkItem } from '@/modules/core/lib/data';
import { sumBudgetValue } from '@/lib/budget-costs';

export type ApuKind = 'material' | 'labor' | 'equipment' | 'other';

export interface ApuBreakdown {
  /** Subtotal por grupo, ya incluyendo las líneas por porcentaje. */
  material: number;
  labor: number;
  equipment: number;
  other: number;
  /** Suma de los cuatro grupos = precio unitario de la partida. */
  total: number;
  /** Valor calculado de cada línea, por id. */
  lineTotals: Map<string, number>;
}

/**
 * Calcula un APU.
 *
 * Las líneas por porcentaje (ej: "herramienta menor = 5% de la mano de obra") se
 * resuelven DESPUÉS de las de cantidad y **no se toman entre sí como base**: si
 * un porcentaje pudiera apoyarse en otro porcentaje, dos líneas que se
 * referencian mutuamente entrarían en un cálculo circular sin solución. Por eso
 * la base siempre son los subtotales por cantidad.
 */
export function computeApu(items: ApuItem[]): ApuBreakdown {
  const base: Record<ApuKind, number> = { material: 0, labor: 0, equipment: 0, other: 0 };
  const lineTotals = new Map<string, number>();

  for (const item of items) {
    if (item.calcMode !== 'quantity') continue;
    const value = (item.quantity || 0) * (item.unitPrice || 0);
    lineTotals.set(item.id, value);
    base[item.kind] += value;
  }

  const baseDirect = base.material + base.labor + base.equipment + base.other;
  const totals: Record<ApuKind, number> = { ...base };

  for (const item of items) {
    if (item.calcMode !== 'percent') continue;
    const source =
      item.percentOf === 'direct' ? baseDirect
        : item.percentOf ? base[item.percentOf]
          : 0;
    const value = (source * (item.percentValue || 0)) / 100;
    lineTotals.set(item.id, value);
    totals[item.kind] += value;
  }

  return {
    ...totals,
    total: totals.material + totals.labor + totals.equipment + totals.other,
    lineTotals,
  };
}

export interface BudgetSummary {
  directCost: number;
  overheads: number;
  contingency: number;
  profit: number;
  /** Costo directo + GG + imprevistos + utilidad, antes de IVA. */
  net: number;
  tax: number;
  total: number;
  /** Valor de cada línea de gastos generales, por id. */
  overheadLines: Map<string, number>;
}

/**
 * Cascada del presupuesto de construcción:
 *   CD          = Σ partidas hoja (cantidad × precio unitario)
 *   GG          = Σ líneas (monto fijo, o % del CD)
 *   Imprevistos = % de (CD + GG)
 *   Utilidad    = % de (CD + GG + imprevistos)
 *   Neto        = CD + GG + imprevistos + utilidad
 *   IVA         = % del neto
 */
export function computeBudgetSummary(
  budget: Pick<Budget, 'contingencyPercent' | 'profitPercent' | 'taxPercent'> | null | undefined,
  workItems: WorkItem[],
  overheads: BudgetOverhead[]
): BudgetSummary {
  const directCost = sumBudgetValue(workItems);

  const overheadLines = new Map<string, number>();
  let overheadsTotal = 0;
  for (const o of overheads) {
    const value = o.mode === 'percent'
      ? (directCost * (o.percent || 0)) / 100
      : (o.amount || 0);
    overheadLines.set(o.id, value);
    overheadsTotal += value;
  }

  const contingency = ((directCost + overheadsTotal) * (budget?.contingencyPercent || 0)) / 100;
  const profit = ((directCost + overheadsTotal + contingency) * (budget?.profitPercent || 0)) / 100;
  const net = directCost + overheadsTotal + contingency + profit;
  const tax = (net * (budget?.taxPercent ?? 0)) / 100;

  return {
    directCost,
    overheads: overheadsTotal,
    contingency,
    profit,
    net,
    tax,
    total: net + tax,
    overheadLines,
  };
}
