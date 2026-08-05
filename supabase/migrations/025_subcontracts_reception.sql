-- ============================================================
-- 025 · Oficina Técnica — Subcontratos y recepción de obra
-- Ejecutar en Supabase (Dashboard > SQL Editor). Idempotente.
--
-- Cierra el módulo. Son las dos puntas que faltaban:
--
--   1. SUBCONTRATOS — la obra le cobra al mandante (Fase 2) y le paga a sus
--      subcontratistas. Es el mismo mecanismo al revés: contrato con monto,
--      anticipo, retención y multas; estados de pago que cubican avance;
--      retención que se devuelve al recibir la obra.
--
--   2. RECEPCIÓN — provisoria y definitiva, con su lista de observaciones
--      (punch list) y la devolución de la retención. Sin esto, la retención
--      queda retenida para siempre en la planilla y nadie sabe qué falta para
--      cerrar la obra.
--
-- POR QUÉ NO SE REUSAN LAS TABLAS DEL MANDANTE
--   `contracts` y `paymentCertificates` son el contrato de la obra: hay UNO por
--   obra y su lógica de aprobación es la de la ITO. Un subcontrato es de otra
--   naturaleza (hay N por obra, los aprueba la propia empresa, y exigen
--   cumplimiento laboral F30/F30-1 antes de pagar). Meter ambos en la misma
--   tabla obligaría a que la mitad de las columnas fueran nulas y a que cada
--   consulta recordara filtrar por tipo. El CÁLCULO sí se reusa: las dos usan
--   `src/lib/contract.ts` y `src/lib/payment-certificate.ts`.
--
-- F30 / F30-1 (Ley 20.123 de subcontratación)
--   La empresa mandante responde subsidiariamente por las obligaciones
--   laborales y previsionales de sus subcontratistas. En la práctica eso se
--   controla exigiendo el certificado F30-1 antes de pagar cada estado de pago.
--   Acá es un trigger, no un recordatorio: pagar sin ese respaldo es exactamente
--   el riesgo que la ley traspasa a quien paga.
-- ============================================================

-- ============================================================
-- 1. SUBCONTRATOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subcontracts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    TEXT NOT NULL,
  "projectId"   UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  -- El subcontratista suele estar ya cargado como proveedor. Se permite texto
  -- libre para no obligar a crear la ficha antes de registrar el contrato.
  "supplierId"  UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  "supplierName" TEXT,

  code          TEXT,
  name          TEXT NOT NULL,
  -- Mismos tres tipos que el contrato con el mandante: el cálculo se comparte.
  type          TEXT NOT NULL DEFAULT 'suma_alzada'
                CHECK (type IN ('suma_alzada', 'precios_unitarios', 'administracion_delegada')),

  currency      TEXT NOT NULL DEFAULT 'CLP' CHECK (currency IN ('CLP', 'UF')),
  "amountNet"   NUMERIC(18,4) NOT NULL DEFAULT 0,

  "signDate"    DATE,
  "startDate"   DATE,
  "plazoDias"   INTEGER,

  "advancePercent"      NUMERIC(7,4) NOT NULL DEFAULT 0,
  "retentionPercent"    NUMERIC(7,4) NOT NULL DEFAULT 0,
  "retentionCapPercent" NUMERIC(7,4),

  "multaMode"   TEXT NOT NULL DEFAULT 'permil_contrato'
                CHECK ("multaMode" IN ('permil_contrato', 'monto_fijo')),
  "multaValue"  NUMERIC(18,4) NOT NULL DEFAULT 0,
  "taxPercent"  NUMERIC(7,4) NOT NULL DEFAULT 19,

  -- Se puede apagar por subcontrato (un servicio puntual sin trabajadores en
  -- obra no lo necesita), pero viene encendido: es la protección por defecto.
  "requiresLaborCompliance" BOOLEAN NOT NULL DEFAULT TRUE,

  status        TEXT NOT NULL DEFAULT 'vigente'
                CHECK (status IN ('borrador', 'vigente', 'suspendido',
                                  'terminado', 'liquidado')),
  notes         TEXT,
  "createdBy"   TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subcontracts_tenant_idx  ON public.subcontracts ("tenantId");
CREATE INDEX IF NOT EXISTS subcontracts_project_idx ON public.subcontracts ("projectId");

