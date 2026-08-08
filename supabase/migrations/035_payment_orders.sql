-- ============================================================
-- 035 · Bloque A5 — Orden de Pago y cierre del contrato
-- Ejecutar en Supabase (Dashboard > SQL Editor). Idempotente.
--
-- QUÉ CIERRA
--   Los dos últimos eslabones del proceso de contratación: el documento con el
--   que Finanzas paga («se genera Orden de Pago» en la pizarra) y la
--   liquidación del contrato cuando ya no queda nada pendiente.
--
-- POR QUÉ LA ORDEN DE PAGO ES UNA TABLA Y NO UN BOTÓN «IMPRIMIR»
--   Entre aprobar un estado de pago y que la plata salga hay un documento con
--   vida propia: se emite, se manda al contratista, a veces se anula y se
--   reemite, y alguien tiene que poder responder «¿esta factura contra qué OP
--   se pagó?». Si fuera solo un PDF que se genera al vuelo, esa pregunta no
--   tendría respuesta y el correlativo cambiaría cada vez que alguien
--   apretara el botón.
--
-- EL CORRELATIVO LO PONE LA BASE
--   Calcularlo en el navegador (MAX + 1) parece igual hasta el día que dos
--   personas emiten a la vez y las dos leen el mismo máximo. Acá lo asigna un
--   trigger dentro de la transacción, contra un índice único: si hay carrera,
--   una de las dos reintenta, no se duplica el número.
-- ============================================================

CREATE TABLE IF NOT EXISTS public."paymentOrders" (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     TEXT NOT NULL,

  -- Correlativo por empresa. Lo asigna el trigger; no se manda desde el cliente.
  number         INTEGER NOT NULL DEFAULT 0,

  -- Qué estado de pago paga. Igual que los descuentos, sirve a los dos:
  -- el del subcontrato (lo que YO pago) y —cuando el mandante me paga a mí—
  -- el del contrato, para dejar registrada la orden que él emitió.
  "certificateType" TEXT NOT NULL
                    CHECK ("certificateType" IN ('subcontract', 'contract')),
  "certificateId"   UUID NOT NULL,
  "projectId"    UUID REFERENCES public.projects(id) ON DELETE SET NULL,

  -- Fotografía de a quién se le paga y a qué cuenta. Si mañana el contratista
  -- cambia de banco, esta orden sigue diciendo a dónde se transfirió de verdad.
  "supplierId"   UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  "supplierName" TEXT NOT NULL,
  "supplierRut"  TEXT,
  bank           TEXT,
  "accountType"  TEXT,
  "accountNumber" TEXT,
  email          TEXT,

  amount         NUMERIC(18,4) NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'CLP' CHECK (currency IN ('CLP', 'UF')),
  "issueDate"    DATE NOT NULL DEFAULT CURRENT_DATE,
  "dueDate"      DATE,
  "invoiceNumber" TEXT,

  status         TEXT NOT NULL DEFAULT 'emitida'
                 CHECK (status IN ('emitida', 'enviada', 'pagada', 'anulada')),

  -- Envío al correo del contratista (opción 1 de la pizarra).
  "sentAt"       TIMESTAMPTZ,
  "sentTo"       TEXT,
  -- Pago efectivo.
  "paidAt"       TIMESTAMPTZ,
  "paymentMethod" TEXT,
  "paymentReference" TEXT,
  -- Anular exige motivo: una OP que desaparece sin explicación deja un hueco
  -- en el correlativo que nadie sabe justificar.
  "voidReason"   TEXT,

  notes          TEXT,
  "createdBy"    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT payment_order_void_needs_reason
    CHECK (status <> 'anulada' OR (("voidReason" IS NOT NULL) AND length(btrim("voidReason")) > 0))
);

CREATE INDEX IF NOT EXISTS payment_orders_tenant_idx  ON public."paymentOrders" ("tenantId");
CREATE INDEX IF NOT EXISTS payment_orders_cert_idx    ON public."paymentOrders" ("certificateType", "certificateId");
CREATE INDEX IF NOT EXISTS payment_orders_supplier_idx ON public."paymentOrders" ("supplierId");

CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_number_uniq
  ON public."paymentOrders" ("tenantId", number);

-- Una orden vigente por estado de pago. Se puede reemitir, pero anulando la
-- anterior primero: dos órdenes vivas por el mismo estado de pago es la forma
-- más directa de pagar dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_cert_uniq
  ON public."paymentOrders" ("certificateType", "certificateId")
  WHERE status <> 'anulada';

-- ============================================================
-- CORRELATIVO
-- ============================================================
CREATE OR REPLACE FUNCTION public.payment_order_assign_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.number IS NULL OR NEW.number <= 0 THEN
    SELECT COALESCE(MAX(number), 0) + 1 INTO NEW.number
    FROM public."paymentOrders"
    WHERE "tenantId" = NEW."tenantId";
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_order_number ON public."paymentOrders";
CREATE TRIGGER trg_payment_order_number
  BEFORE INSERT ON public."paymentOrders"
  FOR EACH ROW EXECUTE FUNCTION public.payment_order_assign_number();

