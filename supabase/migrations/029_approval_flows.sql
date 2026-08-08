-- ============================================================
-- 029 · Oficina Técnica — Flujo de aprobación configurable por empresa
-- Ejecutar en Supabase (Dashboard > SQL Editor). Idempotente.
--
-- QUÉ RESUELVE
--   Hoy cada documento tiene su propio "aprobado sí/no" de un solo paso, y el
--   motivo del rechazo no se guarda en ninguna parte. La empresa necesita lo
--   contrario: una cadena de visto bueno que ELLA define (Jefe de Terreno →
--   Oficina Técnica → Gerencia), donde cada firmante deja su firma y quien
--   rechaza está obligado a decir por qué.
--
-- POR QUÉ UN MOTOR ÚNICO Y NO UNO POR DOCUMENTO
--   El mismo dibujo aparece para contratos de subcontrato, estados de pago de
--   subcontrato, estados de pago al mandante y adicionales. Cuatro copias de la
--   misma máquina significan cuatro lugares donde arreglar el mismo error y,
--   en la práctica, cuatro comportamientos distintos al año siguiente. Acá el
--   documento no sabe aprobar: le pide el trámite al motor, y el motor le
--   responde aprobado o rechazado. Agregar un quinto tipo de documento es
--   agregar una línea al CHECK, no una tabla nueva.
--
-- LA FOTOGRAFÍA DEL FLUJO (`stepsSnapshot`)
--   Al abrir el trámite se copian los pasos vigentes dentro de la solicitud. Si
--   mañana la empresa cambia su cadena de aprobación, los documentos que ya
--   estaban en curso siguen mostrando por quiénes pasaron de verdad. Un flujo
--   que se reescribe hacia atrás es un flujo que no sirve como respaldo.
--
-- LA FIRMA
--   Es firma simple: nombre, RUT y cargo del firmante congelados al momento de
--   firmar, más su imagen de firma y la huella del documento (`documentHash`).
--   La huella es lo que permite detectar que el documento cambió DESPUÉS de la
--   firma: si el monto se edita, la huella deja de calzar y la app lo avisa.
--   No es firma electrónica avanzada y no pretende serlo.
-- ============================================================