-- ============================================================
-- 2. PARTIDAS DEL SUBCONTRATO
--    Su propio itemizado: los precios que se le pagan al subcontratista NO son
--    los que se le cobran al mandante. `workItemId` enlaza —cuando corresponde—
--    con la partida de la EDT, y ese enlace es lo que permite comparar por
--    partida lo que se cobra contra lo que se paga.
-- ============================================================
CREATE TABLE IF NOT EXISTS public."subcontractItems" (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     TEXT NOT NULL,
  "subcontractId" UUID NOT NULL REFERENCES public.subcontracts(id) ON DELETE CASCADE,
  "workItemId"   UUID REFERENCES public."workItems"(id) ON DELETE SET NULL,

  name           TEXT NOT NULL,
  unit           TEXT,
  quantity       NUMERIC(18,4) NOT NULL DEFAULT 0,
  "unitPrice"    NUMERIC(18,4) NOT NULL DEFAULT 0,
  "sortOrder"    INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subcontract_items_tenant_idx ON public."subcontractItems" ("tenantId");
CREATE INDEX IF NOT EXISTS subcontract_items_sub_idx    ON public."subcontractItems" ("subcontractId");

-- ============================================================
-- 3. ESTADOS DE PAGO DE SUBCONTRATO
--    Mismos montos congelados que el EEPP al mandante y por la misma razón: un
--    estado de pago aprobado es un documento que ya se pagó.
-- ============================================================
CREATE TABLE IF NOT EXISTS public."subcontractCertificates" (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     TEXT NOT NULL,
  "subcontractId" UUID NOT NULL REFERENCES public.subcontracts(id) ON DELETE CASCADE,
  "projectId"    UUID REFERENCES public.projects(id) ON DELETE SET NULL,

  number         INTEGER NOT NULL DEFAULT 1,
  "periodStart"  DATE,
  "periodEnd"    DATE,
  status         TEXT NOT NULL DEFAULT 'borrador'
                 CHECK (status IN ('borrador', 'aprobado', 'pagado', 'rechazado')),

  -- Fotografía del subcontrato al emitir.
  "retentionPercent" NUMERIC(7,4) NOT NULL DEFAULT 0,
  "advancePercent"   NUMERIC(7,4) NOT NULL DEFAULT 0,
  "taxPercent"       NUMERIC(7,4) NOT NULL DEFAULT 19,

  "periodAmount"        NUMERIC(18,4) NOT NULL DEFAULT 0,
  "accumulatedAmount"   NUMERIC(18,4) NOT NULL DEFAULT 0,
  "advanceAmortization" NUMERIC(18,4) NOT NULL DEFAULT 0,
  "retentionAmount"     NUMERIC(18,4) NOT NULL DEFAULT 0,
  "penaltyAmount"       NUMERIC(18,4) NOT NULL DEFAULT 0,
  "otherDeductions"     NUMERIC(18,4) NOT NULL DEFAULT 0,
  "otherDeductionsNote" TEXT,
  "netAmount"           NUMERIC(18,4) NOT NULL DEFAULT 0,
  "taxAmount"           NUMERIC(18,4) NOT NULL DEFAULT 0,
  "totalAmount"         NUMERIC(18,4) NOT NULL DEFAULT 0,

  -- Cumplimiento laboral: se guarda la FECHA del certificado recibido, no un
  -- "sí/no". Un F30-1 de hace ocho meses no acredita el período que se paga.
  "f30Date"      DATE,
  "f30_1Date"    DATE,
  "invoiceNumber" TEXT,

  notes          TEXT,
  "approvedAt"   TIMESTAMPTZ,
  "approvedBy"   TEXT,
  "paidAt"       TIMESTAMPTZ,
  "createdBy"    TEXT,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subcontract_certs_tenant_idx ON public."subcontractCertificates" ("tenantId");
CREATE INDEX IF NOT EXISTS subcontract_certs_sub_idx    ON public."subcontractCertificates" ("subcontractId");
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_certs_number_uniq
  ON public."subcontractCertificates" ("subcontractId", number);

CREATE TABLE IF NOT EXISTS public."subcontractCertificateLines" (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"      TEXT NOT NULL,
  "certificateId" UUID NOT NULL REFERENCES public."subcontractCertificates"(id) ON DELETE CASCADE,
  "subcontractItemId" UUID REFERENCES public."subcontractItems"(id) ON DELETE SET NULL,

  name            TEXT NOT NULL,
  unit            TEXT,
  "sortOrder"     INTEGER NOT NULL DEFAULT 0,
  "quantityContract"   NUMERIC(18,4) NOT NULL DEFAULT 0,
  "unitPrice"          NUMERIC(18,4) NOT NULL DEFAULT 0,
  "previousQuantity"   NUMERIC(18,4) NOT NULL DEFAULT 0,
  "periodQuantity"     NUMERIC(18,4) NOT NULL DEFAULT 0,
  "accumulatedQuantity" NUMERIC(18,4) NOT NULL DEFAULT 0,
  "previousAmount"     NUMERIC(18,4) NOT NULL DEFAULT 0,
  "periodAmount"       NUMERIC(18,4) NOT NULL DEFAULT 0,
  "accumulatedAmount"  NUMERIC(18,4) NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subcontract_cert_lines_tenant_idx ON public."subcontractCertificateLines" ("tenantId");
CREATE INDEX IF NOT EXISTS subcontract_cert_lines_cert_idx   ON public."subcontractCertificateLines" ("certificateId");

-- ── Guardas ──────────────────────────────────────────────────────────────
-- El detalle no se toca una vez fuera de borrador.
CREATE OR REPLACE FUNCTION public.sc_guard_frozen()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status
  FROM public."subcontractCertificates"
  WHERE id = COALESCE(NEW."certificateId", OLD."certificateId");

  IF v_status IS DISTINCT FROM 'borrador' THEN
    RAISE EXCEPTION 'El estado de pago del subcontrato ya no está en borrador: su detalle no se puede modificar.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS sc_lines_frozen ON public."subcontractCertificateLines";
CREATE TRIGGER sc_lines_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON public."subcontractCertificateLines"
  FOR EACH ROW EXECUTE FUNCTION public.sc_guard_frozen();

-- Montos congelados al aprobar + control de cumplimiento laboral al pagar.
CREATE OR REPLACE FUNCTION public.sc_guard_amounts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requires BOOLEAN;
BEGIN
  IF OLD.status IN ('aprobado', 'pagado') THEN
    IF NEW."periodAmount"        IS DISTINCT FROM OLD."periodAmount"
    OR NEW."accumulatedAmount"   IS DISTINCT FROM OLD."accumulatedAmount"
    OR NEW."advanceAmortization" IS DISTINCT FROM OLD."advanceAmortization"
    OR NEW."retentionAmount"     IS DISTINCT FROM OLD."retentionAmount"
    OR NEW."penaltyAmount"       IS DISTINCT FROM OLD."penaltyAmount"
    OR NEW."otherDeductions"     IS DISTINCT FROM OLD."otherDeductions"
    OR NEW."netAmount"           IS DISTINCT FROM OLD."netAmount"
    OR NEW."totalAmount"         IS DISTINCT FROM OLD."totalAmount"
    THEN
      RAISE EXCEPTION 'Un estado de pago aprobado no puede cambiar de monto.';
    END IF;
  END IF;

  -- Ley 20.123: sin F30-1 del período no se paga. La empresa responde
  -- subsidiariamente por lo que el subcontratista le deba a sus trabajadores.
  IF NEW.status = 'pagado' AND OLD.status IS DISTINCT FROM 'pagado' THEN
    SELECT "requiresLaborCompliance" INTO v_requires
    FROM public.subcontracts WHERE id = NEW."subcontractId";

    IF COALESCE(v_requires, TRUE) AND NEW."f30_1Date" IS NULL THEN
      RAISE EXCEPTION 'No se puede pagar sin el certificado F30-1 del período (Ley 20.123). Cárgalo o desactiva la exigencia en el subcontrato.';
    END IF;
  END IF;

  IF NEW.status = 'aprobado' AND OLD.status IS DISTINCT FROM 'aprobado' THEN
    IF NOT has_permission('subcontracts:approve') THEN
      RAISE EXCEPTION 'No tienes permiso para aprobar estados de pago de subcontrato.';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sc_amounts_frozen ON public."subcontractCertificates";
CREATE TRIGGER sc_amounts_frozen
  BEFORE UPDATE ON public."subcontractCertificates"
  FOR EACH ROW EXECUTE FUNCTION public.sc_guard_amounts();

-- ============================================================
-- 4. RECEPCIÓN DE OBRA
--    Puede ser de la obra completa (contrato con el mandante) o de un
--    subcontrato. Una sola tabla con las dos referencias, porque el trámite es
--    idéntico: se recibe, se levantan observaciones, se subsanan y se devuelve
--    la retención.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.receptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     TEXT NOT NULL,
  "projectId"    UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  "contractId"   UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  "subcontractId" UUID REFERENCES public.subcontracts(id) ON DELETE CASCADE,

  type           TEXT NOT NULL DEFAULT 'provisoria'
                 CHECK (type IN ('provisoria', 'definitiva')),
  "receptionDate" DATE,
  -- Quién recibe: la ITO, el mandante, o la empresa cuando recibe a su
  -- subcontratista.
  "receivedBy"   TEXT,
  status         TEXT NOT NULL DEFAULT 'borrador'
                 CHECK (status IN ('borrador', 'con_observaciones', 'aceptada', 'rechazada')),

  -- Retención que se devuelve con esta recepción. Es la razón práctica por la
  -- que una recepción se firma: sin ella la plata queda retenida para siempre.
  "retentionReleased" NUMERIC(18,4) NOT NULL DEFAULT 0,
  -- Plazo de garantía que empieza a correr con la recepción provisoria.
  "warrantyDays" INTEGER,

  notes          TEXT,
  "createdBy"    TEXT,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- O es de la obra, o es de un subcontrato: nunca de las dos cosas ni de
  -- ninguna, porque entonces no se sabría a quién se le está devolviendo la
  -- retención.
  CONSTRAINT receptions_target_check CHECK (
    ("contractId" IS NOT NULL AND "subcontractId" IS NULL)
    OR ("contractId" IS NULL AND "subcontractId" IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS receptions_tenant_idx  ON public.receptions ("tenantId");
CREATE INDEX IF NOT EXISTS receptions_project_idx ON public.receptions ("projectId");
CREATE INDEX IF NOT EXISTS receptions_sub_idx     ON public.receptions ("subcontractId");

-- ============================================================
-- 5. OBSERVACIONES (punch list)
--    Cada defecto con su responsable y su plazo. `photoPath` va al bucket
--    `obra-docs` de la migración 023, no como base64.
-- ============================================================
CREATE TABLE IF NOT EXISTS public."receptionObservations" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    TEXT NOT NULL,
  "receptionId" UUID NOT NULL REFERENCES public.receptions(id) ON DELETE CASCADE,
  "workItemId"  UUID REFERENCES public."workItems"(id) ON DELETE SET NULL,

  description   TEXT NOT NULL,
  location      TEXT,
  "responsibleName" TEXT,
  "dueDate"     DATE,
  severity      TEXT NOT NULL DEFAULT 'menor'
                CHECK (severity IN ('menor', 'mayor', 'critica')),
  status        TEXT NOT NULL DEFAULT 'pendiente'
                CHECK (status IN ('pendiente', 'subsanada', 'aceptada', 'anulada')),
  "photoPath"   TEXT,
  "photoName"   TEXT,
  "resolvedAt"  TIMESTAMPTZ,
  notes         TEXT,
  "createdBy"   TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reception_obs_tenant_idx    ON public."receptionObservations" ("tenantId");
CREATE INDEX IF NOT EXISTS reception_obs_reception_idx ON public."receptionObservations" ("receptionId");

-- La fecha de resolución acompaña al estado, igual que en las restricciones.
CREATE OR REPLACE FUNCTION public.observation_stamp_resolved()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('subsanada', 'aceptada') AND NEW."resolvedAt" IS NULL THEN
    NEW."resolvedAt" := NOW();
  END IF;
  IF NEW.status = 'pendiente' THEN
    NEW."resolvedAt" := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS reception_obs_resolved ON public."receptionObservations";
CREATE TRIGGER reception_obs_resolved
  BEFORE INSERT OR UPDATE ON public."receptionObservations"
  FOR EACH ROW EXECUTE FUNCTION public.observation_stamp_resolved();

-- ============================================================
-- 6. RLS
-- ============================================================
ALTER TABLE public.subcontracts                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."subcontractItems"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."subcontractCertificates"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."subcontractCertificateLines"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receptions                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."receptionObservations"          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subcontracts_select" ON public.subcontracts;
CREATE POLICY "subcontracts_select" ON public.subcontracts
  FOR SELECT USING (
    ("tenantId" = get_my_tenant_id() AND has_permission('subcontracts:view'))
    OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "subcontracts_write" ON public.subcontracts;
CREATE POLICY "subcontracts_write" ON public.subcontracts
  FOR ALL
  USING      ("tenantId" = get_my_tenant_id() AND has_permission('subcontracts:manage'))
  WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('subcontracts:manage'));

DROP POLICY IF EXISTS "subcontract_items_select" ON public."subcontractItems";
CREATE POLICY "subcontract_items_select" ON public."subcontractItems"
  FOR SELECT USING (
    ("tenantId" = get_my_tenant_id() AND has_permission('subcontracts:view'))
    OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "subcontract_items_write" ON public."subcontractItems";
CREATE POLICY "subcontract_items_write" ON public."subcontractItems"
  FOR ALL
  USING      ("tenantId" = get_my_tenant_id() AND has_permission('subcontracts:manage'))
  WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('subcontracts:manage'));

DROP POLICY IF EXISTS "subcontract_certs_select" ON public."subcontractCertificates";
CREATE POLICY "subcontract_certs_select" ON public."subcontractCertificates"
  FOR SELECT USING (
    ("tenantId" = get_my_tenant_id() AND has_permission('subcontracts:view'))
    OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "subcontract_certs_write" ON public."subcontractCertificates";
CREATE POLICY "subcontract_certs_write" ON public."subcontractCertificates"
  FOR ALL
  USING      ("tenantId" = get_my_tenant_id() AND has_permission('subcontracts:manage'))
  WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('subcontracts:manage'));

DROP POLICY IF EXISTS "subcontract_cert_lines_select" ON public."subcontractCertificateLines";
CREATE POLICY "subcontract_cert_lines_select" ON public."subcontractCertificateLines"
  FOR SELECT USING (
    ("tenantId" = get_my_tenant_id() AND has_permission('subcontracts:view'))
    OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "subcontract_cert_lines_write" ON public."subcontractCertificateLines";
CREATE POLICY "subcontract_cert_lines_write" ON public."subcontractCertificateLines"
  FOR ALL
  USING      ("tenantId" = get_my_tenant_id() AND has_permission('subcontracts:manage'))
  WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('subcontracts:manage'));

-- La recepción y sus observaciones las lee toda la obra: la lista de lo que
-- falta subsanar es trabajo de terreno.
DROP POLICY IF EXISTS "receptions_select" ON public.receptions;
CREATE POLICY "receptions_select" ON public.receptions
  FOR SELECT USING (
    "tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "receptions_write" ON public.receptions;
CREATE POLICY "receptions_write" ON public.receptions
  FOR ALL
  USING      ("tenantId" = get_my_tenant_id() AND has_permission('receptions:manage'))
  WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('receptions:manage'));

DROP POLICY IF EXISTS "reception_obs_select" ON public."receptionObservations";
CREATE POLICY "reception_obs_select" ON public."receptionObservations"
  FOR SELECT USING (
    "tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "reception_obs_write" ON public."receptionObservations";
CREATE POLICY "reception_obs_write" ON public."receptionObservations"
  FOR ALL
  USING      ("tenantId" = get_my_tenant_id() AND has_permission('receptions:manage'))
  WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('receptions:manage'));

-- ============================================================
-- 7. PERMISOS
-- ============================================================
UPDATE public.roles
SET permissions = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(
      permissions || ARRAY[
        'subcontracts:view',
        'subcontracts:manage',
        'subcontracts:approve',
        'receptions:manage'
      ]
    )
  )
)
WHERE id = 'jefe-oficina-tecnica' AND "tenantId" = '__default__';

-- El jefe de terreno recibe y levanta observaciones, pero no aprueba pagos.
UPDATE public.roles
SET permissions = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(permissions || ARRAY['subcontracts:view', 'receptions:manage'])
  )
)
WHERE id = 'jefe-terreno' AND "tenantId" = '__default__';
