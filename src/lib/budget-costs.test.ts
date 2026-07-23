import { describe, it, expect } from 'vitest';
import {
  getLeafItems,
  sumBudgetValue,
  sumEarnedValue,
  computeClientCosts,
} from './budget-costs';
import type {
  Budget, Client, Project, PurchaseOrder, SupplierPayment, WorkItem,
} from '@/modules/core/lib/data';

/* ── Constructores mínimos ────────────────────────────────────────────── */

function wi(over: Partial<WorkItem> & { id: string }): WorkItem {
  return {
    tenantId: 't1', projectId: 'p1', name: over.id, type: 'task',
    status: 'in-progress', parentId: null, path: over.id, progress: 0,
    unit: 'm2', quantity: 0, unitPrice: 0,
    ...over,
  } as WorkItem;
}

function project(over: Partial<Project> & { id: string }): Project {
  return { name: over.id, tenantId: 't1', createdAt: new Date(), isActive: true, ...over } as Project;
}

function budget(over: Partial<Budget> & { id: string }): Budget {
  return {
    tenantId: 't1', projectId: null, name: over.id, type: 'principal',
    status: 'approved', createdAt: new Date(), ...over,
  } as Budget;
}

function client(over: Partial<Client> & { id: string }): Client {
  return { name: over.id, tenantId: 't1', createdAt: new Date(), isActive: true, ...over } as Client;
}

function po(over: Partial<PurchaseOrder> & { id: string }): PurchaseOrder {
  return {
    supplierId: 's1', supplierName: 's1', createdAt: new Date(), creatorId: 'u1',
    creatorName: 'u1', status: 'issued', items: [], tenantId: 't1', ...over,
  } as PurchaseOrder;
}

function payment(over: Partial<SupplierPayment> & { id: string }): SupplierPayment {
  return {
    supplierId: 's1', invoiceNumber: over.id, amount: 0, issueDate: new Date(),
    dueDate: new Date(), status: 'pending', ...over,
  } as SupplierPayment;
}

/* ── Hojas del árbol ──────────────────────────────────────────────────── */

describe('getLeafItems', () => {
  it('toma como hoja la partida sin hijos, sin mirar el `type`', () => {
    // Este es el bug que teníamos: la pantalla EDT filtraba por
    // `type !== 'project' && type !== 'phase'`, así que una 'subphase' CON
    // hijos se contaba a sí misma y además a sus hijos.
    const items = [
      wi({ id: 'raiz', type: 'project' }),
      wi({ id: 'subfase', type: 'subphase', parentId: 'raiz' }),
      wi({ id: 'tarea', type: 'task', parentId: 'subfase' }),
    ];
    expect(getLeafItems(items).map(i => i.id)).toEqual(['tarea']);
  });

  it('una subfase sin hijos SÍ es hoja', () => {
    const items = [
      wi({ id: 'raiz', type: 'project' }),
      wi({ id: 'subfase', type: 'subphase', parentId: 'raiz' }),
    ];
    expect(getLeafItems(items).map(i => i.id)).toEqual(['subfase']);
  });

  it('devuelve vacío cuando no hay partidas', () => {
    expect(getLeafItems([])).toEqual([]);
  });
});

describe('sumBudgetValue', () => {
  it('NO duplica el monto de una SUBFASE que tiene hijos', () => {
    // Se usa 'subphase' a propósito y no 'phase': el filtro viejo por `type`
    // excluía 'project' y 'phase', así que una subfase con hijos se sumaba a sí
    // misma Y a sus partidas. Con 'phase' este test pasaría incluso con el bug.
    const items = [
      wi({ id: 'subfase', type: 'subphase', quantity: 1, unitPrice: 1_000_000 }),
      wi({ id: 'a', type: 'task', parentId: 'subfase', quantity: 10, unitPrice: 5_000 }),
      wi({ id: 'b', type: 'task', parentId: 'subfase', quantity: 4, unitPrice: 2_500 }),
    ];
    // Solo las hojas: 10×5.000 + 4×2.500 = 60.000.
    expect(sumBudgetValue(items)).toBe(60_000);
  });

  it('trata cantidad o precio faltantes como cero', () => {
    const items = [wi({ id: 'a', quantity: undefined as any, unitPrice: 5_000 })];
    expect(sumBudgetValue(items)).toBe(0);
  });
});

