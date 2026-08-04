-- ============================================================
-- 020 · Oficina Técnica — Estados de Pago al mandante (EEPP)
-- Ejecutar en Supabase (Dashboard > SQL Editor). Idempotente.
--
-- QUÉ AGREGA
--   1. `paymentCertificates`     — la carátula del estado de pago: período,
--                                  correlativo, estado del trámite y TODOS los
--                                  montos congelados.
--   2. `paymentCertificateLines` — el detalle por partida.
--
-- OJO: `paymentStates` (tabla vieja) es OTRA cosa — son los estados de pago a
-- CONTRATISTAS. Esta migración no la toca. En la Fase 7 esa tabla se re-encuadra
-- para reusar este mismo motor de cálculo.
--
-- POR QUÉ LOS MONTOS SE GUARDAN Y NO SE RECALCULAN
--   Un EEPP aprobado es un documento que se presentó y se cobró. Si los montos
--   se recalcularan al vuelo desde la EDT, editar el precio de una partida en
--   marzo cambiaría lo que dice el estado de pago de enero que ya se facturó.
--   Por eso cada línea guarda la cantidad y el precio con que se cobró, y un
--   trigger impide editar un EEPP que ya salió de borrador.
--
-- FLUJO DEL TRÁMITE
--   borrador → presentado (a la ITO) → aprobado → facturado → pagado
--   Desde `presentado` la ITO puede devolverlo a `rechazado`, y de ahí vuelve a
--   `borrador` para corregirlo.
-- ============================================================

