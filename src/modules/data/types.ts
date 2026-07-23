

import {
  User,
  Client,
  Budget,
  Resource,
  Apu,
  ApuItem,
  BudgetOverhead,
  Material,
  Tool,
  ToolLog,
  MaterialRequest,
  ReturnRequest,
  PurchaseRequest,
  Supplier,
  MaterialCategory,
  Unit,
  PurchaseLot,
  PurchaseOrder,
  SupplierPayment,
  SalaryAdvance,
  AttendanceLog,
  AssignedSafetyTask,
  SafetyInspection,
  ChecklistTemplate,
  BehaviorObservation,
  StockMovement,
  UserRole,
  Tenant,
  WorkItem,
  ProgressLog,
  PaymentState,
  DailyTalk,
  Project,
  BitacoraEntry,
  BitacoraWeather,
  LibroObra,
  LibroObraAsiento,
  AsientoTipo,
} from '../core/lib/data';
import { ROLES as ROLES_DEFAULT, Permission, PLANS } from '@/modules/core/lib/permissions';

export interface AppDataState {
  isLoading: boolean;
  roles: typeof ROLES_DEFAULT;
  subscriptionPlans: typeof PLANS;
  users: User[];
  materials: Material[];
  tools: Tool[];
  toolLogs: ToolLog[];
  requests: MaterialRequest[];
  returnRequests: ReturnRequest[];
  purchaseRequests: PurchaseRequest[];
  suppliers: Supplier[];
  materialCategories: MaterialCategory[];
  units: Unit[];
  purchaseLots: PurchaseLot[];
  purchaseOrders: PurchaseOrder[];
  supplierPayments: SupplierPayment[];
  salaryAdvances: SalaryAdvance[];
  attendanceLogs: AttendanceLog[];
  assignedChecklists: AssignedSafetyTask[];
  safetyInspections: SafetyInspection[];
  checklistTemplates: ChecklistTemplate[];
  behaviorObservations: BehaviorObservation[];
  stockMovements: StockMovement[];
  workItems: WorkItem[];
  progressLogs: ProgressLog[];
  paymentStates: PaymentState[];
  dailyTalks: DailyTalk[];
  projects: Project[];
  clients: Client[];
  budgets: Budget[];
  resources: Resource[];
  apus: Apu[];
  apuItems: ApuItem[];
  budgetOverheads: BudgetOverhead[];
  bitacoraEntries: BitacoraEntry[];
  libroObra: LibroObra | null;
  libroObraAsientos: LibroObraAsiento[];
}

// This defines the shape of the context, including all functions
export interface AppStateContextType extends AppDataState {
  currentProjectId: string | null;
  setCurrentProjectId: (id: string | null) => void;
  can: (permission: Permission) => boolean;
  notify: (message: string, variant?: "default" | "destructive" | "success") => void;
  refreshData: () => void;

  // Purchase Requests
  addPurchaseRequest: (data: Partial<Omit<PurchaseRequest, 'id' | 'status' | 'createdAt' | 'tenantId' | 'projectId'>>) => Promise<void>;
  updatePurchaseRequestStatus: (requestId: string, status: PurchaseRequest['status'], data: Partial<PurchaseRequest>) => Promise<void>;
  receivePurchaseRequest: (requestId: string, receivedQuantity: number, existingMaterialId?: string) => Promise<void>;
  deletePurchaseRequest: (requestId: string) => Promise<void>;
  cancelPurchaseOrder: (orderId: string) => Promise<void>;
  archiveLot: (requestIds: string[]) => Promise<void>;
  generatePurchaseOrder: (requests: PurchaseRequest[], supplierId: string) => Promise<string>;
  createPurchaseOrder: (data: { lotId: string; ocNumber: string; items: { requestId: string; price: number; quantity: number; name: string; unit: string; }[]; totalAmount: number; }) => Promise<string>;
  returnToPool: (requestIds: string[]) => Promise<void>;

  // Material Requests
  addMaterialRequest: (data: { items: { materialId: string; quantity: number }[]; area: string; phase?: string; activity?: string; workItemId?: string; supervisorId: string; }) => Promise<void>;
  updateMaterialRequestStatus: (requestId: string, status: 'approved' | 'rejected') => Promise<void>;
  addReturnRequest: (items: { materialId: string; quantity: number; materialName: string; unit: string }[], notes: string) => Promise<void>;
  updateReturnRequestStatus: (requestId: string, status: 'completed' | 'rejected') => Promise<void>;

