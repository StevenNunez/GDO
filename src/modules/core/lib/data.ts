
"use client";

export type UserRole = "admin" | "supervisor" | "worker" | "operations" | "apr" | "guardia" | "finance" | "super-admin" | "bodega-admin" | "cphs" | "jefe-terreno" | "quality" | "jefe-oficina-tecnica" | "soporte" | "subcontratista";

export interface Tenant {
  id: string;
  name: string;
  tenantId: string;
  createdAt: Date;
  plan?: 'basic' | 'pro' | 'enterprise';
  representanteLegal?: string;
  representanteRut?: string;
  representanteCargo?: string;
  representanteSignature?: string;
  /** Perfil de la empresa que se estampa en los PDF (migración 016). El logo
   *  es un data URL, igual que `representanteSignature`. */
  logo?: string | null;
  rut?: string | null;
  giro?: string | null;
  direccion?: string | null;
  comuna?: string | null;
  telefono?: string | null;
  email?: string | null;
  sitioWeb?: string | null;
}

/** Cliente/mandante de la constructora. Jerarquía: Empresa → Cliente → Obra. */
export interface Client {
  id: string;
  name: string;
  tenantId: string;
  createdAt: Date;
  rut?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
}

export interface Project {
  id: string;
  name: string;
  tenantId: string;
  createdAt: Date;
  address?: string;
  description?: string;
  isActive: boolean;
  /** Cliente dueño de la obra. `null` = "Sin asignar". */
  clientId?: string | null;
}

/** Una obra tiene el presupuesto principal y N adicionales (obras
 *  extraordinarias que pide el cliente). Cada uno con su propia EDT. */
export interface Budget {
  id: string;
  tenantId: string;
  /** Obra a la que pertenece. `null` = presupuesto sin obra asignada aún. */
  projectId: string | null;
  name: string;
  type: 'principal' | 'adicional';
  /** Cómo se le cobra al mandante. Se elige al crear el presupuesto. */
  contractType?: ContractType | null;
  status: 'draft' | 'approved' | 'rejected';
  createdAt: Date;
  approvedAt?: Date | null;
  notes?: string | null;
  /** % sobre (costo directo + gastos generales). */
  contingencyPercent?: number;
  /** % sobre (costo directo + GG + imprevistos). */
  profitPercent?: number;
  /** IVA sobre el neto. 19 en Chile. */
  taxPercent?: number;
}

/* ── Oficina Técnica ──────────────────────────────────────────────────── */

/**
 * Cómo se le cobra al mandante. Se elige al crear el presupuesto de la obra
 * porque determina el cálculo del estado de pago:
 *  · suma_alzada             → % de avance × valor de la partida
 *  · precios_unitarios       → cantidad realmente ejecutada × PU de contrato
 *  · administracion_delegada → costo real del período + honorario %
 */
export type ContractType = 'suma_alzada' | 'precios_unitarios' | 'administracion_delegada';

/**
 * Ficha contractual de la obra. De acá salen el anticipo a amortizar, la
 * retención, el plazo contra el que se miden las multas y la base del reajuste:
 * sin contrato no se puede emitir un estado de pago.
 *
 * Los porcentajes son de cada contrato, no de la ley: todos configurables.
 */
export interface Contract {
  id: string;
  tenantId: string;
  projectId: string | null;
  /** Presupuesto que le sirve de línea base. */
  budgetId: string | null;
  code?: string | null;
  name: string;
  type: ContractType;
  currency: 'CLP' | 'UF';
  amountNet: number;
  /** Honorario sobre el costo real. Solo administración delegada. */
  feePercent: number;
  signDate?: Date | null;
  startDate?: Date | null;
  plazoDias?: number | null;
  /** Se amortiza proporcional al avance cobrado. */
  advancePercent: number;
  retentionPercent: number;
  /** Tope acumulado de retención, como % del contrato. `null` = sin tope. */
  retentionCapPercent?: number | null;
  /** `permil_contrato`: ‰ del contrato por día · `monto_fijo`: monto por día. */
  multaMode: 'permil_contrato' | 'monto_fijo';
  multaValue: number;
  reajusteType: 'none' | 'ipc' | 'uf' | 'polinomico';
  reajusteBaseDate?: Date | null;
  taxPercent: number;
  status: 'draft' | 'active' | 'suspended' | 'finished' | 'closed';
  notes?: string | null;
  createdAt: Date;
}

/**
 * Boleta de garantía o póliza. `status` solo guarda estados que alguien decide;
 * "por vencer" y "vencida" se derivan de `expiryDate` en `contract.ts` para que
 * no queden filas diciendo "vigente" meses después del vencimiento.
 */
