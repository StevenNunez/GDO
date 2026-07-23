import { describe, it, expect } from 'vitest';
import { computeApu, computeBudgetSummary } from './apu-costs';
import type { ApuItem, BudgetOverhead, WorkItem } from '@/modules/core/lib/data';

/* ── Constructores mínimos ────────────────────────────────────────────── */

function line(over: Partial<ApuItem> & { id: string }): ApuItem {
  return {
    tenantId: 't1', apuId: 'a1', name: over.id, kind: 'material', unit: 'un',
    calcMode: 'quantity', quantity: 0, unitPrice: 0, sortOrder: 0,
    createdAt: new Date(), ...over,
  } as ApuItem;
}

function wi(over: Partial<WorkItem> & { id: string }): WorkItem {
  return {
    tenantId: 't1', projectId: 'p1', name: over.id, type: 'task',
    status: 'in-progress', parentId: null, path: over.id, progress: 0,
    unit: 'm2', quantity: 0, unitPrice: 0, ...over,
  } as WorkItem;
}

function overhead(over: Partial<BudgetOverhead> & { id: string }): BudgetOverhead {
  return {
    tenantId: 't1', budgetId: 'b1', name: over.id, mode: 'amount',
    amount: 0, percent: 0, sortOrder: 0, createdAt: new Date(), ...over,
  } as BudgetOverhead;
}

/* ── APU ──────────────────────────────────────────────────────────────── */

describe('computeApu', () => {
  it('reproduce el APU de muro de albañilería', () => {
    // El ejemplo que acordamos con el usuario:
    //   Ladrillo    34,00 un × $180    = $6.120
    //   Mortero      0,02 m3 × $45.000 = $  900
    //   Maestro      1,20 HH × $4.500  = $5.400
    //   Jornal       1,20 HH × $3.200  = $3.840
    //   Herramienta  5% de la mano de obra = $462
    const items = [
      line({ id: 'ladrillo', kind: 'material', quantity: 34, unitPrice: 180 }),
      line({ id: 'mortero', kind: 'material', quantity: 0.02, unitPrice: 45_000 }),
      line({ id: 'maestro', kind: 'labor', quantity: 1.2, unitPrice: 4_500 }),
      line({ id: 'jornal', kind: 'labor', quantity: 1.2, unitPrice: 3_200 }),
      line({
        id: 'herramienta', kind: 'equipment',
        calcMode: 'percent', percentValue: 5, percentOf: 'labor',
      }),
    ];

    const r = computeApu(items);
    expect(r.material).toBe(7_020);
    expect(r.labor).toBe(9_240);
    expect(r.equipment).toBeCloseTo(462, 6);
    expect(r.total).toBeCloseTo(16_722, 6);
  });

  it('una línea por % NO usa otra línea por % como base', () => {
    // Si los porcentajes se apoyaran entre sí, dos líneas que se referencian
    // mutuamente quedarían en un cálculo circular sin solución. La base son
    // siempre los subtotales por cantidad.
    const items = [
      line({ id: 'mo', kind: 'labor', quantity: 1, unitPrice: 10_000 }),
      line({ id: 'p1', kind: 'equipment', calcMode: 'percent', percentValue: 10, percentOf: 'labor' }),
      line({ id: 'p2', kind: 'other', calcMode: 'percent', percentValue: 50, percentOf: 'equipment' }),
    ];
    const r = computeApu(items);
    expect(r.equipment).toBe(1_000);
    // 50% de los equipos POR CANTIDAD (que son 0), no del 1.000 del otro %.
    expect(r.other).toBe(0);
  });

  it('el % sobre costo directo usa la suma de todas las líneas por cantidad', () => {
    const items = [
      line({ id: 'mat', kind: 'material', quantity: 1, unitPrice: 6_000 }),
      line({ id: 'mo', kind: 'labor', quantity: 1, unitPrice: 4_000 }),
      line({ id: 'gg', kind: 'other', calcMode: 'percent', percentValue: 10, percentOf: 'direct' }),
    ];
    expect(computeApu(items).other).toBe(1_000);
  });

  it('expone el valor de cada línea para poder mostrarlo', () => {
    const items = [line({ id: 'x', quantity: 3, unitPrice: 1_500 })];
    expect(computeApu(items).lineTotals.get('x')).toBe(4_500);
  });

  it('un APU vacío vale cero y no rompe', () => {
    const r = computeApu([]);
    expect(r.total).toBe(0);
    expect(r.material).toBe(0);
  });

  it('una línea por % sin `percentOf` vale cero en vez de NaN', () => {
    const items = [
      line({ id: 'mo', kind: 'labor', quantity: 1, unitPrice: 10_000 }),
      line({ id: 'raro', kind: 'other', calcMode: 'percent', percentValue: 10, percentOf: null }),
    ];
    const r = computeApu(items);
    expect(r.other).toBe(0);
    expect(Number.isNaN(r.total)).toBe(false);
  });
});

