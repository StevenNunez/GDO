-- ============================================================
-- 039 · Módulo Last Planner (Fase 3) — Parte diario
-- Ejecutar en Supabase (Dashboard > SQL Editor). Idempotente.
--
-- QUÉ RESUELVE
--   Las migraciones 037 y 038 dejaron el programa: las unidades, las
--   actividades y qué día le toca a cada depto. Todo eso es lo que DEBERÍA
--   pasar. Esta migración guarda lo que pasó de verdad, y lo guarda como se
--   puede capturar en terreno: desde el teléfono, el mismo día, por la persona
--   que estuvo ahí.
--
--   Sin esto, el atraso se descubre en la reunión del lunes, cuando ya son
--   cinco días de atraso.
--
-- LA DECISIÓN MÁS IMPORTANTE: `progress` ES ACUMULADO, NO INCREMENTO
--   Lo natural parecía guardar "hoy avancé un 20% del depto 312". Se descartó.
--
--   Un incremento obliga al supervisor a acordarse de lo que reportó ayer para
--   no contar dos veces, y si corrige el parte del día anterior queda un total
--   que ya no significa nada. Y si alguien reporta dos veces el mismo día —que
--   pasa— el depto queda en 140%.
--
--   Acá `progress` es EN CUÁNTO QUEDÓ la unidad al final de ese día: 0 a 1. Es
--   lo que la persona ve cuando mira el depto ("va como en tres cuartos"), no
--   una resta que tenga que hacer de memoria. Reportar dos veces el mismo día
--   corrige, no suma. El incremento se calcula cuando se necesita.
--
--   `crewDays` es la excepción, y sí es incremento: las jornadas gastadas ESE
--   día. Nadie mira un depto y estima "van 14 jornadas acumuladas"; se sabe
--   cuántos hombres se pusieron hoy. Sumadas dan el total, y contra el avance
--   dan el rendimiento — que es la columna HD del Excel del usuario.
--
-- POR QUÉ LA CAUSA VIVE ACÁ Y NO SOLO EN EL PROGRAMA SEMANAL
--   La migración 024 ya guarda causas de no cumplimiento, pero por SEMANA y
--   por compromiso. Un PPC malo dice que la semana salió mal; no dice qué día
--   se cayó ni en qué depto. La causa a nivel de parte diario es la que
--   permite atacar el problema el martes en vez de discutirlo el lunes
--   siguiente. Se usan los MISMOS códigos de la 024 para que el Pareto sea uno
--   solo y no dos que no cuadran.
-- ============================================================

SET lock_timeout = '10s';
SET statement_timeout = '120s';

-- ============================================================
-- ▶ PARTE 1 de 4 · EL PARTE DIARIO
-- ============================================================
CREATE TABLE IF NOT EXISTS public."dailyProgress" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    TEXT NOT NULL,
  "projectId"   UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  "activityId"  UUID NOT NULL REFERENCES public."trainActivities"(id) ON DELETE CASCADE,
  -- NULL = actividad que no se divide en unidades (movimiento de tierra, un
  -- hormigonado). Se reporta contra la actividad completa.
  "unitId"      UUID REFERENCES public."workUnits"(id) ON DELETE CASCADE,

  date          DATE NOT NULL,

  -- EN CUÁNTO QUEDÓ la unidad al final del día, de 0 a 1. Ver la nota de
  -- arriba: es acumulado, no lo que avanzó hoy.
  progress      NUMERIC(5,4) NOT NULL DEFAULT 0
                CHECK (progress >= 0 AND progress <= 1),

  -- Jornadas gastadas ESE día (la columna HD del programa de terminaciones).
  -- Esta sí es incremento: se suman para el total.
  "crewDays"    NUMERIC(8,2) CHECK ("crewDays" IS NULL OR "crewDays" >= 0),

  -- Cantidad avanzada en la unidad de medida de la actividad, cuando la
  -- actividad se mide en m2 o ml en vez de "depto terminado".
  quantity      NUMERIC(18,4),

  -- Por qué NO avanzó. Mismos códigos que la migración 024 para que el Pareto
  -- de causas sea uno solo.
  "causeCode"   TEXT
                CHECK ("causeCode" IS NULL OR "causeCode" IN
                  ('materiales', 'mano_obra', 'equipos', 'informacion',
                   'cancha', 'subcontrato', 'clima', 'cambio_mandante',
                   'mala_programacion', 'otra')),

  "photoPath"   TEXT,
  notes         TEXT,

  -- Quién lo cargó. `reportedBy` queda NULL cuando lo mandó un capataz por
  -- enlace, sin cuenta; ahí el nombre es lo único que identifica.
  "reportedBy"     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  "reportedByName" TEXT,

  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS daily_progress_tenant_idx
  ON public."dailyProgress" ("tenantId", date);
CREATE INDEX IF NOT EXISTS daily_progress_project_idx
  ON public."dailyProgress" ("projectId", date);
CREATE INDEX IF NOT EXISTS daily_progress_activity_idx
  ON public."dailyProgress" ("activityId", "unitId", date);

-- UN PARTE POR UNIDAD POR DÍA
--   Es lo que hace que reportar dos veces el mismo día CORRIJA en vez de
--   duplicar. La app escribe con upsert contra este índice. El COALESCE es
--   porque NULL no choca contra NULL en un índice único común, y las
--   actividades sin unidad física necesitan la misma protección.
CREATE UNIQUE INDEX IF NOT EXISTS daily_progress_unicidad_idx
  ON public."dailyProgress"
     ("activityId", COALESCE("unitId", '00000000-0000-0000-0000-000000000000'::uuid), date);

