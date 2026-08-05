-- ============================================================
-- 027 · Enlace entre empresas
-- Ejecutar en Supabase (Dashboard > SQL Editor). Idempotente.
--
-- QUÉ RESUELVE
--   Hasta acá, para que un subcontratista usara la app tenía que entrar como
--   usuario invitado a la cuenta de la constructora (migración 026). Eso sirve,
--   pero él no lleva SU empresa: sus costos, sus otros clientes, sus obras.
--
--   Con esto, el subcontratista trabaja desde SU propia cuenta y se vincula con
--   la constructora. El subcontrato sigue siendo uno solo y él puede prepararlo
--   y presentarlo desde su lado.
--
-- ⚠️ ESTA MIGRACIÓN ABRE LA PRIMERA GRIETA ENTRE EMPRESAS
--   Todas las políticas de la app dicen `tenantId = get_my_tenant_id()`. Acá,
--   por primera vez, un usuario de la empresa B toca filas de la empresa A. Por
--   eso el permiso es lo más angosto posible y se apoya en TRES condiciones que
--   se exigen juntas:
--     1. La fila declara explícitamente a B como contraparte
--        (`subcontracts.counterpartTenantId`).
--     2. Existe un vínculo ACEPTADO entre A y B. Si A lo revoca, el acceso se
--        corta de inmediato: no hay copia de los datos en B.
--     3. El usuario de B tiene el permiso del portal. Un jornalero de B no
--        entra a los precios del subcontrato solo por trabajar ahí.
--   Y el alcance es SOLO el subcontrato y sus documentos. Nada de la obra, del
--   contrato con el mandante, de los costos ni de los otros subcontratos.
--
-- POR QUÉ UN CÓDIGO Y NO UN CORREO
--   La invitación se acepta con un código corto que A le pasa a B por donde
--   quiera (WhatsApp, teléfono). Emparejar por correo obliga a adivinar cuál de
--   los correos de una empresa es "el bueno", y falla justo con el proveedor
--   que tiene tres casillas. El código lo pega quien lo recibió: si lo tiene,
--   es porque se lo dieron.
-- ============================================================

-- ============================================================
-- 1. VÍNCULO ENTRE DOS EMPRESAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public."companyLinks" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Quien invita: normalmente la empresa que contrata.
  "requesterTenantId" TEXT NOT NULL,
  "requesterName"     TEXT,
  -- Quien acepta. NULL mientras la invitación no se usa.
  "addresseeTenantId" TEXT,
  "addresseeName"     TEXT,

  -- Código corto que se pasa por fuera de la app. Único mientras esté pendiente.
  code          TEXT NOT NULL DEFAULT upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  -- Referencia de a quién se pensaba invitar. No se usa para emparejar.
  "inviteNote"  TEXT,

  status        TEXT NOT NULL DEFAULT 'pendiente'
                CHECK (status IN ('pendiente', 'aceptado', 'rechazado', 'revocado')),
  "respondedAt" TIMESTAMPTZ,
  "createdBy"   TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS company_links_requester_idx ON public."companyLinks" ("requesterTenantId");
CREATE INDEX IF NOT EXISTS company_links_addressee_idx ON public."companyLinks" ("addresseeTenantId");
CREATE UNIQUE INDEX IF NOT EXISTS company_links_code_uniq
  ON public."companyLinks" (code) WHERE status = 'pendiente';

-- Dos empresas no se vinculan dos veces: ensuciaría el selector y dejaría
-- vínculos zombis que nadie sabe cuál manda.
CREATE UNIQUE INDEX IF NOT EXISTS company_links_pair_uniq
  ON public."companyLinks" ("requesterTenantId", "addresseeTenantId")
  WHERE status = 'aceptado';

ALTER TABLE public."companyLinks" ENABLE ROW LEVEL SECURITY;