export interface Guarantee {
  id: string;
  tenantId: string;
  contractId: string;
  type: 'fiel_cumplimiento' | 'anticipo' | 'buena_ejecucion' | 'seriedad_oferta' | 'otra';
  instrument: 'boleta_bancaria' | 'poliza' | 'retencion' | 'otro';
  bank?: string | null;
  number?: string | null;
  amount: number;
  currency: 'CLP' | 'UF';
  issueDate?: Date | null;
  expiryDate?: Date | null;
  status: 'vigente' | 'devuelta' | 'cobrada' | 'anulada';
  notes?: string | null;
  createdAt: Date;
}

/**
 * Estado de pago al MANDANTE. Los de subcontrato son `SubcontractCertificate`.
 *
 * Los montos se guardan, no se recalculan: un EEPP aprobado es un documento que
 * ya se cobró, y editar el precio de una partida en marzo no puede cambiar lo
 * que decía el estado de pago de enero. Un trigger en la base lo congela.
 */
export interface PaymentCertificate {
  id: string;
  tenantId: string;
  contractId: string;
  projectId: string | null;
  /** Correlativo dentro del contrato: "EEPP N° 3". */
  number: number;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  status: 'borrador' | 'presentado' | 'aprobado' | 'rechazado' | 'facturado' | 'pagado';

  /** Fotografía del contrato al emitir, para que el documento se explique solo. */
  contractType: ContractType;
  retentionPercent: number;
  advancePercent: number;
  taxPercent: number;

  periodAmount: number;
  accumulatedAmount: number;
  reajusteAmount: number;
  /** Solo administración delegada: costo real del período y su honorario. */
  realCostAmount: number;
  feeAmount: number;

  advanceAmortization: number;
  retentionAmount: number;
  penaltyAmount: number;
  otherDeductions: number;
  otherDeductionsNote?: string | null;

  netAmount: number;
  taxAmount: number;
  totalAmount: number;

  notes?: string | null;
  rejectionReason?: string | null;
  invoiceNumber?: string | null;

  presentedAt?: Date | null;
  approvedAt?: Date | null;
  approvedBy?: string | null;
  invoicedAt?: Date | null;
  paidAt?: Date | null;
  createdBy?: string | null;
  createdAt: Date;
}

/** Detalle por partida de un estado de pago. Congelado al salir de borrador. */
export interface PaymentCertificateLine {
  id: string;
  tenantId: string;
  certificateId: string;
  /** Referencia a la partida; el nombre y el precio se copian por si se borra. */
  workItemId: string | null;
  name: string;
  unit?: string | null;
  sortOrder: number;
  quantityContract: number;
  unitPrice: number;
  previousQuantity: number;
  periodQuantity: number;
  accumulatedQuantity: number;
  previousAmount: number;
  periodAmount: number;
  accumulatedAmount: number;
  createdAt: Date;
}

/**
 * Qué clase de modificación al contrato es:
 *  · aumento_obra        → más cantidad de partidas que YA están contratadas
 *  · obra_extraordinaria → obra que no estaba en ninguna partida del contrato
 *  · disminucion_obra    → obra contratada que se deja de ejecutar (resta)
 *  · aumento_plazo       → solo días, sin plata
 */
export type AmendmentType =
  | 'aumento_obra'
  | 'obra_extraordinaria'
  | 'disminucion_obra'
  | 'aumento_plazo';

/** Por qué se originó el adicional. Decide quién lo paga. */
export type AmendmentCause =
  | 'modificacion_proyecto'
  | 'error_proyecto'
  | 'solicitud_mandante'
  | 'imprevisto_terreno'
  | 'fuerza_mayor'
  | 'otra';

export type AmendmentStatus =
  | 'borrador'
  | 'presentado'
  | 'aprobado'
  | 'rechazado'
  | 'anulado';

/**
 * Adicional / obra extraordinaria: una modificación al contrato con su propio
 * trámite. Solo los **aprobados** cambian el monto y el plazo vigentes (ver
 * `src/lib/amendment.ts`); el resto es expectativa.
 *
 * `amountNet` se guarda siempre POSITIVO: que una disminución reste lo decide
 * `type`, no el signo escrito a mano.
 *
 * `budgetId` apunta al presupuesto de tipo `adicional` que lo valoriza, cuando
 * se cotizó por partidas. Al aprobarse, esas partidas quedan disponibles para
 * cobrarse en los estados de pago siguientes.
 */
