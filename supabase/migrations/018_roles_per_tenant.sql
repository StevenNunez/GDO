-- ============================================================
-- 018 · Roles por empresa (per-tenant) con defaults heredados
--
-- Antes la tabla `roles` era GLOBAL (una fila por rol, sembrada en 011) y solo
-- el super-admin la escribía. Ahora cada empresa personaliza los permisos de sus
-- propios roles.
--
-- Diseño: las filas sembradas en 011 se conservan como DEFAULTS de plataforma
-- (tenantId = '__default__'). Cada empresa que personalice un rol crea su propia
-- fila (tenantId = su tenant). `has_permission` usa el override de la empresa si
-- existe; si no, cae al default. Así un tenant nuevo hereda los defaults sin
-- necesidad de re-sembrar nada ni triggers.
--
-- El frontend toma los defaults del CÓDIGO (ROLES en permissions.ts) y les
-- superpone los overrides de la empresa. Re-ejecutable.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roles' AND column_name = 'tenantId'
  ) THEN
    -- 1. Agregar tenantId y convertir las filas globales existentes en defaults.
    ALTER TABLE public.roles ADD COLUMN "tenantId" TEXT;
    UPDATE public.roles SET "tenantId" = '__default__' WHERE "tenantId" IS NULL;
    ALTER TABLE public.roles ALTER COLUMN "tenantId" SET NOT NULL;

    -- 2. Clave compuesta (tenantId, id): una fila por (empresa, rol).
    ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_pkey;
    ALTER TABLE public.roles ADD CONSTRAINT roles_pkey PRIMARY KEY ("tenantId", id);
  END IF;
END $$;

-- 3. RLS: cada empresa ve sus roles + los defaults; escribe solo los suyos.
--    (get_my_tenant_id() nunca es '__default__', así que un admin no puede tocar
--     los defaults; esos solo los cambia el super-admin.)
DROP POLICY IF EXISTS "roles_select_all" ON public.roles;
DROP POLICY IF EXISTS "roles_select" ON public.roles;
DROP POLICY IF EXISTS "roles_write_admin" ON public.roles;
DROP POLICY IF EXISTS "roles_write_superadmin" ON public.roles;
DROP POLICY IF EXISTS "roles_write" ON public.roles;

CREATE POLICY "roles_select" ON public.roles
  FOR SELECT USING (
    "tenantId" IN (get_my_tenant_id(), '__default__')
    OR get_my_role() = 'super-admin'
  );

CREATE POLICY "roles_write" ON public.roles
  FOR ALL
  USING (
    get_my_role() = 'super-admin'
    OR ("tenantId" = get_my_tenant_id() AND has_permission('permissions:manage'))
  )
  WITH CHECK (
    get_my_role() = 'super-admin'
    OR ("tenantId" = get_my_tenant_id() AND has_permission('permissions:manage'))
  );

-- 4. has_permission: usa el override de la empresa si existe; si no, el default.
CREATE OR REPLACE FUNCTION public.has_permission(perm TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role  TEXT;
  v_perms TEXT[];
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

  -- Override de la empresa primero; si no hay, el default de plataforma.
  SELECT r.permissions INTO v_perms
  FROM public.roles r
  WHERE r.id = v_role
    AND r."tenantId" IN (get_my_tenant_id(), '__default__')
  ORDER BY (r."tenantId" = get_my_tenant_id()) DESC
  LIMIT 1;

  RETURN v_perms IS NOT NULL AND perm = ANY(v_perms);
END;
$$;
