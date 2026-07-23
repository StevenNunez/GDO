-- ============================================================
-- 010 — Correcciones de seguridad RLS (revisión 2026-07-05)
-- Ejecutar en Supabase (Dashboard > SQL Editor)
--
-- Corrige:
--  1. Escalada de privilegios: cualquier usuario podía cambiarse
--     role/tenantId/baseSalary vía UPDATE a su propia fila.
--  2. Cruce de tenants: un admin podía editar/borrar/crear usuarios
--     de otros tenants.
--  3. Tabla roles (global) escribible por cualquier admin.
--  4. users_select exponía los perfiles de super-admins a todos.
--  7. Funciones SECURITY DEFINER sin search_path fijo.
-- ============================================================

-- ==================== 7. search_path en funciones SECURITY DEFINER ====================
ALTER FUNCTION public.get_my_tenant_id() SET search_path = public;
ALTER FUNCTION public.get_my_role() SET search_path = public;

-- ==================== 4. users_select: evaluar el rol del CALLER, no de la fila ====================
DROP POLICY IF EXISTS "users_select" ON public.users;

CREATE POLICY "users_select" ON public.users
  FOR SELECT USING (
    get_my_role() = 'super-admin'
    OR "tenantId" = get_my_tenant_id()
    OR id = auth.uid()
  );

-- ==================== 2. insert/update/delete con alcance de tenant ====================
-- Nota: la creación de usuarios reales pasa por /api/* con la service key
-- (que ignora RLS), por lo que se elimina la auto-inserción (id = auth.uid()).
DROP POLICY IF EXISTS "users_insert" ON public.users;

CREATE POLICY "users_insert" ON public.users
  FOR INSERT WITH CHECK (
    get_my_role() = 'super-admin'
    OR (get_my_role() = 'admin' AND "tenantId" = get_my_tenant_id())
  );

DROP POLICY IF EXISTS "users_update" ON public.users;

CREATE POLICY "users_update" ON public.users
  FOR UPDATE
  USING (
    get_my_role() = 'super-admin'
    OR (get_my_role() = 'admin' AND "tenantId" = get_my_tenant_id())
    OR id = auth.uid()
  )
  WITH CHECK (
    get_my_role() = 'super-admin'
    OR (get_my_role() = 'admin' AND "tenantId" = get_my_tenant_id())
    OR id = auth.uid()
  );

DROP POLICY IF EXISTS "users_delete" ON public.users;

CREATE POLICY "users_delete" ON public.users
  FOR DELETE USING (
    get_my_role() = 'super-admin'
    OR (get_my_role() = 'admin' AND "tenantId" = get_my_tenant_id())
  );

-- ==================== 1. Trigger: proteger columnas sensibles en UPDATE ====================
-- RLS permite el self-update (perfil, firma, teléfono...), pero este trigger
-- impide que un usuario no-admin toque sus campos privilegiados, y que un
-- admin se salte los límites (promover a super-admin o cambiar de tenant).
CREATE OR REPLACE FUNCTION public.protect_user_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  -- Sin usuario autenticado = service key o SQL directo (RLS ya bloquea al anon).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  caller_role := get_my_role();

  IF caller_role = 'super-admin' THEN
    RETURN NEW;
  END IF;

  IF caller_role = 'admin' THEN
    IF NEW.role = 'super-admin' AND OLD.role IS DISTINCT FROM 'super-admin' THEN
      RAISE EXCEPTION 'Solo un super-admin puede asignar el rol super-admin.';
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

DROP TRIGGER IF EXISTS trg_protect_user_sensitive_columns ON public.users;

CREATE TRIGGER trg_protect_user_sensitive_columns
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_sensitive_columns();

-- ==================== 3. roles: solo super-admin escribe ====================
DROP POLICY IF EXISTS "roles_write_admin" ON public.roles;

CREATE POLICY "roles_write_superadmin" ON public.roles
  FOR ALL USING (get_my_role() = 'super-admin');