  // Generic CRUD
  addTenant: (data: any) => Promise<void>;
  updateUser: (userId: string, data: Partial<User>) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  addMaterial: (data: any) => Promise<void>;
  updateMaterial: (materialId: string, data: Partial<Material>) => Promise<void>;
  deleteMaterial: (materialId: string) => Promise<void>;
  addManualStockEntry: (materialId: string, quantity: number, justification: string) => Promise<void>;
  addMaterialCategory: (name: string) => Promise<void>;
  updateMaterialCategory: (id: string, name: string) => Promise<void>;
  deleteMaterialCategory: (id: string) => Promise<void>;
  addUnit: (name: string) => Promise<void>;
  deleteUnit: (id: string) => Promise<void>;
  addSupplier: (data: any) => Promise<void>;
  updateSupplier: (id: string, data: Partial<Supplier>) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;
  createLot: (name: string) => Promise<void>;
  addRequestToLot: (requestId: string, lotId: string) => Promise<void>;
  removeRequestFromLot: (requestId: string) => Promise<void>;
  deleteLot: (lotId: string) => Promise<void>;
  updateTenant: (tenantId: string, data: Partial<Tenant>) => Promise<void>;

  // Work Items
  addWorkItem: (data: Omit<WorkItem, 'id' | 'tenantId' | 'progress' | 'path'>) => Promise<void>;
  importWorkItemsTemplate: () => Promise<void>;
  updateWorkItem: (id: string, data: Partial<WorkItem>) => Promise<void>;
  deleteWorkItem: (id: string) => Promise<void>;
  addWorkItemProgress: (workItemId: string, quantity: number, date: Date, observations: string | undefined) => Promise<void>;
  submitForQualityReview: (workItemId: string) => Promise<void>;
  approveWorkItem: (workItemId: string) => Promise<void>;
  rejectWorkItem: (workItemId: string, reason: string) => Promise<void>;
  addPaymentState: (data: Omit<PaymentState, 'id' | 'tenantId' | 'createdAt' | 'status' | 'contractorId' | 'contractorName'>) => Promise<string>;

  // Tools
  addTool: (data: { name: string; brand?: string; model?: string; serialNumber?: string; invoiceNumber?: string; purchaseDate?: string; notes?: string }) => Promise<void>;
  updateTool: (toolId: string, data: Partial<Tool>) => Promise<void>;
  deleteTool: (toolId: string) => Promise<void>;
  checkoutTool: (toolId: string, userId: string, supervisorId: string) => Promise<void>;
  returnTool: (logId: string, status: 'ok' | 'damaged', notes: string) => Promise<void>;
  transferToolToProject: (toolId: string, targetProjectId: string) => Promise<void>;
  findActiveLogForTool: (toolId: string) => Promise<ToolLog | null>;

  // Safety
  addChecklistTemplate: (template: Pick<ChecklistTemplate, 'title' | 'items'>) => Promise<void>;
  deleteChecklistTemplate: (templateId: string) => Promise<void>;
  assignChecklistToSupervisors: (template: ChecklistTemplate, supervisorIds: string[], workArea: string) => Promise<void>;
  completeAssignedChecklist: (checklist: AssignedSafetyTask) => Promise<void>;
  reviewAssignedChecklist: (checklistId: string, status: 'approved' | 'rejected', notes: string, signature: string) => Promise<void>;
  deleteAssignedChecklist: (checklistId: string) => Promise<void>;
  addSafetyInspection: (data: any) => Promise<void>;
  completeSafetyInspection: (inspectionId: string, data: any) => Promise<void>;
  reviewSafetyInspection: (inspectionId: string, status: 'approved' | 'rejected', notes: string, signature: string) => Promise<void>;
  addBehaviorObservation: (data: any) => Promise<void>;
  addDailyTalk: (data: Omit<DailyTalk, 'id' | 'createdAt' | 'tenantId'>) => Promise<void>;
  signDailyTalk: (talkId: string) => Promise<void>;

