-- ============================================================
-- 033 · Bloque A3 — Adendas de subcontrato
-- Ejecutar en Supabase (Dashboard > SQL Editor). Idempotente.
--
-- QUÉ RESUELVE
--   «Aumentamos 40 millones» o «se amplía el plazo 30 días» en un SUBcontrato.
--   Hasta ahora eso solo existía para el contrato con el mandante: los
--   subcontratos no tenían adendas, así que la única forma de reflejarlo era
--   editar el monto del contrato original — o sea, borrar lo que se había
--   pactado y no poder explicar nunca de dónde salió la diferencia.
--
-- POR QUÉ SE EXTIENDE `amendments` Y NO SE CREA UNA TABLA NUEVA
--   Una adenda de subcontrato es lo MISMO que un adicional del contrato, vista
--   desde el otro lado del mostrador: cambia el monto, cambia el plazo, y solo
--   cuenta cuando está aprobada. Los mismos cuatro tipos, las mismas causas, el
--   mismo estado. `src/lib/amendment.ts` ya calcula «monto original + adicionales
--   aprobados = monto vigente» y está probado; `impactoContrato()` recibe
--   justamente `amountNet`, `startDate` y `plazoDias`, que es lo que un
--   subcontrato también tiene. Duplicar la tabla sería duplicar ese cálculo y,
--   en un año, tener dos versiones que dicen cosas distintas.
--
--   Lo único que cambia de verdad es QUIÉN aprueba: el adicional al mandante lo
--   aprueba él; la adenda de subcontrato la aprueba mi propia empresa. Eso ya
--   lo resuelve el motor de aprobaciones (029), no el modelo de datos.
-- ============================================================

-- ============================================================
-- 1. LA FILA AHORA PUEDE COLGAR DE UN SUBCONTRATO
-- ============================================================
ALTER TABLE public.amendments
  ADD COLUMN IF NOT EXISTS "subcontractId" UUID
  REFERENCES public.subcontracts(id) ON DELETE CASCADE;

-- `contractId` deja de ser obligatorio: una adenda de subcontrato no tiene
-- contrato con el mandante detrás.
ALTER TABLE public.amendments ALTER COLUMN "contractId" DROP NOT NULL;

-- Pero tiene que colgar de UNO de los dos, y de uno solo. Sin esta guarda
-- aparecen filas huérfanas (de nadie) o ambiguas (de los dos), y ninguna de las
-- dos se puede sumar a ninguna parte.
ALTER TABLE public.amendments DROP CONSTRAINT IF EXISTS amendments_one_parent;
ALTER TABLE public.amendments ADD CONSTRAINT amendments_one_parent
  CHECK (("contractId" IS NOT NULL) <> ("subcontractId" IS NOT NULL));

CREATE INDEX IF NOT EXISTS amendments_subcontract_idx
  ON public.amendments ("subcontractId");

-- El correlativo es por documento padre. El índice viejo cubría solo
-- `contractId`; el nuevo hace lo mismo para el subcontrato, para que las
-- adendas de dos subcontratos distintos puedan ser las dos «N° 1».
CREATE UNIQUE INDEX IF NOT EXISTS amendments_sub_number_uniq
  ON public.amendments ("subcontractId", number)
  WHERE "subcontractId" IS NOT NULL;

-- ============================================================
-- 2. RLS
--    Las políticas anteriores exigían `contracts:view` / `amendments:manage`,
--    que son permisos del contrato con el MANDANTE. Para una adenda de
--    subcontrato el permiso correcto es `subcontracts:*`: quien administra los
--    subcontratos tiene que poder modificarlos sin que se le abra también el
--    contrato de la obra.
-- ============================================================
DROP POLICY IF EXISTS "amendments_select" ON public.amendments;
CREATE POLICY "amendments_select" ON public.amendments
  FOR SELECT USING (
    get_my_role() = 'super-admin'
    OR (
      "tenantId" = get_my_tenant_id()
      AND (
        ("contractId"    IS NOT NULL AND has_permission('contracts:view'))
        OR ("subcontractId" IS NOT NULL AND has_permission('subcontracts:view'))
      )
    )
  );

DROP POLICY IF EXISTS "amendments_write" ON public.amendments;
CREATE POLICY "amendments_write" ON public.amendments
  FOR ALL
  USING (
    get_my_role() = 'super-admin'
    OR (
      "tenantId" = get_my_tenant_id()
      AND (
        ("contractId"    IS NOT NULL AND has_permission('amendments:manage'))
        OR ("subcontractId" IS NOT NULL AND has_permission('subcontracts:manage'))
      )
    )
  )
  WITH CHECK (
    get_my_role() = 'super-admin'
    OR (
      "tenantId" = get_my_tenant_id()
      AND (
        ("contractId"    IS NOT NULL AND has_permission('amendments:manage'))
        OR ("subcontractId" IS NOT NULL AND has_permission('subcontracts:manage'))
      )
    )
  );

-- ============================================================
-- 3. GUARDA: NO SE TOCA UNA ADENDA YA APROBADA
--    Una adenda aprobada ya cambió el monto vigente del subcontrato y, con él,
--    lo que se le pagó en los estados de pago posteriores. Editarla hacia atrás
--    descuadra estados de pago que ya se cursaron.
--    (El contrato con el mandante nunca tuvo esta guarda; se agrega para los
--    dos, porque el problema es el mismo.)
-- ============================================================
CREATE OR REPLACE FUNCTION public.amendment_guard_approved()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'aprobado' AND NEW.status = 'aprobado' THEN
    IF NEW."amountNet" IS DISTINCT FROM OLD."amountNet"
       OR NEW."extraDays" IS DISTINCT FROM OLD."extraDays"
       OR NEW.type       IS DISTINCT FROM OLD.type
       OR NEW.currency   IS DISTINCT FROM OLD.currency THEN
      RAISE EXCEPTION 'Esta adenda ya está aprobada: su monto, plazo y tipo no se pueden cambiar. Anúlala y crea otra.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_amendment_guard_approved ON public.amendments;
CREATE TRIGGER trg_amendment_guard_approved
  BEFORE UPDATE ON public.amendments
  FOR EACH ROW EXECUTE FUNCTION public.amendment_guard_approved();
