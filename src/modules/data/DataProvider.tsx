

"use client";
import React, {
    useCallback,
    useEffect,
    useState,
    useMemo,
} from 'react';
import { createContainer } from 'react-tracked';
import { getSupabaseBrowserClient } from '@/modules/core/lib/supabase';
import { useAuth } from "@/modules/core/contexts/app-provider";
import { useToast } from "@/modules/core/hooks/use-toast";
import {
    useMaterials,
    useTools,
    usePurchaseRequests,
    useUsers,
    useRoles,
    useToolLogs,
    useMaterialRequests,
    useReturnRequests,
    useSuppliers,
    useMaterialCategories,
    useUnits,
    usePurchaseLots,
    usePurchaseOrders,
    useSupplierPayments,
    useSalaryAdvances,
    useAttendanceLogs,
    useAssignedChecklists,
    useSafetyInspections,
    useChecklistTemplates,
    useBehaviorObservations,
    useStockMovements,
    useSubscriptionPlans,
    useWorkItems,
    useProgressLogs,
    usePaymentStates,
    useDailyTalks,
    useProjects,
    useClients,
    useBudgets,
    useResources,
    useApus,
    useApuItems,
    useBudgetOverheads,
    useBitacoraEntries,
    useLibroObra,
    useLibroObraAsientos,
    useContracts,
    useGuarantees,
    useMarketIndices,
    usePaymentCertificates,
    usePaymentCertificateLines,
} from "./collections";
import { AppDataState, AppStateAction, AppStateContextType } from './types';
import * as materialRequestMutations from './mutations/materialRequestMutations';
import * as purchaseRequestMutations from './mutations/purchaseRequestMutations';
import * as genericMutations from './mutations/genericMutations';
import * as toolMutations from './mutations/toolMutations';
import * as safetyMutations from './mutations/safetyMutations';
import * as attendanceMutations from './mutations/attendanceMutations';
import * as paymentMutations from './mutations/paymentMutations';
import * as projectMutations from './mutations/projectMutations';
import * as clientMutations from './mutations/clientMutations';
import * as apuMutations from './mutations/apuMutations';
import * as bitacoraMutations from './mutations/bitacoraMutations';
import * as libroObraMutations from './mutations/libroObraMutations';
import * as technicalOfficeMutations from './mutations/technicalOfficeMutations';
import { ROLES as ROLES_DEFAULT, PLANS, Permission } from '@/modules/core/lib/permissions';

const SUPERADMIN_ONLY_PERMISSIONS: Permission[] = [
    'tenants:create', 'tenants:delete', 'tenants:switch', 'module_subscriptions:view',
];

// [State management removed in favor of direct hook usage]

// --- Context (react-tracked container; Provider + hooks are created at the bottom) ---

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const noop = () => {};

