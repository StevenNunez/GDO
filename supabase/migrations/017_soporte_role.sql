-- ============================================================
-- 017 · Rol "soporte" (Soporte de App)
--
-- Rol de soporte de la aplicación con acceso TOTAL dentro de su empresa (tenant),
-- igual que `admin`/`operations`, pero SIN permisos de plataforma (suscripciones
-- y gestión de tenants, que son exclusivos del super-admin). Lo asigna el
-- super-admin ("el que da el alta al servicio").
--
-- La seguridad real vive en estas funciones/políticas RLS: sin agregar `soporte`
-- aquí, la app le mostraría acceso pero la base rechazaría cada escritura.
-- Re-ejecutable (CREATE OR REPLACE / DROP POLICY IF EXISTS).
-- ============================================================

-- 1. has_permission: soporte = todo salvo permisos exclusivos de plataforma
--    (misma lógica que admin/operations).
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

  IF v_role IN ('admin', 'operations', 'soporte') THEN
    RETURN perm NOT IN ('tenants:create','tenants:delete','tenants:switch','module_subscriptions:view');
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.roles r
    WHERE r.id = v_role AND perm = ANY(r.permissions)
  );
END;
$$;

-- 2. can_manage_payroll: soporte también gestiona nómina (adelantos).
CREATE OR REPLACE FUNCTION public.can_manage_payroll()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT get_my_role() IN ('super-admin','admin','operations','finance','soporte');
$$;

-- 3. Tabla users: soporte puede crear/editar/eliminar usuarios de su tenant
--    (mismo alcance que admin).
DROP POLICY IF EXISTS "users_insert" ON public.users;
CREATE POLICY "users_insert" ON public.users
  FOR INSERT WITH CHECK (
    get_my_role() = 'super-admin'
    OR (get_my_role() IN ('admin','soporte') AND "tenantId" = get_my_tenant_id())
  );

DROP POLICY IF EXISTS "users_update" ON public.users;
CREATE POLICY "users_update" ON public.users
  FOR UPDATE
  USING (
    get_my_role() = 'super-admin'
    OR (get_my_role() IN ('admin','soporte') AND "tenantId" = get_my_tenant_id())
    OR id = auth.uid()
  )
  WITH CHECK (
    get_my_role() = 'super-admin'
    OR (get_my_role() IN ('admin','soporte') AND "tenantId" = get_my_tenant_id())
    OR id = auth.uid()
  );

DROP POLICY IF EXISTS "users_delete" ON public.users;
CREATE POLICY "users_delete" ON public.users
  FOR DELETE USING (
    get_my_role() = 'super-admin'
    OR (get_my_role() IN ('admin','soporte') AND "tenantId" = get_my_tenant_id())
  );

-- 4. Trigger de columnas sensibles: soporte se trata como admin, pero NI admin
--    NI soporte pueden asignar los roles privilegiados (super-admin / soporte):
--    esos solo los otorga el super-admin.
CREATE OR REPLACE FUNCTION public.protect_user_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  caller_role := get_my_role();

  IF caller_role = 'super-admin' THEN
    RETURN NEW;
  END IF;

  IF caller_role IN ('admin', 'soporte') THEN
    IF NEW.role IN ('super-admin','soporte') AND OLD.role IS DISTINCT FROM NEW.role THEN
      RAISE EXCEPTION 'Solo un super-admin puede asignar los roles super-admin o soporte.';
    END IF;
    IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId" THEN
      RAISE EXCEPTION 'No autorizado para cambiar el tenant de un usuario.';
    END IF;
    RETURN NEW;
  END IF;

  -- Resto de roles: solo pueden editar campos no privilegiados de su perfil.
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
     OR NEW."baseSalary" IS DISTINCT FROM OLD."baseSalary"
     OR NEW.afp IS DISTINCT FROM OLD.afp
     OR NEW."tipoSalud" IS DISTINCT FROM OLD."tipoSalud"
     OR NEW."cargasFamiliares" IS DISTINCT FROM OLD."cargasFamiliares"
     OR NEW."fechaIngreso" IS DISTINCT FROM OLD."fechaIngreso"
     OR NEW."assignedProjectIds" IS DISTINCT FROM OLD."assignedProjectIds"
     OR NEW."isDemoUser" IS DISTINCT FROM OLD."isDemoUser"
     OR NEW."qrCode" IS DISTINCT FROM OLD."qrCode" THEN
    RAISE EXCEPTION 'No autorizado para modificar campos protegidos del perfil.';
  END IF;

  RETURN NEW;
END;
$$;