-- Cada empresa ve sus propios vínculos. Las invitaciones pendientes de OTROS no
-- se ven: aceptar va por la función de abajo, que solo necesita el código.
DROP POLICY IF EXISTS "company_links_select" ON public."companyLinks";
CREATE POLICY "company_links_select" ON public."companyLinks"
  FOR SELECT USING (
    "requesterTenantId" = get_my_tenant_id()
    OR "addresseeTenantId" = get_my_tenant_id()
    OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "company_links_insert" ON public."companyLinks";
CREATE POLICY "company_links_insert" ON public."companyLinks"
  FOR INSERT WITH CHECK (
    "requesterTenantId" = get_my_tenant_id()
    AND has_permission('company_links:manage')
  );

-- Editar (revocar) solo la empresa que invitó o la que aceptó.
DROP POLICY IF EXISTS "company_links_update" ON public."companyLinks";
CREATE POLICY "company_links_update" ON public."companyLinks"
  FOR UPDATE
  USING (
    ("requesterTenantId" = get_my_tenant_id() OR "addresseeTenantId" = get_my_tenant_id())
    AND has_permission('company_links:manage')
  )
  WITH CHECK (
    "requesterTenantId" = get_my_tenant_id() OR "addresseeTenantId" = get_my_tenant_id()
  );

DROP POLICY IF EXISTS "company_links_delete" ON public."companyLinks";
CREATE POLICY "company_links_delete" ON public."companyLinks"
  FOR DELETE USING (
    "requesterTenantId" = get_my_tenant_id()
    AND has_permission('company_links:manage')
    AND status <> 'aceptado'
  );

-- ============================================================
-- 2. ACEPTAR CON EL CÓDIGO
--    Va por función SECURITY DEFINER porque quien acepta todavía no puede LEER
--    la fila: si pudiera buscarla, cualquiera podría listar invitaciones
--    ajenas. La función solo resuelve un código exacto y estampa quién aceptó.
-- ============================================================
CREATE OR REPLACE FUNCTION public.accept_company_link(p_code TEXT, p_name TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_requester TEXT;
  v_me TEXT;
BEGIN
  v_me := get_my_tenant_id();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Sin empresa activa.';
  END IF;

  IF NOT has_permission('company_links:manage') THEN
    RAISE EXCEPTION 'No tienes permiso para vincular empresas.';
  END IF;

  SELECT id, "requesterTenantId" INTO v_id, v_requester
  FROM public."companyLinks"
  WHERE upper(code) = upper(trim(p_code)) AND status = 'pendiente';

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'El código no existe o ya fue usado.';
  END IF;

  -- Una empresa no se vincula consigo misma: no aporta nada y rompe el
  -- supuesto de "dos partes" del que cuelgan las políticas.
  IF v_requester = v_me THEN
    RAISE EXCEPTION 'Ese código es de tu propia empresa.';
  END IF;

  UPDATE public."companyLinks"
  SET "addresseeTenantId" = v_me,
      "addresseeName" = COALESCE(p_name, "addresseeName"),
      status = 'aceptado',
      "respondedAt" = NOW()
  WHERE id = v_id;

  RETURN v_id;
END $$;

-- ============================================================
-- 3. LA CONTRAPARTE DEL SUBCONTRATO
-- ============================================================
ALTER TABLE public.subcontracts
  ADD COLUMN IF NOT EXISTS "counterpartTenantId" TEXT;

COMMENT ON COLUMN public.subcontracts."counterpartTenantId" IS
  'Empresa del subcontratista, cuando trabaja con su propia cuenta. Requiere un vínculo aceptado (companyLinks) para dar acceso.';

CREATE INDEX IF NOT EXISTS subcontracts_counterpart_idx
  ON public.subcontracts ("counterpartTenantId");

-- ¿Existe vínculo aceptado entre mi empresa y esa otra?
CREATE OR REPLACE FUNCTION public.has_company_link(p_other TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."companyLinks" l
    WHERE l.status = 'aceptado'
      AND (
        (l."requesterTenantId" = get_my_tenant_id() AND l."addresseeTenantId" = p_other)
        OR (l."addresseeTenantId" = get_my_tenant_id() AND l."requesterTenantId" = p_other)
      )
  );
$$;

/**
 * ¿Puedo actuar sobre este subcontrato como subcontratista?
 *
 * Dos caminos, y ninguno da acceso a nada más:
 *   · soy el contacto designado dentro de la misma empresa (migración 026), o
 *   · mi empresa es la contraparte declarada Y hay vínculo aceptado Y tengo el
 *     permiso del portal.
 */
CREATE OR REPLACE FUNCTION public.can_act_as_subcontractor(p_subcontract UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subcontracts s
    WHERE s.id = p_subcontract
      AND (
        (s."tenantId" = get_my_tenant_id() AND s."contactUserId" = auth.uid()::text)
        OR (
          s."counterpartTenantId" IS NOT NULL
          AND s."counterpartTenantId" = get_my_tenant_id()
          AND has_company_link(s."tenantId")
          AND has_permission('subcontractor_portal:view')
        )
      )
  );
$$;

-- `is_subcontract_contact` (026) pasa a delegar, para que exista UN solo lugar
-- donde se decide quién es "el subcontratista" de una fila.
CREATE OR REPLACE FUNCTION public.is_subcontract_contact(p_subcontract UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_act_as_subcontractor(p_subcontract);
$$;

-- ============================================================
-- 4. POLÍTICAS CRUZADAS
--    Las de la 026 ya usan `is_subcontract_contact`, así que quedan cubiertas
--    solas. Falta la de `subcontracts`, que compara columnas directamente.
-- ============================================================
DROP POLICY IF EXISTS "subcontracts_contact_select" ON public.subcontracts;
CREATE POLICY "subcontracts_contact_select" ON public.subcontracts
  FOR SELECT USING (
    -- Contacto dentro de la misma empresa.
    ("tenantId" = get_my_tenant_id() AND "contactUserId" = auth.uid()::text)
    -- O empresa contraparte con vínculo aceptado.
    OR (
      "counterpartTenantId" IS NOT NULL
      AND "counterpartTenantId" = get_my_tenant_id()
      AND has_company_link("tenantId")
      AND has_permission('subcontractor_portal:view')
    )
  );

-- El subcontratista NO edita el contrato: eso lo fija quien paga. Sí necesita
-- ver la obra a la que pertenece, para saber dónde va a trabajar.
DROP POLICY IF EXISTS "projects_counterpart_select" ON public.projects;
CREATE POLICY "projects_counterpart_select" ON public.projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.subcontracts s
      WHERE s."projectId" = public.projects.id
        AND s."counterpartTenantId" = get_my_tenant_id()
        AND has_company_link(s."tenantId")
        AND has_permission('subcontractor_portal:view')
    )
  );

-- ============================================================
-- 5. PERMISO
--    Vincular empresas es una decisión de la empresa, no de un usuario
--    cualquiera: abre el único camino por el que otra compañía ve algo suyo.
-- ============================================================
UPDATE public.roles
SET permissions = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(permissions || ARRAY['company_links:manage'])
  )
)
WHERE id = 'jefe-oficina-tecnica' AND "tenantId" = '__default__';
