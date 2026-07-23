-- ============================================================
-- 015 — APU (Análisis de Precios Unitarios) y estructura de costos
-- Ejecutar en Supabase (Dashboard > SQL Editor). Idempotente.
--
-- QUÉ AGREGA
--   1. `resources`        — catálogo único de recursos con precio (materiales,
--                           mano de obra por HH, equipos por HM). Se cambia un
--                           precio acá y se recalculan todos los APU que lo usan.
--   2. `apus`             — un APU. Si `isTemplate` = true es de la biblioteca de
--                           la empresa; si tiene `workItemId` es el APU concreto
--                           de una partida (copia del template al aplicarlo, así
--                           ajustar una obra no descuadra las demás).
--   3. `apuItems`         — las líneas del APU. Pueden ser por cantidad
--                           (rendimiento × precio) o por porcentaje de otro
--                           grupo (ej: "herramienta menor 5% de la mano de obra").
--   4. `budgetOverheads`  — gastos generales detallados del presupuesto, cada uno
--                           como monto fijo o como % del costo directo.
--   5. Columnas de % en `budgets` — imprevistos, utilidad e IVA.
--
-- CASCADA DE CÁLCULO (la aplica el frontend en src/lib/apu-costs.ts)
--   Costo Directo  = Σ partidas (cantidad × precio unitario) de las hojas
--   Gastos Grales  = Σ budgetOverheads (montos + % del CD)
--   Imprevistos    = contingencyPercent × (CD + GG)
--   Utilidad       = profitPercent      × (CD + GG + Imprevistos)
--   Neto           = CD + GG + Imprevistos + Utilidad
--   IVA            = taxPercent × Neto
--   Total          = Neto + IVA
-- ============================================================

-- ============================================================
-- 1. CATÁLOGO DE RECURSOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.resources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"  TEXT NOT NULL,
  code        TEXT,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'material'
                CHECK (type IN ('material', 'labor', 'equipment', 'other')),
  unit        TEXT NOT NULL DEFAULT 'un',
  "unitPrice" NUMERIC NOT NULL DEFAULT 0,
  notes       TEXT,
  "isActive"  BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS resources_tenant_idx ON public.resources ("tenantId");

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resources_select" ON public.resources;
CREATE POLICY "resources_select" ON public.resources
  FOR SELECT USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

DROP POLICY IF EXISTS "resources_write" ON public.resources;
CREATE POLICY "resources_write" ON public.resources
  FOR ALL USING ("tenantId" = get_my_tenant_id() AND has_permission('construction_control:edit_structure'))
  WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('construction_control:edit_structure'));

-- ============================================================
-- 2. APU
--    `workItemId` con índice único parcial: una partida tiene a lo más un APU.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.apus (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    TEXT NOT NULL,
  code          TEXT,
  name          TEXT NOT NULL,
  unit          TEXT NOT NULL DEFAULT 'un',
  "isTemplate"  BOOLEAN NOT NULL DEFAULT TRUE,
  "workItemId"  UUID REFERENCES public."workItems"(id) ON DELETE CASCADE,
  "sourceApuId" UUID REFERENCES public.apus(id) ON DELETE SET NULL,
  notes         TEXT,
  "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS apus_tenant_idx ON public.apus ("tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS apus_workitem_unique
  ON public.apus ("workItemId") WHERE "workItemId" IS NOT NULL;

ALTER TABLE public.apus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "apus_select" ON public.apus;
CREATE POLICY "apus_select" ON public.apus
  FOR SELECT USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

DROP POLICY IF EXISTS "apus_write" ON public.apus;
CREATE POLICY "apus_write" ON public.apus
  FOR ALL USING ("tenantId" = get_my_tenant_id() AND has_permission('construction_control:edit_structure'))
  WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('construction_control:edit_structure'));

-- ============================================================
-- 3. LÍNEAS DEL APU
--    `calcMode`:
--      'quantity' → cantidad (rendimiento) × precio unitario
--      'percent'  → percentValue % del subtotal de `percentOf`
--                   ('material' | 'labor' | 'equipment' | 'direct')
--    `unitPrice` es una FOTO del precio del recurso al momento de agregarlo:
--    así un APU histórico no cambia solo, y se refresca a pedido.
-- ============================================================
CREATE TABLE IF NOT EXISTS public."apuItems" (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     TEXT NOT NULL,
  "apuId"        UUID NOT NULL REFERENCES public.apus(id) ON DELETE CASCADE,
  "resourceId"   UUID REFERENCES public.resources(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'material'
                   CHECK (kind IN ('material', 'labor', 'equipment', 'other')),
  unit           TEXT NOT NULL DEFAULT 'un',
  "calcMode"     TEXT NOT NULL DEFAULT 'quantity'
                   CHECK ("calcMode" IN ('quantity', 'percent')),
  quantity       NUMERIC NOT NULL DEFAULT 0,
  "unitPrice"    NUMERIC NOT NULL DEFAULT 0,
  "percentValue" NUMERIC,
  "percentOf"    TEXT CHECK ("percentOf" IN ('material', 'labor', 'equipment', 'direct')),
  "sortOrder"    INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "apuItems_apu_idx"    ON public."apuItems" ("apuId");
CREATE INDEX IF NOT EXISTS "apuItems_tenant_idx" ON public."apuItems" ("tenantId");

ALTER TABLE public."apuItems" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "apuItems_select" ON public."apuItems";
CREATE POLICY "apuItems_select" ON public."apuItems"
  FOR SELECT USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

DROP POLICY IF EXISTS "apuItems_write" ON public."apuItems";
CREATE POLICY "apuItems_write" ON public."apuItems"
  FOR ALL USING ("tenantId" = get_my_tenant_id() AND has_permission('construction_control:edit_structure'))
  WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('construction_control:edit_structure'));

-- ============================================================
-- 4. GASTOS GENERALES DEL PRESUPUESTO
--    Cada línea es monto fijo ('amount') o % del costo directo ('percent').
-- ============================================================
CREATE TABLE IF NOT EXISTS public."budgetOverheads" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"  TEXT NOT NULL,
  "budgetId"  UUID NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  mode        TEXT NOT NULL DEFAULT 'amount' CHECK (mode IN ('amount', 'percent')),
  amount      NUMERIC NOT NULL DEFAULT 0,
  percent     NUMERIC NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "budgetOverheads_budget_idx" ON public."budgetOverheads" ("budgetId");
CREATE INDEX IF NOT EXISTS "budgetOverheads_tenant_idx" ON public."budgetOverheads" ("tenantId");

ALTER TABLE public."budgetOverheads" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "budgetOverheads_select" ON public."budgetOverheads";
CREATE POLICY "budgetOverheads_select" ON public."budgetOverheads"
  FOR SELECT USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

DROP POLICY IF EXISTS "budgetOverheads_write" ON public."budgetOverheads";
CREATE POLICY "budgetOverheads_write" ON public."budgetOverheads"
  FOR ALL USING ("tenantId" = get_my_tenant_id() AND has_permission('construction_control:edit_structure'))
  WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('construction_control:edit_structure'));

-- ============================================================
-- 5. PORCENTAJES DEL PRESUPUESTO
--    IVA 19% por defecto (Chile). Imprevistos y utilidad parten en 0 para no
--    inflar montos sin que el usuario lo haya decidido.
-- ============================================================
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS "contingencyPercent" NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "profitPercent"      NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "taxPercent"         NUMERIC NOT NULL DEFAULT 19;