-- `updatedAt` a mano se olvida justo cuando importa: al corregir un parte.
CREATE OR REPLACE FUNCTION public.daily_progress_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."updatedAt" := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_daily_progress_touch ON public."dailyProgress";
CREATE TRIGGER trg_daily_progress_touch
  BEFORE UPDATE ON public."dailyProgress"
  FOR EACH ROW EXECUTE FUNCTION public.daily_progress_touch();

-- ============================================================
-- ▶ PARTE 2 de 4 · ENLACES PARA EL CAPATAZ SIN CUENTA
--
--   El que sabe lo que pasó en el piso 7 muchas veces no tiene cuenta en la
--   app y no la va a tener: es el capataz del subcontratista. Obligarlo a
--   crearse un usuario es garantizar que el parte no se cargue.
--
--   Se le manda por WhatsApp un enlace que abre SOLO el parte de su actividad
--   y de ese día. No es una sesión: no puede ver el resto de la obra, no puede
--   mirar precios, y a medianoche deja de servir.
--
--   El token se valida en el servidor (`/api/parte/[token]`) con la clave de
--   servicio, igual que el resto de las operaciones privilegiadas de la app.
--   Por eso esta tabla NO se expone por RLS al rol anónimo.
-- ============================================================
CREATE TABLE IF NOT EXISTS public."dailyReportTokens" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    TEXT NOT NULL,
  "projectId"   UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  "activityId"  UUID NOT NULL REFERENCES public."trainActivities"(id) ON DELETE CASCADE,

  -- Lo que va en la URL. Lo genera la app, no la base: tiene que ser
  -- imposible de adivinar y no derivarse de ningún id visible.
  token         TEXT NOT NULL UNIQUE,

  -- Para saber de quién es el parte cuando llegue.
  "foremanName" TEXT NOT NULL,

  -- El día que cubre. Un enlace de ayer no sirve para reportar hoy: si no, un
  -- enlace reenviado por WhatsApp escribe sobre el día equivocado.
  "validFor"    DATE NOT NULL,
  "expiresAt"   TIMESTAMPTZ NOT NULL,

  "usedCount"   INTEGER NOT NULL DEFAULT 0,
  "lastUsedAt"  TIMESTAMPTZ,

  "createdBy"   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS daily_report_tokens_tenant_idx
  ON public."dailyReportTokens" ("tenantId", "validFor");
CREATE INDEX IF NOT EXISTS daily_report_tokens_activity_idx
  ON public."dailyReportTokens" ("activityId", "validFor");

-- ============================================================
-- ▶ PARTE 3 de 4 · RLS
--
--   Reportar es de quien está en terreno, y ese no es necesariamente el que
--   programa: el jefe de terreno arma el tren (`planning:manage`) pero el
--   supervisor solo carga su avance. Por eso acá SÍ hay un permiso nuevo,
--   `daily_report:submit` — es la única forma de que un supervisor pueda
--   escribir el parte sin poder tocar el programa.
--
--   Los tokens no se exponen al rol anónimo: el enlace público pasa por el
--   servidor con la clave de servicio.
-- ============================================================
ALTER TABLE public."dailyProgress"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."dailyReportTokens" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_progress_select" ON public."dailyProgress";
CREATE POLICY "daily_progress_select" ON public."dailyProgress"
  FOR SELECT USING (
    "tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "daily_progress_write" ON public."dailyProgress";
CREATE POLICY "daily_progress_write" ON public."dailyProgress"
  FOR ALL
  USING      (("tenantId" = get_my_tenant_id()
               AND (has_permission('daily_report:submit') OR has_permission('planning:manage')))
              OR get_my_role() = 'super-admin')
  WITH CHECK (("tenantId" = get_my_tenant_id()
               AND (has_permission('daily_report:submit') OR has_permission('planning:manage')))
              OR get_my_role() = 'super-admin');

DROP POLICY IF EXISTS "daily_report_tokens_select" ON public."dailyReportTokens";
CREATE POLICY "daily_report_tokens_select" ON public."dailyReportTokens"
  FOR SELECT USING (
    "tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "daily_report_tokens_write" ON public."dailyReportTokens";
CREATE POLICY "daily_report_tokens_write" ON public."dailyReportTokens"
  FOR ALL
  USING      (("tenantId" = get_my_tenant_id() AND has_permission('planning:manage'))
              OR get_my_role() = 'super-admin')
  WITH CHECK (("tenantId" = get_my_tenant_id() AND has_permission('planning:manage'))
              OR get_my_role() = 'super-admin');

-- ============================================================
-- ▶ PARTE 4 de 4 · PERMISOS Y REALTIME
--
--   Quien ya programa, reporta. Y el supervisor y el subcontratista reportan
--   sin poder programar, que es todo el punto del permiso nuevo.
-- ============================================================
UPDATE public.roles
SET permissions = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(permissions || ARRAY['daily_report:submit', 'planning:view'])
  )
)
WHERE id IN ('jefe-oficina-tecnica', 'jefe-terreno', 'supervisor')
  AND "tenantId" = '__default__';

-- El subcontratista invitado carga SU parte, y nada más. Sin `planning:view`:
-- eso abriría el programa completo de la obra, que es del contratista.
UPDATE public.roles
SET permissions = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(permissions || ARRAY['daily_report:submit'])
  )
)
WHERE id = 'subcontratista' AND "tenantId" = '__default__';

-- Los administradores de la empresa tienen todo por definición.
UPDATE public.roles
SET permissions = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(permissions || ARRAY['daily_report:submit'])
  )
)
WHERE id IN ('admin', 'operations', 'soporte') AND "tenantId" = '__default__';

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public."dailyProgress"; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public."dailyReportTokens"; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