export interface Amendment {
  id: string;
  tenantId: string;
  contractId: string;
  projectId: string | null;
  budgetId: string | null;
  /** Correlativo dentro del contrato: "Adicional N° 3". */
  number: number;
  name: string;
  type: AmendmentType;
  cause: AmendmentCause;
  description?: string | null;
  /** Magnitud, siempre positiva. 0 en un aumento de plazo puro. */
  amountNet: number;
  currency: 'CLP' | 'UF';
  /** Días que se agregan al plazo contractual. */
  extraDays: number;
  status: AmendmentStatus;
  /** N° de orden de cambio, carta o resolución del mandante. */
  reference?: string | null;
  detectedAt?: Date | null;
  presentedAt?: Date | null;
  approvedAt?: Date | null;
  approvedBy?: string | null;
  rejectionReason?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: Date;
}

/* ── Control documental y RDI ─────────────────────────────────────────── */

/** Especialidad del proyecto a la que pertenece un plano o una consulta. */
export type Discipline =
  | 'general'
  | 'arquitectura'
  | 'estructura'
  | 'sanitario'
  | 'electrico'
  | 'clima'
  | 'gas'
  | 'urbanizacion'
  | 'otro';

/**
 * Documento de la obra: un plano, una especificación técnica o una memoria.
 * El archivo NO vive acá — vive en cada revisión, porque lo que cambia es la
 * revisión. Se llama `ProjectDocument` y no `Document` para no chocar con el
 * `Document` del navegador.
 */
export interface ProjectDocument {
  id: string;
  tenantId: string;
  projectId: string | null;
  /** Código del proyectista: "A-01", "E-14". Único dentro de la obra. */
  code?: string | null;
  name: string;
  type: 'plano' | 'especificacion' | 'memoria' | 'otro';
  discipline: Discipline;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: Date;
}

/**
 * Una revisión del documento. Cuál está **vigente** no se guarda: se deduce en
 * `src/lib/documents.ts` de la fecha de emisión, para que no puedan quedar dos
 * marcadas como vigentes al mismo tiempo.
 */
export interface DocumentRevision {
  id: string;
  tenantId: string;
  documentId: string;
  /** 'A', 'B', '0', '1'… tal como la nombra el proyectista. */
  revision: string;
  issueDate?: Date | null;
  receivedAt?: Date | null;
  /** Ruta dentro del bucket `obra-docs`. `null` = revisión anunciada sin archivo. */
  filePath?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  status: 'activa' | 'anulada';
  notes?: string | null;
  uploadedBy?: string | null;
  createdAt: Date;
}

export type RdiStatus = 'abierta' | 'respondida' | 'cerrada' | 'anulada';

/**
 * Requerimiento de Información: la consulta formal al mandante o al
 * proyectista, con plazo de respuesta. Una RDI sin responder es la prueba de
 * por qué una partida se atrasó, y su respuesta es lo que justifica un
 * adicional — por eso puede quedar enlazada al `Amendment` que la origina.
 *
 * "Vencida" no se guarda: se deriva de `dueDate` en `src/lib/rdi.ts`.
 */
export interface Rdi {
  id: string;
  tenantId: string;
  projectId: string | null;
  contractId?: string | null;
  workItemId?: string | null;
  amendmentId?: string | null;
  documentId?: string | null;
  /** Correlativo dentro de la obra: "RDI N° 12". */
  number: number;
  subject: string;
  question: string;
  discipline: Discipline;
  priority: 'baja' | 'normal' | 'alta';
  /** A quién se pregunta. Texto libre: suele ser alguien sin cuenta en la app. */
  askedTo?: string | null;
  askedAt?: Date | null;
  dueDate?: Date | null;
  status: RdiStatus;
  answer?: string | null;
  answeredAt?: Date | null;
  answeredBy?: string | null;
  /** Lo declara quien responde: si la respuesta trae obra o plazo extra. */
  impactCost: boolean;
  impactTime: boolean;
  filePath?: string | null;
  fileName?: string | null;
  answerFilePath?: string | null;
  answerFileName?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: Date;
}

/* ── Programación (Last Planner) ──────────────────────────────────────── */

/**
 * Causa de No Cumplimiento: por qué no se hizo lo que se había comprometido.
 * Es la lista clásica del Last Planner; se ordena en un Pareto para atacar lo
 * que más se repite.
 */
export type NonComplianceCause =
  | 'materiales'
  | 'mano_obra'
  | 'equipos'
  | 'informacion'
  | 'cancha'
  | 'subcontrato'
  | 'clima'
  | 'cambio_mandante'
  | 'mala_programacion'
  | 'otra';

export type TaskConstraintType =
  | 'materiales'
  | 'mano_obra'
  | 'equipos'
  | 'informacion'
  | 'cancha'
  | 'permisos'
  | 'subcontrato'
  | 'seguridad'
  | 'otra';

