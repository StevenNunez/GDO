-- ============================================================
-- 011 — Autorización por rol en tablas de negocio (RLS)  [C2]
-- Ejecutar en Supabase (Dashboard > SQL Editor).
-- Idempotente y reversible: se puede re-ejecutar sin daño.
--
-- PROBLEMA QUE CORRIGE
--   Todas las tablas de negocio usaban una única política
--     FOR ALL USING ("tenantId" = get_my_tenant_id() OR super-admin)
--   => cualquier usuario autenticado del tenant podía INSERT/UPDATE/
--      DELETE sobre CUALQUIER tabla, incluidas las de dinero, saltándose
--      el can() del frontend con una llamada REST directa a PostgREST.
--   Caso testigo: un 'worker' aprobaba su propio adelanto de sueldo con
--      UPDATE salaryAdvances SET status='approved' WHERE id=<suyo>.
--
-- ENFOQUE (híbrido, acordado 2026-07):
--   Parche RLS que cierra los huecos de MAYOR riesgo (dinero + integridad)
--   verificando permisos contra la MISMA tabla `roles` que usa el frontend.
--   El movimiento definitivo de las mutaciones a route handlers de servidor
--   queda para la fase Alto (A3); este parche detiene el sangrado ya.
--
--   Tablas cubiertas: salaryAdvances, supplierPayments, paymentStates,
--   workItems, attendanceLogs, stockMovements.
--   La lectura (SELECT) sigue siendo amplia por tenant; se restringe la
--   ESCRITURA (INSERT/UPDATE/DELETE) al permiso correspondiente.
-- ============================================================

-- ============================================================
-- 0. SEED IDEMPOTENTE DE LA TABLA `roles`
--    has_permission() consulta esta tabla. Si está vacía, el frontend
--    cae a ROLES_DEFAULT (useRoles.ts) pero la RLS no tendría datos.
--    ON CONFLICT DO NOTHING => respeta cualquier personalización previa.
--    (super-admin / admin / operations se resuelven por código en
--     has_permission y NO necesitan fila aquí.)
-- ============================================================
INSERT INTO public.roles (id, description, permissions) VALUES
  ('jefe-oficina-tecnica', 'Jefe de Oficina Técnica', ARRAY[
    'module_construction_control:view','construction_control:edit_structure','construction_control:register_progress','construction_control:view_reports','construction_control:review_protocols',
    'module_purchasing:view','purchase_requests:create','purchase_requests:view_all',
    'module_warehouse:view','materials:view_all','material_requests:create'
  ]),
  ('jefe-terreno', 'Jefe de Terreno', ARRAY[
    'module_construction_control:view','construction_control:register_progress','construction_control:view_reports','construction_control:review_protocols',
    'module_warehouse:view','material_requests:create','purchase_requests:create','return_requests:create','tools:view_own'
  ]),
  ('bodega-admin', 'Jefe de Bodega', ARRAY[
    'module_warehouse:view','module_purchasing:view',
    'material_requests:create','material_requests:approve','material_requests:view_all',
    'return_requests:approve','return_requests:view_all',
    'tools:view_all','tools:create','tools:edit','tools:delete','tools:checkout','tools:return',
    'materials:view_all','materials:create','materials:edit','materials:delete','materials:archive',
    'stock:add_manual','stock:receive_order',
    'purchase_requests:create','purchase_requests:view_all',
    'suppliers:create','suppliers:view','suppliers:edit',
    'categories:view','categories:create','categories:edit',
    'units:create','units:view','units:delete'
  ]),
  ('finance', 'Jefe de Finanzas', ARRAY[
    'module_payments:view',
    'payments:create','payments:view','payments:mark_as_paid','payments:edit','payments:delete',
    'suppliers:view','suppliers:edit','suppliers:create',
    'module_purchasing:view','orders:view_all','finance:manage_purchase_orders'
  ]),
  ('supervisor', 'Supervisor', ARRAY[
    'module_warehouse:view','module_safety:view','module_reports:view','module_purchasing:view','module_construction_control:view',
    'construction_control:register_progress',
    'tools:view_own','materials:view_all',
    'material_requests:create','material_requests:view_own',
    'purchase_requests:create','return_requests:create',
    'safety_checklists:complete','safety_inspections:complete'
  ]),
  ('apr', 'APR', ARRAY[
    'module_safety:view','module_users:view','module_warehouse:view','module_reports:view',
    'safety_templates:create','safety_templates:assign',
    'safety_checklists:complete','safety_checklists:review',
    'safety_inspections:create','safety_inspections:complete','safety_inspections:review',
    'safety_observations:create','safety_observations:review',
    'material_requests:create','purchase_requests:create','return_requests:create'
  ]),
  ('cphs', 'Comité Paritario', ARRAY[
    'module_safety:view','module_warehouse:view','tools:view_own',
    'safety_templates:create','safety_templates:assign',
    'safety_checklists:review','safety_checklists:complete',
    'safety_inspections:create','safety_inspections:review','safety_inspections:complete',
    'safety_observations:create','safety_observations:review'
  ]),
  ('quality', 'Calidad', ARRAY[
    'module_construction_control:view','construction_control:view_reports','construction_control:review_protocols'
  ]),
  ('guardia', 'Guardia', ARRAY[
    'module_attendance:view','attendance:register'
  ]),
  ('worker', 'Trabajador', ARRAY[
    'tools:view_own'
  ])
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 1. HELPERS DE AUTORIZACIÓN
-- ============================================================