-- ============================================================
-- 1. CARÁTULA
-- ============================================================
CREATE TABLE IF NOT EXISTS public."paymentCertificates" (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     TEXT NOT NULL,
  "contractId"   UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  "projectId"    UUID REFERENCES public.projects(id) ON DELETE SET NULL,

  -- Correlativo dentro del contrato: "EEPP N° 3".
  number         INTEGER NOT NULL,
  "periodStart"  DATE,
  "periodEnd"    DATE,

  status         TEXT NOT NULL DEFAULT 'borrador'
                 CHECK (status IN ('borrador','presentado','aprobado','rechazado','facturado','pagado')),

  -- Fotografía del contrato al momento de emitir. Si mañana cambian el % de
  -- retención, este EEPP sigue diciendo con cuál se calculó.
  "contractType"     TEXT NOT NULL,
  "retentionPercent" NUMERIC(7,4) NOT NULL DEFAULT 0,
  "advancePercent"   NUMERIC(7,4) NOT NULL DEFAULT 0,
  "taxPercent"       NUMERIC(7,4) NOT NULL DEFAULT 19,

  -- ── Montos (todos netos, en pesos) ──
  -- Avance del período = suma de las líneas.
  "periodAmount"       NUMERIC(18,4) NOT NULL DEFAULT 0,
  -- Acumulado a la fecha, incluido este EEPP.
  "accumulatedAmount"  NUMERIC(18,4) NOT NULL DEFAULT 0,
  -- Reajuste del período. En contratos polinómicos se ingresa a mano.
  "reajusteAmount"     NUMERIC(18,4) NOT NULL DEFAULT 0,
  -- Costo real del período: SOLO administración delegada (base del honorario).
  "realCostAmount"     NUMERIC(18,4) NOT NULL DEFAULT 0,
  "feeAmount"          NUMERIC(18,4) NOT NULL DEFAULT 0,

  -- ── Descuentos ──
  "advanceAmortization" NUMERIC(18,4) NOT NULL DEFAULT 0,
  "retentionAmount"     NUMERIC(18,4) NOT NULL DEFAULT 0,
  -- La multa NO se aplica sola: la decide el mandante/ITO. Se calcula y se
  -- muestra como sugerencia, pero acá solo llega lo que efectivamente se descontó.
  "penaltyAmount"       NUMERIC(18,4) NOT NULL DEFAULT 0,
  "otherDeductions"     NUMERIC(18,4) NOT NULL DEFAULT 0,
  "otherDeductionsNote" TEXT,

  -- ── Resultado ──
  "netAmount"   NUMERIC(18,4) NOT NULL DEFAULT 0,
  "taxAmount"   NUMERIC(18,4) NOT NULL DEFAULT 0,
  "totalAmount" NUMERIC(18,4) NOT NULL DEFAULT 0,

  notes         TEXT,
  "rejectionReason" TEXT,
  "invoiceNumber"   TEXT,

  "presentedAt" TIMESTAMPTZ,
  "approvedAt"  TIMESTAMPTZ,
  "approvedBy"  TEXT,
  "invoicedAt"  TIMESTAMPTZ,
  "paidAt"      TIMESTAMPTZ,
  "createdBy"   TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pc_tenant_idx   ON public."paymentCertificates" ("tenantId");
CREATE INDEX IF NOT EXISTS pc_contract_idx ON public."paymentCertificates" ("contractId");
-- El correlativo no se repite dentro de un contrato.
CREATE UNIQUE INDEX IF NOT EXISTS pc_contract_number_uniq
  ON public."paymentCertificates" ("contractId", number);

-- ============================================================
-- 2. DETALLE POR PARTIDA
-- ============================================================
CREATE TABLE IF NOT EXISTS public."paymentCertificateLines" (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"      TEXT NOT NULL,
  "certificateId" UUID NOT NULL REFERENCES public."paymentCertificates"(id) ON DELETE CASCADE,
  -- Se conserva la referencia, pero el nombre y el precio se copian: si mañana
  -- borran o renombran la partida, el documento cobrado sigue siendo legible.
  "workItemId"    UUID REFERENCES public."workItems"(id) ON DELETE SET NULL,

  name            TEXT NOT NULL,
  unit            TEXT,
  "sortOrder"     INTEGER NOT NULL DEFAULT 0,

  "quantityContract" NUMERIC(18,4) NOT NULL DEFAULT 0,
  "unitPrice"        NUMERIC(18,4) NOT NULL DEFAULT 0,

  -- Cantidades: anterior (lo ya cobrado) + período = acumulada.
  "previousQuantity"    NUMERIC(18,4) NOT NULL DEFAULT 0,
  "periodQuantity"      NUMERIC(18,4) NOT NULL DEFAULT 0,
  "accumulatedQuantity" NUMERIC(18,4) NOT NULL DEFAULT 0,

  "previousAmount"    NUMERIC(18,4) NOT NULL DEFAULT 0,
  "periodAmount"      NUMERIC(18,4) NOT NULL DEFAULT 0,
  "accumulatedAmount" NUMERIC(18,4) NOT NULL DEFAULT 0,

  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pcl_tenant_idx ON public."paymentCertificateLines" ("tenantId");
CREATE INDEX IF NOT EXISTS pcl_cert_idx   ON public."paymentCertificateLines" ("certificateId");

-- ============================================================
-- 3. CONGELADO: un EEPP fuera de borrador no se edita
--    Esta es la protección real. La UI puede esconder los botones, pero
--    cualquiera con sesión puede escribir por REST directo a PostgREST; el
--    trigger corre en la base y no se puede saltar.
-- ============================================================
CREATE OR REPLACE FUNCTION public.pc_guard_frozen()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status
  FROM public."paymentCertificates"
  WHERE id = COALESCE(NEW."certificateId", OLD."certificateId");

  IF v_status IS DISTINCT FROM 'borrador' THEN
    RAISE EXCEPTION 'El estado de pago ya no está en borrador: su detalle no se puede modificar.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS pc_lines_frozen ON public."paymentCertificateLines";
CREATE TRIGGER pc_lines_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON public."paymentCertificateLines"
  FOR EACH ROW EXECUTE FUNCTION public.pc_guard_frozen();

-- Los montos de la carátula tampoco se tocan una vez aprobado. Sí se permite
-- avanzar el trámite (facturar, marcar pagado) y anotar la factura.
CREATE OR REPLACE FUNCTION public.pc_guard_amounts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('aprobado','facturado','pagado') THEN
    IF NEW."periodAmount"        IS DISTINCT FROM OLD."periodAmount"
    OR NEW."accumulatedAmount"   IS DISTINCT FROM OLD."accumulatedAmount"
    OR NEW."reajusteAmount"      IS DISTINCT FROM OLD."reajusteAmount"
    OR NEW."advanceAmortization" IS DISTINCT FROM OLD."advanceAmortization"
    OR NEW."retentionAmount"     IS DISTINCT FROM OLD."retentionAmount"
    OR NEW."penaltyAmount"       IS DISTINCT FROM OLD."penaltyAmount"
    OR NEW."otherDeductions"     IS DISTINCT FROM OLD."otherDeductions"
    OR NEW."netAmount"           IS DISTINCT FROM OLD."netAmount"
    OR NEW."taxAmount"           IS DISTINCT FROM OLD."taxAmount"
    OR NEW."totalAmount"         IS DISTINCT FROM OLD."totalAmount"
    THEN
      RAISE EXCEPTION 'Un estado de pago aprobado no puede cambiar de monto.';
    END IF;
  END IF;

  -- Aprobar exige el permiso dedicado, no basta con poder editar.
  IF NEW.status = 'aprobado' AND OLD.status IS DISTINCT FROM 'aprobado' THEN
    IF NOT has_permission('payment_certificates:approve') THEN
      RAISE EXCEPTION 'No tienes permiso para aprobar estados de pago.';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pc_amounts_frozen ON public."paymentCertificates";
CREATE TRIGGER pc_amounts_frozen
  BEFORE UPDATE ON public."paymentCertificates"
  FOR EACH ROW EXECUTE FUNCTION public.pc_guard_amounts();

-- ============================================================
-- 4. RLS
-- ============================================================
ALTER TABLE public."paymentCertificates"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."paymentCertificateLines" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pc_select" ON public."paymentCertificates";
CREATE POLICY "pc_select" ON public."paymentCertificates"
  FOR SELECT USING (
    ("tenantId" = get_my_tenant_id() AND has_permission('payment_certificates:view'))
    OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "pc_write" ON public."paymentCertificates";
CREATE POLICY "pc_write" ON public."paymentCertificates"
  FOR ALL
  USING      ("tenantId" = get_my_tenant_id() AND has_permission('payment_certificates:create'))
  WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('payment_certificates:create'));

DROP POLICY IF EXISTS "pcl_select" ON public."paymentCertificateLines";
CREATE POLICY "pcl_select" ON public."paymentCertificateLines"
  FOR SELECT USING (
    ("tenantId" = get_my_tenant_id() AND has_permission('payment_certificates:view'))
    OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "pcl_write" ON public."paymentCertificateLines";
CREATE POLICY "pcl_write" ON public."paymentCertificateLines"
  FOR ALL
  USING      ("tenantId" = get_my_tenant_id() AND has_permission('payment_certificates:create'))
  WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('payment_certificates:create'));

-- ============================================================
-- 5. PERMISOS
--    Sin esto has_permission() devuelve FALSE y la base rechaza todo aunque la
--    UI muestre los botones. admin/operations/soporte/super-admin se resuelven
--    por código dentro de has_permission y no necesitan fila.
-- ============================================================
UPDATE public.roles
SET permissions = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(
      permissions || ARRAY[
        'payment_certificates:view',
        'payment_certificates:create',
        'payment_certificates:approve'
      ]
    )
  )
)
WHERE id = 'jefe-oficina-tecnica' AND "tenantId" = '__default__';
