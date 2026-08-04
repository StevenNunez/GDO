-- ============================================================
-- 019 · Oficina Técnica — Contrato, garantías e indicadores
-- Ejecutar en Supabase (Dashboard > SQL Editor). Idempotente.
--
-- QUÉ AGREGA
--   1. `contracts`     — la ficha contractual de la obra. Es lo que faltaba para
--                        poder calcular un estado de pago: de acá salen el
--                        anticipo a amortizar, el % de retención, el plazo
--                        contra el que se miden las multas y la base del
--                        reajuste. Un contrato por presupuesto principal.
--   2. `guarantees`    — boletas de garantía / pólizas, con vencimiento.
--   3. `marketIndices` — UF, UTM e IPC por fecha. Tabla GLOBAL (dato público),
--                        sin tenantId: la lee cualquier usuario autenticado y
--                        solo el servidor la escribe.
--
-- SOBRE EL TIPO DE CONTRATO
--   Se elige al crear el presupuesto de la obra, porque determina cómo se cobra:
--     · suma_alzada            → % de avance × valor de la partida
--     · precios_unitarios      → cantidad realmente ejecutada × PU de contrato
--     · administracion_delegada→ costo real del período + honorario %
--   Los porcentajes de anticipo, retención y multa NO son ley: son de cada
--   contrato. Por eso van todos como columnas configurables y sin default
--   "estándar" que induzca a error.
-- ============================================================

-- ============================================================
-- 1. CONTRATOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contracts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    TEXT NOT NULL,
  -- Obra y presupuesto que le sirve de línea base. Ambos nullable por la misma
  -- razón que en `budgets`: un presupuesto puede nacer antes de asignarse.
  "projectId"   UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  "budgetId"    UUID REFERENCES public.budgets(id)  ON DELETE SET NULL,

  code          TEXT,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL
                CHECK (type IN ('suma_alzada', 'precios_unitarios', 'administracion_delegada')),

  -- Un contrato en UF se guarda en UF; la conversión a pesos se hace al emitir
  -- cada estado de pago con la UF del día, no acá.
  currency      TEXT NOT NULL DEFAULT 'CLP' CHECK (currency IN ('CLP', 'UF')),
  "amountNet"   NUMERIC(18,4) NOT NULL DEFAULT 0,
  -- Honorario sobre el costo real. Solo aplica a administración delegada.
  "feePercent"  NUMERIC(7,4) NOT NULL DEFAULT 0,

  "signDate"    DATE,
  "startDate"   DATE,
  "plazoDias"   INTEGER,

  -- Anticipo: se paga al inicio y se amortiza descontándolo de cada EEPP en
  -- proporción al avance cobrado (decisión del usuario, 2026-08-03).
  "advancePercent"      NUMERIC(7,4) NOT NULL DEFAULT 0,

  -- Retención: % de cada EEPP que se retiene, con tope acumulado opcional
  -- expresado como % del contrato. NULL = sin tope.
  "retentionPercent"    NUMERIC(7,4) NOT NULL DEFAULT 0,
  "retentionCapPercent" NUMERIC(7,4),

  -- Multa por atraso: por día, en ‰ del monto del contrato o en monto fijo.
  "multaMode"   TEXT NOT NULL DEFAULT 'permil_contrato'
                CHECK ("multaMode" IN ('permil_contrato', 'monto_fijo')),
  "multaValue"  NUMERIC(18,4) NOT NULL DEFAULT 0,

  "reajusteType"     TEXT NOT NULL DEFAULT 'none'
                     CHECK ("reajusteType" IN ('none', 'ipc', 'uf', 'polinomico')),
  "reajusteBaseDate" DATE,

  "taxPercent"  NUMERIC(7,4) NOT NULL DEFAULT 19,

  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'active', 'suspended', 'finished', 'closed')),
  notes         TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contracts_tenant_idx  ON public.contracts ("tenantId");
CREATE INDEX IF NOT EXISTS contracts_project_idx ON public.contracts ("projectId");
-- Un presupuesto es la línea base de un solo contrato.
CREATE UNIQUE INDEX IF NOT EXISTS contracts_budget_uniq
  ON public.contracts ("budgetId") WHERE "budgetId" IS NOT NULL;

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contracts_select" ON public.contracts;
CREATE POLICY "contracts_select" ON public.contracts
  FOR SELECT USING (
    ("tenantId" = get_my_tenant_id() AND has_permission('contracts:view'))
    OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "contracts_write" ON public.contracts;
CREATE POLICY "contracts_write" ON public.contracts
  FOR ALL
  USING      ("tenantId" = get_my_tenant_id() AND has_permission('contracts:manage'))
  WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('contracts:manage'));

