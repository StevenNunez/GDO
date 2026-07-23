-- ============================================================
-- GestionDeObras — Initial Schema Migration
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==================== USERS (primero, las funciones la referencian) ====================
CREATE TABLE IF NOT EXISTS public.users (
  id                   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  email                TEXT NOT NULL,
  role                 TEXT NOT NULL DEFAULT 'worker',
  "qrCode"             TEXT NOT NULL DEFAULT '',
  "tenantId"           TEXT NOT NULL DEFAULT '',
  rut                  TEXT,
  cargo                TEXT,
  phone                TEXT,
  "fechaIngreso"       TIMESTAMPTZ,
  "baseSalary"         NUMERIC,
  afp                  TEXT,
  "tipoSalud"          TEXT,
  "cargasFamiliares"   INTEGER,
  signature            TEXT,
  "isDemoUser"         BOOLEAN DEFAULT FALSE,
  "assignedProjectIds" TEXT[] DEFAULT '{}',
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== HELPER FUNCTIONS (después de users) ====================
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT "tenantId" FROM public.users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$;

-- ==================== RLS PARA USERS ====================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select" ON public.users
  FOR SELECT USING (
    role = 'super-admin'
    OR "tenantId" = get_my_tenant_id()
    OR id = auth.uid()
  );

CREATE POLICY "users_insert" ON public.users
  FOR INSERT WITH CHECK (
    get_my_role() IN ('super-admin', 'admin')
    OR id = auth.uid()
  );

CREATE POLICY "users_update" ON public.users
  FOR UPDATE USING (
    id = auth.uid()
    OR get_my_role() IN ('super-admin', 'admin')
  );

CREATE POLICY "users_delete" ON public.users
  FOR DELETE USING (
    get_my_role() IN ('super-admin', 'admin')
  );

-- ==================== TENANTS ====================
CREATE TABLE IF NOT EXISTS public.tenants (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  "tenantId"  TEXT NOT NULL UNIQUE,
  plan        TEXT DEFAULT 'basic',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenants_select" ON public.tenants
  FOR SELECT USING (
    get_my_role() = 'super-admin'
    OR "tenantId" = get_my_tenant_id()
  );

CREATE POLICY "tenants_all_superadmin" ON public.tenants
  FOR ALL USING (get_my_role() = 'super-admin');

-- ==================== SUBSCRIPTIONS ====================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                   TEXT PRIMARY KEY,
  plan                 TEXT NOT NULL DEFAULT 'professional',
  features             JSONB DEFAULT '{}',
  "maxUsers"           INTEGER,
  "maxRequests"        INTEGER,
  "storageLimitMB"     INTEGER,
  "expiresAt"          TIMESTAMPTZ,
  "allowedPermissions" TEXT[] DEFAULT '{}',
  "tenantId"           TEXT NOT NULL
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_select" ON public.subscriptions
  FOR SELECT USING (
    get_my_role() = 'super-admin'
    OR "tenantId" = get_my_tenant_id()
  );

CREATE POLICY "subscriptions_all_superadmin" ON public.subscriptions
  FOR ALL USING (get_my_role() = 'super-admin');

-- ==================== PROJECTS ====================
CREATE TABLE IF NOT EXISTS public.projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  "tenantId"  TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  address     TEXT,
  description TEXT,
  "isActive"  BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_tenant" ON public.projects
  FOR ALL USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- ==================== MATERIAL CATEGORIES ====================
CREATE TABLE IF NOT EXISTS public."materialCategories" (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  "tenantId" TEXT NOT NULL
);

ALTER TABLE public."materialCategories" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "materialCategories_tenant" ON public."materialCategories"
  FOR ALL USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- ==================== UNITS ====================
CREATE TABLE IF NOT EXISTS public.units (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  "tenantId" TEXT NOT NULL
);

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "units_tenant" ON public.units
  FOR ALL USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- ==================== SUPPLIERS ====================
CREATE TABLE IF NOT EXISTS public.suppliers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  categories      TEXT[] DEFAULT '{}',
  rut             TEXT,
  bank            TEXT,
  "accountType"   TEXT,
  "accountNumber" TEXT,
  email           TEXT,
  address         TEXT,
  phone           TEXT,
  "tenantId"      TEXT NOT NULL
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suppliers_tenant" ON public.suppliers
  FOR ALL USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- ==================== MATERIALS ====================
CREATE TABLE IF NOT EXISTS public.materials (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  stock        NUMERIC NOT NULL DEFAULT 0,
  unit         TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT '',
  "categoryId" UUID REFERENCES public."materialCategories"(id) ON DELETE SET NULL,
  "projectId"  UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  "supplierId" UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  archived     BOOLEAN NOT NULL DEFAULT FALSE,
  "tenantId"   TEXT NOT NULL
);

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "materials_tenant" ON public.materials
  FOR ALL USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- ==================== STOCK MOVEMENTS ====================
CREATE TABLE IF NOT EXISTS public."stockMovements" (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "materialId"       UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  "materialName"     TEXT NOT NULL,
  "quantityChange"   NUMERIC NOT NULL,
  "newStock"         NUMERIC NOT NULL,
  type               TEXT NOT NULL,
  date               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  justification      TEXT NOT NULL DEFAULT '',
  "userId"           UUID NOT NULL,
  "userName"         TEXT NOT NULL,
  "relatedRequestId" UUID,
  "projectId"        UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  "tenantId"         TEXT NOT NULL,
  "workItemId"       UUID,
  phase              TEXT,
  activity           TEXT
);

ALTER TABLE public."stockMovements" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stockMovements_tenant" ON public."stockMovements"
  FOR ALL USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- ==================== TOOLS ====================
CREATE TABLE IF NOT EXISTS public.tools (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  "qrCode"    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'available',
  "projectId" UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  "tenantId"  TEXT NOT NULL
);

ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tools_tenant" ON public.tools
  FOR ALL USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- ==================== TOOL LOGS ====================
CREATE TABLE IF NOT EXISTS public."toolLogs" (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "toolId"                 UUID NOT NULL REFERENCES public.tools(id) ON DELETE CASCADE,
  "toolName"               TEXT NOT NULL,
  "userId"                 UUID NOT NULL,
  "userName"               TEXT NOT NULL,
  "checkoutDate"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "returnDate"             TIMESTAMPTZ,
  "checkoutSupervisorId"   UUID NOT NULL,
  "checkoutSupervisorName" TEXT NOT NULL,
  "returnSupervisorId"     UUID,
  "returnSupervisorName"   TEXT,
  "returnStatus"           TEXT,
  "returnNotes"            TEXT,
  "tenantId"               TEXT NOT NULL
);

ALTER TABLE public."toolLogs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "toolLogs_tenant" ON public."toolLogs"
  FOR ALL USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- ==================== MATERIAL REQUESTS ====================
CREATE TABLE IF NOT EXISTS public."materialRequests" (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  items           JSONB NOT NULL DEFAULT '[]',
  area            TEXT NOT NULL,
  "supervisorId"  UUID NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userName"      TEXT,
  "approvalDate"  TIMESTAMPTZ,
  "rejectionDate" TIMESTAMPTZ,
  "deliveryDate"  TIMESTAMPTZ,
  "approverId"    UUID,
  "approverName"  TEXT,
  notes           TEXT,
  "tenantId"      TEXT NOT NULL,
  "projectId"     UUID REFERENCES public.projects(id) ON DELETE SET NULL
);

ALTER TABLE public."materialRequests" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "materialRequests_tenant" ON public."materialRequests"
  FOR ALL USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- ==================== RETURN REQUESTS ====================
CREATE TABLE IF NOT EXISTS public."returnRequests" (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "supervisorId"   UUID NOT NULL,
  "supervisorName" TEXT NOT NULL,
  "materialId"     UUID REFERENCES public.materials(id) ON DELETE SET NULL,
  "materialName"   TEXT NOT NULL,
  quantity         NUMERIC NOT NULL,
  unit             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completionDate" TIMESTAMPTZ,
  notes            TEXT,
  "handlerId"      UUID,
  "handlerName"    TEXT,
  "tenantId"       TEXT NOT NULL,
  "projectId"      UUID REFERENCES public.projects(id) ON DELETE SET NULL
);

ALTER TABLE public."returnRequests" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "returnRequests_tenant" ON public."returnRequests"
  FOR ALL USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- ==================== PURCHASE LOTS ====================
CREATE TABLE IF NOT EXISTS public."purchaseLots" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "creatorId"   UUID NOT NULL,
  "creatorName" TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open',
  "supplierId"  UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  "tenantId"    TEXT NOT NULL
);

ALTER TABLE public."purchaseLots" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchaseLots_tenant" ON public."purchaseLots"
  FOR ALL USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- ==================== PURCHASE ORDERS ====================
CREATE TABLE IF NOT EXISTS public."purchaseOrders" (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "supplierId"   UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  "supplierName" TEXT NOT NULL,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "creatorId"    UUID NOT NULL,
  "creatorName"  TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'generated',
  "requestIds"   TEXT[] DEFAULT '{}',
  items          JSONB NOT NULL DEFAULT '[]',
  "lotId"        UUID REFERENCES public."purchaseLots"(id) ON DELETE SET NULL,
  "pdfUrl"       TEXT,
  "officialOCId" TEXT,
  "processedAt"  TIMESTAMPTZ,
  "processedBy"  UUID,
  "totalAmount"  NUMERIC,
  "tenantId"     TEXT NOT NULL
);

ALTER TABLE public."purchaseOrders" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchaseOrders_tenant" ON public."purchaseOrders"
  FOR ALL USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- ==================== PURCHASE REQUESTS ====================
CREATE TABLE IF NOT EXISTS public."purchaseRequests" (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "materialName"     TEXT NOT NULL,
  quantity           NUMERIC NOT NULL,
  "originalQuantity" NUMERIC,
  unit               TEXT NOT NULL,
  justification      TEXT NOT NULL DEFAULT '',
  "supervisorId"     UUID NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending',
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "orderedAt"        TIMESTAMPTZ,
  "receivedAt"       TIMESTAMPTZ,
  category           TEXT NOT NULL DEFAULT '',
  area               TEXT NOT NULL DEFAULT '',
  phase              TEXT,
  activity           TEXT,
  "workItemId"       UUID,
  "lotId"            UUID REFERENCES public."purchaseLots"(id) ON DELETE SET NULL,
  notes              TEXT,
  "approverId"       UUID,
  "approvalDate"     TIMESTAMPTZ,
  "requesterName"    TEXT,
  "approverName"     TEXT,
  "tenantId"         TEXT NOT NULL,
  "projectId"        UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  "purchaseOrderId"  UUID REFERENCES public."purchaseOrders"(id) ON DELETE SET NULL,
  "rejectionReason"  TEXT,
  "rejectionDate"    TIMESTAMPTZ
);

ALTER TABLE public."purchaseRequests" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchaseRequests_tenant" ON public."purchaseRequests"
  FOR ALL USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- ==================== SUPPLIER PAYMENTS ====================
CREATE TABLE IF NOT EXISTS public."supplierPayments" (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "supplierId"          UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  "invoiceNumber"       TEXT NOT NULL,
  amount                NUMERIC NOT NULL,
  "issueDate"           TIMESTAMPTZ NOT NULL,
  "dueDate"             TIMESTAMPTZ NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending',
  "createdAt"           TIMESTAMPTZ DEFAULT NOW(),
  "purchaseOrderNumber" TEXT,
  work                  TEXT,
  "paymentDate"         TIMESTAMPTZ,
  "paymentMethod"       TEXT,
  "pdfURL"              TEXT,
  "tenantId"            TEXT NOT NULL
);

ALTER TABLE public."supplierPayments" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplierPayments_tenant" ON public."supplierPayments"
  FOR ALL USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- ==================== SALARY ADVANCES ====================
CREATE TABLE IF NOT EXISTS public."salaryAdvances" (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workerId"        UUID NOT NULL,
  "workerName"      TEXT NOT NULL,
  amount            NUMERIC NOT NULL,
  "requestedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status            TEXT NOT NULL DEFAULT 'pending',
  "processedAt"     TIMESTAMPTZ,
  "approverId"      UUID,
  "approverName"    TEXT,
  "rejectionReason" TEXT,
  "tenantId"        TEXT NOT NULL
);

ALTER TABLE public."salaryAdvances" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salaryAdvances_tenant" ON public."salaryAdvances"
  FOR ALL USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- ==================== ATTENDANCE LOGS ====================
CREATE TABLE IF NOT EXISTS public."attendanceLogs" (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"            UUID NOT NULL,
  "userName"          TEXT NOT NULL,
  timestamp           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type                TEXT NOT NULL,
  method              TEXT NOT NULL,
  "registrarId"       UUID NOT NULL,
  "registrarName"     TEXT NOT NULL,
  date                TEXT NOT NULL,
  "originalTimestamp" TIMESTAMPTZ,
  "modifiedAt"        TIMESTAMPTZ,
  "modifiedBy"        UUID,
  "tenantId"          TEXT NOT NULL
);

ALTER TABLE public."attendanceLogs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendanceLogs_tenant" ON public."attendanceLogs"
  FOR ALL USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

CREATE INDEX IF NOT EXISTS idx_attendance_date ON public."attendanceLogs" (date, "userId");

-- ==================== CHECKLIST TEMPLATES ====================
CREATE TABLE IF NOT EXISTS public."checklistTemplates" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  items       JSONB NOT NULL DEFAULT '[]',
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "tenantId"  TEXT NOT NULL
);

