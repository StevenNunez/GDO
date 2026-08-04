import { describe, it, expect } from 'vitest';
import {
  buildCostTree,
  aplanar,
  resumenCostos,
  costoMetaUnitario,
  partidasEnRiesgo,
  type NodoCosto,
} from './cost-control';
import type { WorkItem } from '@/modules/core/lib/data';

type Item = WorkItem & { targetUnitCost?: number | null };

function wi(over: Partial<Item> & { id: string }): Item {
  return {
    tenantId: 't1', projectId: 'p1', name: over.id, type: 'task',
    status: 'in-progress', parentId: null, path: over.id, progress: 0,
    unit: 'm2', quantity: 0, unitPrice: 0,
    ...over,
  } as Item;
}

/** Busca un nodo por id en el árbol. */
function nodo(raices: NodoCosto[], id: string): NodoCosto {
  const n = aplanar(raices).find((x) => x.id === id);
  if (!n) throw new Error(`nodo ${id} no encontrado`);
  return n;
}

/* ── Costo meta unitario ──────────────────────────────────────────────── */

describe('costoMetaUnitario', () => {
  it('usa el meta explícito cuando existe', () => {
    expect(costoMetaUnitario({ id: 'a', targetUnitCost: 8000 }, new Map([['a', 9000]])))
      .toBe(8000);
  });

  it('cae al costo del APU si no hay meta escrito', () => {
    expect(costoMetaUnitario({ id: 'a' }, new Map([['a', 9000]]))).toBe(9000);
  });

  it('un meta en cero es una decisión, no un vacío: se respeta', () => {
    expect(costoMetaUnitario({ id: 'a', targetUnitCost: 0 }, new Map([['a', 9000]])))
      .toBe(0);
  });

  it('sin meta ni APU devuelve 0', () => {
    expect(costoMetaUnitario({ id: 'a' })).toBe(0);
  });
});

/* ── Árbol ────────────────────────────────────────────────────────────── */

describe('buildCostTree', () => {
  // Fase «Obra Gruesa» con dos partidas de $1.000.000 de venta cada una.
  const items: Item[] = [
    wi({ id: 'fase', type: 'phase', path: '1' }),
    wi({ id: 'p1', parentId: 'fase', path: '1.1', quantity: 100, unitPrice: 10_000, targetUnitCost: 7_000, progress: 50 }),
    wi({ id: 'p2', parentId: 'fase', path: '1.2', quantity: 100, unitPrice: 10_000, targetUnitCost: 7_000, progress: 0 }),
  ];

  it('la venta y el costo meta solo se cuentan en las hojas', () => {
    const { raices } = buildCostTree(items, { facturas: [] });
    const fase = nodo(raices, 'fase');
    expect(fase.ownSale).toBe(0);          // la fase no aporta valor propio
    expect(fase.sale).toBe(2_000_000);     // pero acumula el de sus hijas
    expect(fase.targetCost).toBe(1_400_000);
  });

  it('pondera lo ejecutado por el avance de cada partida', () => {
    const { raices } = buildCostTree(items, { facturas: [] });
    const fase = nodo(raices, 'fase');
    // p1 va al 50% (500.000 de venta), p2 en 0.
    expect(fase.earnedSale).toBe(500_000);
    expect(fase.earnedCost).toBe(350_000);
  });

  it('suma el gasto imputado a una partida', () => {
    const { raices } = buildCostTree(items, {
      facturas: [{ workItemId: 'p1', amount: 300_000 }],
    });
    expect(nodo(raices, 'p1').actualCost).toBe(300_000);
    expect(nodo(raices, 'fase').actualCost).toBe(300_000);
  });

  it('acepta gasto imputado a la FASE, no solo a la partida', () => {
    // Una factura de cemento es de «Obra Gruesa», no de una partida puntual.
    const { raices } = buildCostTree(items, {
      facturas: [
        { workItemId: 'fase', amount: 200_000 },
        { workItemId: 'p1', amount: 100_000 },
      ],
    });
    expect(nodo(raices, 'fase').ownActualCost).toBe(200_000);
    expect(nodo(raices, 'fase').actualCost).toBe(300_000);
    expect(nodo(raices, 'p1').actualCost).toBe(100_000);
  });

  it('separa lo comprometido de lo real', () => {
    const { raices } = buildCostTree(items, {
      facturas: [{ workItemId: 'p1', amount: 300_000 }],
      ordenes: [{ workItemId: 'p1', amount: 150_000 }],
    });
    const p1 = nodo(raices, 'p1');
    expect(p1.actualCost).toBe(300_000);
    expect(p1.committedCost).toBe(150_000);
  });

  it('el gasto sin partida se reporta aparte, no se reparte ni se pierde', () => {
    const { raices, sinImputar } = buildCostTree(items, {
      facturas: [
        { workItemId: null, amount: 500_000 },
        { workItemId: 'p1', amount: 100_000 },
      ],
      ordenes: [{ workItemId: null, amount: 90_000 }],
    });
    expect(sinImputar.facturas).toBe(500_000);
    expect(sinImputar.ordenes).toBe(90_000);
    // Lo sin imputar NO infla los totales del árbol.
    expect(nodo(raices, 'fase').actualCost).toBe(100_000);
  });

  it('calcula margen y CPI de la partida', () => {
    const { raices } = buildCostTree(items, {
      facturas: [{ workItemId: 'p1', amount: 300_000 }],
    });
    const p1 = nodo(raices, 'p1');
    // Ejecutado: venta 500.000, costo meta 350.000, real 300.000.
    expect(p1.margin).toBe(200_000);
    expect(p1.marginPercent).toBe(40);
    expect(p1.cpi).toBeCloseTo(350_000 / 300_000, 6);
    expect(p1.costVariance).toBe(50_000);
  });

  it('sin gasto imputado el CPI es null, no infinito', () => {
    const { raices } = buildCostTree(items, { facturas: [] });
    expect(nodo(raices, 'p1').cpi).toBeNull();
  });

  it('sin venta ejecutada el margen porcentual es null, no 0%', () => {
    const { raices } = buildCostTree(items, { facturas: [] });
    expect(nodo(raices, 'p2').marginPercent).toBeNull();
  });

  it('usa el costo del APU cuando la partida no tiene meta escrito', () => {
    const sinMeta: Item[] = [
      wi({ id: 'x', quantity: 10, unitPrice: 1000, progress: 100 }),
    ];
    const { raices } = buildCostTree(sinMeta, {
      facturas: [],
      costosApu: new Map([['x', 600]]),
    });
    expect(nodo(raices, 'x').targetCost).toBe(6_000);
  });

  it('respeta la jerarquía en varios niveles', () => {
    const hondo: Item[] = [
      wi({ id: 'r', type: 'project' }),
      wi({ id: 'f', parentId: 'r', type: 'phase' }),
      wi({ id: 'sf', parentId: 'f', type: 'subphase' }),
      wi({ id: 'h', parentId: 'sf', quantity: 1, unitPrice: 1_000_000, targetUnitCost: 700_000, progress: 100 }),
    ];
    const { raices } = buildCostTree(hondo, { facturas: [{ workItemId: 'h', amount: 800_000 }] });
    expect(nodo(raices, 'r').sale).toBe(1_000_000);
    expect(nodo(raices, 'r').actualCost).toBe(800_000);
    expect(nodo(raices, 'h').depth).toBe(3);
  });
});