/* ── Cascada del presupuesto ──────────────────────────────────────────── */

describe('computeBudgetSummary', () => {
  it('reproduce exactamente la cascada acordada con el usuario', () => {
    // CD 120.000.000
    // GG 12.000.000 + 4.800.000 + 2.400.000 + 3% del CD (3.600.000) = 22.800.000
    // Imprevistos 3% de (CD+GG) = 4.284.000
    // Utilidad   10% de (CD+GG+imprev) = 14.708.400
    // Neto = 161.792.400 · IVA 19% = 30.740.556 · Total = 192.532.956
    const items = [wi({ id: 'p', quantity: 1, unitPrice: 120_000_000 })];
    const overheads = [
      overhead({ id: 'jefe', mode: 'amount', amount: 12_000_000 }),
      overhead({ id: 'arriendo', mode: 'amount', amount: 4_800_000 }),
      overhead({ id: 'seguros', mode: 'amount', amount: 2_400_000 }),
      overhead({ id: 'otros', mode: 'percent', percent: 3 }),
    ];
    const r = computeBudgetSummary(
      { contingencyPercent: 3, profitPercent: 10, taxPercent: 19 },
      items,
      overheads
    );

    expect(r.directCost).toBe(120_000_000);
    expect(r.overheads).toBe(22_800_000);
    expect(r.contingency).toBeCloseTo(4_284_000, 2);
    expect(r.profit).toBeCloseTo(14_708_400, 2);
    expect(r.net).toBeCloseTo(161_792_400, 2);
    expect(r.tax).toBeCloseTo(30_740_556, 2);
    expect(r.total).toBeCloseTo(192_532_956, 2);
  });

  it('los imprevistos se calculan sobre CD + GG, no solo sobre el CD', () => {
    const items = [wi({ id: 'p', quantity: 1, unitPrice: 100 })];
    const overheads = [overhead({ id: 'gg', mode: 'amount', amount: 100 })];
    const r = computeBudgetSummary({ contingencyPercent: 10, profitPercent: 0, taxPercent: 0 }, items, overheads);
    expect(r.contingency).toBe(20); // 10% de 200, no de 100
  });

  it('la utilidad se calcula sobre CD + GG + imprevistos', () => {
    const items = [wi({ id: 'p', quantity: 1, unitPrice: 100 })];
    const r = computeBudgetSummary({ contingencyPercent: 100, profitPercent: 10, taxPercent: 0 }, items, []);
    // CD 100, imprevistos 100 => utilidad 10% de 200
    expect(r.profit).toBe(20);
  });

  it('el % de gastos generales se aplica sobre el costo directo', () => {
    const items = [wi({ id: 'p', quantity: 2, unitPrice: 500 })];
    const r = computeBudgetSummary(null, items, [overhead({ id: 'gg', mode: 'percent', percent: 15 })]);
    expect(r.directCost).toBe(1_000);
    expect(r.overheads).toBe(150);
  });

  it('sin presupuesto configurado no inventa porcentajes', () => {
    const items = [wi({ id: 'p', quantity: 1, unitPrice: 1_000 })];
    const r = computeBudgetSummary(null, items, []);
    expect(r.contingency).toBe(0);
    expect(r.profit).toBe(0);
    expect(r.tax).toBe(0);
    expect(r.total).toBe(1_000);
  });

  it('un presupuesto sin partidas da todo en cero, sin NaN', () => {
    const r = computeBudgetSummary({ contingencyPercent: 3, profitPercent: 10, taxPercent: 19 }, [], []);
    expect(r.directCost).toBe(0);
    expect(r.total).toBe(0);
    expect(Number.isNaN(r.total)).toBe(false);
  });

  it('el costo directo no duplica los padres del árbol', () => {
    const items = [
      wi({ id: 'fase', type: 'phase', quantity: 1, unitPrice: 999_999 }),
      wi({ id: 'hija', parentId: 'fase', quantity: 2, unitPrice: 100 }),
    ];
    const r = computeBudgetSummary(null, items, []);
    expect(r.directCost).toBe(200);
  });

  it('expone el valor de cada línea de gastos generales', () => {
    const items = [wi({ id: 'p', quantity: 1, unitPrice: 1_000 })];
    const overheads = [overhead({ id: 'gg1', mode: 'percent', percent: 5 })];
    const r = computeBudgetSummary(null, items, overheads);
    expect(r.overheadLines.get('gg1')).toBe(50);
  });
});