ALTER TABLE public."checklistTemplates" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklistTemplates_tenant" ON public."checklistTemplates"
  FOR ALL USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- ==================== ASSIGNED CHECKLISTS ====================
CREATE TABLE IF NOT EXISTS public."assignedChecklists" (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "templateId"     UUID REFERENCES public."checklistTemplates"(id) ON DELETE SET NULL,
  "templateTitle"  TEXT NOT NULL,
  "supervisorId"   UUID NOT NULL,
  "assignerId"     UUID NOT NULL,
  "assignerName"   TEXT NOT NULL,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status           TEXT NOT NULL DEFAULT 'assigned',
  area             TEXT NOT NULL,
  items            JSONB DEFAULT '[]',
  observations     TEXT,
  "evidencePhotos" TEXT[] DEFAULT '{}',
  "performedBy"    JSONB,
  "completedAt"    TIMESTAMPTZ,
  "reviewedBy"     JSONB,
  "rejectionNotes" TEXT,
  "tenantId"       TEXT NOT NULL
);

ALTER TABLE public."assignedChecklists" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assignedChecklists_tenant" ON public."assignedChecklists"
  FOR ALL USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- ==================== SAFETY INSPECTIONS ====================
CREATE TABLE IF NOT EXISTS public."safetyInspections" (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "inspectorId"         UUID NOT NULL,
  "inspectorName"       TEXT NOT NULL,
  "inspectorRole"       TEXT NOT NULL,
  date                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  area                  TEXT NOT NULL,
  location              TEXT,
  description           TEXT NOT NULL DEFAULT '',
  "riskLevel"           TEXT NOT NULL,
  "actionPlan"          TEXT,
  "evidencePhotoUrl"    TEXT,
  "evidencePhotos"      TEXT[] DEFAULT '{}',
  "assignedTo"          UUID,
  deadline              TIMESTAMPTZ,
  status                TEXT NOT NULL DEFAULT 'open',
  "completionNotes"     TEXT,
  "completionExecutor"  TEXT,
  "completionPhotos"    TEXT[] DEFAULT '{}',
  "completedAt"         TIMESTAMPTZ,
  "completionSignature" TEXT,
  "reviewedBy"          JSONB,
  "rejectionNotes"      TEXT,
  "tenantId"            TEXT NOT NULL
);

