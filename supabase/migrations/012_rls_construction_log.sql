-- 012 · RLS para las tablas del Libro de Obra y la Bitácora
-- ============================================================================
-- Las migraciones 008 (bitacoraEntries) y 009 (libroObra, libroObraAsientos)
-- crearon las tablas SIN RLS → quedaban expuestas entre tenants (cualquier
-- usuario autenticado podía leer/escribir el libro de obra o la bitácora de
-- otra empresa vía PostgREST). Este archivo cierra ese hueco con el mismo patrón
-- que 011: SELECT amplio por tenant, escritura gateada por permiso.
--
-- Reutiliza los helpers ya existentes: get_my_tenant_id() y get_my_role() (010),
-- has_permission() (011). Es idempotente (DROP POLICY IF EXISTS + CREATE).
-- ============================================================================

-- Helper: ¿puede el usuario actual escribir contenido de control de obra?
-- (registrar avance / editar estructura — mismos permisos que gatea la UI)
CREATE OR REPLACE FUNCTION public.can_write_construction()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_permission('construction_control:register_progress')
      OR public.has_permission('construction_control:edit_structure');
$$;

-- ─────────────────────────── libroObra (carátula) ───────────────────────────
-- Editar la carátula del libro = acción estructural (edit_structure).
ALTER TABLE public."libroObra" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "libroObra_select" ON public."libroObra";
CREATE POLICY "libroObra_select" ON public."libroObra"
  FOR SELECT USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

DROP POLICY IF EXISTS "libroObra_insert" ON public."libroObra";
CREATE POLICY "libroObra_insert" ON public."libroObra"
  FOR INSERT WITH CHECK (("tenantId" = get_my_tenant_id() AND has_permission('construction_control:edit_structure')) OR get_my_role() = 'super-admin');

DROP POLICY IF EXISTS "libroObra_update" ON public."libroObra";
CREATE POLICY "libroObra_update" ON public."libroObra"
  FOR UPDATE USING (("tenantId" = get_my_tenant_id() AND has_permission('construction_control:edit_structure')) OR get_my_role() = 'super-admin')
  WITH CHECK (("tenantId" = get_my_tenant_id() AND has_permission('construction_control:edit_structure')) OR get_my_role() = 'super-admin');

DROP POLICY IF EXISTS "libroObra_delete" ON public."libroObra";
CREATE POLICY "libroObra_delete" ON public."libroObra"
  FOR DELETE USING (("tenantId" = get_my_tenant_id() AND has_permission('construction_control:edit_structure')) OR get_my_role() = 'super-admin');

-- ───────────────────── libroObraAsientos (anotaciones) ──────────────────────
-- Agregar/editar asientos = registrar avance o editar estructura. Borrar = edit_structure.
ALTER TABLE public."libroObraAsientos" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "libroObraAsientos_select" ON public."libroObraAsientos";
CREATE POLICY "libroObraAsientos_select" ON public."libroObraAsientos"
  FOR SELECT USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

DROP POLICY IF EXISTS "libroObraAsientos_insert" ON public."libroObraAsientos";
CREATE POLICY "libroObraAsientos_insert" ON public."libroObraAsientos"
  FOR INSERT WITH CHECK (("tenantId" = get_my_tenant_id() AND can_write_construction()) OR get_my_role() = 'super-admin');

DROP POLICY IF EXISTS "libroObraAsientos_update" ON public."libroObraAsientos";
CREATE POLICY "libroObraAsientos_update" ON public."libroObraAsientos"
  FOR UPDATE USING (("tenantId" = get_my_tenant_id() AND can_write_construction()) OR get_my_role() = 'super-admin')
  WITH CHECK (("tenantId" = get_my_tenant_id() AND can_write_construction()) OR get_my_role() = 'super-admin');

DROP POLICY IF EXISTS "libroObraAsientos_delete" ON public."libroObraAsientos";
CREATE POLICY "libroObraAsientos_delete" ON public."libroObraAsientos"
  FOR DELETE USING (("tenantId" = get_my_tenant_id() AND has_permission('construction_control:edit_structure')) OR get_my_role() = 'super-admin');

-- ────────────────────────── bitacoraEntries ─────────────────────────────────
-- Agregar/editar bitácora = registrar avance o editar estructura. Borrar = edit_structure.
ALTER TABLE public."bitacoraEntries" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bitacoraEntries_select" ON public."bitacoraEntries";
CREATE POLICY "bitacoraEntries_select" ON public."bitacoraEntries"
  FOR SELECT USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

DROP POLICY IF EXISTS "bitacoraEntries_insert" ON public."bitacoraEntries";
CREATE POLICY "bitacoraEntries_insert" ON public."bitacoraEntries"
  FOR INSERT WITH CHECK (("tenantId" = get_my_tenant_id() AND can_write_construction()) OR get_my_role() = 'super-admin');

DROP POLICY IF EXISTS "bitacoraEntries_update" ON public."bitacoraEntries";
CREATE POLICY "bitacoraEntries_update" ON public."bitacoraEntries"
  FOR UPDATE USING (("tenantId" = get_my_tenant_id() AND can_write_construction()) OR get_my_role() = 'super-admin')
  WITH CHECK (("tenantId" = get_my_tenant_id() AND can_write_construction()) OR get_my_role() = 'super-admin');

DROP POLICY IF EXISTS "bitacoraEntries_delete" ON public."bitacoraEntries";
CREATE POLICY "bitacoraEntries_delete" ON public."bitacoraEntries"
  FOR DELETE USING (("tenantId" = get_my_tenant_id() AND has_permission('construction_control:edit_structure')) OR get_my_role() = 'super-admin');
