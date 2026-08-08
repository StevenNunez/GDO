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

/**
 * Fecha calendario `YYYY-MM-DD`, que es como Supabase devuelve una columna
 * DATE. Se arma con los campos LOCALES a propósito: cortar un ISO en UTC
 * correría el día en Chile, y con vencimientos eso es la diferencia entre un
 * certificado vigente y uno vencido.
 */
const dia = (daysFromNow = 0) => {
  const d = new Date(Date.now() + daysFromNow * 86_400_000);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

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
    { id: 'sup-01', name: 'Comercial Andes Ltda.', categories: ['Hormigón y áridos'], rut: '77.888.999-0', email: 'ventas@andes.cl', phone: '+56 2 2555 1000', tenantId: t, isContractor: false },
    { id: 'sup-02', name: 'Ferretería El Maestro', categories: ['Fierro y enfierradura', 'Terminaciones'], rut: '78.111.222-3', email: 'contacto@elmaestro.cl', phone: '+56 51 233 4455', tenantId: t, isContractor: false },
    // Contratistas: son los que llevan expediente. Uno enrolado y otro con el
    // F30-1 vencido, para que se vea la diferencia sin tener que provocarla.
    { id: 'sub-01', name: 'Montajes del Norte SpA', categories: ['Subcontratos'], rut: '76.543.210-K', email: 'contacto@montajesnorte.cl', phone: '+56 51 244 1122', tenantId: t, isContractor: true, legalName: 'Montajes del Norte SpA', giro: 'Obras de montaje y estructuras', representativeName: 'Rodrigo Fuentes', representativeRut: '10.111.222-3' },
    { id: 'sub-02', name: 'Terminaciones Pacífico Ltda.', categories: ['Subcontratos'], rut: '77.222.333-4', email: 'obras@pacifico.cl', phone: '+56 51 255 6677', tenantId: t, isContractor: true, legalName: 'Terminaciones Pacífico Limitada', giro: 'Terminaciones y revestimientos', representativeName: 'Carmen Ríos', representativeRut: '12.333.444-5' },
  ];

  /* ── Expediente documental del contratista (migración 031) ──────────── */

  const ct = (id: string, code: string, name: string, required: boolean, hasExpiry: boolean, sortOrder: number) =>
    ({ id, tenantId: t, code, name, description: null, required, hasExpiry, warnDays: null, sortOrder, active: true, createdAt: iso(60) });

  const contractorDocumentTypes = [
    ct('ct-rut', 'e_rut', 'e-RUT de la empresa', true, false, 10),
    ct('ct-const', 'constitucion', 'Escritura de constitución', true, false, 20),
    ct('ct-vig', 'vigencia', 'Certificado de vigencia', true, true, 30),
    ct('ct-mut', 'mutual', 'Adhesión a mutual', true, true, 40),
    ct('ct-f30', 'f30', 'F30 · Antecedentes laborales', true, true, 50),
    ct('ct-f301', 'f30_1', 'F30-1 · Cumplimiento de obligaciones', true, true, 60),
    ct('ct-pol', 'poliza', 'Póliza de responsabilidad civil', true, true, 70),
    ct('ct-banco', 'banco', 'Certificado de cuenta bancaria', true, false, 80),
    ct('ct-riohs', 'riohs', 'Reglamento interno (RIOHS)', false, false, 90),
  ];

  const cd = (
    id: string, supplierId: string, documentTypeId: string,
    expiryDate: string | null, status: string, observations: string | null = null,
  ) => ({
    id, tenantId: t, supplierId, documentTypeId,
    number: null, issueDate: dia(-90), expiryDate,
    filePath: null, fileName: null, fileSize: null,
    status, observations,
    reviewedBy: status === 'aprobado' ? DEMO_USER_ID : null,
    reviewedAt: status === 'aprobado' ? iso(30) : null,
    uploadedBy: DEMO_USER_ID, createdAt: iso(60),
  });

  const contractorDocuments = [
    // Montajes del Norte: expediente completo, con la póliza por vencer (avisa
    // pero no bloquea) — así se ve que «avisar» y «bloquear» son distintos.
    cd('cd-01', 'sub-01', 'ct-rut',   null,       'aprobado'),
    cd('cd-02', 'sub-01', 'ct-const', null,       'aprobado'),
    cd('cd-03', 'sub-01', 'ct-vig',   dia(180),   'aprobado'),
    cd('cd-04', 'sub-01', 'ct-mut',   dia(200),   'aprobado'),
    cd('cd-05', 'sub-01', 'ct-f30',   dia(45),    'aprobado'),
    cd('cd-06', 'sub-01', 'ct-f301',  dia(40),    'aprobado'),
    cd('cd-07', 'sub-01', 'ct-pol',   dia(12),    'aprobado'),
    cd('cd-08', 'sub-01', 'ct-banco', null,       'aprobado'),

    // Terminaciones Pacífico: el F30-1 vencido y la póliza observada. No se le
    // puede firmar contrato hasta arreglarlo.
    cd('cd-11', 'sub-02', 'ct-rut',   null,      'aprobado'),
    cd('cd-12', 'sub-02', 'ct-const', null,      'aprobado'),
    cd('cd-13', 'sub-02', 'ct-vig',   dia(150),  'aprobado'),
    cd('cd-14', 'sub-02', 'ct-mut',   dia(90),   'aprobado'),
    cd('cd-15', 'sub-02', 'ct-f30',   dia(30),   'aprobado'),
    cd('cd-16', 'sub-02', 'ct-f301',  dia(-8),   'aprobado'),
    cd('cd-17', 'sub-02', 'ct-pol',   dia(120),  'observado', 'La póliza está a nombre de otra sociedad.'),
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

  /**
   * Las partidas llevan fechas PROGRAMADAS (`plannedStart/EndDate`): sin ellas
   * la curva S no tiene contra qué comparar el avance y la pantalla saldría
   * vacía. Se arman relativas a hoy para que el demo siempre esté "a mitad de
   * obra", en vez de quedar en el pasado a las pocas semanas.
   */
  const wi = (
    id: string, name: string, type: string, parentId: string | null, path: string,
    progress: number, quantity: number, unit: string, unitPrice: number,
    desdeDias?: number, hastaDias?: number,
  ) => ({
    id, name, type, parentId, path, progress, quantity, unit, unitPrice,
    plannedStartDate: desdeDias !== undefined ? dia(desdeDias) : null,
    plannedEndDate: hastaDias !== undefined ? dia(hastaDias) : null,
    tenantId: t, projectId: PROJECT_ID, status: 'in-progress', budgetId: null,
  });

  const workItems = [
    wi('wi-og', 'Obra Gruesa', 'phase', null, '01', 62, 0, 'gl', 0),
    wi('wi-fund', 'Fundaciones', 'task', 'wi-og', '01/01', 100, 120, 'm³', 95_000, -120, -75),
    wi('wi-radier', 'Radier e=10cm', 'task', 'wi-og', '01/02', 45, 80, 'm³', 78_000, -80, -30),
    wi('wi-albanileria', 'Albañilería', 'task', 'wi-og', '01/03', 30, 350, 'm²', 42_000, -35, 25),
    wi('wi-term', 'Terminaciones', 'phase', null, '02', 12, 0, 'gl', 0),
    wi('wi-pintura', 'Pintura interior', 'task', 'wi-term', '02/01', 10, 500, 'm²', 8_500, 10, 60),
    wi('wi-ceramica', 'Revestimiento cerámico', 'task', 'wi-term', '02/02', 15, 210, 'm²', 22_000, 20, 75),
  ];

  /**
   * Avances reales. Van deliberadamente POR DEBAJO de lo programado en
   * albañilería: así el demo muestra un SPI bajo 1, que es el caso interesante
   * — una curva perfecta no enseña nada.
   */
  const pl = (id: string, workItemId: string, daysAgo: number, quantity: number) =>
    ({ id, tenantId: t, workItemId, date: iso(daysAgo), quantity, userId: SUP_ID, userName: 'Pedro Jefe de Terreno' });

  const progressLogs = [
    pl('pl-01', 'wi-fund', 110, 45),
    pl('pl-02', 'wi-fund', 95, 45),
    pl('pl-03', 'wi-fund', 78, 30),
    pl('pl-04', 'wi-radier', 70, 20),
    pl('pl-05', 'wi-radier', 50, 16),
    pl('pl-06', 'wi-albanileria', 25, 60),
    pl('pl-07', 'wi-albanileria', 10, 45),
  ];


  /* ── Subcontratos, para probar el proceso de contratación ───────────── */

  const subcontracts = [
    {
      id: 'sc-01', tenantId: t, projectId: PROJECT_ID,
      supplierId: 'sub-01', supplierName: 'Montajes del Norte SpA',
      code: 'SC-001', name: 'Estructura metálica de cubierta',
      type: 'suma_alzada', currency: 'CLP', amountNet: 48_000_000,
      signDate: dia(-45), startDate: dia(-40), plazoDias: 90,
      advancePercent: 20, retentionPercent: 5, retentionCapPercent: null,
      multaMode: 'permil_contrato', multaValue: 2, taxPercent: 19,
      requiresLaborCompliance: true, status: 'vigente',
      notes: null, createdBy: DEMO_USER_ID, createdAt: iso(45),
    },
    {
      // En borrador y con el contratista bloqueado: el panel de aprobación
      // explica por qué no se puede mandar a firma.
      id: 'sc-02', tenantId: t, projectId: PROJECT_ID,
      supplierId: 'sub-02', supplierName: 'Terminaciones Pacífico Ltda.',
      code: 'SC-002', name: 'Revestimientos y pintura',
      type: 'precios_unitarios', currency: 'CLP', amountNet: 22_500_000,
      signDate: null, startDate: null, plazoDias: 60,
      advancePercent: 0, retentionPercent: 5, retentionCapPercent: null,
      multaMode: 'permil_contrato', multaValue: 2, taxPercent: 19,
      requiresLaborCompliance: true, status: 'borrador',
      notes: null, createdBy: DEMO_USER_ID, createdAt: iso(10),
    },
  ];

  const si = (id: string, subcontractId: string, name: string, unit: string, quantity: number, unitPrice: number, sortOrder: number, workItemId: string | null) =>
    ({ id, tenantId: t, subcontractId, workItemId, name, unit, quantity, unitPrice, sortOrder, createdAt: iso(45) });

  const subcontractItems = [
    si('si-01', 'sc-01', 'Fabricación de vigas y pilares', 'kg', 24_000, 1_450, 0, null),
    si('si-02', 'sc-01', 'Montaje en obra', 'kg', 24_000, 550, 1, null),
    si('si-03', 'sc-02', 'Pintura interior', 'm²', 500, 8_500, 0, 'wi-pintura'),
    si('si-04', 'sc-02', 'Revestimiento cerámico', 'm²', 210, 22_000, 1, 'wi-ceramica'),
  ];

  // Un estado de pago en borrador, listo para mandarlo por la cadena de firmas.
  const subcontractCertificates = [
    {
      id: 'sce-01', tenantId: t, subcontractId: 'sc-01', projectId: PROJECT_ID,
      number: 1, periodStart: dia(-35), periodEnd: dia(-5), status: 'borrador',
      retentionPercent: 5, advancePercent: 20, taxPercent: 19,
      periodAmount: 12_000_000, accumulatedAmount: 12_000_000,
      advanceAmortization: 2_400_000, retentionAmount: 600_000,
      // Los descuentos vienen de `certificateDeductions`, no de un número
      // suelto: 180.000 + 150.000 + 80.000 = 410.000.
      penaltyAmount: 0, otherDeductions: 410_000, otherDeductionsNote: null,
      netAmount: 8_590_000, taxAmount: 1_632_100, totalAmount: 10_222_100,
      f30Date: dia(-3), f30_1Date: dia(-3), invoiceNumber: null,
      notes: null, approvedAt: null, approvedBy: null, paidAt: null,
      createdBy: DEMO_USER_ID, createdAt: iso(4),
    },
  ];

  const subcontractCertificateLines = [
    {
      id: 'scl-01', tenantId: t, certificateId: 'sce-01', subcontractItemId: 'si-01',
      name: 'Fabricación de vigas y pilares', unit: 'kg', sortOrder: 0,
      quantityContract: 24_000, unitPrice: 1_450,
      previousQuantity: 0, periodQuantity: 8_275, accumulatedQuantity: 8_275,
      previousAmount: 0, periodAmount: 12_000_000, accumulatedAmount: 12_000_000,
      createdAt: iso(4),
    },
  ];

  /* ── Flujo de aprobación y delegación (migraciones 029 y 030) ────────── */

  // La cadena se siembra encendida para el estado de pago del subcontrato: es
  // el flujo de la pizarra y el que conviene ver funcionando de entrada.
  const approvalFlows = [
    { id: 'af-eepp', tenantId: t, documentType: 'subcontract_certificate', name: 'Estado de pago de subcontrato', active: true, notes: null, createdBy: DEMO_USER_ID, createdAt: iso(30) },
    { id: 'af-sc',   tenantId: t, documentType: 'subcontract',             name: 'Contrato de subcontrato',      active: true, notes: null, createdBy: DEMO_USER_ID, createdAt: iso(30) },
  ];

  const approvalFlowSteps = [
    { id: 'afs-1', tenantId: t, flowId: 'af-eepp', sortOrder: 0, name: 'Jefe de Terreno', approverRole: 'jefe-terreno', approverUserId: null, requiresSignature: true, createdAt: iso(30) },
    { id: 'afs-2', tenantId: t, flowId: 'af-eepp', sortOrder: 1, name: 'Administración', approverRole: 'admin', approverUserId: null, requiresSignature: true, createdAt: iso(30) },
    { id: 'afs-3', tenantId: t, flowId: 'af-sc',   sortOrder: 0, name: 'Jefe de Terreno', approverRole: 'jefe-terreno', approverUserId: null, requiresSignature: false, createdAt: iso(30) },
    { id: 'afs-4', tenantId: t, flowId: 'af-sc',   sortOrder: 1, name: 'Administración', approverRole: 'admin', approverUserId: null, requiresSignature: true, createdAt: iso(30) },
  ];

  // El usuario demo entra siempre como `admin`, así que sin esto solo podría
  // firmar el segundo paso y la cadena quedaría trabada en el primero. Pedro
  // (jefe de terreno) le delega su firma: se prueban las dos cosas de una vez,
  // y en el documento se lee «Usuario Demo, por Pedro Jefe de Terreno».
  const approvalDelegations = [
    {
      id: 'ad-01', tenantId: t, fromUserId: SUP_ID, toUserId: DEMO_USER_ID,
      documentType: null, startDate: dia(-7), endDate: dia(30),
      reason: 'Vacaciones de Pedro', active: true,
      createdBy: SUP_ID, createdAt: iso(7),
    },
  ];

  /* ── Licitación y firma del contrato (migración 032) ─────────────────── */

  // Tres ofertas para el subcontrato de estructura. La adjudicada NO es la más
  // barata: así se ve en pantalla el motivo escrito, que es el dato que la app
  // obliga a dejar y que en papel nunca queda.
  const subcontractQuotes = [
    {
      id: 'sq-01', tenantId: t, subcontractId: 'sc-01',
      supplierId: 'sub-01', supplierName: 'Montajes del Norte SpA',
      amountNet: 48_000_000, currency: 'CLP', plazoDias: 90,
      quoteDate: dia(-60), validUntil: dia(30),
      filePath: null, fileName: null, fileSize: null,
      notes: null, awarded: true,
      awardReason: 'Única con experiencia certificada en trabajo en altura y 20 días menos de plazo.',
      createdBy: DEMO_USER_ID, createdAt: iso(60),
    },
    {
      id: 'sq-02', tenantId: t, subcontractId: 'sc-01',
      supplierId: null, supplierName: 'Estructuras Elqui Ltda.',
      amountNet: 44_500_000, currency: 'CLP', plazoDias: 110,
      quoteDate: dia(-58), validUntil: dia(20),
      filePath: null, fileName: null, fileSize: null,
      notes: null, awarded: false, awardReason: null,
      createdBy: DEMO_USER_ID, createdAt: iso(58),
    },
    {
      id: 'sq-03', tenantId: t, subcontractId: 'sc-01',
      supplierId: null, supplierName: 'Maestranza Coquimbo SpA',
      amountNet: 52_300_000, currency: 'CLP', plazoDias: 85,
      quoteDate: dia(-57), validUntil: dia(-2), // validez vencida, a propósito
      filePath: null, fileName: null, fileSize: null,
      notes: null, awarded: false, awardReason: null,
      createdBy: DEMO_USER_ID, createdAt: iso(57),
    },
  ];

  const subcontractAttachments: any[] = [];

  // El contrato de estructura ya está firmado por las dos partes; el de
  // terminaciones no, porque su contratista tiene el F30-1 vencido.
  const documentSignatures = [
    {
      id: 'ds-01', tenantId: t, documentType: 'subcontract', documentId: 'sc-01',
      party: 'empresa', signerName: 'Usuario Demo', signerRut: '11.111.111-1',
      signerRole: 'Administrador de Obra', signedBy: DEMO_USER_ID,
      signature: null, documentHash: null,
      signedAt: iso(44), createdAt: iso(44),
    },
    {
      id: 'ds-02', tenantId: t, documentType: 'subcontract', documentId: 'sc-01',
      party: 'contraparte', signerName: 'Rodrigo Fuentes', signerRut: '10.111.222-3',
      signerRole: 'Representante legal', signedBy: null,
      signature: null, documentHash: null,
      signedAt: iso(44), createdAt: iso(44),
    },
  ];

  /* ── Adendas de subcontrato (migración 033) ──────────────────────────── */

  // Una aprobada (ya cambió el monto vigente) y una presentada sin resolver
  // (todavía NO lo cambia): la diferencia entre las dos es el punto del módulo.
  const amendments = [
    {
      id: 'am-01', tenantId: t, contractId: null, subcontractId: 'sc-01',
      projectId: PROJECT_ID, budgetId: null,
      number: 1, name: 'Refuerzo de pilares eje 4',
      type: 'aumento_obra', cause: 'error_proyecto',
      description: 'El cálculo original no consideraba la carga de la sala de máquinas.',
      amountNet: 3_200_000, currency: 'CLP', extraDays: 10,
      status: 'aprobado', reference: 'OC-2026-014',
      detectedAt: dia(-30), presentedAt: iso(28), approvedAt: iso(22),
      approvedBy: DEMO_USER_ID, rejectionReason: null, notes: null,
      createdBy: DEMO_USER_ID, createdAt: iso(30),
    },
    {
      id: 'am-02', tenantId: t, contractId: null, subcontractId: 'sc-01',
      projectId: PROJECT_ID, budgetId: null,
      number: 2, name: 'Ampliación de plazo por lluvias',
      type: 'aumento_plazo', cause: 'fuerza_mayor',
      description: 'Ocho días sin poder montar por viento sobre 60 km/h.',
      amountNet: 0, currency: 'CLP', extraDays: 8,
      status: 'presentado', reference: null,
      detectedAt: dia(-9), presentedAt: iso(6), approvedAt: null,
      approvedBy: null, rejectionReason: null, notes: null,
      createdBy: DEMO_USER_ID, createdAt: iso(7),
    },
  ];

  /* ── Descuentos tipificados del EEPP (migración 034) ─────────────────── */

  // Tres líneas en vez de un «otros descuentos: $410.000» sin explicación. El
  // neto del EEPP sembrado ya viene con estos descuentos restados.
  const certificateDeductions = [
    {
      id: 'cde-01', tenantId: t, certificateType: 'subcontract', certificateId: 'sce-01',
      kind: 'herramienta', description: 'Esmeril angular no devuelto',
      amount: 180_000, sourceType: null, sourceId: null,
      notes: null, createdBy: DEMO_USER_ID, createdAt: iso(3),
    },
    {
      id: 'cde-02', tenantId: t, certificateType: 'subcontract', certificateId: 'sce-01',
      kind: 'epp', description: 'Arneses y líneas de vida entregados en obra (6 un.)',
      amount: 150_000, sourceType: null, sourceId: null,
      notes: null, createdBy: DEMO_USER_ID, createdAt: iso(3),
    },
    {
      id: 'cde-03', tenantId: t, certificateType: 'subcontract', certificateId: 'sce-01',
      kind: 'servicios', description: 'Uso de grúa torre — 4 horas',
      amount: 80_000, sourceType: null, sourceId: null,
      notes: null, createdBy: DEMO_USER_ID, createdAt: iso(2),
    },
  ];

  /* ── Orden de Pago (migración 035) ───────────────────────────────────── */

  // El EEPP sembrado está en borrador, así que no lleva orden todavía: eso se
  // prueba aprobándolo y emitiéndola. Se deja el arreglo listo para que la
  // colección no venga indefinida.
  const paymentOrders: any[] = [];

  /* ── Equipos y maquinaria en arriendo (migración 036) ────────────────── */

  // Uno dentro de plazo y otro PASADO de su fecha, que es el caso que el
  // módulo viene a resolver: el equipo que sigue en obra costando sin que
  // nadie se acuerde de devolverlo.
  const equipmentRentals = [
    {
      id: 'eq-01', tenantId: t, projectId: PROJECT_ID,
      supplierId: null, supplierName: 'Arriendos Coquimbo Ltda.',
      name: 'Grúa torre Potain MDT 178', code: 'GT-01', category: 'grua',
      rateMode: 'mes', rate: 3_200_000, currency: 'CLP',
      hoursPerDay: null, minimumUnits: null,
      startDate: dia(-70), endDate: dia(20), returnedAt: null,
      workItemId: 'wi-albanileria', status: 'activo',
      notes: null, createdBy: DEMO_USER_ID, createdAt: iso(70),
    },
    {
      // Debía devolverse hace 12 días: son 12 días de andamios pagados de más.
      id: 'eq-02', tenantId: t, projectId: PROJECT_ID,
      supplierId: null, supplierName: 'Andamios del Norte',
      name: 'Andamios modulares (240 m²)', code: 'AND-240', category: 'andamio',
      rateMode: 'dia', rate: 85_000, currency: 'CLP',
      hoursPerDay: null, minimumUnits: null,
      startDate: dia(-55), endDate: dia(-12), returnedAt: null,
      workItemId: 'wi-albanileria', status: 'activo',
      notes: 'Se pidió retiro y no lo han venido a buscar.',
      createdBy: DEMO_USER_ID, createdAt: iso(55),
    },
    {
      id: 'eq-03', tenantId: t, projectId: PROJECT_ID,
      supplierId: null, supplierName: 'Arriendos Coquimbo Ltda.',
      name: 'Generador 60 kVA', code: 'GEN-03', category: 'generador',
      rateMode: 'semana', rate: 420_000, currency: 'CLP',
      hoursPerDay: null, minimumUnits: null,
      startDate: dia(-90), endDate: dia(-40), returnedAt: dia(-38),
      workItemId: 'wi-fund', status: 'devuelto',
      notes: null, createdBy: DEMO_USER_ID, createdAt: iso(90),
    },
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
    progressLogs,
    contractorDocumentTypes,
    contractorDocuments,
    subcontracts,
    subcontractItems,
    subcontractCertificates,
    subcontractCertificateLines,
    approvalFlows,
    approvalFlowSteps,
    approvalDelegations,
    subcontractQuotes,
    subcontractAttachments,
    documentSignatures,
    amendments,
    certificateDeductions,
    paymentOrders,
    equipmentRentals,
  };
}
