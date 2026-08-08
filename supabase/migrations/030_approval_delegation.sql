-- ============================================================
-- 030 · Delegación de firma
-- Ejecutar en Supabase (Dashboard > SQL Editor). Idempotente.
--
-- QUÉ RESUELVE
--   «Estoy de vacaciones, que firme Juan por mí.»
--   Sin esto, el gerente se va dos semanas y todos los estados de pago del mes
--   quedan esperando a alguien que no está. La salida de emergencia sería que
--   alguien edite el flujo para sacarlo —y después nadie se acuerda de
--   devolverlo—, o que le presten la clave. Las dos son peores que el problema.
--
-- LO QUE ESTA MIGRACIÓN **NO** HACE, A PROPÓSITO
--
--   1. NO delega en cadena. Si A delega en B y B delega en C, C **no** firma
--      por A. Una cadena de delegaciones es imposible de auditar («¿quién
--      autorizó realmente este pago?») y puede formar un círculo. Un salto.
--
--   2. NO borra el rastro. La acción queda firmada por quien realmente hizo
--      clic, con `onBehalfOf` apuntando a la persona que delegó. En el
--      documento se lee «Juan Pérez, por Ana Soto». Una delegación que se
--      registra como si hubiera firmado el titular es una firma falsa.
--
--   3. NO es indefinida. Toda delegación tiene fecha de término. Una
--      delegación «hasta nuevo aviso» es, en la práctica, un cambio permanente
--      de quién aprueba, hecho por la puerta de atrás.
-- ============================================================

CREATE TABLE IF NOT EXISTS public."approvalDelegations" (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     TEXT NOT NULL,

  -- Quién delega (el titular) y en quién.
  "fromUserId"   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  "toUserId"     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- NULL = para todos los documentos. Con valor, solo para ese tipo: se puede
  -- delegar la firma de los estados de pago sin delegar la de los contratos.
  "documentType" TEXT
                 CHECK ("documentType" IS NULL OR "documentType" IN (
                   'subcontract', 'subcontract_certificate',
                   'payment_certificate', 'amendment'
                 )),

  "startDate"    DATE NOT NULL,
  "endDate"      DATE NOT NULL,

  reason         TEXT,
  active         BOOLEAN NOT NULL DEFAULT TRUE,

  "createdBy"    TEXT,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Delegarse a uno mismo no significa nada y confunde la lectura del historial.
  CONSTRAINT approval_delegation_distinct CHECK ("fromUserId" <> "toUserId"),
  CONSTRAINT approval_delegation_range    CHECK ("endDate" >= "startDate")
);

CREATE INDEX IF NOT EXISTS approval_delegations_tenant_idx
  ON public."approvalDelegations" ("tenantId");
CREATE INDEX IF NOT EXISTS approval_delegations_to_idx
  ON public."approvalDelegations" ("toUserId") WHERE active;
CREATE INDEX IF NOT EXISTS approval_delegations_from_idx
  ON public."approvalDelegations" ("fromUserId") WHERE active;

-- ============================================================
-- Rastro en la acción: quién firmó de verdad y por cuenta de quién.
-- ============================================================
ALTER TABLE public."approvalActions"
  ADD COLUMN IF NOT EXISTS "onBehalfOf" UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public."approvalActions"
  ADD COLUMN IF NOT EXISTS "onBehalfOfName" TEXT;

-- ============================================================
-- ¿Tiene esta persona una delegación vigente del titular?
-- Único lugar donde se responde. Un salto, sin recursión.
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_approval_delegation(
  p_from_user   UUID,
  p_document_type TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."approvalDelegations" d
    WHERE d.active
      AND d."fromUserId" = p_from_user
      AND d."toUserId"   = auth.uid()
      AND d."tenantId"   = get_my_tenant_id()
      AND (d."documentType" IS NULL OR d."documentType" = p_document_type)
      AND CURRENT_DATE BETWEEN d."startDate" AND d."endDate"
  );
$$;

-- ============================================================
-- can_act_on_approval, ahora con delegación.
--
-- Reemplaza a la versión de la 029. La regla nueva es el último OR de cada
-- rama: si el paso apunta a alguien que delegó en mí, puedo firmar.
--
-- Para un paso POR ROL la delegación se resuelve distinta: no hay un titular
-- concreto a quien reemplazar, así que se acepta si CUALQUIER persona de ese
-- rol delegó en quien pide. Sin eso, delegar la firma de un paso por rol sería
-- imposible, que es justo el caso más común (el jefe de terreno de vacaciones).
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_act_on_approval(p_request_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req    RECORD;
  v_step   JSONB;
  v_role   TEXT;
  v_tenant TEXT;
  v_titular UUID;
BEGIN
  SELECT * INTO v_req FROM public."approvalRequests" WHERE id = p_request_id;
  IF NOT FOUND OR v_req.status <> 'pendiente' THEN
    RETURN FALSE;
  END IF;

  v_role   := get_my_role();
  v_tenant := get_my_tenant_id();

  IF v_role = 'super-admin' THEN
    RETURN TRUE;
  END IF;

  IF v_req."tenantId" IS DISTINCT FROM v_tenant THEN
    RETURN FALSE;
  END IF;

  v_step := v_req."stepsSnapshot" -> v_req."currentStep";
  IF v_step IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Paso nominativo.
  IF v_step ->> 'approverUserId' IS NOT NULL THEN
    v_titular := (v_step ->> 'approverUserId')::UUID;
    RETURN v_titular = auth.uid()
        OR public.has_approval_delegation(v_titular, v_req."documentType");
  END IF;

  -- Paso por rol: el propio rol, o una delegación de alguien de ese rol.
  IF v_step ->> 'approverRole' = v_role THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public."approvalDelegations" d
    JOIN public.users u ON u.id = d."fromUserId"
    WHERE d.active
      AND d."toUserId" = auth.uid()
      AND d."tenantId" = v_tenant
      AND u.role = v_step ->> 'approverRole'
      AND (d."documentType" IS NULL OR d."documentType" = v_req."documentType")
      AND CURRENT_DATE BETWEEN d."startDate" AND d."endDate"
  );