// The entire client data layer lives in this hook. It's wired into a react-tracked
// container so that consumers of useAppState() only re-render for the specific
// fields they actually read (per-property render tracking via proxy-compare),
// instead of re-rendering on every change to any of the ~30 collections.
function useAppStateValue(): [AppStateContextType, () => void] {
    const { user, getTenantId, authLoading } = useAuth();

    // Always start with null — restored from localStorage only after projects load
    // and are validated to belong to the current tenant (prevents stale UUID errors).
    const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
    const projectIdRestoredRef = React.useRef(false);

    useEffect(() => {
        if (currentProjectId) {
            localStorage.setItem('currentProjectId', currentProjectId);
        } else {
            localStorage.setItem('currentProjectId', 'all');
        }
    }, [currentProjectId]);

    const { toast } = useToast();

    const tenantId = getTenantId();

    // When tenant changes, reset project selection so stale IDs don't carry over
    const prevTenantIdRef = React.useRef<string | null | undefined>(undefined);
    useEffect(() => {
        if (prevTenantIdRef.current !== undefined && prevTenantIdRef.current !== tenantId) {
            setCurrentProjectId(null);
            projectIdRestoredRef.current = false;
        }
        prevTenantIdRef.current = tenantId;
    }, [tenantId]);

    const usersData = useUsers(tenantId);
    const materialsData = useMaterials(tenantId, currentProjectId);
    const toolsData = useTools(tenantId, currentProjectId);
    const toolLogsData = useToolLogs(tenantId); // Tool logs might be global for the tenant or per project. If per project, needs update.
    const requestsData = useMaterialRequests(tenantId, currentProjectId);
    const returnRequestsData = useReturnRequests(tenantId);
    const purchaseRequestsData = usePurchaseRequests(tenantId, currentProjectId);
    const suppliersData = useSuppliers(tenantId);
    const materialCategoriesData = useMaterialCategories(tenantId);
    const unitsData = useUnits(tenantId);
    const purchaseLotsData = usePurchaseLots(tenantId);
    const purchaseOrdersData = usePurchaseOrders(tenantId);
    const supplierPaymentsData = useSupplierPayments(tenantId);
    const salaryAdvancesData = useSalaryAdvances(tenantId);
    const attendanceLogsData = useAttendanceLogs(tenantId);
    const assignedChecklistsData = useAssignedChecklists(tenantId);
    const safetyInspectionsData = useSafetyInspections(tenantId);
    const checklistTemplatesData = useChecklistTemplates(tenantId);
    const behaviorObservationsData = useBehaviorObservations(tenantId);
    const stockMovementsData = useStockMovements(tenantId, currentProjectId);
    const subscriptionPlansData = useSubscriptionPlans();
    const workItemsData = useWorkItems(tenantId);
    const progressLogsData = useProgressLogs(tenantId);
    const paymentStatesData = usePaymentStates(tenantId);
    const dailyTalksData = useDailyTalks(tenantId);
    const projectsData = useProjects(tenantId);
    const clientsData = useClients(tenantId);
    const budgetsData = useBudgets(tenantId);
    const resourcesData = useResources(tenantId);
    const apusData = useApus(tenantId);
    const apuItemsData = useApuItems(tenantId);
    const budgetOverheadsData = useBudgetOverheads(tenantId);
    const bitacoraEntriesData = useBitacoraEntries(tenantId);
    const libroObraData = useLibroObra(tenantId);
    const libroObraAsientosData = useLibroObraAsientos(libroObraData?.id ?? null);
    const contractsData = useContracts(tenantId);
    const guaranteesData = useGuarantees(tenantId);
    const marketIndicesData = useMarketIndices(tenantId);
    const paymentCertificatesData = usePaymentCertificates(tenantId);
    const paymentCertificateLinesData = usePaymentCertificateLines(tenantId);
    const dynamicRolesData = useRoles(tenantId);


    const users = usersData ?? [];
    const materials = materialsData ?? [];
    const tools = toolsData ?? [];
    const toolLogs = toolLogsData ?? [];
    const requests = requestsData ?? [];
    const returnRequests = returnRequestsData ?? [];
    const purchaseRequests = purchaseRequestsData ?? [];
    const suppliers = suppliersData ?? [];
    const materialCategories = materialCategoriesData ?? [];
    const units = unitsData ?? [];
    const purchaseLots = purchaseLotsData ?? [];
    const purchaseOrders = purchaseOrdersData ?? [];
    const supplierPayments = supplierPaymentsData ?? [];
    const salaryAdvances = salaryAdvancesData ?? [];
    const attendanceLogs = attendanceLogsData ?? [];
    const assignedChecklists = assignedChecklistsData ?? [];
    const safetyInspections = safetyInspectionsData ?? [];
    const checklistTemplates = checklistTemplatesData ?? [];
    const behaviorObservations = behaviorObservationsData ?? [];
    const stockMovements = stockMovementsData ?? [];
    const progressLogs = progressLogsData ?? [];
    const paymentStates = paymentStatesData ?? [];
    const dailyTalks = dailyTalksData ?? [];
    const projects = projectsData ?? [];
    const clients = clientsData ?? [];
    const budgets = budgetsData ?? [];
    const resources = resourcesData ?? [];
    const apus = apusData ?? [];
    const apuItems = apuItemsData ?? [];
    const budgetOverheads = budgetOverheadsData ?? [];
    const bitacoraEntries = bitacoraEntriesData ?? [];
    const libroObra = libroObraData ?? null;
    const libroObraAsientos = libroObraAsientosData ?? [];
    const contracts = contractsData ?? [];
    const guarantees = guaranteesData ?? [];
    const marketIndices = marketIndicesData ?? [];
    const paymentCertificates = paymentCertificatesData ?? [];
    const paymentCertificateLines = paymentCertificateLinesData ?? [];

    // Real data only — no phantom seed. Tenants without work items get the
    // empty state in the EDT page, plus an "Importar plantilla" action that
    // persists the example WBS via importWorkItemsTemplate.
    const workItems = workItemsData;


    // Roles & Plans
    // Defaults del código + overrides por empresa (per-tenant). Un rol que la
    // empresa no personalizó usa su default; el que sí, lo pisa.
    const roles = useMemo(() => ({ ...ROLES_DEFAULT, ...(dynamicRolesData ?? {}) }), [dynamicRolesData]);
    const subscriptionPlans = useMemo(() => (subscriptionPlansData && Object.keys(subscriptionPlansData).length > 0 ? subscriptionPlansData : PLANS), [subscriptionPlansData]);

    const can = useCallback((permission: Permission): boolean => {
        if (!user) return false;
        if (user.role === 'super-admin') return true;
        if (['admin', 'operations', 'soporte'].includes(user.role)) return !SUPERADMIN_ONLY_PERMISSIONS.includes(permission);
        const userPerms: string[] = (roles as any)[user.role]?.permissions ?? [];
        return userPerms.includes(permission as string);
    }, [user, roles]);

    // Loading State Calculation
    const isLoading = useMemo(() => {
        if (authLoading) return true;
        if (!user) return true;
        if (user.role !== 'super-admin' && !tenantId) return true;

        // Progressive loading: we don't block the UI while collections stream in.
        // The collection hooks initialize their state to [] (never undefined), so once
        // auth is resolved and the tenant is known, the app is considered ready and each
        // section renders its own empty/loading state as data arrives.
        return false;
    }, [authLoading, user, tenantId]);

    // After projects load for the first time, restore the saved selection (validated)
    // or auto-select the first available project.
    useEffect(() => {
        if (!projects.length || projectIdRestoredRef.current) return;
        projectIdRestoredRef.current = true;

        const saved = typeof window !== 'undefined' ? localStorage.getItem('currentProjectId') : null;
        if (saved && saved !== 'all' && UUID_RE.test(saved) && projects.some(p => p.id === saved)) {
            setCurrentProjectId(saved);
        } else if (!currentProjectId) {
            setCurrentProjectId(projects[0].id);
        }
    }, [projects]);

    const notify = useCallback((message: string, variant: "default" | "destructive" | "success" = "default") => {
        toast({
            variant: variant === "success" ? "default" : variant,
            title: variant === "success" ? "Éxito" : variant === "destructive" ? "Error" : "Notificación",
            description: message,
            className: variant === 'success' ? 'border-green-500' : ''
        });
    }, [toast]);

    const functions = useMemo(() => {
        const bindContext = <T extends any[], R>(fn: (...args: [...T, { user: any; tenantId: string | null | undefined; projectId: string | null; db?: any }]) => R) => {
            return (...args: T): R => {
                const context = { user, tenantId, projectId: currentProjectId };
                if (context.user === undefined) {
                    throw new Error('Context for mutation is not yet available.');
                }
                return fn(...args, context);
            };
        };

        return {
            // Purchase Requests
            addPurchaseRequest: bindContext(purchaseRequestMutations.addPurchaseRequest),
            updatePurchaseRequestStatus: bindContext(purchaseRequestMutations.updatePurchaseRequestStatus),
            receivePurchaseRequest: bindContext(purchaseRequestMutations.receivePurchaseRequest),
            deletePurchaseRequest: bindContext(purchaseRequestMutations.deletePurchaseRequest),
            cancelPurchaseOrder: bindContext(purchaseRequestMutations.cancelPurchaseOrder),
            archiveLot: bindContext(purchaseRequestMutations.archiveLot),
            generatePurchaseOrder: bindContext(purchaseRequestMutations.generatePurchaseOrder),
            createPurchaseOrder: bindContext(purchaseRequestMutations.createPurchaseOrder),
            returnToPool: bindContext(purchaseRequestMutations.returnToPool),

            // Material Requests
            addMaterialRequest: bindContext(materialRequestMutations.addMaterialRequest),
            updateMaterialRequestStatus: bindContext(materialRequestMutations.updateMaterialRequestStatus),
            addReturnRequest: bindContext(materialRequestMutations.addReturnRequest),
            updateReturnRequestStatus: bindContext(materialRequestMutations.updateReturnRequestStatus),

            // Generic CRUD
            addTenant: bindContext(genericMutations.addTenant),
            updateUser: bindContext(genericMutations.updateUser),
            deleteUser: bindContext(genericMutations.deleteUser),
            addMaterial: bindContext(genericMutations.addMaterial),
            updateMaterial: bindContext(genericMutations.updateMaterial),
            deleteMaterial: bindContext(genericMutations.deleteMaterial),
            addManualStockEntry: bindContext(genericMutations.addManualStockEntry),
            addMaterialCategory: bindContext(genericMutations.addMaterialCategory),
            updateMaterialCategory: bindContext(genericMutations.updateMaterialCategory),
            deleteMaterialCategory: bindContext(genericMutations.deleteMaterialCategory),
            addUnit: bindContext(genericMutations.addUnit),
            deleteUnit: bindContext(genericMutations.deleteUnit),
            addSupplier: bindContext(genericMutations.addSupplier),
            updateSupplier: bindContext(genericMutations.updateSupplier),
            deleteSupplier: bindContext(genericMutations.deleteSupplier),
            createLot: bindContext(genericMutations.createLot),
            addRequestToLot: bindContext(genericMutations.addRequestToLot),
            removeRequestFromLot: bindContext(genericMutations.removeRequestFromLot),
            deleteLot: bindContext(genericMutations.deleteLot),

            // Tenant
            updateTenant: bindContext(genericMutations.updateTenant),

            // Work Items
            addWorkItem: bindContext(genericMutations.addWorkItem),
            importWorkItemsTemplate: bindContext(genericMutations.importWorkItemsTemplate),
            updateWorkItem: bindContext(genericMutations.updateWorkItem),
            deleteWorkItem: bindContext(genericMutations.deleteWorkItem),
            addWorkItemProgress: bindContext(genericMutations.addWorkItemProgress),
            submitForQualityReview: bindContext(genericMutations.submitForQualityReview),
            approveWorkItem: bindContext(genericMutations.approveWorkItem),
            rejectWorkItem: bindContext(genericMutations.rejectWorkItem),
            addPaymentState: bindContext(genericMutations.addPaymentState),

            // Projects
            addProject: bindContext(projectMutations.addProject),
            updateProject: bindContext(projectMutations.updateProject),
            deleteProject: bindContext(projectMutations.deleteProject),

            addClient: bindContext(clientMutations.addClient),
            updateClient: bindContext(clientMutations.updateClient),
            deleteClient: bindContext(clientMutations.deleteClient),
            addBudget: bindContext(clientMutations.addBudget),
            updateBudget: bindContext(clientMutations.updateBudget),
            deleteBudget: bindContext(clientMutations.deleteBudget),

            // Oficina Técnica
            addContract: bindContext(technicalOfficeMutations.addContract),
            updateContract: bindContext(technicalOfficeMutations.updateContract),
            deleteContract: bindContext(technicalOfficeMutations.deleteContract),
            addGuarantee: bindContext(technicalOfficeMutations.addGuarantee),
            updateGuarantee: bindContext(technicalOfficeMutations.updateGuarantee),
            deleteGuarantee: bindContext(technicalOfficeMutations.deleteGuarantee),
            syncMarketIndices: bindContext(technicalOfficeMutations.syncMarketIndices),
            setMarketIndex: bindContext(technicalOfficeMutations.setMarketIndex),
            addPaymentCertificate: bindContext(technicalOfficeMutations.addPaymentCertificate),
            updatePaymentCertificate: bindContext(technicalOfficeMutations.updatePaymentCertificate),
            setPaymentCertificateStatus: bindContext(technicalOfficeMutations.setPaymentCertificateStatus),
            deletePaymentCertificate: bindContext(technicalOfficeMutations.deletePaymentCertificate),

            addResource: bindContext(apuMutations.addResource),
            updateResource: bindContext(apuMutations.updateResource),
            deleteResource: bindContext(apuMutations.deleteResource),
            refreshApuPricesFromResource: bindContext(apuMutations.refreshApuPricesFromResource),
            addApu: bindContext(apuMutations.addApu),
            updateApu: bindContext(apuMutations.updateApu),
            deleteApu: bindContext(apuMutations.deleteApu),
            addApuItem: bindContext(apuMutations.addApuItem),
            updateApuItem: bindContext(apuMutations.updateApuItem),
            deleteApuItem: bindContext(apuMutations.deleteApuItem),
            applyApuToWorkItem: bindContext(apuMutations.applyApuToWorkItem),
            setWorkItemUnitPrice: bindContext(apuMutations.setWorkItemUnitPrice),
            addBudgetOverhead: bindContext(apuMutations.addBudgetOverhead),
            updateBudgetOverhead: bindContext(apuMutations.updateBudgetOverhead),
            deleteBudgetOverhead: bindContext(apuMutations.deleteBudgetOverhead),
            migrateLegacyDataToProject: bindContext(projectMutations.migrateLegacyDataToProject),

            // Tools
            addTool: bindContext(toolMutations.addTool),
            updateTool: bindContext(toolMutations.updateTool),
            deleteTool: bindContext(toolMutations.deleteTool),
            checkoutTool: bindContext(toolMutations.checkoutTool),
            returnTool: bindContext(toolMutations.returnTool),
            transferToolToProject: bindContext(toolMutations.transferToolToProject),
            findActiveLogForTool: bindContext(toolMutations.findActiveLogForTool),

            // Safety
            addChecklistTemplate: bindContext(safetyMutations.addChecklistTemplate),
            deleteChecklistTemplate: bindContext(safetyMutations.deleteChecklistTemplate),
            assignChecklistToSupervisors: bindContext(safetyMutations.assignChecklistToSupervisors),
            completeAssignedChecklist: bindContext(safetyMutations.completeAssignedChecklist),
            reviewAssignedChecklist: bindContext(safetyMutations.reviewAssignedChecklist),
            deleteAssignedChecklist: bindContext(safetyMutations.deleteAssignedChecklist),
            addSafetyInspection: bindContext(safetyMutations.addSafetyInspection),
            completeSafetyInspection: bindContext(safetyMutations.completeSafetyInspection),
            reviewSafetyInspection: bindContext(safetyMutations.reviewSafetyInspection),
            addBehaviorObservation: bindContext(safetyMutations.addBehaviorObservation),
            addDailyTalk: bindContext(safetyMutations.addDailyTalk),
            signDailyTalk: bindContext(safetyMutations.signDailyTalk),

            // Attendance
            handleAttendanceScan: bindContext(attendanceMutations.handleAttendanceScan),
            addManualAttendance: bindContext(attendanceMutations.addManualAttendance),
            updateAttendanceLog: bindContext(attendanceMutations.updateAttendanceLog),
            deleteAttendanceLog: bindContext(attendanceMutations.deleteAttendanceLog),

            // Payments
            addSupplierPayment: bindContext(paymentMutations.addSupplierPayment),
            updateSupplierPayment: bindContext(paymentMutations.updateSupplierPayment),
            markPaymentAsPaid: bindContext(paymentMutations.markPaymentAsPaid),
            deleteSupplierPayment: bindContext(paymentMutations.deleteSupplierPayment),
            addSalaryAdvanceRequest: bindContext(paymentMutations.addSalaryAdvanceRequest),
            approveSalaryAdvance: bindContext(paymentMutations.approveSalaryAdvance),
            rejectSalaryAdvance: bindContext(paymentMutations.rejectSalaryAdvance),

            // Permissions
            updateRolePermissions: bindContext(genericMutations.updateRolePermissions),
            updatePlanPermissions: bindContext(genericMutations.updatePlanPermissions),

            // Bitácora de Obra
            addBitacoraEntry: bindContext(bitacoraMutations.addBitacoraEntry),
            deleteBitacoraEntry: bindContext(bitacoraMutations.deleteBitacoraEntry),

            // Libro de Obra Digital
            createLibroObra: bindContext(libroObraMutations.createLibroObra),
            updateLibroObra: bindContext(libroObraMutations.updateLibroObra),
            addAsiento: bindContext(libroObraMutations.addAsiento),
            signAsiento: bindContext(libroObraMutations.signAsiento),
        };
     
    }, [user, tenantId, currentProjectId]);

    const value: AppStateContextType = useMemo(() => ({
        isLoading,
        roles,
        subscriptionPlans,
        users,
        materials,
        tools,
        toolLogs,
        requests,
        returnRequests,
        purchaseRequests,
        suppliers,
        materialCategories,
        units,
        purchaseLots,
        purchaseOrders,
        supplierPayments,
        salaryAdvances,
        attendanceLogs,
        assignedChecklists,
        safetyInspections,
        checklistTemplates,
        behaviorObservations,
        stockMovements,
        workItems,
        progressLogs,
        paymentStates,
        dailyTalks,
        projects,
        clients,
        budgets,
        resources,
        apus,
        apuItems,
        budgetOverheads,
        bitacoraEntries,
        libroObra,
        libroObraAsientos,
        contracts,
        guarantees,
        marketIndices,
        paymentCertificates,
        paymentCertificateLines,
        currentProjectId,
        setCurrentProjectId,
        can,
        notify,
        ...functions,
    }), [
        isLoading, roles, subscriptionPlans, users, materials, tools, toolLogs,
        requests, returnRequests, purchaseRequests, suppliers, materialCategories,
        units, purchaseLots, purchaseOrders, supplierPayments, salaryAdvances,
        attendanceLogs, assignedChecklists, safetyInspections, checklistTemplates,
        behaviorObservations, stockMovements, workItems, progressLogs, paymentStates,
        dailyTalks, projects, clients, budgets, resources, apus, apuItems, budgetOverheads, bitacoraEntries, libroObra, libroObraAsientos,
        contracts, guarantees, marketIndices, paymentCertificates, paymentCertificateLines,
        currentProjectId, can, notify, functions,
    ]);

    return [value, noop];
}

// --- react-tracked container ---
// createContainer runs useAppStateValue inside the Provider and exposes
// per-property render-tracked hooks. useAppState() is a drop-in replacement for
// the previous useContext-based hook: same return shape, but components only
// re-render for the fields they read. useAppSelector() is available for explicit
// slice selection when needed.
const {
    Provider: TrackedProvider,
    useTrackedState,
    useSelector: useAppSelector,
} = createContainer(useAppStateValue);

export function DataProvider({ children }: { children: React.ReactNode }) {
    return <TrackedProvider>{children}</TrackedProvider>;
}

export const useAppState = useTrackedState;
export { useAppSelector };