-- has_permission: ¿el usuario actual tiene el permiso <perm>?
-- Réplica en SQL de can() (DataProvider): super-admin todo; admin/operations
-- todo salvo superadmin-only; el resto según la tabla `roles`.
CREATE OR REPLACE FUNCTION public.has_permission(perm TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Sin sesión => service key o SQL directo: se deja pasar (RLS bloquea al anon
  -- en otras capas; las mutaciones server-side con service key ignoran RLS).
  IF auth.uid() IS NULL THEN
    RETURN TRUE;
  END IF;

  v_role := get_my_role();
  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_role = 'super-admin' THEN
    RETURN TRUE;
  END IF;

  IF v_role IN ('admin', 'operations') THEN
    -- admin/operations: todo salvo permisos exclusivos de plataforma
    RETURN perm NOT IN ('tenants:create','tenants:delete','tenants:switch','module_subscriptions:view');
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.roles r
    WHERE r.id = v_role AND perm = ANY(r.permissions)
  );
END;
$$;

-- can_manage_payroll: quién puede aprobar/rechazar adelantos y tocar montos.
-- NOTA: no existe aún un permiso dedicado 'salary_advances:approve'. Se usa una
-- whitelist administrativa. Refinar a permiso propio al mover al servidor (A3).
CREATE OR REPLACE FUNCTION public.can_manage_payroll()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT get_my_role() IN ('super-admin','admin','operations','finance');
$$;

-- ============================================================
-- 2. salaryAdvances — adelantos de sueldo
--    INSERT: cualquiera del tenant (el trabajador crea su solicitud 'pending').
--    UPDATE/DELETE: solo nómina/gerencia.
--    + trigger que impide auto-aprobación y cambio de monto por no autorizados.
-- ============================================================
DROP POLICY IF EXISTS "salaryAdvances_tenant" ON public."salaryAdvances";

CREATE POLICY "salaryAdvances_select" ON public."salaryAdvances"
  FOR SELECT USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

CREATE POLICY "salaryAdvances_insert" ON public."salaryAdvances"
  FOR INSERT WITH CHECK ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

CREATE POLICY "salaryAdvances_update" ON public."salaryAdvances"
  FOR UPDATE USING (("tenantId" = get_my_tenant_id() AND can_manage_payroll()) OR get_my_role() = 'super-admin')
  WITH CHECK (("tenantId" = get_my_tenant_id() AND can_manage_payroll()) OR get_my_role() = 'super-admin');

CREATE POLICY "salaryAdvances_delete" ON public."salaryAdvances"
  FOR DELETE USING (("tenantId" = get_my_tenant_id() AND can_manage_payroll()) OR get_my_role() = 'super-admin');

CREATE OR REPLACE FUNCTION public.protect_salary_advance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;  -- service key
  END IF;

  IF get_my_role() = 'super-admin' THEN
    RETURN NEW;
  END IF;

  -- Aprobar/rechazar exige rol de nómina y no ser el propio solicitante.
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected') THEN
    IF NOT can_manage_payroll() THEN
      RAISE EXCEPTION 'No autorizado para aprobar o rechazar adelantos de sueldo.';
    END IF;
    IF NEW."workerId" = auth.uid() THEN
      RAISE EXCEPTION 'No puedes aprobar o rechazar tu propio adelanto de sueldo.';
    END IF;
  END IF;

  -- El monto no se altera tras crear salvo por nómina.
  IF NEW.amount IS DISTINCT FROM OLD.amount AND NOT can_manage_payroll() THEN
    RAISE EXCEPTION 'No autorizado para modificar el monto del adelanto.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_salary_advance ON public."salaryAdvances";
CREATE TRIGGER trg_protect_salary_advance
  BEFORE UPDATE ON public."salaryAdvances"
  FOR EACH ROW EXECUTE FUNCTION public.protect_salary_advance();

-- ============================================================
-- 3. supplierPayments — facturas / pagos a proveedores
--    INSERT: payments:create · UPDATE: payments:edit|mark_as_paid · DELETE: payments:delete
-- ============================================================
DROP POLICY IF EXISTS "supplierPayments_tenant" ON public."supplierPayments";

CREATE POLICY "supplierPayments_select" ON public."supplierPayments"
  FOR SELECT USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

CREATE POLICY "supplierPayments_insert" ON public."supplierPayments"
  FOR INSERT WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('payments:create'));

