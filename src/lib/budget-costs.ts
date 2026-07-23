import type {
  Budget,
  Client,
  Project,
  PurchaseOrder,
  SupplierPayment,
  WorkItem,
} from '@/modules/core/lib/data';

/**
 * Hoja del árbol EDT = partida que no tiene hijos.
 *
 * Se calcula por `parentId` y no por `type` porque el tipo no garantiza que sea
 * terminal (una 'subphase' puede colgar 'activity'). Sumar también los padres
 * duplicaría el monto: el valor de una fase ya está en sus partidas.
 */
export function getLeafItems(items: WorkItem[]): WorkItem[] {
  const withChildren = new Set<string>();
  for (const i of items) {
    if (i.parentId) withChildren.add(i.parentId);
  }
  return items.filter(i => !withChildren.has(i.id));
}

/** Valor contratado = Σ cantidad × precio unitario de las hojas. */
export function sumBudgetValue(items: WorkItem[]): number {
  return getLeafItems(items).reduce((s, i) => s + (i.quantity || 0) * (i.unitPrice || 0), 0);
}

/** Valor ganado = lo mismo, ponderado por el % de avance de cada partida. */
export function sumEarnedValue(items: WorkItem[]): number {
  return getLeafItems(items).reduce(
    (s, i) => s + ((i.quantity || 0) * (i.unitPrice || 0) * (i.progress || 0)) / 100,
    0
  );
}

export interface ProjectCosts {
  project: Project;
  /** Presupuestos de la obra (principal + adicionales). */
  budgets: Budget[];
  /** Contratado del presupuesto principal. */
  contractedPrincipal: number;
  /** Contratado de los adicionales. */
  contractedAdicionales: number;
  /** Principal + adicionales. */
  contracted: number;
  /** Gasto real: órdenes de compra + facturas de proveedor imputadas a la obra. */
  spentPurchaseOrders: number;
  spentSupplierPayments: number;
  spent: number;
  /** Contratado − gastado. Negativo = sobregiro. */
  available: number;
  /** % del presupuesto consumido. 0 si no hay presupuesto cargado. */
  spentPercent: number;
}

export interface ClientCosts {
  /** `null` en el grupo de obras sin cliente asignado. */
  client: Client | null;
  projects: ProjectCosts[];
  contractedPrincipal: number;
  contractedAdicionales: number;
  contracted: number;
  spent: number;
  available: number;
  spentPercent: number;
}

interface CostInput {
  clients: Client[];
  projects: Project[];
  budgets: Budget[];
  workItems: WorkItem[];
  purchaseOrders: PurchaseOrder[];
  supplierPayments: SupplierPayment[];
}

function percent(spent: number, contracted: number): number {
  if (contracted <= 0) return 0;
  return (spent / contracted) * 100;
}

function costsForProject(
  project: Project,
  budgets: Budget[],
  itemsByBudget: Map<string, WorkItem[]>,
  orphanItemsByProject: Map<string, WorkItem[]>,
  poByProject: Map<string, number>,
  spByProject: Map<string, number>
): ProjectCosts {
  const projectBudgets = budgets.filter(b => b.projectId === project.id);

  let contractedPrincipal = 0;
  let contractedAdicionales = 0;
  for (const b of projectBudgets) {
    const value = sumBudgetValue(itemsByBudget.get(b.id) ?? []);
    if (b.type === 'adicional') contractedAdicionales += value;
    else contractedPrincipal += value;
  }

  // Partidas cargadas antes de que existieran los presupuestos (budgetId nulo):
  // cuentan como contrato principal para no dejar la obra en $0.
  contractedPrincipal += sumBudgetValue(orphanItemsByProject.get(project.id) ?? []);

  const spentPurchaseOrders = poByProject.get(project.id) ?? 0;
  const spentSupplierPayments = spByProject.get(project.id) ?? 0;
  const contracted = contractedPrincipal + contractedAdicionales;
  const spent = spentPurchaseOrders + spentSupplierPayments;

  return {
    project,
    budgets: projectBudgets,
    contractedPrincipal,
    contractedAdicionales,
    contracted,
    spentPurchaseOrders,
    spentSupplierPayments,
    spent,
    available: contracted - spent,
    spentPercent: percent(spent, contracted),
  };
}

/**
 * Consolida presupuesto y gasto real por cliente.
 *
 * Las obras sin cliente salen agrupadas al final con `client: null` — no se
 * descartan, porque son justamente las que hay que asignar.
 */
export function computeClientCosts(input: CostInput): ClientCosts[] {
  const { clients, projects, budgets, workItems, purchaseOrders, supplierPayments } = input;

  const itemsByBudget = new Map<string, WorkItem[]>();
  const orphanItemsByProject = new Map<string, WorkItem[]>();
  for (const item of workItems) {
    if (item.budgetId) {
      const list = itemsByBudget.get(item.budgetId);
      if (list) list.push(item);
      else itemsByBudget.set(item.budgetId, [item]);
    } else if (item.projectId) {
      const list = orphanItemsByProject.get(item.projectId);
      if (list) list.push(item);
      else orphanItemsByProject.set(item.projectId, [item]);
    }
  }

  const poByProject = new Map<string, number>();
  for (const po of purchaseOrders) {
    // Solo cuentan las OC vivas: una cancelada no es gasto.
    if (!po.projectId || po.status === 'cancelled') continue;
    poByProject.set(po.projectId, (poByProject.get(po.projectId) ?? 0) + (po.totalAmount ?? 0));
  }

  const spByProject = new Map<string, number>();
  for (const sp of supplierPayments) {
    if (!sp.projectId) continue;
    spByProject.set(sp.projectId, (spByProject.get(sp.projectId) ?? 0) + (sp.amount ?? 0));
  }

  const build = (client: Client | null, ownProjects: Project[]): ClientCosts => {
    const projectCosts = ownProjects.map(p =>
      costsForProject(p, budgets, itemsByBudget, orphanItemsByProject, poByProject, spByProject)
    );
    const contractedPrincipal = projectCosts.reduce((s, p) => s + p.contractedPrincipal, 0);
    const contractedAdicionales = projectCosts.reduce((s, p) => s + p.contractedAdicionales, 0);
    const contracted = contractedPrincipal + contractedAdicionales;
    const spent = projectCosts.reduce((s, p) => s + p.spent, 0);
    return {
      client,
      projects: projectCosts,
      contractedPrincipal,
      contractedAdicionales,
      contracted,
      spent,
      available: contracted - spent,
      spentPercent: percent(spent, contracted),
    };
  };

  const result = clients.map(c => build(c, projects.filter(p => p.clientId === c.id)));

  const unassigned = projects.filter(p => !p.clientId);
  if (unassigned.length > 0) result.push(build(null, unassigned));

  return result;
}