-- ============================================================
-- NO SE EMITE UNA ORDEN DE PAGO DE ALGO QUE NO ESTÁ APROBADO
--
-- Es la guarda que evita el error caro: emitir la orden con el estado de pago
-- todavía en revisión. En el subcontrato se exige además el F30-1 —la misma
-- regla de la Ley 20.123 que ya bloquea marcarlo pagado—, porque la orden es
-- justamente el papel con el que sale la plata.
-- ============================================================
CREATE OR REPLACE FUNCTION public.payment_order_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status   TEXT;
  v_f30_1    DATE;
  v_requires BOOLEAN;
  v_sub      UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."certificateType" = 'subcontract' THEN
      SELECT status, "f30_1Date", "subcontractId"
        INTO v_status, v_f30_1, v_sub
      FROM public."subcontractCertificates" WHERE id = NEW."certificateId";

      IF v_status IS NULL THEN
        RAISE EXCEPTION 'El estado de pago no existe.';
      END IF;
      IF v_status NOT IN ('aprobado', 'pagado') THEN
        RAISE EXCEPTION 'Solo se emite una orden de pago de un estado de pago aprobado.';
      END IF;

      SELECT "requiresLaborCompliance" INTO v_requires
      FROM public.subcontracts WHERE id = v_sub;

      IF COALESCE(v_requires, TRUE) AND v_f30_1 IS NULL THEN
        RAISE EXCEPTION 'Falta el certificado F30-1 del período (Ley 20.123): no se puede emitir la orden de pago.';
      END IF;

    ELSE
      SELECT status INTO v_status
      FROM public."paymentCertificates" WHERE id = NEW."certificateId";

      IF v_status IS NULL THEN
        RAISE EXCEPTION 'El estado de pago no existe.';
      END IF;
      IF v_status NOT IN ('aprobado', 'facturado', 'pagado') THEN
        RAISE EXCEPTION 'Solo se emite una orden de pago de un estado de pago aprobado.';
      END IF;
    END IF;
  END IF;

  -- Una orden pagada ya movió plata: no cambia de monto ni de destinatario.
  IF TG_OP = 'UPDATE' AND OLD.status = 'pagada' THEN
    IF NEW.amount        IS DISTINCT FROM OLD.amount
    OR NEW."supplierId"  IS DISTINCT FROM OLD."supplierId"
    OR NEW."accountNumber" IS DISTINCT FROM OLD."accountNumber" THEN
      RAISE EXCEPTION 'Esta orden de pago ya se pagó: no puede cambiar de monto ni de destinatario.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_order_guard ON public."paymentOrders";
CREATE TRIGGER trg_payment_order_guard
  BEFORE INSERT OR UPDATE ON public."paymentOrders"
  FOR EACH ROW EXECUTE FUNCTION public.payment_order_guard();

-- ============================================================
-- CIERRE DEL CONTRATO
--   `subcontracts.status` ya contempla 'liquidado'. Lo que faltaba era dejar
--   registro de CUÁNDO se cerró y con qué observación: un contrato que pasa a
--   liquidado sin fecha no se puede auditar después.
-- ============================================================
ALTER TABLE public.subcontracts ADD COLUMN IF NOT EXISTS "closedAt"     TIMESTAMPTZ;
ALTER TABLE public.subcontracts ADD COLUMN IF NOT EXISTS "closureNotes" TEXT;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public."paymentOrders" ENABLE ROW LEVEL SECURITY;

-- El subcontratista ve la orden con la que se le paga: es su comprobante.
DROP POLICY IF EXISTS "payment_orders_select" ON public."paymentOrders";
CREATE POLICY "payment_orders_select" ON public."paymentOrders"
  FOR SELECT USING (
    get_my_role() = 'super-admin'
    OR "tenantId" = get_my_tenant_id()
    OR (
      "certificateType" = 'subcontract'
      AND EXISTS (
        SELECT 1 FROM public."subcontractCertificates" sc
        WHERE sc.id = public."paymentOrders"."certificateId"
          AND public.can_act_as_subcontractor(sc."subcontractId")
      )
    )
  );

DROP POLICY IF EXISTS "payment_orders_write" ON public."paymentOrders";
CREATE POLICY "payment_orders_write" ON public."paymentOrders"
  FOR ALL USING (
    get_my_role() = 'super-admin'
    OR (
      "tenantId" = get_my_tenant_id()
      AND (
        ("certificateType" = 'subcontract' AND has_permission('subcontracts:manage'))
        OR ("certificateType" = 'contract' AND has_permission('payment_certificates:create'))
      )
    )
  ) WITH CHECK (
    get_my_role() = 'super-admin'
    OR (
      "tenantId" = get_my_tenant_id()
      AND (
        ("certificateType" = 'subcontract' AND has_permission('subcontracts:manage'))
        OR ("certificateType" = 'contract' AND has_permission('payment_certificates:create'))
      )
    )
  );

-- ============================================================
-- REALTIME
-- ============================================================
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public."paymentOrders"; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
