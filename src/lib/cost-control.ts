/**
 * Control de costos por partida: venta vs. costo meta vs. costo real, margen y
 * proyección a término.
 *
 * Lógica pura, sin React ni acceso a datos (tests en `cost-control.test.ts`).
 *
 * LAS CUATRO CIFRAS QUE IMPORTAN, por partida y acumuladas hacia arriba:
 *   · Venta        — lo que se le cobra al mandante (cantidad × precio unitario).
 *   · Costo meta   — lo que la empresa se propuso gastar (cantidad × costo meta).
 *   · Costo real   — lo efectivamente facturado por proveedores e imputado acá.
 *   · Comprometido — órdenes de compra emitidas y todavía no facturadas.
 *
 * Y las dos que se leen de esas:
 *   · Margen  = venta ejecutada − costo real.
 *   · CPI     = costo ganado / costo real. Bajo 1 = se está gastando de más.
 *
 * OJO CON EL AVANCE: todo lo "ejecutado" se pondera por el % de avance de la
 * partida. Comparar la venta TOTAL contra el costo real de un 10% de avance
 * daría un margen fantástico y falso.
 */

import type { WorkItem } from '@/modules/core/lib/data';

/* ── Entradas ─────────────────────────────────────────────────────────── */

/** Un gasto ya imputado a un nodo de la EDT. */
export interface Imputacion {
  workItemId: string | null;
  amount: number;
}

export interface NodoCosto {
  id: string;
  parentId: string | null;
  name: string;
  path: string;
  type: WorkItem['type'];
  unit: string;
  quantity: number;
  progress: number;

  /** Venta contratada de esta partida (sin sus hijos). */
  ownSale: number;
  /** Costo meta de esta partida (sin sus hijos). */
  ownTargetCost: number;
  /** Gasto real imputado directamente a este nodo. */
  ownActualCost: number;
  /** Órdenes de compra imputadas a este nodo y aún no facturadas. */
  ownCommittedCost: number;

  /* ── Acumulados: el nodo más todos sus descendientes ── */
  sale: number;
  targetCost: number;
  actualCost: number;
  committedCost: number;
  /** Venta correspondiente a lo ejecutado. */
  earnedSale: number;
  /** Costo meta correspondiente a lo ejecutado (el "valor ganado" a costo). */
  earnedCost: number;
  /** earnedCost − actualCost. Positivo = se gastó menos de lo previsto. */
  costVariance: number;
  /** earnedCost / actualCost. `null` si todavía no hay gasto imputado. */
  cpi: number | null;
  /** earnedSale − actualCost. */
  margin: number;
  /** Margen sobre la venta ejecutada, en %. `null` si no hay venta ejecutada. */
  marginPercent: number | null;

  children: NodoCosto[];
  depth: number;
}

/**
 * Costo meta unitario de una partida.
 *
 * Si nadie escribió un meta explícito se usa el costo que arroja el APU: así una
 * obra con APU cargado tiene presupuesto meta sin tener que escribir lo mismo
 * dos veces. Si no hay ninguno de los dos, devuelve 0 — y la pantalla avisa,
 * porque un costo meta en cero produce un margen del 100% que no es real.
 */
export function costoMetaUnitario(
  item: Pick<WorkItem, 'id'> & { targetUnitCost?: number | null },
  costosApu?: Map<string, number>,
): number {
  if (item.targetUnitCost != null) return item.targetUnitCost;
  return costosApu?.get(item.id) ?? 0;
}

/* ── Árbol ────────────────────────────────────────────────────────────── */

/**
 * Arma el árbol de costos de la EDT con todo acumulado hacia arriba.
 *
 * Cada nodo suma **lo propio más lo de sus descendientes**. La venta y el costo
 * meta propios solo se cuentan en las HOJAS: el valor de una fase ya está
 * repartido en sus partidas, así que sumarlo también en el padre duplicaría el
 * monto (mismo criterio que `getLeafItems` en `budget-costs.ts`).
 *
 * El gasto real y el comprometido sí se cuentan en cualquier nodo, porque una
 * factura se imputa donde tenga sentido: a la fase «Obra Gruesa» o a la partida
 * final, y ambas deben dar totales correctos.
 */
