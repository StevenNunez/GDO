-- ============================================================
-- 034 · Bloque A4 — Descuentos tipificados del estado de pago
-- Ejecutar en Supabase (Dashboard > SQL Editor). Idempotente.
--
-- QUÉ RESUELVE
--   Hasta ahora «otros descuentos» era UN número suelto con una nota de texto
--   al lado. Servía para que la resta cuadrara, y para nada más: nadie podía
--   responder «¿cuánto le he descontado en herramientas a este contratista
--   este año?», que es justamente la pregunta que aparece cuando el
--   contratista reclama.
--
--   Con los descuentos como líneas —cada una con su tipo, su monto y, cuando
--   corresponde, de dónde salió— el estado de pago deja de ser una resta y
--   pasa a ser una liquidación que se puede explicar renglón por renglón.
--
-- POR QUÉ SE CONSERVA LA COLUMNA `otherDeductions`
--   Porque la leen el cálculo de la carátula (`payment-certificate.ts`), los
--   PDF y los estados de pago ya emitidos. En vez de romper todo eso, la
--   columna pasa a ser un TOTAL DERIVADO: un trigger la recalcula desde las
--   líneas y, de paso, rehace el neto, el IVA y el total. La consecuencia
--   importante: las líneas son ahora la ÚNICA forma de cargar otros
--   descuentos; escribir la columna a mano no sirve, el trigger la pisa.
--
-- QUÉ PASA CON LOS ESTADOS DE PAGO YA EMITIDOS
--   Nada. Los que tienen `otherDeductions` cargado a mano y sin líneas se
--   quedan como están: el trigger solo actúa cuando se toca una línea, y sobre
--   un estado de pago en borrador. Uno aprobado ya está congelado por la
--   migración 025 y esta no lo desarma.
-- ============================================================

CREATE TABLE IF NOT EXISTS public."certificateDeductions" (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     TEXT NOT NULL,

  -- Sirve a los dos estados de pago: el del subcontrato (lo que YO pago) y el
  -- del mandante (lo que YO cobro, donde el mandante también me descuenta).
  -- Sin FK porque apunta a dos tablas; la limpieza va por trigger.
  "certificateType" TEXT NOT NULL
                    CHECK ("certificateType" IN ('subcontract', 'contract')),
  "certificateId"   UUID NOT NULL,

  -- El tipo es lo que permite responder «cuánto en herramientas este año».
  -- 'otro' existe para no obligar a forzar una categoría, pero exige glosa.
  kind           TEXT NOT NULL DEFAULT 'otro'
                 CHECK (kind IN (
                   'herramienta',    -- herramienta no devuelta o dañada
                   'epp',            -- elementos de protección personal
                   'combustible',
                   'materiales',     -- material de bodega consumido por el contratista
                   'servicios',      -- luz, agua, andamios, grúa, aseo
                   'danos',          -- daños a la obra o a terceros
                   'anticipo_extra', -- adelantos fuera del anticipo contractual
                   'garantia',       -- retención adicional pactada
                   'otro'
                 )),

  -- Qué se le está descontando, en palabras. Obligatorio: un descuento sin
  -- glosa es exactamente el que termina en discusión.
  description    TEXT NOT NULL,
  amount         NUMERIC(18,4) NOT NULL CHECK (amount > 0),

  -- De dónde salió, cuando salió de otro módulo. Nullable: la mayoría se
  -- cargan a mano y forzar un origen inventado sería peor que no tenerlo.
  "sourceType"   TEXT CHECK ("sourceType" IN ('tool_log', 'material_request', 'purchase_order')),
  "sourceId"     UUID,

  notes          TEXT,
  "createdBy"    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT cert_deduction_needs_description
    CHECK (length(btrim(description)) > 0)
);

CREATE INDEX IF NOT EXISTS cert_deductions_cert_idx
  ON public."certificateDeductions" ("certificateType", "certificateId");
CREATE INDEX IF NOT EXISTS cert_deductions_tenant_idx
  ON public."certificateDeductions" ("tenantId");