/* ── Resumen ──────────────────────────────────────────────────────────── */

describe('resumenCostos', () => {
  const items: Item[] = [
    wi({ id: 'p1', quantity: 100, unitPrice: 10_000, targetUnitCost: 7_000, progress: 50 }),
    wi({ id: 'p2', quantity: 100, unitPrice: 10_000, targetUnitCost: 7_000, progress: 0 }),
  ];

  it('resume venta, costos y avance valorizado', () => {
    const { raices } = buildCostTree(items, {
      facturas: [{ workItemId: 'p1', amount: 300_000 }],
    });
    const r = resumenCostos(raices);
    expect(r.sale).toBe(2_000_000);
    expect(r.targetCost).toBe(1_400_000);
    expect(r.earnedSale).toBe(500_000);
    expect(r.actualCost).toBe(300_000);
    expect(r.progressPercent).toBe(25);
    expect(r.margin).toBe(200_000);
  });

  it('proyecta el costo final con el rendimiento actual', () => {
    const { raices } = buildCostTree(items, {
      facturas: [{ workItemId: 'p1', amount: 350_000 }],
    });
    const r = resumenCostos(raices);
    // CPI = 350.000/350.000 = 1 => la obra terminaría en el costo meta.
    expect(r.cpi).toBe(1);
    expect(r.eac).toBe(1_400_000);
    expect(r.projectedMargin).toBe(600_000);
  });

  it('si se gasta de más, la proyección sube y el margen proyectado cae', () => {
    const { raices } = buildCostTree(items, {
      facturas: [{ workItemId: 'p1', amount: 700_000 }],
    });
    const r = resumenCostos(raices);
    // Se gastó el doble de lo previsto para el avance logrado: CPI = 0,5.
    expect(r.cpi).toBe(0.5);
    expect(r.eac).toBe(2_800_000);         // 700.000 + 1.050.000/0,5
    expect(r.projectedMargin).toBe(-800_000);
  });

  it('sin gasto imputado no proyecta nada en vez de fingir que va bien', () => {
    const { raices } = buildCostTree(items, { facturas: [] });
    const r = resumenCostos(raices);
    expect(r.cpi).toBeNull();
    expect(r.eac).toBeNull();
    expect(r.projectedMargin).toBeNull();
  });

  it('una obra sin partidas no rompe ni divide por cero', () => {
    const r = resumenCostos([]);
    expect(r.sale).toBe(0);
    expect(r.progressPercent).toBe(0);
    expect(r.marginPercent).toBeNull();
  });
});

/* ── Partidas en riesgo ───────────────────────────────────────────────── */

describe('partidasEnRiesgo', () => {
  const items: Item[] = [
    wi({ id: 'mala', quantity: 10, unitPrice: 10_000, targetUnitCost: 7_000, progress: 50 }),
    wi({ id: 'buena', quantity: 10, unitPrice: 10_000, targetUnitCost: 7_000, progress: 50 }),
    wi({ id: 'sin-avance', quantity: 10, unitPrice: 10_000, targetUnitCost: 7_000, progress: 0 }),
  ];

  const { raices } = buildCostTree(items, {
    facturas: [
      { workItemId: 'mala', amount: 60_000 },      // meta ganado 35.000 → CPI 0,58
      { workItemId: 'buena', amount: 30_000 },     // CPI 1,17
      { workItemId: 'sin-avance', amount: 50_000 },// avance 0: no se puede juzgar
    ],
  });

  it('lista solo las que superan su costo meta, la peor primero', () => {
    expect(partidasEnRiesgo(raices).map((n) => n.id)).toEqual(['mala']);
  });

  it('ignora las partidas sin avance: su CPI no significa nada todavía', () => {
    expect(partidasEnRiesgo(raices).map((n) => n.id)).not.toContain('sin-avance');
  });

  it('sin gasto imputado no hay nada que juzgar', () => {
    const { raices: limpias } = buildCostTree(items, { facturas: [] });
    expect(partidasEnRiesgo(limpias)).toEqual([]);
  });
});