ALTER TABLE public."safetyInspections" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "safetyInspections_tenant" ON public."safetyInspections"
  FOR ALL USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- ==================== BEHAVIOR OBSERVATIONS ====================
CREATE TABLE IF NOT EXISTS public."behaviorObservations" (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra                TEXT NOT NULL,
  "workerId"          UUID NOT NULL,
  "workerName"        TEXT NOT NULL,
  "workerRut"         TEXT,
  "observationDate"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  items               JSONB NOT NULL DEFAULT '[]',
  "riskLevel"         TEXT,
  feedback            TEXT,
  "observerSignature" TEXT,
  "workerSignature"   TEXT,
  "observerId"        UUID NOT NULL,
  "observerName"      TEXT NOT NULL,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "evidencePhoto"     TEXT,
  "tenantId"          TEXT NOT NULL
);

ALTER TABLE public."behaviorObservations" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "behaviorObservations_tenant" ON public."behaviorObservations"
  FOR ALL USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- ==================== DAILY TALKS ====================
CREATE TABLE IF NOT EXISTS public."dailyTalks" (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"      TEXT NOT NULL,
  obra            TEXT NOT NULL,
  fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expositorId"   UUID NOT NULL,
  "expositorName" TEXT NOT NULL,
  temas           TEXT NOT NULL,
  asistentes      JSONB NOT NULL DEFAULT '[]',
  firma           TEXT,
  foto            TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public."dailyTalks" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dailyTalks_tenant" ON public."dailyTalks"
  FOR ALL USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- ==================== WORK ITEMS ====================
CREATE TABLE IF NOT EXISTS public."workItems" (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"         TEXT NOT NULL,
  "projectId"        UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  name               TEXT NOT NULL,
  type               TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'in-progress',
  "parentId"         UUID REFERENCES public."workItems"(id) ON DELETE CASCADE,
  path               TEXT NOT NULL DEFAULT '',
  progress           NUMERIC NOT NULL DEFAULT 0,
  "plannedStartDate" TIMESTAMPTZ,
  "plannedEndDate"   TIMESTAMPTZ,
  "actualStartDate"  TIMESTAMPTZ,
  "actualEndDate"    TIMESTAMPTZ,
  unit               TEXT NOT NULL DEFAULT '',
  quantity           NUMERIC NOT NULL DEFAULT 0,
  "unitPrice"        NUMERIC NOT NULL DEFAULT 0,
  "assignedTo"       UUID,
  "createdBy"        UUID
);

ALTER TABLE public."workItems" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workItems_tenant" ON public."workItems"
  FOR ALL USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- ==================== PROGRESS LOGS ====================
CREATE TABLE IF NOT EXISTS public."progressLogs" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"   TEXT NOT NULL,
  "workItemId" UUID NOT NULL REFERENCES public."workItems"(id) ON DELETE CASCADE,
  date         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  quantity     NUMERIC NOT NULL,
  "userId"     UUID NOT NULL,
  "userName"   TEXT NOT NULL,
  observations TEXT,
  "photoUrl"   TEXT
);