CREATE INDEX IF NOT EXISTS cert_deductions_kind_idx
  ON public."certificateDeductions" ("tenantId", kind);

-- Un mismo origen no se descuenta dos veces. Es el error clásico: la misma
-- herramienta perdida aparece en el estado de pago de agosto y otra vez en el
-- de septiembre porque nadie se acordó.
CREATE UNIQUE INDEX IF NOT EXISTS cert_deductions_source_uniq
  ON public."certificateDeductions" ("sourceType", "sourceId")
  WHERE "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL;

-- ============================================================
-- RECÁLCULO DE LA CARÁTULA
--
-- Las líneas mandan: al tocarlas se rehace `otherDeductions` y, con él, el
-- neto, el IVA y el total. Si solo se actualizara `otherDeductions`, el estado
-- de pago quedaría diciendo que descuenta $200.000 pero con un total que no los
-- descuenta — el peor de los mundos, porque cuadra en la pantalla y no en la
-- caja.
-- ============================================================
CREATE OR REPLACE FUNCTION public.recalc_certificate_deductions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type   TEXT;
  v_id     UUID;
  v_total  NUMERIC(18,4);
  v_status TEXT;
BEGIN
  v_type := COALESCE(NEW."certificateType", OLD."certificateType");
  v_id   := COALESCE(NEW."certificateId",   OLD."certificateId");

  SELECT COALESCE(SUM(amount), 0) INTO v_total
  FROM public."certificateDeductions"
  WHERE "certificateType" = v_type AND "certificateId" = v_id;

  IF v_type = 'subcontract' THEN
    SELECT status INTO v_status
    FROM public."subcontractCertificates" WHERE id = v_id;

    -- Un estado de pago fuera de borrador ya está congelado (migración 025).
    -- Se sale sin tocarlo en vez de chocar contra ese trigger con un mensaje
    -- que nadie entendería.
    IF v_status IS DISTINCT FROM 'borrador' THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    UPDATE public."subcontractCertificates" c
    SET "otherDeductions" = v_total,
        "netAmount" = c."periodAmount"
                      - c."advanceAmortization"
                      - c."retentionAmount"
                      - c."penaltyAmount"
                      - v_total,
        "taxAmount" = ROUND((c."periodAmount"
                      - c."advanceAmortization"
                      - c."retentionAmount"
                      - c."penaltyAmount"
                      - v_total) * c."taxPercent" / 100),
        "totalAmount" = (c."periodAmount"
                      - c."advanceAmortization"
                      - c."retentionAmount"
                      - c."penaltyAmount"
                      - v_total)
                      + ROUND((c."periodAmount"
                      - c."advanceAmortization"
                      - c."retentionAmount"
                      - c."penaltyAmount"
                      - v_total) * c."taxPercent" / 100)
    WHERE c.id = v_id;

  ELSE
    SELECT status INTO v_status
    FROM public."paymentCertificates" WHERE id = v_id;

    IF v_status IS DISTINCT FROM 'borrador' THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    -- El estado de pago al mandante suma además reajuste y honorario.
    UPDATE public."paymentCertificates" c
    SET "otherDeductions" = v_total,
        "netAmount" = c."periodAmount" + c."reajusteAmount" + c."feeAmount"
                      - c."advanceAmortization"
                      - c."retentionAmount"
                      - c."penaltyAmount"
                      - v_total,
        "taxAmount" = ROUND((c."periodAmount" + c."reajusteAmount" + c."feeAmount"
                      - c."advanceAmortization"
                      - c."retentionAmount"
                      - c."penaltyAmount"
                      - v_total) * c."taxPercent" / 100),
        "totalAmount" = (c."periodAmount" + c."reajusteAmount" + c."feeAmount"
                      - c."advanceAmortization"
                      - c."retentionAmount"
                      - c."penaltyAmount"
                      - v_total)
                      + ROUND((c."periodAmount" + c."reajusteAmount" + c."feeAmount"
                      - c."advanceAmortization"
                      - c."retentionAmount"
                      - c."penaltyAmount"
                      - v_total) * c."taxPercent" / 100)
    WHERE c.id = v_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_cert_deductions ON public."certificateDeductions";