/**
 * Tarea de programación. Es **una sola tabla** para el lookahead y el programa
 * semanal: lo que cambia es la semana asignada (`weekStart`, siempre un lunes)
 * y el estado. Copiar la tarea de una tabla a otra las desincroniza al primer
 * cambio.
 */
export interface LookaheadTask {
  id: string;
  tenantId: string;
  projectId: string | null;
  /** Partida de la EDT que avanza con esta tarea. No todas lo tienen. */
  workItemId?: string | null;
  name: string;
  responsibleId?: string | null;
  /** Texto libre: el responsable puede ser un subcontratista sin cuenta. */
  responsibleName?: string | null;
  /** Lunes de la semana a la que está asignada. */
  weekStart: Date | string;
  unit?: string | null;
  quantityPlanned: number;
  quantityDone: number;
  status: 'planificada' | 'comprometida' | 'cumplida' | 'no_cumplida' | 'anulada';
  causeCode?: NonComplianceCause | null;
  causeNote?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: Date;
}

/**
 * Lo que impide ejecutar una tarea. Sin responsable y fecha no se levanta
 * nunca; "vencida" se deriva de `dueDate`, no se guarda.
 */
export interface TaskConstraint {
  id: string;
  tenantId: string;
  taskId: string;
  /** RDI con que se pidió la información que falta (Fase 5). */
  rdiId?: string | null;
  type: TaskConstraintType;
  description: string;
  responsibleName?: string | null;
  dueDate?: Date | null;
  status: 'pendiente' | 'liberada' | 'anulada';
  releasedAt?: Date | null;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: Date;
}

/* ── Subcontratos y recepción de obra ─────────────────────────────────── */

/**
 * Vínculo entre dos empresas que usan la app: la que contrata y la que ejecuta.
 *
 * NO copia datos. Da acceso a los subcontratos donde una es la contraparte
 * declarada de la otra, y la base lo verifica en cada consulta (migración 027).
 * Si se revoca, el acceso se corta en el acto.
 */
export interface CompanyLink {
  id: string;
  /** Empresa que invita: normalmente la que contrata. */
  requesterTenantId: string;
  requesterName?: string | null;
  /** Empresa que acepta. `null` mientras la invitación no se usa. */
  addresseeTenantId?: string | null;
  addresseeName?: string | null;
  /** Código corto que se pasa por fuera de la app (WhatsApp, teléfono). */
  code: string;
  inviteNote?: string | null;
  status: 'pendiente' | 'aceptado' | 'rechazado' | 'revocado';
  respondedAt?: Date | null;
  createdBy?: string | null;
  createdAt: Date;
}

/**
 * Contrato con un subcontratista. Es el espejo de `Contract`: la obra le cobra
 * al mandante y le paga a sus subcontratos con el mismo mecanismo (anticipo,
 * retención, multas). El cálculo se comparte — `src/lib/contract.ts` y
 * `src/lib/payment-certificate.ts` sirven para los dos.
 */
export interface Subcontract {
  id: string;
  tenantId: string;
  projectId: string | null;
  /** Proveedor ya cargado, si existe su ficha. */
  supplierId?: string | null;
  supplierName?: string | null;
  code?: string | null;
  name: string;
  type: ContractType;
  currency: 'CLP' | 'UF';
  amountNet: number;
  signDate?: Date | null;
  startDate?: Date | null;
  plazoDias?: number | null;
  advancePercent: number;
  retentionPercent: number;
  retentionCapPercent?: number | null;
  multaMode: 'permil_contrato' | 'monto_fijo';
  multaValue: number;
  taxPercent: number;
  /**
   * Exige F30-1 antes de pagar (Ley 20.123). Viene encendido: la empresa
   * responde subsidiariamente por las deudas laborales del subcontratista.
   */
  requiresLaborCompliance: boolean;
  /**
   * Usuario del subcontratista con acceso al portal. Ve y prepara SOLO este
   * subcontrato: el acceso es por fila, no por permiso (migración 026).
   */
  contactUserId?: string | null;
  /**
   * Empresa del subcontratista cuando trabaja con SU propia cuenta. Necesita un
   * vínculo aceptado (`CompanyLink`) para que ese acceso exista.
   */
  counterpartTenantId?: string | null;
  status: 'borrador' | 'vigente' | 'suspendido' | 'terminado' | 'liquidado';
  notes?: string | null;
  createdBy?: string | null;
  createdAt: Date;
}

/**
 * Partida del subcontrato, con SU precio. No es el que se le cobra al
 * mandante; `workItemId` enlaza con la partida de la EDT cuando corresponde, y
 * ese enlace permite comparar por partida lo que se cobra contra lo que se paga.
 */