  // Attendance
  handleAttendanceScan: (qrCode: string, coords?: { lat: number; lng: number } | null) => Promise<{ userName: string; type: 'in' | 'out' }>;
  addManualAttendance: (userId: string, date: Date, time: string, type: 'in' | 'out', coords?: { lat: number; lng: number } | null) => Promise<void>;
  updateAttendanceLog: (logId: string, newTimestamp: Date, newType: 'in' | 'out', originalTimestamp: Date) => Promise<void>;
  deleteAttendanceLog: (logId: string) => Promise<void>;

  // Bitácora de Obra
  addBitacoraEntry: (data: { date: Date; weather: BitacoraWeather; workerCount: number; workPerformed: string; equipment?: string; incidents?: string; observations?: string }) => Promise<void>;
  deleteBitacoraEntry: (entryId: string) => Promise<void>;

  // Libro de Obra Digital
  createLibroObra: (data: Omit<LibroObra, 'id' | 'tenantId' | 'createdAt' | 'createdBy'>) => Promise<string>;
  updateLibroObra: (libroId: string, data: Partial<Omit<LibroObra, 'id' | 'tenantId' | 'createdAt' | 'createdBy'>>) => Promise<void>;
  addAsiento: (data: { libroId: string; fecha: Date; tipo: AsientoTipo; contenido: string; autorRol: string }) => Promise<void>;
  signAsiento: (asientoId: string, firmaDigital: string) => Promise<void>;

  // Payments
  addSupplierPayment: (data: any) => Promise<void>;
  updateSupplierPayment: (paymentId: string, data: Partial<SupplierPayment>) => Promise<void>;
  markPaymentAsPaid: (paymentId: string, details: { paymentDate: Date; paymentMethod: string; }) => Promise<void>;
  deleteSupplierPayment: (paymentId: string) => Promise<void>;
  addSalaryAdvanceRequest: (data: { workerId: string; workerName: string; amount: number; }) => Promise<void>;
  approveSalaryAdvance: (advanceId: string) => Promise<void>;
  rejectSalaryAdvance: (advanceId: string) => Promise<void>;

  // Permissions
  updateRolePermissions: (role: UserRole, permission: Permission, checked: boolean) => Promise<void>;
  updatePlanPermissions: (planId: string, permissions: Permission[]) => Promise<void>;

  // Projects
  addProject: (data: Partial<Project>) => Promise<void>;
  updateProject: (id: string, data: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  addClient: (data: Partial<Client>) => Promise<void>;
  updateClient: (id: string, data: Partial<Client>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  addBudget: (data: Partial<Budget>) => Promise<string>;
  updateBudget: (id: string, data: Partial<Budget>) => Promise<void>;
  deleteBudget: (id: string) => Promise<void>;
  addResource: (data: Partial<Resource>) => Promise<void>;
  updateResource: (id: string, data: Partial<Resource>) => Promise<void>;
  deleteResource: (id: string) => Promise<void>;
  refreshApuPricesFromResource: (resourceId: string) => Promise<number>;
  addApu: (data: Partial<Apu>) => Promise<string>;
  updateApu: (id: string, data: Partial<Apu>) => Promise<void>;
  deleteApu: (id: string) => Promise<void>;
  addApuItem: (data: Partial<ApuItem>) => Promise<void>;
  updateApuItem: (id: string, data: Partial<ApuItem>) => Promise<void>;
  deleteApuItem: (id: string) => Promise<void>;
  applyApuToWorkItem: (templateApuId: string, workItemId: string) => Promise<string>;
  setWorkItemUnitPrice: (workItemId: string, unitPrice: number) => Promise<void>;
  addBudgetOverhead: (data: Partial<BudgetOverhead>) => Promise<void>;
  updateBudgetOverhead: (id: string, data: Partial<BudgetOverhead>) => Promise<void>;
  deleteBudgetOverhead: (id: string) => Promise<void>;
  migrateLegacyDataToProject: (projectId: string) => Promise<number>;
}

export type AppStateAction =
  | { type: 'SET_DATA'; payload: { collection: keyof AppDataState; data: any[] } }
  | { type: 'SET_ROLES'; payload: typeof ROLES_DEFAULT }
  | { type: 'SET_PLANS'; payload: typeof PLANS }
  | { type: 'SET_LOADING'; payload: boolean };
