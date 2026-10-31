

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
    useAmendments,
    useRdis,
    useDocuments,
    useDocumentRevisions,
    useLookaheadTasks,
    useTaskConstraints,
    useApprovalFlows,
    useApprovalFlowSteps,
    useApprovalRequests,
    useApprovalActions,
    useApprovalDelegations,
    useContractorDocumentTypes,
    useContractorDocuments,
    useSubcontractQuotes,
    useSubcontractAttachments,
    useDocumentSignatures,
    useCertificateDeductions,
    useSubcontracts,
    usePaymentOrders,
    useSubcontractItems,
    useEquipmentRentals,
    useWorkUnits,
    useWorkCalendarExceptions,
    useTrainActivities,
    useDailyProgress,
    useDailyReportTokens,
    useSubcontractCertificates,
    useSubcontractCertificateLines,
    useReceptions,
    useReceptionObservations,
    useCompanyLinks,
    useMarketIndices,
    usePaymentCertificates,
    usePaymentCertificateLines,
} from "./collections";
import { AppDataState, AppStateAction, AppStateContextType } from './types';
import {
    ALWAYS_ON, LAZY_KEYS, expandDemand, withDemandGetters, createDemandTracker,
} from './lazy-collections';
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
import * as documentMutations from './mutations/documentMutations';
import * as planningMutations from './mutations/planningMutations';
import * as subcontractMutations from './mutations/subcontractMutations';
import * as approvalMutations from './mutations/approvalMutations';
import * as contractorMutations from './mutations/contractorMutations';
import * as tenderMutations from './mutations/tenderMutations';
import * as deductionMutations from './mutations/deductionMutations';
import * as companyLinkMutations from './mutations/companyLinkMutations';
import * as paymentOrderMutations from './mutations/paymentOrderMutations';
import { ROLES as ROLES_DEFAULT, PLANS, Permission } from '@/modules/core/lib/permissions';
import * as equipmentMutations from './mutations/equipmentMutations';
import * as lastPlannerMutations from './mutations/lastPlannerMutations';
import {
    normalizePlanTier, planAllowsPermission, featureEnabled, lockedFeatureFor,
    parseModuleOverrides, type PlanFeature,
} from '@/lib/plan-features';

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
    const { user, getTenantId, authLoading, subscription, currentTenant } = useAuth();

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

    // Carga por demanda (ver lazy-collections.ts): una colección solo se
    // descarga cuando alguna pantalla la lee del contexto. `en('x')` devuelve el
    // tenantId si 'x' está encendida y `undefined` si no — y los hooks de
    // colección ya se quedan quietos cuando reciben `undefined`.
    const [demanded, setDemanded] = useState<ReadonlySet<string>>(() => new Set());
    const tracker = useMemo(() => createDemandTracker(all => {
        setDemanded(prev => {
            const next = expandDemand(all);
            if (next.size === prev.size && [...next].every(k => prev.has(k))) return prev;
            return next;
        });
    }), []);
    const en = (key: string) => (ALWAYS_ON.has(key) || demanded.has(key) ? tenantId : undefined);

    // When tenant changes, reset project selection so stale IDs don't carry over
    const prevTenantIdRef = React.useRef<string | null | undefined>(undefined);
    useEffect(() => {
        if (prevTenantIdRef.current !== undefined && prevTenantIdRef.current !== tenantId) {
            setCurrentProjectId(null);
            projectIdRestoredRef.current = false;
        }
        prevTenantIdRef.current = tenantId;
    }, [tenantId]);

    const usersData = useUsers(en('users'));
    const materialsData = useMaterials(en('materials'), currentProjectId);
    const toolsData = useTools(en('tools'), currentProjectId);
    const toolLogsData = useToolLogs(en('toolLogs')); // Tool logs might be global for the tenant or per project. If per project, needs update.
    const requestsData = useMaterialRequests(en('requests'), currentProjectId);
    const returnRequestsData = useReturnRequests(en('returnRequests'));
    const purchaseRequestsData = usePurchaseRequests(en('purchaseRequests'), currentProjectId);
    const suppliersData = useSuppliers(en('suppliers'));
    const materialCategoriesData = useMaterialCategories(en('materialCategories'));
    const unitsData = useUnits(en('units'));
    const purchaseLotsData = usePurchaseLots(en('purchaseLots'));
    const purchaseOrdersData = usePurchaseOrders(en('purchaseOrders'));
    const supplierPaymentsData = useSupplierPayments(en('supplierPayments'));
    const salaryAdvancesData = useSalaryAdvances(en('salaryAdvances'));
    const attendanceLogsData = useAttendanceLogs(en('attendanceLogs'));
    const assignedChecklistsData = useAssignedChecklists(en('assignedChecklists'));
    const safetyInspectionsData = useSafetyInspections(en('safetyInspections'));
    const checklistTemplatesData = useChecklistTemplates(en('checklistTemplates'));
    const behaviorObservationsData = useBehaviorObservations(en('behaviorObservations'));
    const stockMovementsData = useStockMovements(en('stockMovements'), currentProjectId);
    const subscriptionPlansData = useSubscriptionPlans();
    const workItemsData = useWorkItems(en('workItems'));
    const progressLogsData = useProgressLogs(en('progressLogs'));
    const dailyTalksData = useDailyTalks(en('dailyTalks'));
    const projectsData = useProjects(en('projects'));
    const clientsData = useClients(en('clients'));
    const budgetsData = useBudgets(en('budgets'));
    const resourcesData = useResources(en('resources'));
    const apusData = useApus(en('apus'));
    const apuItemsData = useApuItems(en('apuItems'));
    const budgetOverheadsData = useBudgetOverheads(en('budgetOverheads'));
    const bitacoraEntriesData = useBitacoraEntries(en('bitacoraEntries'));
    const libroObraData = useLibroObra(en('libroObra'));
    const libroObraAsientosData = useLibroObraAsientos(demanded.has('libroObraAsientos') ? (libroObraData?.id ?? null) : undefined);
    const contractsData = useContracts(en('contracts'));
    const guaranteesData = useGuarantees(en('guarantees'));
    const amendmentsData = useAmendments(en('amendments'));
    const rdisData = useRdis(en('rdis'));
    const documentsData = useDocuments(en('documents'));
    const documentRevisionsData = useDocumentRevisions(en('documentRevisions'));
    const lookaheadTasksData = useLookaheadTasks(en('lookaheadTasks'));
    const taskConstraintsData = useTaskConstraints(en('taskConstraints'));
    const subcontractsData = useSubcontracts(en('subcontracts'));
    const subcontractItemsData = useSubcontractItems(en('subcontractItems'));
    const subcontractCertificatesData = useSubcontractCertificates(en('subcontractCertificates'));
    const subcontractCertificateLinesData = useSubcontractCertificateLines(en('subcontractCertificateLines'));
    const receptionsData = useReceptions(en('receptions'));
    const receptionObservationsData = useReceptionObservations(en('receptionObservations'));
    const companyLinksData = useCompanyLinks(en('companyLinks'));
    const marketIndicesData = useMarketIndices(en('marketIndices'));
    const paymentCertificatesData = usePaymentCertificates(en('paymentCertificates'));
    const paymentCertificateLinesData = usePaymentCertificateLines(en('paymentCertificateLines'));
    const approvalFlowsData = useApprovalFlows(en('approvalFlows'));
    const approvalFlowStepsData = useApprovalFlowSteps(en('approvalFlowSteps'));
    const approvalRequestsData = useApprovalRequests(en('approvalRequests'));
    const approvalActionsData = useApprovalActions(en('approvalActions'));
    const approvalDelegationsData = useApprovalDelegations(en('approvalDelegations'));
    const contractorDocumentTypesData = useContractorDocumentTypes(en('contractorDocumentTypes'));
    const contractorDocumentsData = useContractorDocuments(en('contractorDocuments'));
    const subcontractQuotesData = useSubcontractQuotes(en('subcontractQuotes'));
    const subcontractAttachmentsData = useSubcontractAttachments(en('subcontractAttachments'));
    const documentSignaturesData = useDocumentSignatures(en('documentSignatures'));
    const certificateDeductionsData = useCertificateDeductions(en('certificateDeductions'));
    const dynamicRolesData = useRoles(en('dynamicRoles'));
    const paymentOrdersData = usePaymentOrders(en('paymentOrders'));

    const equipmentRentalsData = useEquipmentRentals(en('equipmentRentals'));
    const workUnitsData = useWorkUnits(en('workUnits'));
    const workCalendarExceptionsData = useWorkCalendarExceptions(en('workCalendarExceptions'));
    const trainActivitiesData = useTrainActivities(en('trainActivities'));
    const dailyProgressData = useDailyProgress(en('dailyProgress'));
    const dailyReportTokensData = useDailyReportTokens(en('dailyReportTokens'));

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
    const amendments = amendmentsData ?? [];
    const rdis = rdisData ?? [];
    const documents = documentsData ?? [];
    const documentRevisions = documentRevisionsData ?? [];
    const lookaheadTasks = lookaheadTasksData ?? [];
    const taskConstraints = taskConstraintsData ?? [];
    const subcontracts = subcontractsData ?? [];
    const subcontractItems = subcontractItemsData ?? [];
    const subcontractCertificates = subcontractCertificatesData ?? [];
    const subcontractCertificateLines = subcontractCertificateLinesData ?? [];
    const receptions = receptionsData ?? [];
    const receptionObservations = receptionObservationsData ?? [];
    const companyLinks = companyLinksData ?? [];
    const marketIndices = marketIndicesData ?? [];
    const paymentCertificates = paymentCertificatesData ?? [];
    const paymentCertificateLines = paymentCertificateLinesData ?? [];
    const approvalFlows = approvalFlowsData ?? [];
    const approvalFlowSteps = approvalFlowStepsData ?? [];
    const approvalRequests = approvalRequestsData ?? [];
    const approvalActions = approvalActionsData ?? [];
    const approvalDelegations = approvalDelegationsData ?? [];
    const contractorDocumentTypes = contractorDocumentTypesData ?? [];
    const contractorDocuments = contractorDocumentsData ?? [];
    const subcontractQuotes = subcontractQuotesData ?? [];
    const subcontractAttachments = subcontractAttachmentsData ?? [];
    const documentSignatures = documentSignaturesData ?? [];
    const certificateDeductions = certificateDeductionsData ?? [];

    const paymentOrders = paymentOrdersData ?? [];
    // Real data only — no phantom seed. Tenants without work items get the
    const equipmentRentals = equipmentRentalsData ?? [];
    const workUnits = workUnitsData ?? [];
    const workCalendarExceptions = workCalendarExceptionsData ?? [];
    const trainActivities = trainActivitiesData ?? [];
    const dailyProgress = dailyProgressData ?? [];
    const dailyReportTokens = dailyReportTokensData ?? [];
    // empty state in the EDT page, plus an "Importar plantilla" action that
    // persists the example WBS via importWorkItemsTemplate.
    const workItems = workItemsData;


    // Roles & Plans
    // Defaults del código + overrides por empresa (per-tenant). Un rol que la
    // empresa no personalizó usa su default; el que sí, lo pisa.
    const roles = useMemo(() => ({ ...ROLES_DEFAULT, ...(dynamicRolesData ?? {}) }), [dynamicRolesData]);
    const subscriptionPlans = useMemo(() => (subscriptionPlansData && Object.keys(subscriptionPlansData).length > 0 ? subscriptionPlansData : PLANS), [subscriptionPlansData]);

    // El plan contratado sale de `tenants.plan` — es lo que el super-admin edita
    // en Suscripciones. `subscriptions` queda solo como respaldo por si alguna
    // fila vieja lo tuviera ahí. Mientras no haya dato, normalizePlanTier
    // devuelve 'basic': se muestra de menos y se abre cuando el dato confirma.
    const planTier = useMemo(
        () => normalizePlanTier(currentTenant?.plan ?? subscription?.plan),
        [currentTenant?.plan, subscription?.plan],
    );

    // Excepciones que el super-admin definió para ESTA empresa (migración 028).
    const moduleOverrides = useMemo(
        () => parseModuleOverrides(currentTenant?.moduleOverrides),
        [currentTenant?.moduleOverrides],
    );

    const hasFeature = useCallback(
        (feature: PlanFeature) =>
            user?.role === 'super-admin' || featureEnabled(planTier, moduleOverrides, feature),
        [planTier, moduleOverrides, user],
    );

    const lockedFeature = useCallback(
        (permission: Permission) => (user?.role === 'super-admin'
            ? null
            : lockedFeatureFor(planTier, permission, moduleOverrides)),
        [planTier, moduleOverrides, user],
    );

    // Dos filtros que se aplican juntos: el MÓDULO (plan + lo que haya decidido
    // el super-admin para esta empresa) decide qué existe, el ROL decide quién lo
    // usa. El super-admin es personal de la plataforma y da soporte a cualquier
    // empresa, así que pasa por encima de los dos.
    const can = useCallback((permission: Permission): boolean => {
        if (!user) return false;
        if (user.role === 'super-admin') return true;
        if (!planAllowsPermission(planTier, permission, moduleOverrides)) return false;
        if (['admin', 'operations', 'soporte'].includes(user.role)) return !SUPERADMIN_ONLY_PERMISSIONS.includes(permission);
        const userPerms: string[] = (roles as any)[user.role]?.permissions ?? [];
        return userPerms.includes(permission as string);
    }, [user, roles, planTier, moduleOverrides]);

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

    // ¿Hay colecciones pedidas que todavía no terminaron su primera descarga?
    // Cada hook arranca con un arreglo vacío y, al terminar, lo reemplaza por
    // otro: si sigue siendo el mismo, aún no llegó nada. Sirve para mostrar una
    // barrita de «sincronizando» en vez de pantallas que parecen vacías.
    const rawByKey: Record<string, unknown> = {
        users: usersData,
        materials: materialsData,
        tools: toolsData,
        toolLogs: toolLogsData,
        requests: requestsData,
        returnRequests: returnRequestsData,
        purchaseRequests: purchaseRequestsData,
        suppliers: suppliersData,
        materialCategories: materialCategoriesData,
        units: unitsData,
        purchaseLots: purchaseLotsData,
        purchaseOrders: purchaseOrdersData,
        supplierPayments: supplierPaymentsData,
        salaryAdvances: salaryAdvancesData,
        attendanceLogs: attendanceLogsData,
        assignedChecklists: assignedChecklistsData,
        safetyInspections: safetyInspectionsData,
        checklistTemplates: checklistTemplatesData,
        behaviorObservations: behaviorObservationsData,
        stockMovements: stockMovementsData,
        workItems: workItemsData,
        progressLogs: progressLogsData,
        dailyTalks: dailyTalksData,
        projects: projectsData,
        clients: clientsData,
        budgets: budgetsData,
        resources: resourcesData,
        apus: apusData,
        apuItems: apuItemsData,
        budgetOverheads: budgetOverheadsData,
        bitacoraEntries: bitacoraEntriesData,
        libroObra: libroObraData,
        contracts: contractsData,
        guarantees: guaranteesData,
        amendments: amendmentsData,
        rdis: rdisData,
        documents: documentsData,
        documentRevisions: documentRevisionsData,
        lookaheadTasks: lookaheadTasksData,
        taskConstraints: taskConstraintsData,
        subcontracts: subcontractsData,
        subcontractItems: subcontractItemsData,
        subcontractCertificates: subcontractCertificatesData,
        subcontractCertificateLines: subcontractCertificateLinesData,
        receptions: receptionsData,
        receptionObservations: receptionObservationsData,
        companyLinks: companyLinksData,
        marketIndices: marketIndicesData,
        paymentCertificates: paymentCertificatesData,
        paymentCertificateLines: paymentCertificateLinesData,
        approvalFlows: approvalFlowsData,
        approvalFlowSteps: approvalFlowStepsData,
        approvalRequests: approvalRequestsData,
        approvalActions: approvalActionsData,
        approvalDelegations: approvalDelegationsData,
        contractorDocumentTypes: contractorDocumentTypesData,
        contractorDocuments: contractorDocumentsData,
        subcontractQuotes: subcontractQuotesData,
        subcontractAttachments: subcontractAttachmentsData,
        documentSignatures: documentSignaturesData,
        certificateDeductions: certificateDeductionsData,
        dynamicRoles: dynamicRolesData,
        paymentOrders: paymentOrdersData,
        equipmentRentals: equipmentRentalsData,
        workUnits: workUnitsData,
        workCalendarExceptions: workCalendarExceptionsData,
        trainActivities: trainActivitiesData,
        dailyProgress: dailyProgressData,
        dailyReportTokens: dailyReportTokensData,
        libroObraAsientos: libroObraAsientosData,
    };
    const firstSeen = React.useRef(new Map<string, { initial: unknown; at: number }>());
    let pendingCount = 0;
    const nowMs = Date.now();
    demanded.forEach(key => {
        if (ALWAYS_ON.has(key)) return;
        const raw = rawByKey[key];
        let rec = firstSeen.current.get(key);
        if (!rec) { rec = { initial: raw, at: nowMs }; firstSeen.current.set(key, rec); }
        // Pasados 8 s se deja de esperar (una consulta que falla no deja la barra para siempre).
        if (Array.isArray(raw) && raw === rec.initial && nowMs - rec.at < 8000) pendingCount++;
    });
    const isSyncing = pendingCount > 0;
    const [, setSyncTick] = useState(0);
    useEffect(() => {
        if (!isSyncing) return;
        const t = setTimeout(() => setSyncTick(n => n + 1), 8100);
        return () => clearTimeout(t);
    }, [isSyncing]);

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
            addAmendment: bindContext(technicalOfficeMutations.addAmendment),
            updateAmendment: bindContext(technicalOfficeMutations.updateAmendment),
            setAmendmentStatus: bindContext(technicalOfficeMutations.setAmendmentStatus),
            deleteAmendment: bindContext(technicalOfficeMutations.deleteAmendment),

            // Control documental y RDI
            addDocument: bindContext(documentMutations.addDocument),
            updateDocument: bindContext(documentMutations.updateDocument),
            deleteDocument: bindContext(documentMutations.deleteDocument),
            addDocumentRevision: bindContext(documentMutations.addDocumentRevision),
            updateDocumentRevision: bindContext(documentMutations.updateDocumentRevision),
            deleteDocumentRevision: bindContext(documentMutations.deleteDocumentRevision),
            addRdi: bindContext(documentMutations.addRdi),
            updateRdi: bindContext(documentMutations.updateRdi),
            answerRdi: bindContext(documentMutations.answerRdi),
            setRdiStatus: bindContext(documentMutations.setRdiStatus),
            deleteRdi: bindContext(documentMutations.deleteRdi),

            // Programación (Last Planner)
            addLookaheadTask: bindContext(planningMutations.addLookaheadTask),
            updateLookaheadTask: bindContext(planningMutations.updateLookaheadTask),
            cerrarTareaSemanal: bindContext(planningMutations.cerrarTareaSemanal),
            deleteLookaheadTask: bindContext(planningMutations.deleteLookaheadTask),
            addTaskConstraint: bindContext(planningMutations.addTaskConstraint),
            updateTaskConstraint: bindContext(planningMutations.updateTaskConstraint),
            deleteTaskConstraint: bindContext(planningMutations.deleteTaskConstraint),

            // Subcontratos y recepción de obra
            addSubcontract: bindContext(subcontractMutations.addSubcontract),
            updateSubcontract: bindContext(subcontractMutations.updateSubcontract),
            deleteSubcontract: bindContext(subcontractMutations.deleteSubcontract),
            addSubcontractItem: bindContext(subcontractMutations.addSubcontractItem),
            updateSubcontractItem: bindContext(subcontractMutations.updateSubcontractItem),
            deleteSubcontractItem: bindContext(subcontractMutations.deleteSubcontractItem),
            addSubcontractCertificate: bindContext(subcontractMutations.addSubcontractCertificate),
            updateSubcontractCertificate: bindContext(subcontractMutations.updateSubcontractCertificate),
            setSubcontractCertificateStatus: bindContext(subcontractMutations.setSubcontractCertificateStatus),
            deleteSubcontractCertificate: bindContext(subcontractMutations.deleteSubcontractCertificate),
            addApprovalFlow: bindContext(approvalMutations.addApprovalFlow),
            updateApprovalFlow: bindContext(approvalMutations.updateApprovalFlow),
            deleteApprovalFlow: bindContext(approvalMutations.deleteApprovalFlow),
            addApprovalFlowStep: bindContext(approvalMutations.addApprovalFlowStep),
            updateApprovalFlowStep: bindContext(approvalMutations.updateApprovalFlowStep),
            deleteApprovalFlowStep: bindContext(approvalMutations.deleteApprovalFlowStep),
            reorderApprovalFlowSteps: bindContext(approvalMutations.reorderApprovalFlowSteps),
            submitForApproval: bindContext(approvalMutations.submitForApproval),
            actOnApproval: bindContext(approvalMutations.actOnApproval),
            cancelApprovalRequest: bindContext(approvalMutations.cancelApprovalRequest),
            addApprovalDelegation: bindContext(approvalMutations.addApprovalDelegation),
            updateApprovalDelegation: bindContext(approvalMutations.updateApprovalDelegation),
            deleteApprovalDelegation: bindContext(approvalMutations.deleteApprovalDelegation),
            seedContractorDocumentTypes: bindContext(contractorMutations.seedContractorDocumentTypes),
            addContractorDocumentType: bindContext(contractorMutations.addContractorDocumentType),
            updateContractorDocumentType: bindContext(contractorMutations.updateContractorDocumentType),
            deleteContractorDocumentType: bindContext(contractorMutations.deleteContractorDocumentType),
            upsertContractorDocument: bindContext(contractorMutations.upsertContractorDocument),
            reviewContractorDocument: bindContext(contractorMutations.reviewContractorDocument),
            deleteContractorDocument: bindContext(contractorMutations.deleteContractorDocument),
            addSubcontractQuote: bindContext(tenderMutations.addSubcontractQuote),
            updateSubcontractQuote: bindContext(tenderMutations.updateSubcontractQuote),
            deleteSubcontractQuote: bindContext(tenderMutations.deleteSubcontractQuote),
            awardSubcontractQuote: bindContext(tenderMutations.awardSubcontractQuote),
            addSubcontractAttachment: bindContext(tenderMutations.addSubcontractAttachment),
            deleteSubcontractAttachment: bindContext(tenderMutations.deleteSubcontractAttachment),
            signDocument: bindContext(tenderMutations.signDocument),
            removeDocumentSignature: bindContext(tenderMutations.removeDocumentSignature),
            addCertificateDeduction: bindContext(deductionMutations.addCertificateDeduction),
            updateCertificateDeduction: bindContext(deductionMutations.updateCertificateDeduction),
            deleteCertificateDeduction: bindContext(deductionMutations.deleteCertificateDeduction),
            addReception: bindContext(subcontractMutations.addReception),
            addPaymentOrder: bindContext(paymentOrderMutations.addPaymentOrder),
            updatePaymentOrder: bindContext(paymentOrderMutations.updatePaymentOrder),
            markPaymentOrderPaid: bindContext(paymentOrderMutations.markPaymentOrderPaid),
            voidPaymentOrder: bindContext(paymentOrderMutations.voidPaymentOrder),
            sendPaymentOrder: bindContext(paymentOrderMutations.sendPaymentOrder),
            closeSubcontract: bindContext(paymentOrderMutations.closeSubcontract),
            reopenSubcontract: bindContext(paymentOrderMutations.reopenSubcontract),
            updateReception: bindContext(subcontractMutations.updateReception),
            addEquipmentRental: bindContext(equipmentMutations.addEquipmentRental),
            updateEquipmentRental: bindContext(equipmentMutations.updateEquipmentRental),
            returnEquipmentRental: bindContext(equipmentMutations.returnEquipmentRental),
            deleteEquipmentRental: bindContext(equipmentMutations.deleteEquipmentRental),

            addWorkUnits: bindContext(lastPlannerMutations.addWorkUnits),
            updateWorkUnit: bindContext(lastPlannerMutations.updateWorkUnit),
            deleteWorkUnit: bindContext(lastPlannerMutations.deleteWorkUnit),
            deleteWorkUnitsOfProject: bindContext(lastPlannerMutations.deleteWorkUnitsOfProject),
            swapWorkUnitOrder: bindContext(lastPlannerMutations.swapWorkUnitOrder),
            addCalendarExceptions: bindContext(lastPlannerMutations.addCalendarExceptions),
            updateCalendarException: bindContext(lastPlannerMutations.updateCalendarException),
            deleteCalendarException: bindContext(lastPlannerMutations.deleteCalendarException),
            addTrainActivity: bindContext(lastPlannerMutations.addTrainActivity),
            updateTrainActivity: bindContext(lastPlannerMutations.updateTrainActivity),
            deleteTrainActivity: bindContext(lastPlannerMutations.deleteTrainActivity),
            applyTrainSchedule: bindContext(lastPlannerMutations.applyTrainSchedule),
            swapTrainActivityOrder: bindContext(lastPlannerMutations.swapTrainActivityOrder),
            saveDailyProgress: bindContext(lastPlannerMutations.saveDailyProgress),
            deleteDailyProgress: bindContext(lastPlannerMutations.deleteDailyProgress),
            createDailyReportToken: bindContext(lastPlannerMutations.createDailyReportToken),
            deleteDailyReportToken: bindContext(lastPlannerMutations.deleteDailyReportToken),
            deleteReception: bindContext(subcontractMutations.deleteReception),
            addReceptionObservation: bindContext(subcontractMutations.addReceptionObservation),
            updateReceptionObservation: bindContext(subcontractMutations.updateReceptionObservation),
            deleteReceptionObservation: bindContext(subcontractMutations.deleteReceptionObservation),

            // Vínculos entre empresas
            createCompanyLink: bindContext(companyLinkMutations.createCompanyLink),
            acceptCompanyLink: bindContext(companyLinkMutations.acceptCompanyLink),
            revokeCompanyLink: bindContext(companyLinkMutations.revokeCompanyLink),
            deleteCompanyLink: bindContext(companyLinkMutations.deleteCompanyLink),
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

    const value: AppStateContextType = useMemo(() => withDemandGetters({
        isLoading,
        isSyncing,
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
        amendments,
        rdis,
        documents,
        documentRevisions,
        lookaheadTasks,
        taskConstraints,
        subcontracts,
        subcontractItems,
        subcontractCertificates,
        subcontractCertificateLines,
        receptions,
        receptionObservations,
        companyLinks,
        marketIndices,
        paymentCertificates,
        paymentCertificateLines,
        approvalFlows,
        approvalFlowSteps,
        approvalRequests,
        approvalActions,
        approvalDelegations,
        contractorDocumentTypes,
        contractorDocuments,
        subcontractQuotes,
        subcontractAttachments,
        documentSignatures,
        certificateDeductions,
        paymentOrders,
        equipmentRentals,
        workUnits,
        workCalendarExceptions,
        trainActivities,
        dailyProgress,
        dailyReportTokens,
        currentProjectId,
        setCurrentProjectId,
        can,
        planTier,
        hasFeature,
        lockedFeature,
        notify,
        ...functions,
    }, LAZY_KEYS, tracker.request), [
        isLoading, isSyncing, tracker, roles, subscriptionPlans, users, materials, tools, toolLogs,
        requests, returnRequests, purchaseRequests, suppliers, materialCategories,
        units, purchaseLots, purchaseOrders, supplierPayments, salaryAdvances,
        attendanceLogs, assignedChecklists, safetyInspections, checklistTemplates,
        behaviorObservations, stockMovements, workItems, progressLogs,
        dailyTalks, projects, clients, budgets, resources, apus, apuItems, budgetOverheads, bitacoraEntries, libroObra, libroObraAsientos,
        contracts, guarantees, amendments, rdis, documents, documentRevisions,
        lookaheadTasks, taskConstraints,
        subcontracts, subcontractItems, subcontractCertificates, subcontractCertificateLines, receptions, receptionObservations, companyLinks,
        marketIndices, paymentCertificates, paymentCertificateLines,
        approvalFlows, approvalFlowSteps, approvalRequests, approvalActions,
        approvalDelegations, contractorDocumentTypes, contractorDocuments,
        subcontractQuotes, subcontractAttachments, documentSignatures,
        certificateDeductions,
        paymentOrders,
        equipmentRentals, workUnits, workCalendarExceptions, trainActivities,
        dailyProgress, dailyReportTokens,
        currentProjectId, can, planTier, hasFeature, lockedFeature, notify, functions,
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