export interface SubcontractItem {
  id: string;
  tenantId: string;
  subcontractId: string;
  workItemId?: string | null;
  name: string;
  unit?: string | null;
  quantity: number;
  unitPrice: number;
  sortOrder: number;
  createdAt: Date;
}

/**
 * Estado de pago de un subcontrato. Los montos se guardan, no se recalculan
 * (un trigger los congela al aprobar), y `f30_1Date` es la fecha del
 * certificado de cumplimiento laboral: sin ella la base rechaza marcarlo pagado.
 */
export interface SubcontractCertificate {
  id: string;
  tenantId: string;
  subcontractId: string;
  projectId: string | null;
  number: number;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  /** borrador → presentado (lo entrega el subcontratista) → aprobado → pagado. */
  status: 'borrador' | 'presentado' | 'aprobado' | 'pagado' | 'rechazado';

  retentionPercent: number;
  advancePercent: number;
  taxPercent: number;

  periodAmount: number;
  accumulatedAmount: number;
  advanceAmortization: number;
  retentionAmount: number;
  penaltyAmount: number;
  otherDeductions: number;
  otherDeductionsNote?: string | null;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;

  /** Fechas de los certificados recibidos, no un "sí/no": uno viejo no acredita. */
  f30Date?: Date | null;
  f30_1Date?: Date | null;
  invoiceNumber?: string | null;

  notes?: string | null;
  approvedAt?: Date | null;
  approvedBy?: string | null;
  paidAt?: Date | null;
  createdBy?: string | null;
  createdAt: Date;
}

export interface SubcontractCertificateLine {
  id: string;
  tenantId: string;
  certificateId: string;
  subcontractItemId?: string | null;
  name: string;
  unit?: string | null;
  sortOrder: number;
  quantityContract: number;
  unitPrice: number;
  previousQuantity: number;
  periodQuantity: number;
  accumulatedQuantity: number;
  previousAmount: number;
  periodAmount: number;
  accumulatedAmount: number;
  createdAt: Date;
}

/**
 * Recepción de obra, provisoria o definitiva. Es de la obra completa
 * (`contractId`) o de un subcontrato (`subcontractId`), nunca de ambos: si no,
 * no se sabría a quién se le devuelve la retención.
 */
export interface Reception {
  id: string;
  tenantId: string;
  projectId: string | null;
  contractId?: string | null;
  subcontractId?: string | null;
  type: 'provisoria' | 'definitiva';
  receptionDate?: Date | null;
  receivedBy?: string | null;
  status: 'borrador' | 'con_observaciones' | 'aceptada' | 'rechazada';
  /** Retención que se devuelve con esta recepción. */
  retentionReleased: number;
  /** Plazo de garantía que empieza con la recepción provisoria. */
  warrantyDays?: number | null;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: Date;
}

/** Observación de la recepción (punch list): un defecto con dueño y plazo. */
export interface ReceptionObservation {
  id: string;
  tenantId: string;
  receptionId: string;
  workItemId?: string | null;
  description: string;
  location?: string | null;
  responsibleName?: string | null;
  dueDate?: Date | null;
  severity: 'menor' | 'mayor' | 'critica';
  status: 'pendiente' | 'subsanada' | 'aceptada' | 'anulada';
  /** Foto en el bucket `obra-docs` (migración 023), no base64. */
  photoPath?: string | null;
  photoName?: string | null;
  resolvedAt?: Date | null;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: Date;
}

/** UF, UTM o IPC a una fecha. Dato público y compartido: no lleva tenantId. */
export interface MarketIndex {
  id: string;
  date: Date;
  type: 'uf' | 'utm' | 'ipc';
  value: number;
  createdAt: Date;
}

/** Recurso del catálogo: material, mano de obra (HH) o equipo (HM). */
export interface Resource {
  id: string;
  tenantId: string;
  name: string;
  type: 'material' | 'labor' | 'equipment' | 'other';
  unit: string;
  unitPrice: number;
  code?: string | null;
  notes?: string | null;
  isActive: boolean;
  createdAt: Date;
}

/** Análisis de Precio Unitario. `isTemplate` = está en la biblioteca de la
 *  empresa; con `workItemId` = es el APU concreto de una partida. */
