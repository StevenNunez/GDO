/**
 * Datos de ejemplo del modo demo. Una obra chica pero "viva": materiales (con
 * algunos en stock crítico), personal, herramientas, solicitudes de compra y una
 * EDT con fases y avance. Nombres de columna en camelCase y tipos según
 * `src/modules/core/lib/data.ts`. Las fechas van como ISO string, igual que las
 * devuelve Supabase.
 */
import type { DemoDB } from './demo-store';

export const DEMO_TENANT_ID = 'demo-tenant';
export const DEMO_USER_ID = '11111111-1111-4111-8111-111111111111';
export const DEMO_EMAIL = 'demo@gdo.app';

const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const SUP_ID = '11111111-1111-4111-8111-111111111112';
const W1_ID = '11111111-1111-4111-8111-111111111113';
const W2_ID = '11111111-1111-4111-8111-111111111114';
const SOPORTE_ID = '11111111-1111-4111-8111-111111111115';

const iso = (daysAgo = 0) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

/** Construye la base demo completa desde cero. */
export function buildDemoDB(): DemoDB {
  const t = DEMO_TENANT_ID;

  const tenants = [
    { id: t, name: 'Constructora Demo Ltda.', tenantId: t, createdAt: iso(120), plan: 'enterprise', rut: '76.123.456-7', giro: 'Construcción de obras civiles', direccion: 'Av. Ejemplo 1234', comuna: 'La Serena', telefono: '+56 51 222 3344', email: 'contacto@demo.cl' },
  ];

  const subscriptions = [
    { id: t, plan: 'enterprise', features: { basic: true, pro: true, enterprise: true } },
  ];

  const users = [
    { id: DEMO_USER_ID, name: 'Usuario Demo', email: DEMO_EMAIL, role: 'admin', qrCode: 'DEMO-ADMIN', tenantId: t, cargo: 'Administrador de Obra', rut: '11.111.111-1', baseSalary: 1_800_000, assignedProjectIds: [PROJECT_ID] },
    { id: SUP_ID, name: 'Pedro Jefe de Terreno', email: 'pedro@demo.cl', role: 'jefe-terreno', qrCode: 'DEMO-JT', tenantId: t, cargo: 'Jefe de Terreno', rut: '12.222.222-2', baseSalary: 1_400_000, assignedProjectIds: [PROJECT_ID] },
    { id: W1_ID, name: 'Juan Maestro', email: 'juan@demo.cl', role: 'worker', qrCode: 'DEMO-W1', tenantId: t, cargo: 'Maestro Albañil', rut: '13.333.333-3', baseSalary: 700_000, assignedProjectIds: [PROJECT_ID] },
    { id: W2_ID, name: 'Luis Ayudante', email: 'luis@demo.cl', role: 'worker', qrCode: 'DEMO-W2', tenantId: t, cargo: 'Ayudante', rut: '14.444.444-4', baseSalary: 550_000, assignedProjectIds: [PROJECT_ID] },
    { id: SOPORTE_ID, name: 'Soporte GDO', email: 'soporte@demo.cl', role: 'soporte', qrCode: 'DEMO-SOP', tenantId: t, cargo: 'Soporte de Aplicación', rut: '15.555.555-5', assignedProjectIds: [PROJECT_ID] },
  ];

  const projects = [
    { id: PROJECT_ID, name: 'Edificio Cordillera — La Serena', tenantId: t, createdAt: iso(120), address: 'Av. del Mar 5600, La Serena', description: 'Obra de ejemplo para explorar la aplicación.', isActive: true, clientId: null },
  ];

  const materialCategories = [
    { id: 'cat-horm', name: 'Hormigón y áridos', tenantId: t },
    { id: 'cat-fierro', name: 'Fierro y enfierradura', tenantId: t },
    { id: 'cat-term', name: 'Terminaciones', tenantId: t },
  ];

  const units = [
    { id: 'un-saco', name: 'Saco' },
    { id: 'un-m3', name: 'm³' },
    { id: 'un-kg', name: 'kg' },
    { id: 'un-un', name: 'Unidad' },
    { id: 'un-m2', name: 'm²' },
  ];

  const mat = (id: string, name: string, stock: number, unit: string, category: string) =>
    ({ id, name, stock, unit, category, tenantId: t, projectId: PROJECT_ID });

  const materials = [
    mat('mat-01', 'Cemento Especial', 8, 'Saco', 'Hormigón y áridos'), // crítico
    mat('mat-02', 'Arena gruesa', 140, 'm³', 'Hormigón y áridos'),
    mat('mat-03', 'Gravilla', 95, 'm³', 'Hormigón y áridos'),
    mat('mat-04', 'Fierro estriado 8mm', 6, 'kg', 'Fierro y enfierradura'), // crítico
    mat('mat-05', 'Fierro estriado 10mm', 320, 'kg', 'Fierro y enfierradura'),
    mat('mat-06', 'Alambre negro N°18', 45, 'kg', 'Fierro y enfierradura'),
    mat('mat-07', 'Ladrillo fiscal', 2400, 'Unidad', 'Terminaciones'),
    mat('mat-08', 'Yeso cartón 15mm', 60, 'Unidad', 'Terminaciones'),
    mat('mat-09', 'Pintura látex blanca', 3, 'Unidad', 'Terminaciones'), // crítico
    mat('mat-10', 'Cerámica 45x45', 210, 'm²', 'Terminaciones'),
    mat('mat-11', 'Tubería PVC 110mm', 30, 'Unidad', 'Terminaciones'),
    mat('mat-12', 'Malla Acma C-92', 18, 'Unidad', 'Fierro y enfierradura'),
  ];

  const tool = (id: string, name: string, status: string, qr: string) =>
    ({ id, name, status, qrCode: qr, projectId: PROJECT_ID, tenantId: t, createdAt: iso(90) });

  const tools = [
    tool('tool-01', 'Betonera 200L', 'available', 'DEMO-T1'),
    tool('tool-02', 'Taladro percutor Bosch', 'in-use', 'DEMO-T2'),
    tool('tool-03', 'Esmeril angular', 'available', 'DEMO-T3'),
    tool('tool-04', 'Vibrador de inmersión', 'maintenance', 'DEMO-T4'),
    tool('tool-05', 'Nivel láser', 'available', 'DEMO-T5'),
  ];

  const pr = (id: string, materialName: string, quantity: number, unit: string, status: string, phase: string, daysAgo: number) =>
    ({ id, materialName, quantity, unit, status, phase, tenantId: t, projectId: PROJECT_ID, supervisorId: SUP_ID, requesterName: 'Pedro Jefe de Terreno', category: 'General', area: phase, justification: 'Reposición de stock', createdAt: iso(daysAgo) });

  const purchaseRequests = [
    pr('pr-01', 'Cemento Especial', 50, 'Saco', 'pending', 'Obra Gruesa', 2),
    pr('pr-02', 'Fierro estriado 8mm', 200, 'kg', 'pending', 'Obra Gruesa', 1),
    pr('pr-03', 'Pintura látex blanca', 20, 'Unidad', 'approved', 'Terminaciones', 5),
    pr('pr-04', 'Cerámica 45x45', 80, 'm²', 'ordered', 'Terminaciones', 8),
  ];

  const suppliers = [
    { id: 'sup-01', name: 'Comercial Andes Ltda.', categories: ['Hormigón y áridos'], rut: '77.888.999-0', email: 'ventas@andes.cl', phone: '+56 2 2555 1000', tenantId: t },
    { id: 'sup-02', name: 'Ferretería El Maestro', categories: ['Fierro y enfierradura', 'Terminaciones'], rut: '78.111.222-3', email: 'contacto@elmaestro.cl', phone: '+56 51 233 4455', tenantId: t },
  ];

  const proj = 'Edificio Cordillera — La Serena';
  const supplierPayments = [
    { id: 'sp-01', supplierId: 'sup-01', invoiceNumber: 'F-1042', amount: 2_450_000, issueDate: iso(40), dueDate: iso(5), status: 'pending', projectId: PROJECT_ID, work: proj, purchaseOrderNumber: 'OC-018', tenantId: t },
    { id: 'sp-02', supplierId: 'sup-02', invoiceNumber: 'F-2210', amount: 880_000, issueDate: iso(10), dueDate: iso(-4), status: 'pending', projectId: PROJECT_ID, work: proj, tenantId: t },
    { id: 'sp-03', supplierId: 'sup-01', invoiceNumber: 'F-1050', amount: 1_200_000, issueDate: iso(6), dueDate: iso(-20), status: 'pending', projectId: null, work: '', tenantId: t },
    { id: 'sp-04', supplierId: 'sup-02', invoiceNumber: 'F-2185', amount: 640_000, issueDate: iso(35), dueDate: iso(10), status: 'paid', paymentDate: iso(3), paymentMethod: 'Transferencia', projectId: PROJECT_ID, work: proj, tenantId: t },
  ];

  const materialRequests = [
    { id: 'mr-01', items: [{ materialId: 'mat-02', quantity: 20 }, { materialId: 'mat-03', quantity: 10 }], area: 'Fundaciones', supervisorId: SUP_ID, status: 'pending', createdAt: iso(1), tenantId: t, projectId: PROJECT_ID },
    { id: 'mr-02', items: [{ materialId: 'mat-07', quantity: 500 }], area: 'Albañilería', supervisorId: SUP_ID, status: 'approved', approvalDate: iso(3), createdAt: iso(4), tenantId: t, projectId: PROJECT_ID },
  ];

  const returnRequests = [
    { id: 'rr-01', supervisorId: SUP_ID, supervisorName: 'Pedro Jefe de Terreno', materialId: 'mat-05', materialName: 'Fierro estriado 10mm', quantity: 15, unit: 'kg', status: 'pending', createdAt: iso(1), tenantId: t, projectId: PROJECT_ID },
  ];

  // Marcas de asistencia de HOY (para el panel de Asistencia).
  const now = new Date();
  const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();
  const attLog = (id: string, userId: string, userName: string, tsIso: string, type: 'in' | 'out') =>
    ({ id, userId, userName, timestamp: tsIso, type, method: 'qr', registrarId: SUP_ID, registrarName: 'Pedro Jefe de Terreno', date: todayDate, tenantId: t });

  const attendanceLogs = [
    attLog('al-01', W2_ID, 'Luis Ayudante', minsAgo(185), 'in'),
    attLog('al-02', W1_ID, 'Juan Maestro', minsAgo(180), 'in'),
    attLog('al-03', SUP_ID, 'Pedro Jefe de Terreno', minsAgo(175), 'in'),
    attLog('al-04', W1_ID, 'Juan Maestro', minsAgo(15), 'out'),
  ];

  const wi = (id: string, name: string, type: string, parentId: string | null, path: string, progress: number, quantity: number, unit: string, unitPrice: number) =>
    ({ id, name, type, parentId, path, progress, quantity, unit, unitPrice, tenantId: t, projectId: PROJECT_ID, status: 'in-progress', budgetId: null });

  const workItems = [
    wi('wi-og', 'Obra Gruesa', 'phase', null, '01', 62, 0, 'gl', 0),
    wi('wi-fund', 'Fundaciones', 'task', 'wi-og', '01/01', 100, 120, 'm³', 95_000),
    wi('wi-radier', 'Radier e=10cm', 'task', 'wi-og', '01/02', 45, 80, 'm³', 78_000),
    wi('wi-albanileria', 'Albañilería', 'task', 'wi-og', '01/03', 30, 350, 'm²', 42_000),
    wi('wi-term', 'Terminaciones', 'phase', null, '02', 12, 0, 'gl', 0),
    wi('wi-pintura', 'Pintura interior', 'task', 'wi-term', '02/01', 10, 500, 'm²', 8_500),
    wi('wi-ceramica', 'Revestimiento cerámico', 'task', 'wi-term', '02/02', 15, 210, 'm²', 22_000),
  ];

  return {
    tenants,
    subscriptions,
    users,
    projects,
    materialCategories,
    units,
    materials,
    tools,
    suppliers,
    supplierPayments,
    purchaseRequests,
    materialRequests,
    returnRequests,
    attendanceLogs,
    workItems,
  };
}