describe('sumEarnedValue', () => {
  it('pondera cada hoja por su porcentaje de avance', () => {
    const items = [
      wi({ id: 'a', quantity: 10, unitPrice: 1_000, progress: 50 }),
      wi({ id: 'b', quantity: 10, unitPrice: 1_000, progress: 100 }),
    ];
    // 10.000×0,5 + 10.000×1 = 15.000
    expect(sumEarnedValue(items)).toBe(15_000);
  });
});

/* ── Costos por cliente ───────────────────────────────────────────────── */

describe('computeClientCosts', () => {
  const base = {
    clients: [client({ id: 'c1', name: 'Aeropuerto' })],
    projects: [project({ id: 'p1', clientId: 'c1' })],
    budgets: [budget({ id: 'b1', projectId: 'p1' })],
    workItems: [wi({ id: 'w1', budgetId: 'b1', quantity: 10, unitPrice: 1_000 })],
    purchaseOrders: [] as PurchaseOrder[],
    supplierPayments: [] as SupplierPayment[],
  };

  it('atribuye el contratado a la obra vía budget.projectId', () => {
    const [c] = computeClientCosts(base);
    expect(c.contracted).toBe(10_000);
    expect(c.spent).toBe(0);
    expect(c.available).toBe(10_000);
  });

  it('separa el contratado principal del de los adicionales', () => {
    const result = computeClientCosts({
      ...base,
      budgets: [
        budget({ id: 'b1', projectId: 'p1', type: 'principal' }),
        budget({ id: 'b2', projectId: 'p1', type: 'adicional' }),
      ],
      workItems: [
        wi({ id: 'w1', budgetId: 'b1', quantity: 10, unitPrice: 1_000 }),
        wi({ id: 'w2', budgetId: 'b2', quantity: 5, unitPrice: 1_000 }),
      ],
    });
    expect(result[0].contractedPrincipal).toBe(10_000);
    expect(result[0].contractedAdicionales).toBe(5_000);
    expect(result[0].contracted).toBe(15_000);
  });

  it('suma órdenes de compra y facturas imputadas a la obra', () => {
    const [c] = computeClientCosts({
      ...base,
      purchaseOrders: [po({ id: 'o1', projectId: 'p1', totalAmount: 3_000 })],
      supplierPayments: [payment({ id: 'f1', projectId: 'p1', amount: 2_000 })],
    });
    expect(c.spent).toBe(5_000);
    expect(c.available).toBe(5_000);
    expect(c.spentPercent).toBe(50);
  });

  it('NO cuenta las órdenes de compra canceladas', () => {
    const [c] = computeClientCosts({
      ...base,
      purchaseOrders: [
        po({ id: 'o1', projectId: 'p1', totalAmount: 3_000, status: 'cancelled' }),
        po({ id: 'o2', projectId: 'p1', totalAmount: 1_000 }),
      ],
    });
    expect(c.spent).toBe(1_000);
  });

  it('ignora el gasto sin obra: si no está imputado, no es de nadie', () => {
    const [c] = computeClientCosts({
      ...base,
      supplierPayments: [payment({ id: 'f1', projectId: null, amount: 9_999 })],
    });
    expect(c.spent).toBe(0);
  });

  it('ignora las partidas de un presupuesto sin obra asignada', () => {
    const [c] = computeClientCosts({
      ...base,
      budgets: [budget({ id: 'b1', projectId: null })],
    });
    expect(c.contracted).toBe(0);
  });

  it('agrupa al final las obras sin cliente en vez de descartarlas', () => {
    const result = computeClientCosts({
      ...base,
      projects: [project({ id: 'p1', clientId: 'c1' }), project({ id: 'p2', clientId: null })],
    });
    const huerfanas = result[result.length - 1];
    expect(huerfanas.client).toBeNull();
    expect(huerfanas.projects.map(p => p.project.id)).toEqual(['p2']);
  });

  it('no divide por cero cuando no hay presupuesto cargado', () => {
    const [c] = computeClientCosts({
      ...base,
      workItems: [],
      supplierPayments: [payment({ id: 'f1', projectId: 'p1', amount: 5_000 })],
    });
    expect(c.contracted).toBe(0);
    expect(c.spentPercent).toBe(0);
    expect(Number.isFinite(c.spentPercent)).toBe(true);
  });

  it('marca sobregiro con disponible negativo', () => {
    const [c] = computeClientCosts({
      ...base,
      supplierPayments: [payment({ id: 'f1', projectId: 'p1', amount: 15_000 })],
    });
    expect(c.available).toBe(-5_000);
    expect(c.spentPercent).toBe(150);
  });
});
