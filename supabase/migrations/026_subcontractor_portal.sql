-- ============================================================
-- 026 · Portal del subcontratista
-- Ejecutar en Supabase (Dashboard > SQL Editor). Idempotente.
--
-- QUÉ RESUELVE
--   El subcontratista deja de ser un dato que alguien transcribe: entra a la
--   app, ve SU subcontrato, prepara SU estado de pago y lo presenta. La
--   constructora lo aprueba y lo paga. Un solo documento, no dos planillas que
--   después no cuadran.
--
-- EL DOCUMENTO VIVE UNA SOLA VEZ
--   El estado de pago del subcontrato pertenece a la empresa que PAGA: es ella
--   quien fija el contrato, el anticipo y la retención. El subcontratista no
--   tiene una copia propia: escribe sobre ese mismo documento mientras está en
--   borrador. Duplicarlo en dos cuentas y "sincronizar" es la receta conocida
--   para que las dos versiones digan cosas distintas justo cuando hay que
--   cobrar.
--
-- CÓMO SE LIMITA LO QUE VE
--   No alcanza con darle el permiso `subcontracts:view`: eso le mostraría TODOS
--   los subcontratos de la obra, incluidos los de la competencia y sus precios.
--   El acceso es **por fila**: solo el subcontrato donde él es el contacto
--   (`contactUserId`). Eso no se puede expresar con un permiso; va con
--   políticas propias y una función de apoyo.
--
-- ESTADO NUEVO: 'presentado'
--   El trámite pasa a ser borrador → presentado → aprobado → pagado. El
--   subcontratista puede mover su estado de pago hasta 'presentado' y ahí se le
--   congela: aprobar sigue exigiendo `subcontracts:approve`, que él no tiene.
-- ============================================================

-- ============================================================
-- 1. CONTACTO DEL SUBCONTRATO
-- ============================================================
ALTER TABLE public.subcontracts
  ADD COLUMN IF NOT EXISTS "contactUserId" TEXT;

COMMENT ON COLUMN public.subcontracts."contactUserId" IS
  'Usuario del subcontratista con acceso al portal. Ve y prepara SOLO este subcontrato.';

CREATE INDEX IF NOT EXISTS subcontracts_contact_idx
  ON public.subcontracts ("contactUserId");

-- ============================================================
-- 2. ESTADO 'presentado'
-- ============================================================
DO $$
BEGIN
  ALTER TABLE public."subcontractCertificates"
    DROP CONSTRAINT IF EXISTS "subcontractCertificates_status_check";
  ALTER TABLE public."subcontractCertificates"
    ADD CONSTRAINT "subcontractCertificates_status_check"
    CHECK (status IN ('borrador', 'presentado', 'aprobado', 'pagado', 'rechazado'));
END $$;

-- El detalle se congela al salir de borrador: 'presentado' ya es un documento
-- entregado. Se reemplaza la función de la 025 para incluir el estado nuevo.
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
    RAISE EXCEPTION 'El estado de pago ya fue presentado: su detalle no se puede modificar.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

-- ============================================================
-- 3. ¿ESTE SUBCONTRATO ES MÍO?
--    SECURITY DEFINER para poder mirar `subcontracts` sin que la propia RLS
--    de esa tabla se muerda la cola al evaluar las políticas de las hijas.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_subcontract_contact(p_subcontract UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subcontracts s
    WHERE s.id = p_subcontract
      AND s."tenantId" = get_my_tenant_id()
      AND s."contactUserId" = auth.uid()::text
  );
$$;

-- ============================================================
-- 4. POLÍTICAS DEL PORTAL
--    Son ADICIONALES a las de la 025: en Postgres varias políticas permisivas
--    se suman (OR). Lo que se agrega acá es siempre a nivel de fila.
-- ============================================================

-- Ver su propio subcontrato.
DROP POLICY IF EXISTS "subcontracts_contact_select" ON public.subcontracts;
CREATE POLICY "subcontracts_contact_select" ON public.subcontracts
  FOR SELECT USING (
    "tenantId" = get_my_tenant_id()
    AND "contactUserId" = auth.uid()::text
  );

-- Ver su itemizado (los precios que le pagan a él).
DROP POLICY IF EXISTS "subcontract_items_contact_select" ON public."subcontractItems";
CREATE POLICY "subcontract_items_contact_select" ON public."subcontractItems"
  FOR SELECT USING (is_subcontract_contact("subcontractId"));

-- Ver sus estados de pago y su detalle.
DROP POLICY IF EXISTS "subcontract_certs_contact_select" ON public."subcontractCertificates";
CREATE POLICY "subcontract_certs_contact_select" ON public."subcontractCertificates"
  FOR SELECT USING (is_subcontract_contact("subcontractId"));