-- ============================================================
-- 1. FLUJOS — la plantilla que define la empresa
-- ============================================================
CREATE TABLE IF NOT EXISTS public."approvalFlows" (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     TEXT NOT NULL,

  -- Qué documento gobierna este flujo. Agregar un tipo nuevo = una línea acá.
  "documentType" TEXT NOT NULL
                 CHECK ("documentType" IN (
                   'subcontract',              -- contrato de subcontrato
                   'subcontract_certificate',  -- EEPP de subcontrato
                   'payment_certificate',      -- EEPP al mandante
                   'amendment'                 -- adicional / aumento de obra
                 )),

  name           TEXT NOT NULL,
  -- Un flujo apagado deja de aplicarse a los documentos nuevos, pero los
  -- trámites que ya estaban abiertos siguen su curso con su fotografía.
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  notes          TEXT,
  "createdBy"    TEXT,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS approval_flows_tenant_idx
  ON public."approvalFlows" ("tenantId", "documentType");

-- Un solo flujo activo por empresa y tipo de documento: si hubiera dos, no
-- habría manera de decidir cuál se aplica al crear el trámite.
CREATE UNIQUE INDEX IF NOT EXISTS approval_flows_active_uniq
  ON public."approvalFlows" ("tenantId", "documentType")
  WHERE active;

-- ============================================================
-- 2. PASOS DEL FLUJO — cada eslabón de la cadena
-- ============================================================
CREATE TABLE IF NOT EXISTS public."approvalFlowSteps" (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     TEXT NOT NULL,
  "flowId"       UUID NOT NULL REFERENCES public."approvalFlows"(id) ON DELETE CASCADE,

  "sortOrder"    INTEGER NOT NULL DEFAULT 0,
  name           TEXT NOT NULL,

  -- Quién aprueba. Por ROL es lo normal («el jefe de terreno», sea quien sea
  -- hoy); por PERSONA cuando el visto bueno es de alguien en particular
  -- (el gerente). Si van los dos, manda la persona.
  "approverRole"   TEXT,
  "approverUserId" UUID REFERENCES public.users(id) ON DELETE SET NULL,

  -- Un paso puede pedir firma dibujada o bastarse con el clic de aprobación.
  "requiresSignature" BOOLEAN NOT NULL DEFAULT TRUE,

  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Un paso sin aprobador no lo puede aprobar nadie: dejaría el documento
  -- trabado para siempre sin que nadie entienda por qué.
  CONSTRAINT approval_step_has_approver
    CHECK ("approverRole" IS NOT NULL OR "approverUserId" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS approval_flow_steps_flow_idx
  ON public."approvalFlowSteps" ("flowId", "sortOrder");
CREATE INDEX IF NOT EXISTS approval_flow_steps_tenant_idx
  ON public."approvalFlowSteps" ("tenantId");

-- ============================================================
-- 3. SOLICITUDES — el trámite de UN documento concreto
-- ============================================================
CREATE TABLE IF NOT EXISTS public."approvalRequests" (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     TEXT NOT NULL,

  "documentType" TEXT NOT NULL
                 CHECK ("documentType" IN (
                   'subcontract', 'subcontract_certificate',
                   'payment_certificate', 'amendment'
                 )),
  -- Sin FK a propósito: apunta a cuatro tablas distintas. El borrado del
  -- documento limpia su trámite por trigger (más abajo).
  "documentId"   UUID NOT NULL,
  "projectId"    UUID REFERENCES public.projects(id) ON DELETE CASCADE,

  "flowId"       UUID REFERENCES public."approvalFlows"(id) ON DELETE SET NULL,
  -- Fotografía de los pasos al abrir el trámite:
  -- [{ order, name, approverRole, approverUserId, requiresSignature }]
  "stepsSnapshot" JSONB NOT NULL DEFAULT '[]'::jsonb,

  status         TEXT NOT NULL DEFAULT 'pendiente'
                 CHECK (status IN ('pendiente', 'aprobado', 'rechazado', 'anulado')),
  -- Índice del paso en curso dentro de `stepsSnapshot` (base 0).
  "currentStep"  INTEGER NOT NULL DEFAULT 0,

  -- Huella del documento al presentarlo. Ver la nota de cabecera.
  "documentHash" TEXT,

  "submittedBy"  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  "submittedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "closedAt"     TIMESTAMPTZ,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS approval_requests_tenant_idx
  ON public."approvalRequests" ("tenantId");
CREATE INDEX IF NOT EXISTS approval_requests_doc_idx
  ON public."approvalRequests" ("documentType", "documentId");
CREATE INDEX IF NOT EXISTS approval_requests_open_idx
  ON public."approvalRequests" ("tenantId", status) WHERE status = 'pendiente';

-- Un documento no puede tener dos trámites abiertos a la vez: sería imposible
-- decir cuál de los dos es el que vale.
CREATE UNIQUE INDEX IF NOT EXISTS approval_requests_open_uniq
  ON public."approvalRequests" ("documentType", "documentId")
  WHERE status = 'pendiente';

-- ============================================================
-- 4. ACCIONES — quién firmó qué, cuándo y con qué motivo
--    Es el libro del trámite: solo se agrega, nunca se corrige.
-- ============================================================
CREATE TABLE IF NOT EXISTS public."approvalActions" (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     TEXT NOT NULL,
  "requestId"    UUID NOT NULL REFERENCES public."approvalRequests"(id) ON DELETE CASCADE,

  "stepOrder"    INTEGER NOT NULL,
  "stepName"     TEXT,

  action         TEXT NOT NULL CHECK (action IN ('aprobado', 'rechazado')),
  -- Motivo del rechazo. Obligatorio al rechazar: un rechazo sin motivo obliga
  -- a llamar por teléfono para saber qué corregir, que es justo lo que este
  -- módulo viene a evitar.
  comment        TEXT,

  -- Identidad congelada del firmante. Si mañana cambia de cargo o se va de la
  -- empresa, el documento sigue diciendo quién firmó y con qué cargo lo hizo.
  "actedBy"      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  "actorName"    TEXT,
  "actorRut"     TEXT,
  "actorCargo"   TEXT,
  "actorRole"    TEXT,

  signature      TEXT,   -- imagen de la firma (data URL), como en prevención
  "documentHash" TEXT,   -- huella del documento en el instante de firmar

  "actedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT approval_rejection_needs_reason
    CHECK (action <> 'rechazado' OR (comment IS NOT NULL AND length(btrim(comment)) > 0))
);

CREATE INDEX IF NOT EXISTS approval_actions_request_idx
  ON public."approvalActions" ("requestId", "stepOrder");
CREATE INDEX IF NOT EXISTS approval_actions_tenant_idx
  ON public."approvalActions" ("tenantId");
CREATE INDEX IF NOT EXISTS approval_actions_actor_idx
  ON public."approvalActions" ("actedBy");

-- ============================================================
-- 5. LIMPIEZA AL BORRAR EL DOCUMENTO
--    `documentId` no tiene FK (apunta a cuatro tablas), así que la cascada hay
--    que escribirla. Sin esto quedan trámites huérfanos contando como
--    pendientes en la bandeja de alguien que ya no tiene qué firmar.
-- ============================================================
CREATE OR REPLACE FUNCTION public.approval_cleanup_orphans()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public."approvalRequests"
  WHERE "documentType" = TG_ARGV[0] AND "documentId" = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_approval_cleanup ON public.subcontracts;
CREATE TRIGGER trg_approval_cleanup
  AFTER DELETE ON public.subcontracts
  FOR EACH ROW EXECUTE FUNCTION public.approval_cleanup_orphans('subcontract');

DROP TRIGGER IF EXISTS trg_approval_cleanup ON public."subcontractCertificates";
CREATE TRIGGER trg_approval_cleanup
  AFTER DELETE ON public."subcontractCertificates"
  FOR EACH ROW EXECUTE FUNCTION public.approval_cleanup_orphans('subcontract_certificate');

DROP TRIGGER IF EXISTS trg_approval_cleanup ON public."paymentCertificates";
CREATE TRIGGER trg_approval_cleanup
  AFTER DELETE ON public."paymentCertificates"
  FOR EACH ROW EXECUTE FUNCTION public.approval_cleanup_orphans('payment_certificate');

DROP TRIGGER IF EXISTS trg_approval_cleanup ON public.amendments;
CREATE TRIGGER trg_approval_cleanup
  AFTER DELETE ON public.amendments
  FOR EACH ROW EXECUTE FUNCTION public.approval_cleanup_orphans('amendment');

-- ============================================================
-- 6. ¿PUEDE ESTA PERSONA FIRMAR ESTE PASO?
--    Único lugar donde se decide. La pantalla hace la misma cuenta para
--    mostrar u ocultar el botón, pero quien manda es esta función.
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

  -- El trámite es de otra empresa: no se firma desde afuera.
  IF v_req."tenantId" IS DISTINCT FROM v_tenant THEN
    RETURN FALSE;
  END IF;

  v_step := v_req."stepsSnapshot" -> v_req."currentStep";
  IF v_step IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Paso nominativo: solo esa persona. Manda por sobre el rol.
  IF v_step ->> 'approverUserId' IS NOT NULL THEN
    RETURN (v_step ->> 'approverUserId')::UUID = auth.uid();
  END IF;

  RETURN v_step ->> 'approverRole' = v_role;
END;
$$;

-- ============================================================
-- 7. FIRMAR UN PASO (RPC)
--    Va por RPC y no por UPDATE del navegador porque son tres cosas que tienen
--    que pasar juntas o ninguna: registrar la acción, mover el paso y —si era
--    el último— cerrar el trámite. Hecho desde el cliente, una pestaña cerrada
--    a mitad de camino deja el documento en un estado que no existe.
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

  -- FOR UPDATE: si dos aprobadores hacen clic al mismo tiempo, el segundo
  -- espera y se encuentra con el paso ya movido en vez de firmarlo dos veces.
  SELECT * INTO v_req FROM public."approvalRequests"
  WHERE id = p_request_id FOR UPDATE;

  v_step  := v_req."stepsSnapshot" -> v_req."currentStep";
  v_total := jsonb_array_length(v_req."stepsSnapshot");

  SELECT name, rut, cargo, role INTO v_user
  FROM public.users WHERE id = auth.uid();

  INSERT INTO public."approvalActions" (
    "tenantId", "requestId", "stepOrder", "stepName", action, comment,
    "actedBy", "actorName", "actorRut", "actorCargo", "actorRole",
    signature, "documentHash"
  ) VALUES (
    v_req."tenantId", p_request_id, v_req."currentStep", v_step ->> 'name',
    p_action, NULLIF(btrim(COALESCE(p_comment, '')), ''),
    auth.uid(), v_user.name, v_user.rut, v_user.cargo, v_user.role,
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
-- 8. RLS
--    Leer: la empresa. Configurar el flujo: permiso dedicado. Firmar: NO se
--    escribe la acción a mano, se llama al RPC — por eso `approvalActions` no
--    tiene política de INSERT para el cliente.
-- ============================================================
ALTER TABLE public."approvalFlows"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."approvalFlowSteps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."approvalRequests"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."approvalActions"   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_flows_select" ON public."approvalFlows";
CREATE POLICY "approval_flows_select" ON public."approvalFlows"
  FOR SELECT USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

DROP POLICY IF EXISTS "approval_flows_write" ON public."approvalFlows";
CREATE POLICY "approval_flows_write" ON public."approvalFlows"
  FOR ALL USING (
    ("tenantId" = get_my_tenant_id() AND has_permission('approvals:configure'))
    OR get_my_role() = 'super-admin'
  ) WITH CHECK (
    ("tenantId" = get_my_tenant_id() AND has_permission('approvals:configure'))
    OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "approval_steps_select" ON public."approvalFlowSteps";
CREATE POLICY "approval_steps_select" ON public."approvalFlowSteps"
  FOR SELECT USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

DROP POLICY IF EXISTS "approval_steps_write" ON public."approvalFlowSteps";
CREATE POLICY "approval_steps_write" ON public."approvalFlowSteps"
  FOR ALL USING (
    ("tenantId" = get_my_tenant_id() AND has_permission('approvals:configure'))
    OR get_my_role() = 'super-admin'
  ) WITH CHECK (
    ("tenantId" = get_my_tenant_id() AND has_permission('approvals:configure'))
    OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "approval_requests_select" ON public."approvalRequests";
CREATE POLICY "approval_requests_select" ON public."approvalRequests"
  FOR SELECT USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- Abrir el trámite lo hace quien prepara el documento; el permiso del
-- documento en sí ya lo controla la RLS de su propia tabla.
DROP POLICY IF EXISTS "approval_requests_insert" ON public."approvalRequests";
CREATE POLICY "approval_requests_insert" ON public."approvalRequests"
  FOR INSERT WITH CHECK (
    "tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin'
  );

-- Lo único que el cliente puede cambiar a mano es anular su propio trámite.
-- Avanzar los pasos es cosa del RPC.
DROP POLICY IF EXISTS "approval_requests_update" ON public."approvalRequests";
CREATE POLICY "approval_requests_update" ON public."approvalRequests"
  FOR UPDATE USING (
    ("tenantId" = get_my_tenant_id() AND ("submittedBy" = auth.uid() OR has_permission('approvals:configure')))
    OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "approval_requests_delete" ON public."approvalRequests";
CREATE POLICY "approval_requests_delete" ON public."approvalRequests"
  FOR DELETE USING (
    ("tenantId" = get_my_tenant_id() AND has_permission('approvals:configure'))
    OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "approval_actions_select" ON public."approvalActions";
CREATE POLICY "approval_actions_select" ON public."approvalActions"
  FOR SELECT USING ("tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin');

-- ============================================================
-- 9. REALTIME
-- ============================================================
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public."approvalFlows";     EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public."approvalFlowSteps"; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public."approvalRequests";  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public."approvalActions";   EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