CREATE TRIGGER trg_recalc_cert_deductions
  AFTER INSERT OR UPDATE OR DELETE ON public."certificateDeductions"
  FOR EACH ROW EXECUTE FUNCTION public.recalc_certificate_deductions();

-- ============================================================
-- NO SE TOCAN LOS DESCUENTOS DE UN ESTADO DE PAGO YA CURSADO
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_certificate_deductions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type   TEXT;
  v_id     UUID;
  v_status TEXT;
BEGIN
  v_type := COALESCE(NEW."certificateType", OLD."certificateType");
  v_id   := COALESCE(NEW."certificateId",   OLD."certificateId");

  IF v_type = 'subcontract' THEN
    SELECT status INTO v_status FROM public."subcontractCertificates" WHERE id = v_id;
  ELSE
    SELECT status INTO v_status FROM public."paymentCertificates" WHERE id = v_id;
  END IF;

  IF v_status IS DISTINCT FROM 'borrador' THEN
    RAISE EXCEPTION 'Este estado de pago ya salió de borrador: sus descuentos no se pueden cambiar.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_cert_deductions ON public."certificateDeductions";
CREATE TRIGGER trg_guard_cert_deductions
  BEFORE INSERT OR UPDATE OR DELETE ON public."certificateDeductions"
  FOR EACH ROW EXECUTE FUNCTION public.guard_certificate_deductions();

-- ============================================================
-- LIMPIEZA AL BORRAR EL ESTADO DE PAGO
-- `certificateId` no tiene FK (apunta a dos tablas), así que la cascada hay
-- que escribirla.
-- ============================================================
CREATE OR REPLACE FUNCTION public.cert_deductions_cleanup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public."certificateDeductions"
  WHERE "certificateType" = TG_ARGV[0] AND "certificateId" = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cert_deductions_cleanup ON public."subcontractCertificates";
CREATE TRIGGER trg_cert_deductions_cleanup
  AFTER DELETE ON public."subcontractCertificates"
  FOR EACH ROW EXECUTE FUNCTION public.cert_deductions_cleanup('subcontract');

DROP TRIGGER IF EXISTS trg_cert_deductions_cleanup ON public."paymentCertificates";
CREATE TRIGGER trg_cert_deductions_cleanup
  AFTER DELETE ON public."paymentCertificates"
  FOR EACH ROW EXECUTE FUNCTION public.cert_deductions_cleanup('contract');

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public."certificateDeductions" ENABLE ROW LEVEL SECURITY;

-- El subcontratista SÍ ve lo que se le descuenta: es su liquidación, y
-- ocultárselo es lo que provoca la discusión que este módulo viene a evitar.
-- La fila es de MI empresa, así que el filtro por tenant no alcanza para él;
-- se apoya en `can_act_as_subcontractor` (migración 026), la misma que ya lo
-- deja ver su estado de pago.
DROP POLICY IF EXISTS "cert_deductions_select" ON public."certificateDeductions";
CREATE POLICY "cert_deductions_select" ON public."certificateDeductions"
  FOR SELECT USING (
    get_my_role() = 'super-admin'
    OR "tenantId" = get_my_tenant_id()
    OR (
      "certificateType" = 'subcontract'
      AND EXISTS (
        SELECT 1 FROM public."subcontractCertificates" sc
        WHERE sc.id = public."certificateDeductions"."certificateId"
          AND public.can_act_as_subcontractor(sc."subcontractId")
      )
    )
  );

-- Descontar es decisión de quien paga: el subcontratista no se edita sus
-- propios descuentos.
DROP POLICY IF EXISTS "cert_deductions_write" ON public."certificateDeductions";
CREATE POLICY "cert_deductions_write" ON public."certificateDeductions"
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
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public."certificateDeductions"; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