END;
$$;

-- ============================================================
-- approval_act, ahora dejando el rastro de por cuenta de quién se firmó.
-- ============================================================
CREATE OR REPLACE FUNCTION public.approval_act(
  p_request_id   UUID,
  p_action       TEXT,
  p_comment      TEXT DEFAULT NULL,
  p_signature    TEXT DEFAULT NULL,
  p_document_hash TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req      RECORD;
  v_step     JSONB;
  v_user     RECORD;
  v_total    INTEGER;
  v_next     INTEGER;
  v_status   TEXT;
  v_titular  UUID;
  v_titular_nombre TEXT;
BEGIN
  IF p_action NOT IN ('aprobado', 'rechazado') THEN
    RAISE EXCEPTION 'Acción no válida: %', p_action;
  END IF;

  IF p_action = 'rechazado' AND (p_comment IS NULL OR btrim(p_comment) = '') THEN
    RAISE EXCEPTION 'Para rechazar hay que indicar el motivo.';
  END IF;

  IF NOT public.can_act_on_approval(p_request_id) THEN
    RAISE EXCEPTION 'No te corresponde firmar este paso.';
  END IF;

  SELECT * INTO v_req FROM public."approvalRequests"
  WHERE id = p_request_id FOR UPDATE;

  v_step  := v_req."stepsSnapshot" -> v_req."currentStep";
  v_total := jsonb_array_length(v_req."stepsSnapshot");

  SELECT name, rut, cargo, role INTO v_user
  FROM public.users WHERE id = auth.uid();

  -- ¿Firmó por cuenta de otro? Solo si el paso era nominativo y no es él.
  IF v_step ->> 'approverUserId' IS NOT NULL
     AND (v_step ->> 'approverUserId')::UUID <> auth.uid() THEN
    v_titular := (v_step ->> 'approverUserId')::UUID;
    SELECT name INTO v_titular_nombre FROM public.users WHERE id = v_titular;
  END IF;

  INSERT INTO public."approvalActions" (
    "tenantId", "requestId", "stepOrder", "stepName", action, comment,
    "actedBy", "actorName", "actorRut", "actorCargo", "actorRole",
    "onBehalfOf", "onBehalfOfName",
    signature, "documentHash"
  ) VALUES (
    v_req."tenantId", p_request_id, v_req."currentStep", v_step ->> 'name',
    p_action, NULLIF(btrim(COALESCE(p_comment, '')), ''),
    auth.uid(), v_user.name, v_user.rut, v_user.cargo, v_user.role,
    v_titular, v_titular_nombre,
    p_signature, COALESCE(p_document_hash, v_req."documentHash")
  );

  IF p_action = 'rechazado' THEN
    v_status := 'rechazado';
    v_next   := v_req."currentStep";
  ELSIF v_req."currentStep" + 1 >= v_total THEN
    v_status := 'aprobado';
    v_next   := v_total;
  ELSE
    v_status := 'pendiente';
    v_next   := v_req."currentStep" + 1;
  END IF;

  UPDATE public."approvalRequests"
  SET status = v_status,
      "currentStep" = v_next,
      "closedAt" = CASE WHEN v_status = 'pendiente' THEN NULL ELSE NOW() END
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'status', v_status,
    'currentStep', v_next,
    'totalSteps', v_total
  );
END;
$$;

-- ============================================================
-- RLS
--
-- Delegar es un acto PERSONAL: cada quien decide quién firma por él, y no
-- necesita permiso de nadie. Lo que NO puede es delegar en nombre de otro
-- (`fromUserId` tiene que ser uno mismo), porque eso sería asignarse la firma
-- ajena. La excepción es quien configura los flujos: tiene que poder cortar
-- una delegación que quedó abierta cuando la persona ya no está.
-- ============================================================
ALTER TABLE public."approvalDelegations" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_delegations_select" ON public."approvalDelegations";
CREATE POLICY "approval_delegations_select" ON public."approvalDelegations"
  FOR SELECT USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

DROP POLICY IF EXISTS "approval_delegations_insert" ON public."approvalDelegations";
CREATE POLICY "approval_delegations_insert" ON public."approvalDelegations"
  FOR INSERT WITH CHECK (
    ("tenantId" = get_my_tenant_id() AND "fromUserId" = auth.uid())
    OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "approval_delegations_update" ON public."approvalDelegations";
CREATE POLICY "approval_delegations_update" ON public."approvalDelegations"
  FOR UPDATE USING (
    ("tenantId" = get_my_tenant_id()
     AND ("fromUserId" = auth.uid() OR has_permission('approvals:configure')))
    OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "approval_delegations_delete" ON public."approvalDelegations";
CREATE POLICY "approval_delegations_delete" ON public."approvalDelegations"
  FOR DELETE USING (
    ("tenantId" = get_my_tenant_id()
     AND ("fromUserId" = auth.uid() OR has_permission('approvals:configure')))
    OR get_my_role() = 'super-admin'
  );

-- ============================================================
-- REALTIME
-- ============================================================
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public."approvalDelegations"; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