ALTER TABLE public."progressLogs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "progressLogs_tenant" ON public."progressLogs"
  FOR ALL USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- ==================== PAYMENT STATES ====================
CREATE TABLE IF NOT EXISTS public."paymentStates" (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "contractorId"   UUID NOT NULL,
  "contractorName" TEXT NOT NULL,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "totalValue"     NUMERIC NOT NULL DEFAULT 0,
  "earnedValue"    NUMERIC NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending',
  items            JSONB NOT NULL DEFAULT '[]',
  "tenantId"       TEXT NOT NULL
);

ALTER TABLE public."paymentStates" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "paymentStates_tenant" ON public."paymentStates"
  FOR ALL USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- ==================== ROLES (permisos dinámicos) ====================
CREATE TABLE IF NOT EXISTS public.roles (
  id          TEXT PRIMARY KEY,
  description TEXT,
  permissions TEXT[] DEFAULT '{}'
);

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roles_select_all" ON public.roles
  FOR SELECT USING (TRUE);

CREATE POLICY "roles_write_admin" ON public.roles
  FOR ALL USING (get_my_role() IN ('super-admin', 'admin'));

-- ==================== SUBSCRIPTION PLANS ====================
CREATE TABLE IF NOT EXISTS public."subscriptionPlans" (
  id                   TEXT PRIMARY KEY,
  plan                 TEXT NOT NULL,
  features             JSONB DEFAULT '{}',
  "maxUsers"           INTEGER,
  "maxRequests"        INTEGER,
  "storageLimitMB"     INTEGER,
  "allowedPermissions" TEXT[] DEFAULT '{}'
);

