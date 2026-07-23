-- ============================================================
-- 013 — Clientes, presupuestos y trazabilidad del gasto
-- Ejecutar en Supabase (Dashboard > SQL Editor).
-- Idempotente: se puede re-ejecutar sin daño.
--
-- QUÉ AGREGA
--   Jerarquía nueva:  Empresa (tenant) → Cliente → Obra → Presupuesto → Partidas
--
--   1. `clients`            — los clientes/mandantes de la constructora.
--   2. `projects.clientId`  — a qué cliente pertenece cada obra.
--   3. `budgets`            — una obra puede tener el presupuesto PRINCIPAL y
--                             N ADICIONALES (obras extraordinarias que pide el
--                             cliente). Cada uno con su propia EDT.
--   4. `workItems.budgetId` — la partida ahora cuelga de un presupuesto.
--   5. `purchaseOrders.projectId` y `supplierPayments.projectId` — sin esto el
--      gasto real NO se puede atribuir a una obra (y por lo tanto a un cliente);
--      hoy la factura solo guarda un texto libre en la columna `work`.
--
-- SOBRE LOS DATOS QUE YA EXISTEN
--   · Las obras actuales quedan con clientId NULL = "Sin asignar" (decisión del
--     usuario). Se asignan a mano desde la app.
--   · A cada obra que YA tenga partidas se le crea un presupuesto "Principal" y
--     se le cuelgan sus partidas, para no perder ninguna EDT cargada.
--   · Las órdenes de compra heredan el projectId de sus solicitudes cuando se
--     puede deducir sin ambigüedad. Las facturas antiguas quedan en NULL.
-- ============================================================

-- ============================================================
-- 1. CLIENTES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    TEXT NOT NULL,
  name          TEXT NOT NULL,
  rut           TEXT,
  "contactName" TEXT,
  email         TEXT,
  phone         TEXT,
  address       TEXT,
  notes         TEXT,
  "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clients_tenant_idx ON public.clients ("tenantId");

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_select" ON public.clients;
CREATE POLICY "clients_select" ON public.clients
  FOR SELECT USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- La cartera de clientes es dato comercial: se escribe con el mismo permiso
-- que administra las obras.
DROP POLICY IF EXISTS "clients_write" ON public.clients;
CREATE POLICY "clients_write" ON public.clients
  FOR ALL USING ("tenantId" = get_my_tenant_id() AND has_permission('projects:manage'))
  WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('projects:manage'));

-- ============================================================
-- 2. LA OBRA PERTENECE A UN CLIENTE
--    NULL = "Sin asignar". ON DELETE SET NULL: borrar un cliente no puede
--    llevarse por delante la obra ni su historial de gastos.
-- ============================================================
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS "clientId" UUID REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS projects_client_idx ON public.projects ("clientId");

-- ============================================================
-- 3. PRESUPUESTOS (principal + adicionales)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.budgets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"   TEXT NOT NULL,
  "projectId"  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'principal'
                 CHECK (type IN ('principal', 'adicional')),
  status       TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'approved', 'rejected')),
  "approvedAt" TIMESTAMPTZ,
  notes        TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS budgets_tenant_idx  ON public.budgets ("tenantId");
CREATE INDEX IF NOT EXISTS budgets_project_idx ON public.budgets ("projectId");

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "budgets_select" ON public.budgets;
CREATE POLICY "budgets_select" ON public.budgets
  FOR SELECT USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- Mismo permiso que las partidas: un presupuesto ES el valor de la obra.
DROP POLICY IF EXISTS "budgets_write" ON public.budgets;
CREATE POLICY "budgets_write" ON public.budgets
  FOR ALL USING ("tenantId" = get_my_tenant_id() AND has_permission('construction_control:edit_structure'))
  WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('construction_control:edit_structure'));

-- ============================================================
-- 4. LA PARTIDA CUELGA DE UN PRESUPUESTO
-- ============================================================
ALTER TABLE public."workItems"
  ADD COLUMN IF NOT EXISTS "budgetId" UUID REFERENCES public.budgets(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "workItems_budget_idx" ON public."workItems" ("budgetId");

-- ============================================================
-- 5. TRAZABILIDAD DEL GASTO REAL
--    Sin estas dos columnas no se puede responder "¿cuánto llevo gastado en
--    el cliente X?", que es el objetivo de todo este cambio.
-- ============================================================
ALTER TABLE public."purchaseOrders"
  ADD COLUMN IF NOT EXISTS "projectId" UUID REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE public."supplierPayments"
  ADD COLUMN IF NOT EXISTS "projectId" UUID REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "purchaseOrders_project_idx"   ON public."purchaseOrders" ("projectId");
CREATE INDEX IF NOT EXISTS "supplierPayments_project_idx" ON public."supplierPayments" ("projectId");

-- ============================================================
-- 6. MIGRACIÓN DE DATOS EXISTENTES
-- ============================================================

-- 6.1 Un presupuesto "Principal" por cada obra que ya tenga partidas cargadas.
INSERT INTO public.budgets (id, "tenantId", "projectId", name, type, status)
SELECT
  gen_random_uuid(),
  p."tenantId",
  p.id,
  'Presupuesto Principal',
  'principal',
  'approved'
FROM public.projects p
WHERE EXISTS (
        SELECT 1 FROM public."workItems" wi
        WHERE wi."projectId" = p.id AND wi."budgetId" IS NULL
      )
  AND NOT EXISTS (
        SELECT 1 FROM public.budgets b
        WHERE b."projectId" = p.id AND b.type = 'principal'
      );

-- 6.2 Colgar las partidas huérfanas de ese presupuesto principal.
UPDATE public."workItems" wi
SET "budgetId" = b.id
FROM public.budgets b
WHERE wi."budgetId" IS NULL
  AND b."projectId" = wi."projectId"
  AND b.type = 'principal';

-- 6.3 Las órdenes de compra heredan la obra de sus solicitudes, pero solo
--     cuando TODAS apuntan a la misma: si una OC mezcla obras no se puede
--     atribuir sin inventar, y se deja en NULL para revisarla a mano.
UPDATE public."purchaseOrders" po
SET "projectId" = sub."projectId"
FROM (
  -- No se usa MIN(): Postgres no tiene MIN(uuid). El HAVING de abajo garantiza
  -- que hay un único projectId, así que basta con tomar el primero del array.
  SELECT pr."purchaseOrderId"              AS oc_id,
         (array_agg(DISTINCT pr."projectId"))[1] AS "projectId"
  FROM public."purchaseRequests" pr
  WHERE pr."purchaseOrderId" IS NOT NULL
    AND pr."projectId" IS NOT NULL
  GROUP BY pr."purchaseOrderId"
  HAVING COUNT(DISTINCT pr."projectId") = 1
) sub
WHERE po.id = sub.oc_id
  AND po."projectId" IS NULL;
