/**
 * Carga de colecciones por demanda.
 *
 * ANTES: entrar al panel descargaba y dejaba escuchando ~70 tablas, las usara
 * o no la pantalla. Para quien abre la app todos los días a mirar una obra, eso
 * eran decenas de consultas y de canales realtime innecesarios.
 *
 * AHORA: una colección solo se descarga cuando alguna pantalla la LEE de
 * `useAppState()`. Se logra con getters sobre el valor del contexto: leer
 * `materials` avisa «hace falta materials» y el DataProvider enciende ese hook.
 * No hay lista de rutas que mantener: lo que una pantalla usa es lo que se carga.
 *
 * Una vez encendida, una colección se queda encendida durante la sesión (con su
 * canal realtime): volver a una pantalla ya visitada es instantáneo.
 */

/** Siempre cargadas: el propio DataProvider las necesita para funcionar. */
export const ALWAYS_ON: ReadonlySet<string> = new Set(['projects', 'dynamicRoles']);

/** Si piden la clave de la izquierda, hay que encender también las de la derecha. */
export const DEPENDS_ON: Readonly<Record<string, readonly string[]>> = {
  libroObraAsientos: ['libroObra'],
};

/** Claves del contexto que se cargan por demanda. */
export const LAZY_KEYS: ReadonlySet<string> = new Set([
  'users', 'materials', 'tools', 'toolLogs', 'requests', 'returnRequests', 'purchaseRequests',
  'suppliers', 'materialCategories', 'units', 'purchaseLots', 'purchaseOrders', 'supplierPayments',
  'salaryAdvances', 'attendanceLogs', 'assignedChecklists', 'safetyInspections', 'checklistTemplates',
  'behaviorObservations', 'stockMovements', 'workItems', 'progressLogs', 'dailyTalks', 'clients',
  'budgets', 'resources', 'apus', 'apuItems', 'budgetOverheads', 'bitacoraEntries', 'libroObra',
  'libroObraAsientos', 'contracts', 'guarantees', 'amendments', 'rdis', 'documents', 'documentRevisions',
  'lookaheadTasks', 'taskConstraints', 'subcontracts', 'subcontractItems', 'subcontractCertificates',
  'subcontractCertificateLines', 'receptions', 'receptionObservations', 'companyLinks', 'marketIndices',
  'paymentCertificates', 'paymentCertificateLines', 'approvalFlows', 'approvalFlowSteps',
  'approvalRequests', 'approvalActions', 'approvalDelegations', 'contractorDocumentTypes',
  'contractorDocuments', 'subcontractQuotes', 'subcontractAttachments', 'documentSignatures',
  'certificateDeductions', 'paymentOrders', 'equipmentRentals', 'workUnits',
  'workCalendarExceptions', 'trainActivities', 'dailyProgress', 'dailyReportTokens',
]);

/** Agrega a lo pedido todo lo que esas colecciones necesitan para cargarse. */
export function expandDemand(keys: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const k of keys) {
    out.add(k);
    for (const dep of DEPENDS_ON[k] ?? []) out.add(dep);
  }
  return out;
}

/**
 * Devuelve una copia de `base` donde las claves perezosas son getters que avisan
 * (`onRead`) cada vez que alguien las lee. Las demás claves quedan tal cual.
 */
export function withDemandGetters<T extends object>(
  base: T,
  lazyKeys: ReadonlySet<string>,
  onRead: (key: string) => void,
): T {
  const out = {} as Record<string, unknown>;
  for (const key of Object.keys(base)) {
    const value = (base as Record<string, unknown>)[key];
    if (lazyKeys.has(key)) {
      Object.defineProperty(out, key, {
        enumerable: true,
        configurable: true,
        get() {
          onRead(key);
          return value;
        },
      });
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

/**
 * Junta los pedidos hechos durante un mismo render y avisa UNA vez, fuera del
 * render (React no deja actualizar el estado de otro componente mientras se
 * dibuja). `request` es idempotente y barato: se llama en cada lectura.
 */
export function createDemandTracker(onChange: (all: ReadonlySet<string>) => void) {
  const wanted = new Set<string>();
  let scheduled = false;
  let disposed = false;

  return {
    request(key: string) {
      if (wanted.has(key)) return;
      wanted.add(key);
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        if (!disposed) onChange(new Set(wanted));
      });
    },
    current(): ReadonlySet<string> {
      return wanted;
    },
    dispose() {
      disposed = true;
    },
  };
}