ALTER TABLE public."subscriptionPlans" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptionPlans_select_all" ON public."subscriptionPlans"
  FOR SELECT USING (TRUE);

CREATE POLICY "subscriptionPlans_write_superadmin" ON public."subscriptionPlans"
  FOR ALL USING (get_my_role() = 'super-admin');

-- ==================== REALTIME ====================
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tenants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.materials;
ALTER PUBLICATION supabase_realtime ADD TABLE public."materialCategories";
ALTER PUBLICATION supabase_realtime ADD TABLE public.units;
ALTER PUBLICATION supabase_realtime ADD TABLE public.suppliers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tools;
ALTER PUBLICATION supabase_realtime ADD TABLE public."toolLogs";
ALTER PUBLICATION supabase_realtime ADD TABLE public."materialRequests";
ALTER PUBLICATION supabase_realtime ADD TABLE public."returnRequests";
ALTER PUBLICATION supabase_realtime ADD TABLE public."purchaseRequests";
ALTER PUBLICATION supabase_realtime ADD TABLE public."purchaseLots";
ALTER PUBLICATION supabase_realtime ADD TABLE public."purchaseOrders";
ALTER PUBLICATION supabase_realtime ADD TABLE public."supplierPayments";
ALTER PUBLICATION supabase_realtime ADD TABLE public."salaryAdvances";
ALTER PUBLICATION supabase_realtime ADD TABLE public."attendanceLogs";
ALTER PUBLICATION supabase_realtime ADD TABLE public."checklistTemplates";
ALTER PUBLICATION supabase_realtime ADD TABLE public."assignedChecklists";
ALTER PUBLICATION supabase_realtime ADD TABLE public."safetyInspections";
ALTER PUBLICATION supabase_realtime ADD TABLE public."behaviorObservations";
ALTER PUBLICATION supabase_realtime ADD TABLE public."stockMovements";
ALTER PUBLICATION supabase_realtime ADD TABLE public."workItems";
ALTER PUBLICATION supabase_realtime ADD TABLE public."progressLogs";
ALTER PUBLICATION supabase_realtime ADD TABLE public."paymentStates";
ALTER PUBLICATION supabase_realtime ADD TABLE public."dailyTalks";

