-- ============================================================
-- 022 · Oficina Técnica — Adicionales y aumentos de obra
-- Ejecutar en Supabase (Dashboard > SQL Editor). Idempotente.
--
-- EL PROBLEMA QUE RESUELVE
--   Ninguna obra se ejecuta exactamente como se contrató: aparecen obras
--   extraordinarias, aumentos y disminuciones de partidas, y días de atraso que
--   no son culpa del contratista. Si eso no se lleva en un registro formal:
--     · se ejecuta obra que después nadie paga ("lo hicimos, pero no quedó por
--       escrito");
--     · el monto contra el que se mide el avance sigue siendo el original, así
--       que el estado de pago tope y la retención quedan mal;
--     · la fecha de término no se corre, y la multa por atraso se calcula
--       contra un plazo que ya no es el vigente.
--
--   `amendments` es ese registro: el ciclo completo de un adicional, desde que
--   se detecta hasta que se incorpora al contrato vigente.
--
-- CÓMO SE VALORIZA
--   Un adicional puede tener su propio PRESUPUESTO (`budgetId` → un `budgets`
--   de tipo 'adicional' con sus partidas y sus APU). Eso es lo que permite
--   cobrarlo después en el estado de pago partida por partida, igual que el
--   contrato principal. Pero no es obligatorio: un aumento de plazo puro o un
--   monto negociado a suma alzada se registran solo con su cifra.
--
-- EL SIGNO LO PONE EL TIPO, NO EL USUARIO
--   `amountNet` se guarda SIEMPRE positivo (es una magnitud). Que una
--   disminución de obra reste lo decide `type`, en `src/lib/amendment.ts`.
--   Guardar montos negativos a mano terminaba, tarde o temprano, en un
--   "-500.000" escrito con signo en un aumento de obra.
--
-- SOLO LO APROBADO CUENTA
--   Un adicional presentado y no aprobado NO cambia el monto ni el plazo del
--   contrato. Se muestra aparte, como expectativa, porque el mandante todavía
--   puede rechazarlo.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.amendments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    TEXT NOT NULL,
  "contractId"  UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  "projectId"   UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  -- Presupuesto que lo valoriza, si se cotizó por partidas. Al aprobarse, sus
  -- partidas quedan disponibles para cobrarse en los estados de pago.
  "budgetId"    UUID REFERENCES public.budgets(id) ON DELETE SET NULL,

  -- Correlativo dentro del contrato: "Adicional N° 3".
  number        INTEGER NOT NULL DEFAULT 1,
  name          TEXT NOT NULL,

  --  aumento_obra        → más cantidad de partidas que YA están en el contrato
  --  obra_extraordinaria → obra que no estaba contratada en ninguna partida
  --  disminucion_obra    → obra contratada que se deja de ejecutar (resta)
  --  aumento_plazo       → solo días, sin plata
  type          TEXT NOT NULL DEFAULT 'obra_extraordinaria'
                CHECK (type IN ('aumento_obra', 'obra_extraordinaria',
                                'disminucion_obra', 'aumento_plazo')),

  -- Por qué se originó. Es lo primero que pregunta el mandante y lo que decide
  -- quién lo paga.
  cause         TEXT NOT NULL DEFAULT 'otra'
                CHECK (cause IN ('modificacion_proyecto', 'error_proyecto',
                                 'solicitud_mandante', 'imprevisto_terreno',
                                 'fuerza_mayor', 'otra')),
  description   TEXT,

  -- Magnitud, siempre positiva (ver cabecera). 0 en un aumento de plazo puro.
  "amountNet"   NUMERIC(18,4) NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'CLP' CHECK (currency IN ('CLP', 'UF')),
  -- Días de aumento de plazo que trae el adicional. Corren la fecha de término
  -- contractual y, con ella, el cálculo de las multas.
  "extraDays"   INTEGER NOT NULL DEFAULT 0,

  status        TEXT NOT NULL DEFAULT 'borrador'
                CHECK (status IN ('borrador', 'presentado', 'aprobado',
                                  'rechazado', 'anulado')),

  -- N° de la orden de cambio / carta / resolución con que el mandante lo aprobó.
  reference     TEXT,
  "detectedAt"  DATE,
  "presentedAt" TIMESTAMPTZ,
  "approvedAt"  TIMESTAMPTZ,
  "approvedBy"  TEXT,
  "rejectionReason" TEXT,
  notes         TEXT,
  "createdBy"   TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS amendments_tenant_idx   ON public.amendments ("tenantId");
CREATE INDEX IF NOT EXISTS amendments_contract_idx ON public.amendments ("contractId");
CREATE INDEX IF NOT EXISTS amendments_project_idx  ON public.amendments ("projectId");

-- Un correlativo por contrato, y un presupuesto valoriza un solo adicional.
CREATE UNIQUE INDEX IF NOT EXISTS amendments_number_uniq
  ON public.amendments ("contractId", number);
CREATE UNIQUE INDEX IF NOT EXISTS amendments_budget_uniq
  ON public.amendments ("budgetId") WHERE "budgetId" IS NOT NULL;

-- ============================================================
-- 2. CONGELADO AL APROBAR
--    Un adicional aprobado ya cambió el monto y el plazo del contrato, y con
--    eso los estados de pago que se emitieron después. Editarle la cifra a
--    posteriori dejaría EEPP cuadrando contra un contrato que ya no existe.
--    Se permite seguir el trámite (anularlo deja rastro) y anotar la referencia.
--
--    Va en un TRIGGER, no en la UI: esconder el botón no es seguridad,
--    cualquiera con sesión puede escribir por REST.
-- ============================================================
CREATE OR REPLACE FUNCTION public.amendment_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'aprobado' THEN
    IF NEW."amountNet" IS DISTINCT FROM OLD."amountNet"
    OR NEW."extraDays" IS DISTINCT FROM OLD."extraDays"
    OR NEW.type       IS DISTINCT FROM OLD.type
    OR NEW."budgetId" IS DISTINCT FROM OLD."budgetId"
    THEN
      RAISE EXCEPTION 'Un adicional aprobado no puede cambiar de monto, plazo ni presupuesto. Anúlalo y crea uno nuevo.';
    END IF;
  END IF;

  -- Aprobar o rechazar es la decisión del mandante: exige permiso propio, no
  -- basta con poder redactar el adicional.
  IF NEW.status IN ('aprobado', 'rechazado')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT has_permission('amendments:approve') THEN
      RAISE EXCEPTION 'No tienes permiso para aprobar o rechazar adicionales.';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS amendments_guard ON public.amendments;
CREATE TRIGGER amendments_guard
  BEFORE UPDATE ON public.amendments
  FOR EACH ROW EXECUTE FUNCTION public.amendment_guard();

-- Un adicional aprobado tampoco se borra: es parte del contrato vigente.
CREATE OR REPLACE FUNCTION public.amendment_guard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'aprobado' THEN
    RAISE EXCEPTION 'Un adicional aprobado no se borra: anúlalo para dejar el rastro.';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS amendments_guard_delete ON public.amendments;
CREATE TRIGGER amendments_guard_delete
  BEFORE DELETE ON public.amendments
  FOR EACH ROW EXECUTE FUNCTION public.amendment_guard_delete();

-- ============================================================
-- 3. RLS
--    Se leen con `contracts:view` (quien ve el contrato tiene que ver de qué
--    está compuesto el monto vigente) y se escriben con `amendments:manage`.
-- ============================================================
ALTER TABLE public.amendments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "amendments_select" ON public.amendments;
CREATE POLICY "amendments_select" ON public.amendments
  FOR SELECT USING (
    ("tenantId" = get_my_tenant_id() AND has_permission('contracts:view'))
    OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "amendments_write" ON public.amendments;
CREATE POLICY "amendments_write" ON public.amendments
  FOR ALL
  USING      ("tenantId" = get_my_tenant_id() AND has_permission('amendments:manage'))
  WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('amendments:manage'));

-- ============================================================
-- 4. PERMISOS
--    Sin esto has_permission() devuelve FALSE y la base rechaza todo aunque la
--    UI muestre los botones. admin/operations/soporte/super-admin se resuelven
--    por código dentro de has_permission y no necesitan fila.
-- ============================================================
UPDATE public.roles
SET permissions = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(
      permissions || ARRAY[
        'amendments:manage',
        'amendments:approve'
      ]
    )
  )
)
WHERE id = 'jefe-oficina-tecnica' AND "tenantId" = '__default__';