export function buildCostTree(
  items: (WorkItem & { targetUnitCost?: number | null })[],
  opts: {
    facturas: Imputacion[];
    ordenes?: Imputacion[];
    costosApu?: Map<string, number>;
  },
): { raices: NodoCosto[]; sinImputar: { facturas: number; ordenes: number } } {
  const conHijos = new Set<string>();
  for (const i of items) if (i.parentId) conHijos.add(i.parentId);

  // Gasto por nodo. Lo que no trae partida se acumula aparte y se muestra: si se
  // repartiera o se ignorara, el control de costos se vería completo y estaría mal.
  const realPorNodo = new Map<string, number>();
  let facturasSinImputar = 0;
  for (const f of opts.facturas) {
    if (!f.workItemId) { facturasSinImputar += f.amount; continue; }
    realPorNodo.set(f.workItemId, (realPorNodo.get(f.workItemId) ?? 0) + f.amount);
  }

  const compPorNodo = new Map<string, number>();
  let ordenesSinImputar = 0;
  for (const o of opts.ordenes ?? []) {
    if (!o.workItemId) { ordenesSinImputar += o.amount; continue; }
    compPorNodo.set(o.workItemId, (compPorNodo.get(o.workItemId) ?? 0) + o.amount);
  }

  const porPadre = new Map<string | null, typeof items>();
  for (const i of items) {
    const k = i.parentId ?? null;
    if (!porPadre.has(k)) porPadre.set(k, []);
    porPadre.get(k)!.push(i);
  }

  const construir = (item: (typeof items)[number], depth: number): NodoCosto => {
    const esHoja = !conHijos.has(item.id);
    const quantity = item.quantity ?? 0;
    const progress = item.progress ?? 0;

    const ownSale = esHoja ? quantity * (item.unitPrice ?? 0) : 0;
    const ownTargetCost = esHoja ? quantity * costoMetaUnitario(item, opts.costosApu) : 0;
    const ownActualCost = realPorNodo.get(item.id) ?? 0;
    const ownCommittedCost = compPorNodo.get(item.id) ?? 0;

    const children = (porPadre.get(item.id) ?? []).map((c) => construir(c, depth + 1));

    const sale = ownSale + children.reduce((s, c) => s + c.sale, 0);
    const targetCost = ownTargetCost + children.reduce((s, c) => s + c.targetCost, 0);
    const actualCost = ownActualCost + children.reduce((s, c) => s + c.actualCost, 0);
    const committedCost = ownCommittedCost + children.reduce((s, c) => s + c.committedCost, 0);

    // Lo ejecutado se pondera por avance en la hoja; los padres suman a sus hijos.
    const earnedSale = esHoja
      ? ownSale * (progress / 100)
      : children.reduce((s, c) => s + c.earnedSale, 0);
    const earnedCost = esHoja
      ? ownTargetCost * (progress / 100)
      : children.reduce((s, c) => s + c.earnedCost, 0);

    const margin = earnedSale - actualCost;

    return {
      id: item.id,
      parentId: item.parentId,
      name: item.name,
      path: item.path,
      type: item.type,
      unit: item.unit,
      quantity,
      progress,
      ownSale,
      ownTargetCost,
      ownActualCost,
      ownCommittedCost,
      sale,
      targetCost,
      actualCost,
      committedCost,
      earnedSale,
      earnedCost,
      costVariance: earnedCost - actualCost,
      cpi: actualCost > 0 ? earnedCost / actualCost : null,
      margin,
      marginPercent: earnedSale > 0 ? (margin / earnedSale) * 100 : null,
      children,
      depth,
    };
  };

  const raices = (porPadre.get(null) ?? []).map((i) => construir(i, 0));

  return {
    raices,
    sinImputar: { facturas: facturasSinImputar, ordenes: ordenesSinImputar },
  };
}

/** Aplana el árbol en orden de lectura, para pintarlo como tabla. */
export function aplanar(nodos: NodoCosto[]): NodoCosto[] {
  return nodos.flatMap((n) => [n, ...aplanar(n.children)]);
}

/* ── Resumen y proyección ─────────────────────────────────────────────── */

export interface ResumenCostos {
  sale: number;
  targetCost: number;
  actualCost: number;
  committedCost: number;
  earnedSale: number;
  earnedCost: number;
  costVariance: number;
  cpi: number | null;
  margin: number;
  marginPercent: number | null;
  /** % de avance valorizado sobre la venta total. */
  progressPercent: number;
  /**
   * Costo estimado al terminar la obra. Se proyecta el rendimiento actual sobre
   * lo que falta: `real + (meta restante ÷ CPI)`.
   *
   * Es la clásica EAC. Si todavía no hay gasto imputado no se puede proyectar
   * nada y devuelve `null` — mostrar el costo meta como si fuera una proyección
   * daría una falsa sensación de que la obra va bien.
   */
  eac: number | null;
  /** Margen proyectado al terminar: venta total − EAC. */
  projectedMargin: number | null;
}

export function resumenCostos(raices: NodoCosto[]): ResumenCostos {
  const suma = (f: (n: NodoCosto) => number) => raices.reduce((s, n) => s + f(n), 0);

  const sale = suma((n) => n.sale);
  const targetCost = suma((n) => n.targetCost);
  const actualCost = suma((n) => n.actualCost);
  const committedCost = suma((n) => n.committedCost);
  const earnedSale = suma((n) => n.earnedSale);
  const earnedCost = suma((n) => n.earnedCost);

  const cpi = actualCost > 0 ? earnedCost / actualCost : null;
  const margin = earnedSale - actualCost;

  // Lo que falta por ejecutar, a costo meta, corregido por el rendimiento real.
  const eac = cpi && cpi > 0
    ? actualCost + Math.max(0, targetCost - earnedCost) / cpi
    : null;

  return {
    sale,
    targetCost,
    actualCost,
    committedCost,
    earnedSale,
    earnedCost,
    costVariance: earnedCost - actualCost,
    cpi,
    margin,
    marginPercent: earnedSale > 0 ? (margin / earnedSale) * 100 : null,
    progressPercent: sale > 0 ? (earnedSale / sale) * 100 : 0,
    eac,
    projectedMargin: eac != null ? sale - eac : null,
  };
}

/**
 * Partidas que se están yendo de presupuesto, más urgente primero.
 *
 * Solo entran las que ya tienen gasto imputado y avance: sin eso el CPI no
 * significa nada (una partida con una factura y 0% de avance siempre se vería
 * catastrófica).
 */
export function partidasEnRiesgo(
  raices: NodoCosto[],
  cpiMinimo = 1,
): NodoCosto[] {
  return aplanar(raices)
    .filter((n) => n.children.length === 0)
    .filter((n) => n.actualCost > 0 && n.progress > 0)
    .filter((n) => n.cpi != null && n.cpi < cpiMinimo)
    .sort((a, b) => (a.cpi ?? 0) - (b.cpi ?? 0));
}