-- ============================================================
-- 2. GARANTÍAS (boletas / pólizas)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.guarantees (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    TEXT NOT NULL,
  "contractId"  UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,

  type          TEXT NOT NULL
                CHECK (type IN ('fiel_cumplimiento', 'anticipo', 'buena_ejecucion',
                                'seriedad_oferta', 'otra')),
  instrument    TEXT NOT NULL DEFAULT 'boleta_bancaria'
                CHECK (instrument IN ('boleta_bancaria', 'poliza', 'retencion', 'otro')),

  bank          TEXT,
  number        TEXT,
  amount        NUMERIC(18,4) NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'CLP' CHECK (currency IN ('CLP', 'UF')),
  "issueDate"   DATE,
  "expiryDate"  DATE,

  -- Solo estados que alguien decide. "Por vencer" y "vencida" NO se guardan:
  -- se derivan de expiryDate al mostrarlas, para que no queden datos podridos
  -- que digan "vigente" tres meses después del vencimiento.
  status        TEXT NOT NULL DEFAULT 'vigente'
                CHECK (status IN ('vigente', 'devuelta', 'cobrada', 'anulada')),
  notes         TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS guarantees_tenant_idx   ON public.guarantees ("tenantId");
CREATE INDEX IF NOT EXISTS guarantees_contract_idx ON public.guarantees ("contractId");
CREATE INDEX IF NOT EXISTS guarantees_expiry_idx   ON public.guarantees ("expiryDate");

ALTER TABLE public.guarantees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guarantees_select" ON public.guarantees;
CREATE POLICY "guarantees_select" ON public.guarantees
  FOR SELECT USING (
    ("tenantId" = get_my_tenant_id() AND has_permission('contracts:view'))
    OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "guarantees_write" ON public.guarantees;
CREATE POLICY "guarantees_write" ON public.guarantees
  FOR ALL
  USING      ("tenantId" = get_my_tenant_id() AND has_permission('guarantees:manage'))
  WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('guarantees:manage'));

-- ============================================================
-- 3. INDICADORES (UF / UTM / IPC)
--    Dato público y compartido: sin tenantId. Lo escribe solo el servidor
--    (service role, que no pasa por RLS) desde mindicador.cl, o el super-admin
--    a mano si la API no responde.
-- ============================================================
CREATE TABLE IF NOT EXISTS public."marketIndices" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date        DATE NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('uf', 'utm', 'ipc')),
  value       NUMERIC(18,6) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (date, type)
);

CREATE INDEX IF NOT EXISTS market_indices_type_date_idx
  ON public."marketIndices" (type, date DESC);

ALTER TABLE public."marketIndices" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "market_indices_select" ON public."marketIndices";
CREATE POLICY "market_indices_select" ON public."marketIndices"
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "market_indices_write" ON public."marketIndices";
CREATE POLICY "market_indices_write" ON public."marketIndices"
  FOR ALL
  USING      (get_my_role() = 'super-admin')
  WITH CHECK (get_my_role() = 'super-admin');

-- ============================================================
-- 4. TIPO DE CONTRATO EN EL PRESUPUESTO
--    Se elige al crear el presupuesto de la obra. Se guarda también acá (y no
--    solo en `contracts`) porque la EDT y el cálculo del avance lo necesitan
--    para saber si se cobra por % o por cantidad ejecutada, sin tener que
--    cargar el contrato entero.
-- ============================================================
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS "contractType" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'budgets_contract_type_check'
  ) THEN
    ALTER TABLE public.budgets ADD CONSTRAINT budgets_contract_type_check
      CHECK ("contractType" IS NULL OR "contractType" IN
             ('suma_alzada', 'precios_unitarios', 'administracion_delegada'));
  END IF;
END $$;

-- Los presupuestos que ya existen quedan como suma alzada, que es el caso más
-- común en edificación privada. Se puede cambiar desde la app.
UPDATE public.budgets SET "contractType" = 'suma_alzada' WHERE "contractType" IS NULL;

-- ============================================================
-- 5. PERMISOS DEL MÓDULO
--    Sin esto, has_permission() devuelve FALSE y la base rechaza toda escritura
--    aunque la UI muestre los botones. admin/operations/soporte/super-admin se
--    resuelven por código dentro de has_permission y no necesitan fila.
--    Se agregan al rol DEFAULT de plataforma; cada empresa puede ajustarlo.
-- ============================================================
UPDATE public.roles
SET permissions = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(
      permissions || ARRAY[
        'module_technical_office:view',
        'contracts:view',
        'contracts:manage',
        'guarantees:manage'
      ]
    )
  )
)
WHERE id = 'jefe-oficina-tecnica' AND "tenantId" = '__default__';