-- ==================== RPC: add_work_item_progress ====================
CREATE OR REPLACE FUNCTION add_work_item_progress(
  p_work_item_id UUID,
  p_quantity     NUMERIC,
  p_date         TIMESTAMPTZ,
  p_observations TEXT,
  p_user_id      UUID,
  p_user_name    TEXT,
  p_tenant_id    TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_work_item    public."workItems"%ROWTYPE;
  v_existing_qty NUMERIC;
  v_total        NUMERIC;
  v_new_progress NUMERIC;
BEGIN
  SELECT * INTO v_work_item FROM public."workItems" WHERE id = p_work_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La partida de trabajo no existe.'; END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_existing_qty
    FROM public."progressLogs" WHERE "workItemId" = p_work_item_id;

  v_total := v_existing_qty + p_quantity;
  IF v_total > v_work_item.quantity THEN
    RAISE EXCEPTION 'La cantidad total avanzada (%) no puede exceder la cantidad total (%).', v_total, v_work_item.quantity;
  END IF;

  v_new_progress := (v_total / NULLIF(v_work_item.quantity, 0)) * 100;

  INSERT INTO public."progressLogs" ("tenantId","workItemId",date,quantity,"userId","userName",observations)
  VALUES (p_tenant_id, p_work_item_id, p_date, p_quantity, p_user_id, p_user_name, p_observations);

  UPDATE public."workItems" SET progress = v_new_progress WHERE id = p_work_item_id;
END;
$$;

-- ==================== RPC: return_tool ====================
CREATE OR REPLACE FUNCTION return_tool(
  p_log_id    UUID,
  p_status    TEXT,
  p_notes     TEXT,
  p_user_id   UUID,
  p_user_name TEXT,
  p_tenant_id TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_tool_id UUID;
BEGIN
  SELECT "toolId" INTO v_tool_id FROM public."toolLogs" WHERE id = p_log_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro de herramienta no encontrado.'; END IF;

  UPDATE public.tools SET status = CASE WHEN p_status = 'ok' THEN 'available' ELSE 'maintenance' END WHERE id = v_tool_id;

  UPDATE public."toolLogs"
     SET "returnDate" = NOW(), "returnStatus" = p_status, "returnNotes" = p_notes,
         "returnSupervisorId" = p_user_id, "returnSupervisorName" = p_user_name
   WHERE id = p_log_id;
END;
$$;

-- ==================== RPC: checkout_tool ====================
CREATE OR REPLACE FUNCTION checkout_tool(
  p_tool_id         UUID,
  p_user_id         UUID,
  p_user_name       TEXT,
  p_supervisor_id   UUID,
  p_supervisor_name TEXT,
  p_tenant_id       TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_tool_name TEXT;
BEGIN
  SELECT name INTO v_tool_name FROM public.tools WHERE id = p_tool_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Herramienta no encontrada.'; END IF;

  UPDATE public.tools SET status = 'in-use' WHERE id = p_tool_id;

  INSERT INTO public."toolLogs"
    ("toolId","toolName","userId","userName","checkoutDate","returnDate","checkoutSupervisorId","checkoutSupervisorName","tenantId")
  VALUES (p_tool_id, v_tool_name, p_user_id, p_user_name, NOW(), NULL, p_supervisor_id, p_supervisor_name, p_tenant_id);
END;
$$;

-- ==================== RPC: delete_lot ====================
CREATE OR REPLACE FUNCTION delete_lot(p_lot_id UUID, p_tenant_id TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public."purchaseRequests" SET "lotId" = NULL, status = 'approved'
   WHERE "lotId" = p_lot_id AND "tenantId" = p_tenant_id;
  DELETE FROM public."purchaseLots" WHERE id = p_lot_id;
END;
$$;

-- ==================== RPC: sign_daily_talk ====================
CREATE OR REPLACE FUNCTION sign_daily_talk(
  p_talk_id   UUID,
  p_user_id   UUID,
  p_signature TEXT,
  p_tenant_id TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_talk      public."dailyTalks"%ROWTYPE;
  v_attendees JSONB;
  v_idx       INT;
  i           INT;
BEGIN
  SELECT * INTO v_talk FROM public."dailyTalks" WHERE id = p_talk_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La charla no existe.'; END IF;

  v_attendees := v_talk.asistentes;
  v_idx := NULL;

  FOR i IN 0 .. jsonb_array_length(v_attendees) - 1 LOOP
    IF (v_attendees->i->>'id') = p_user_id::TEXT THEN
      v_idx := i; EXIT;
    END IF;
  END LOOP;

  IF v_idx IS NULL THEN RAISE EXCEPTION 'No estás en la lista de asistentes de esta charla.'; END IF;

  v_attendees := jsonb_set(
    v_attendees, ARRAY[v_idx::TEXT],
    (v_attendees->v_idx) || jsonb_build_object(
      'signed', TRUE,
      'signedAt', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'signature', p_signature
    )
  );

  UPDATE public."dailyTalks" SET asistentes = v_attendees WHERE id = p_talk_id;
END;
$$;

-- ==================== RPC: add_manual_stock_entry ====================
CREATE OR REPLACE FUNCTION add_manual_stock_entry(
  p_material_id   UUID,
  p_quantity      NUMERIC,
  p_justification TEXT,
  p_user_id       UUID,
  p_user_name     TEXT,
  p_tenant_id     TEXT,
  p_project_id    UUID DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_current_stock NUMERIC;
  v_new_stock     NUMERIC;
  v_material_name TEXT;
BEGIN
  SELECT stock, name INTO v_current_stock, v_material_name
    FROM public.materials WHERE id = p_material_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material no encontrado.'; END IF;

  v_new_stock := v_current_stock + p_quantity;
  UPDATE public.materials SET stock = v_new_stock WHERE id = p_material_id;

  INSERT INTO public."stockMovements"
    ("materialId","materialName","quantityChange","newStock",type,date,justification,"userId","userName","tenantId","projectId")
  VALUES
    (p_material_id, v_material_name, p_quantity, v_new_stock, 'manual-entry', NOW(), p_justification, p_user_id, p_user_name, p_tenant_id, p_project_id);
END;
$$;