CREATE POLICY "supplierPayments_update" ON public."supplierPayments"
  FOR UPDATE USING ("tenantId" = get_my_tenant_id() AND (has_permission('payments:edit') OR has_permission('payments:mark_as_paid')))
  WITH CHECK ("tenantId" = get_my_tenant_id() AND (has_permission('payments:edit') OR has_permission('payments:mark_as_paid')));

CREATE POLICY "supplierPayments_delete" ON public."supplierPayments"
  FOR DELETE USING ("tenantId" = get_my_tenant_id() AND has_permission('payments:delete'));

-- ============================================================
-- 4. paymentStates — estados de pago a contratistas (dinero)
--    Gestionados por oficina técnica: construction_control:edit_structure
-- ============================================================
DROP POLICY IF EXISTS "paymentStates_tenant" ON public."paymentStates";

CREATE POLICY "paymentStates_select" ON public."paymentStates"
  FOR SELECT USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

CREATE POLICY "paymentStates_write" ON public."paymentStates"
  FOR ALL USING ("tenantId" = get_my_tenant_id() AND has_permission('construction_control:edit_structure'))
  WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('construction_control:edit_structure'));

-- ============================================================
-- 5. workItems — partidas EDT (contienen unitPrice y quantity => valor de obra)
--    Estructura/precio: construction_control:edit_structure
--    (el avance 'progress' se aplica vía RPC add_work_item_progress SECURITY
--     DEFINER, que salta RLS; el registro de avance no requiere edit_structure.)
-- ============================================================
DROP POLICY IF EXISTS "workItems_tenant" ON public."workItems";

CREATE POLICY "workItems_select" ON public."workItems"
  FOR SELECT USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

CREATE POLICY "workItems_write" ON public."workItems"
  FOR ALL USING ("tenantId" = get_my_tenant_id() AND has_permission('construction_control:edit_structure'))
  WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('construction_control:edit_structure'));

-- ============================================================
-- 6. attendanceLogs — asistencia (base de sueldos/finiquitos)
--    INSERT: attendance:register · UPDATE/DELETE: attendance:edit
-- ============================================================
DROP POLICY IF EXISTS "attendanceLogs_tenant" ON public."attendanceLogs";

CREATE POLICY "attendanceLogs_select" ON public."attendanceLogs"
  FOR SELECT USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

CREATE POLICY "attendanceLogs_insert" ON public."attendanceLogs"
  FOR INSERT WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('attendance:register'));

CREATE POLICY "attendanceLogs_update" ON public."attendanceLogs"
  FOR UPDATE USING ("tenantId" = get_my_tenant_id() AND has_permission('attendance:edit'))
  WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('attendance:edit'));

CREATE POLICY "attendanceLogs_delete" ON public."attendanceLogs"
  FOR DELETE USING ("tenantId" = get_my_tenant_id() AND has_permission('attendance:edit'));

-- ============================================================
-- 7. stockMovements — libro de movimientos de inventario (auditoría)
--    Los movimientos legítimos se crean vía RPC SECURITY DEFINER
--    (add_manual_stock_entry, etc.) que saltan RLS. Por REST directo:
--    INSERT solo con permiso de stock; UPDATE/DELETE nunca (inmutable) salvo admin.
-- ============================================================
DROP POLICY IF EXISTS "stockMovements_tenant" ON public."stockMovements";

CREATE POLICY "stockMovements_select" ON public."stockMovements"
  FOR SELECT USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

CREATE POLICY "stockMovements_insert" ON public."stockMovements"
  FOR INSERT WITH CHECK (
    "tenantId" = get_my_tenant_id()
    AND (has_permission('stock:add_manual') OR has_permission('stock:receive_order'))
  );

-- Sin políticas de UPDATE/DELETE => nadie (excepto service key / super-admin abajo)
-- puede alterar el historial de movimientos desde el cliente.
CREATE POLICY "stockMovements_modify_superadmin" ON public."stockMovements"
  FOR UPDATE USING (get_my_role() = 'super-admin') WITH CHECK (get_my_role() = 'super-admin');
CREATE POLICY "stockMovements_delete_superadmin" ON public."stockMovements"
  FOR DELETE USING (get_my_role() = 'super-admin');

-- ============================================================
-- VERIFICACIÓN (opcional — ejecutar por separado como cada rol)
-- ------------------------------------------------------------
-- Como un 'worker' autenticado, esto DEBE fallar / afectar 0 filas:
--   UPDATE public."salaryAdvances" SET status='approved' WHERE id='<uuid>';
--   -> ERROR: No puedes aprobar o rechazar tu propio adelanto de sueldo.
-- Como 'finance', aprobar el adelanto de OTRO trabajador DEBE funcionar.
-- Como 'supervisor', esto DEBE afectar 0 filas (sin permiso):
--   UPDATE public."supplierPayments" SET status='paid' WHERE id='<uuid>';
-- ============================================================