export interface Apu {
  id: string;
  tenantId: string;
  name: string;
  unit: string;
  isTemplate: boolean;
  workItemId?: string | null;
  sourceApuId?: string | null;
  code?: string | null;
  notes?: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface ApuItem {
  id: string;
  tenantId: string;
  apuId: string;
  resourceId?: string | null;
  name: string;
  kind: 'material' | 'labor' | 'equipment' | 'other';
  unit: string;
  /** 'quantity' = rendimiento × precio · 'percent' = % del subtotal de `percentOf`. */
  calcMode: 'quantity' | 'percent';
  quantity: number;
  unitPrice: number;
  percentValue?: number | null;
  percentOf?: 'material' | 'labor' | 'equipment' | 'direct' | null;
  sortOrder: number;
  createdAt: Date;
}

/** Línea de gastos generales de un presupuesto: monto fijo o % del costo directo. */
export interface BudgetOverhead {
  id: string;
  tenantId: string;
  budgetId: string;
  name: string;
  mode: 'amount' | 'percent';
  amount: number;
  percent: number;
  sortOrder: number;
  createdAt: Date;
}

export interface SubscriptionPlan {
  plan: 'basic' | 'pro' | 'enterprise';
  features: {
    basic: boolean;
    pro: boolean;
    enterprise: boolean;
  },
  maxUsers?: number;
  maxRequests?: number;
  storageLimitMB?: number;
  expiresAt?: Date;
  allowedPermissions?: string[];
}

export interface User {
  id: string; // Corresponds to Firebase Auth UID
  name: string;
  email: string;
  role: UserRole;
  qrCode: string;
  tenantId: string; // ID of the company/tenant they belong to
  rut?: string;
  cargo?: string;
  phone?: string;
  fechaIngreso?: Date | null;
  baseSalary?: number; // Sueldo base
  afp?: string;
  tipoSalud?: 'Fonasa' | 'Isapre';
  cargasFamiliares?: number;
  signature?: string; // Data URL of the user's signature
  assignedProjectIds?: string[]; // Projects the user has access to
}

export interface Unit {
  id: string;
  name: string;
}

export interface Tool {
  id: string;
  name: string;
  qrCode: string;
  status: 'available' | 'in-use' | 'maintenance';
  projectId: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  invoiceNumber?: string;
  purchaseDate?: string;
  notes?: string;
  createdAt?: Date | string;
}

export interface MaterialCategory {
  id: string;
  name: string;
}

export interface Material {
  id: string;
  name: string;
  stock: number;
  unit: string;
  category: string;
  projectId: string; // Material is specific to a project/obra
  supplierId?: string | null; // Preferred supplier
  archived?: boolean;
}

export interface MaterialRequest {
  id: string;
  items: {
    materialId: string;
    quantity: number;
  }[];
  area: string;
  supervisorId: string;
  status: "pending" | "approved" | "rejected";
  createdAt: Date;
  userName?: string;
  approvalDate?: Date;
  rejectionDate?: Date;
  deliveryDate?: Date;
  approverId?: string;
  approverName?: string;
  notes?: string;
  tenantId: string;
  projectId: string; // Request belongs to a project
}

export interface ReturnRequest {
  id: string;
  supervisorId: string;
  supervisorName: string;
  materialId: string;
  materialName: string;
  quantity: number;
  unit: string;
  status: 'pending' | 'completed' | 'rejected';
  createdAt: Date;
  completionDate?: Date;
  notes?: string;
  handlerId?: string; // ID of the admin who handled it
  handlerName?: string;
  tenantId: string;
  projectId: string;
}

export type PurchaseRequestStatus = "pending" | "approved" | "rejected" | "received" | "ordered" | "batched";

export interface PurchaseRequest {
  id: string;
  materialName: string;
  quantity: number;
  originalQuantity?: number | null;
  unit: string;
  justification: string;
  supervisorId: string;
  status: PurchaseRequestStatus;
  createdAt: Date;
  receivedAt?: Date | null;
  category: string;
  area: string;
  phase?: string; // e.g., "Obra Gruesa"
  activity?: string; // e.g., "Hormigonado"
  workItemId?: string; // Links to a specific workItem (partida)
  lotId?: string | null;
  notes?: string | null;
  approverId?: string | null;
  approvalDate?: Date | null;
  requesterName?: string;
  approverName?: string;
  tenantId: string;
  projectId: string; // Purchase request belongs to a project
  purchaseOrderId?: string;
  rejectionReason?: string;
  rejectionDate?: Date;
}

export interface ToolLog {
  id: string;
  toolId: string;
  toolName: string;
  userId: string;
  userName: string;
  checkoutDate: Date;
  returnDate: Date | null;
  checkoutSupervisorId: string;
  checkoutSupervisorName: string;
  returnSupervisorId?: string;
  returnSupervisorName?: string;
  returnStatus?: 'ok' | 'damaged' | null;
  returnNotes?: string;
}

export interface AttendanceLog {
  id: string;
  userId: string;
  userName: string;
  timestamp: Date;
  type: 'in' | 'out';
  method: 'qr' | 'manual';
  registrarId: string;
  registrarName: string;
  date: string; // YYYY-MM-DD for easy querying
  originalTimestamp?: Date | null;
  modifiedAt?: Date | null;
  modifiedBy?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface Supplier {
  id: string;
  name: string;
  categories: string[];
  rut?: string;
  bank?: string;
  accountType?: string;
  accountNumber?: string;
  email?: string;
  address?: string;
  phone?: string;
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  createdAt: Date;
  creatorId: string;
  creatorName: string;
  status: 'generated' | 'sent' | 'completed' | 'cancelled' | 'issued';
  requestIds?: string[];
  items: { id: string; name: string; unit: string; totalQuantity: number; price?: number; }[];
  lotId?: string | null;
  pdfUrl?: string;
  officialOCId?: string; // ID for the final, confirmed OC
  processedAt?: Date;
  processedBy?: string;
  totalAmount?: number;
  tenantId: string;
  /** Obra a la que se imputa el gasto. Necesario para el control por cliente. */
  projectId?: string | null;
  /** Partida o fase de la EDT a la que se imputa. `null` = sin imputar. */
  workItemId?: string | null;
}

export interface StockMovement {
  id: string;
  materialId: string;
  materialName: string;
  quantityChange: number; // Positive for entry, negative for exit
  newStock: number;
  type: 'manual-entry' | 'initial' | 'request-delivery' | 'return-reentry' | 'adjustment';
  date: Date;
  justification: string;
  userId: string; // User who performed the action
  userName: string;
  relatedRequestId?: string;
  projectId: string; // Movement is specific to a project
  tenantId: string;
  workItemId?: string;
  phase?: string;
  activity?: string;
}

export interface PurchaseLot {
  id: string;
  name: string;
  createdAt: Date;
  creatorId: string;
  creatorName: string;
  status: 'open' | 'ordered';
  supplierId: string;
}

export interface ChecklistTemplate {
  id: string;
  title: string;
  items: Pick<ChecklistItem, 'element'>[];
  createdBy: string;
  createdAt: Date;
}

export interface AssignedSafetyTask {
  id: string;
  templateId: string;
  templateTitle: string;
  supervisorId: string;
  assignerId: string;
  assignerName: string;
  createdAt: Date;
  status: 'assigned' | 'completed' | 'approved' | 'rejected';
  area: string;
  items?: any[];
  observations?: string;
  evidencePhotos?: string[];
  performedBy?: any;
  completedAt?: Date;
  reviewedBy?: {
    signature: string;
    date: Date;
    name: string;
  };
  rejectionNotes?: string;
}

export interface BehaviorObservation {
  id: string;
  obra: string;
  workerId: string;
  workerName: string;
  workerRut: string;
  observationDate: Date;
  items: BehaviorObservationItem[];
  riskLevel: 'aceptable' | 'leve' | 'grave' | 'gravisimo' | null;
  feedback: string;
  observerSignature: string;
  workerSignature: string;
  observerId: string;
  observerName: string;
  createdAt: Date;
  evidencePhoto?: string;
}

export interface BehaviorObservationItem {
  question: string;
  status: 'si' | 'no' | 'na' | null;
}

export interface ChecklistItem {
  element: string;
  yes: boolean;
  no: boolean;
  na: boolean;
  responsibleUserId: string;
  completionDate: Date | null;
}

export interface SafetyInspection {
  id: string;
  inspectorId: string;
  inspectorName: string;
  inspectorRole: UserRole;
  date: Date;
  area: string;
  location?: string;
  description: string;
  riskLevel: 'leve' | 'grave' | 'fatal';
  actionPlan?: string;
  evidencePhotoUrl?: string;
  evidencePhotos?: string[];
  assignedTo: string;
  deadline?: Date;
  status: 'open' | 'in-progress' | 'completed' | 'approved' | 'rejected';
  completionNotes?: string;
  completionExecutor?: string;
  completionPhotos?: string[];
  completedAt?: Date;
  completionSignature?: string;
  reviewedBy?: {
    id: string;
    name: string;
    signature: string;
    date: Date;
  };
  rejectionNotes?: string;
}

export interface SupplierPayment {
  id: string;
  supplierId: string;
  invoiceNumber: string;
  amount: number;
  issueDate: Date;
  dueDate: Date;
  status: 'pending' | 'paid' | 'overdue';
  createdAt?: Date;
  purchaseOrderNumber?: string;
  work?: string; // Obra (texto libre heredado; usar projectId para imputar)
  /** Obra a la que se imputa la factura. Necesario para el control por cliente. */
  projectId?: string | null;
  /** Partida o fase de la EDT a la que se imputa. `null` = sin imputar. */
  workItemId?: string | null;
  paymentDate?: Date;
  paymentMethod?: string;
  pdfURL?: string;
}

export interface SalaryAdvance {
  id: string;
  workerId: string;
  workerName: string;
  amount: number;
  requestedAt: Date;
  status: 'pending' | 'approved' | 'rejected';
  processedAt?: Date;
  approverId?: string;
  approverName?: string;
  rejectionReason?: string;
  tenantId: string;
}

export interface DailyTalk {
  id: string;
  tenantId: string;
  obra: string;
  fecha: Date;
  expositorId: string;
  expositorName: string;
  temas: string;
  asistentes: {
    id: string;
    name: string;
    rut?: string;
    signed: boolean;
    signedAt: Date | null;
    signature?: string | null;
  }[];
  firma: string; // dataURL
  foto?: string; // dataURL
  createdAt: Date;
}


export interface WorkItem {
  id: string;
  tenantId: string;
  projectId: string;
  /** Presupuesto al que pertenece la partida (principal o un adicional). */
  budgetId?: string | null;
  name: string;
  type: 'project' | 'phase' | 'subphase' | 'activity' | 'task';
  status: 'in-progress' | 'pending-quality-review' | 'completed' | 'rejected';
  parentId: string | null;
  path: string;
  progress: number;
  plannedStartDate?: Date | null;
  plannedEndDate?: Date | null;
  actualStartDate?: Date | null;
  actualEndDate?: Date | null;
  unit: string;
  quantity: number;
  /** Precio de VENTA unitario: lo que se le cobra al mandante. */
  unitPrice: number;
  /** Costo interno objetivo por unidad. `null` = usar el que arroje el APU. */
  targetUnitCost?: number | null;
  assignedTo?: string | null;
  createdBy?: string;
  rejectionReason?: string | null;
}

export type BitacoraWeather = 'soleado' | 'nublado' | 'lluvia' | 'viento' | 'heladas';

export interface BitacoraEntry {
  id: string;
  tenantId: string;
  projectId?: string | null;
  date: Date;
  weather: BitacoraWeather;
  workerCount: number;
  workPerformed: string;
  equipment?: string;
  incidents?: string;
  observations?: string;
  authorId: string;
  authorName: string;
  createdAt: Date;
}

export interface ProgressLog {
  id: string;
  tenantId: string;
  workItemId: string;
  date: Date;
  quantity: number;
  userId: string;
  userName: string;
  observations?: string;
  photoUrl?: string;
}


// This is a client-side only type, not stored in DB
export interface Checklist {
  id: string;
  title: string;
  items: {
    element: string;
    checked: boolean;
  }[];
  createdBy: string;
}

export type AsientoTipo =
  | 'inicio-obra'
  | 'entrega-terreno'
  | 'orden-trabajo'
  | 'modificacion-proyecto'
  | 'observacion-ito'
  | 'respuesta-constructor'
  | 'avance'
  | 'incidente'
  | 'paralizacion'
  | 'reanudacion'
  | 'termino-obra';

export interface LibroObra {
  id: string;
  tenantId: string;
  projectId?: string | null;
  nombreProyecto: string;
  direccionObra: string;
  comunaObra: string;
  numeroPermiso: string;
  fechaPermiso?: Date | null;
  nombrePropietario: string;
  rutPropietario: string;
  nombreArquitecto: string;
  rutArquitecto: string;
  nombreCalculista?: string;
  rutCalculista?: string;
  nombreConstructor: string;
  rutConstructor: string;
  nombreITO?: string;
  rutITO?: string;
  nombreRevisorIndependiente?: string;
  rutRevisorIndependiente?: string;
  fechaInicioObra?: Date | null;
  fechaEntregaTerreno?: Date | null;
  estado: 'vigente' | 'cerrado';
  createdAt: Date;
  createdBy: string;
}

export interface LibroObraAsiento {
  id: string;
  libroId: string;
  tenantId: string;
  numero: number;
  fecha: Date;
  tipo: AsientoTipo;
  contenido: string;
  autorId: string;
  autorNombre: string;
  autorRol: string;
  firmado: boolean;
  firmaDigital?: string | null;
  firmadoAt?: Date | null;
  createdAt: Date;
}

export const WORK_SCHEDULE = {
  weekdays: {
    start: '08:00',
    end: '18:00',
  },
  friday: {
    start: '08:00',
    end: '17:00',
  },
  saturday: {
    start: '08:00',
    end: '13:00',
  },
  lunchBreak: {
    start: '13:00',
    end: '14:00',
  },
};