DROP POLICY IF EXISTS "subcontract_cert_lines_contact_select" ON public."subcontractCertificateLines";
CREATE POLICY "subcontract_cert_lines_contact_select" ON public."subcontractCertificateLines"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public."subcontractCertificates" c
      WHERE c.id = "certificateId" AND is_subcontract_contact(c."subcontractId")
    )
  );

-- Preparar su estado de pago: solo mientras está en borrador.
DROP POLICY IF EXISTS "subcontract_certs_contact_insert" ON public."subcontractCertificates";
CREATE POLICY "subcontract_certs_contact_insert" ON public."subcontractCertificates"
  FOR INSERT WITH CHECK (
    "tenantId" = get_my_tenant_id()
    AND is_subcontract_contact("subcontractId")
    AND status = 'borrador'
  );

-- Editarlo y presentarlo. El WITH CHECK limita a qué estados puede llevarlo:
-- borrador (sigue editando) o presentado (lo entrega). Aprobar y pagar quedan
-- fuera de su alcance, y además el trigger exige el permiso para aprobar.
DROP POLICY IF EXISTS "subcontract_certs_contact_update" ON public."subcontractCertificates";
CREATE POLICY "subcontract_certs_contact_update" ON public."subcontractCertificates"
  FOR UPDATE
  USING (
    is_subcontract_contact("subcontractId")
    AND status IN ('borrador', 'rechazado')
  )
  WITH CHECK (
    is_subcontract_contact("subcontractId")
    AND status IN ('borrador', 'presentado')
  );

-- Descartar su propio borrador.
DROP POLICY IF EXISTS "subcontract_certs_contact_delete" ON public."subcontractCertificates";
CREATE POLICY "subcontract_certs_contact_delete" ON public."subcontractCertificates"
  FOR DELETE USING (
    is_subcontract_contact("subcontractId")
    AND status = 'borrador'
  );

-- El detalle del estado de pago que está preparando.
DROP POLICY IF EXISTS "subcontract_cert_lines_contact_write" ON public."subcontractCertificateLines";
CREATE POLICY "subcontract_cert_lines_contact_write" ON public."subcontractCertificateLines"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public."subcontractCertificates" c
      WHERE c.id = "certificateId"
        AND is_subcontract_contact(c."subcontractId")
    )
  )
  WITH CHECK (
    "tenantId" = get_my_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public."subcontractCertificates" c
      WHERE c.id = "certificateId"
        AND is_subcontract_contact(c."subcontractId")
    )
  );

-- Sus observaciones de recepción: las tiene que ver para subsanarlas. Solo
-- lectura — quien da por resuelta una observación es el que recibe.
DROP POLICY IF EXISTS "reception_obs_contact_select" ON public."receptionObservations";
CREATE POLICY "reception_obs_contact_select" ON public."receptionObservations"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.receptions r
      WHERE r.id = "receptionId"
        AND r."subcontractId" IS NOT NULL
        AND is_subcontract_contact(r."subcontractId")
    )
  );

-- ============================================================
-- 5. ROL `subcontratista`
--    Deliberadamente pobre: NO lleva `subcontracts:view` (eso le mostraría los
--    subcontratos de los demás, con sus precios). Su acceso real sale de las
--    políticas por fila de arriba; el permiso solo le abre la pantalla.
-- ============================================================
INSERT INTO public.roles ("tenantId", id, permissions)
VALUES ('__default__', 'subcontratista', ARRAY['subcontractor_portal:view'])
ON CONFLICT ("tenantId", id) DO UPDATE
  SET permissions = (
    SELECT ARRAY(
      SELECT DISTINCT unnest(public.roles.permissions || ARRAY['subcontractor_portal:view'])
    )
  );

-- Los roles que gestionan subcontratos también pueden abrir el portal para ver
-- lo que ve el subcontratista (soporte real, sin adivinar).
UPDATE public.roles
SET permissions = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(permissions || ARRAY['subcontractor_portal:view'])
  )
)
WHERE id IN ('jefe-oficina-tecnica', 'jefe-terreno') AND "tenantId" = '__default__';

-- ============================================================
-- 6. `paymentStates` QUEDA OBSOLETA
--    Era el prototipo del estado de pago: sumaba las partidas asignadas a un
--    usuario, sin contrato, sin anticipo, sin retención y sin IVA. Lo reemplaza
--    `subcontractCertificates`. NO se borra la tabla acá: si hubiera filas
--    reales, borrarlas sería destruir el historial de alguien. Se marca, y el
--    usuario decide cuándo eliminarla.
-- ============================================================
COMMENT ON TABLE public."paymentStates" IS
  'OBSOLETA (migración 026). Prototipo reemplazado por subcontractCertificates. La app ya no la lee ni la escribe; se puede eliminar cuando se confirme que no hay datos que conservar.';
