-- ============================================================
-- 038 · Módulo Last Planner (Fase 2) — Tren de actividades
-- Ejecutar en Supabase (Dashboard > SQL Editor). Idempotente.
--
-- QUÉ RESUELVE
--   La migración 037 dejó las COLUMNAS de la matriz (las unidades). Esta deja
--   las FILAS: las actividades que se repiten unidad por unidad —pulido, yeso,
--   cerámica, pintura— cada una con su cuadrilla y su ritmo.
--
--   Cruzar las dos da la matriz completa del programa de terminaciones: qué
--   día le toca la cerámica al depto 312. Eso hoy son 14.400 celdas escritas a
--   mano en un Excel, y cada vez que una actividad se atrasa hay que
--   reescribirlas todas.
--
-- LA DECISIÓN DE FONDO: LAS FECHAS DE LAS CELDAS **NO** SE GUARDAN
--   Sería lo obvio: una tabla `celda` con actividad, unidad y fecha. Se
--   descartó por dos razones. La primera es el volumen: 60 actividades por 240
--   unidades son 14.400 filas por obra que hay que reescribir enteras cada vez
--   que alguien corre una fecha de inicio un día. La segunda, más grave: una
--   fecha guardada y un ritmo guardado siempre terminan discrepando, y ahí ya
--   no se sabe cuál de las dos es el programa.
--
--   Acá se guarda lo que alguien DECIDE —dónde empieza la actividad y a qué
--   ritmo avanza— y la fecha de cada celda se calcula (`src/lib/train.ts`).
--   Correr el inicio un día es cambiar un dato, no 240.
--
-- QUÉ SIGNIFICA `daysPerUnit`
--   Días que la cuadrilla ocupa en CADA unidad. Es fraccionario a propósito:
--   0.5 son dos deptos por día, que es exactamente el ritmo del programa de
--   Los Fundadores (los deptos 112 y 113 comparten fecha, el 114 cae al día
--   hábil siguiente). 2 son dos días por depto. Un solo número cubre los dos
--   casos y evita tener una columna "unidades por día" y otra "días por
--   unidad" que se contradigan.
--
-- POR QUÉ NO HAY DEPENDENCIAS ENTRE ACTIVIDADES
--   Tentaba guardar "el yeso empieza cuando termina la tabiquería". Se
--   descartó para esta fase: un grafo de dependencias admite ciclos, y un
--   ciclo en el programa de una obra es una pantalla que no carga y nadie sabe
--   por qué. Cada actividad tiene su propia fecha de inicio, que es lo que
--   tiene el Excel hoy, y la app ofrece escalonarlas de una pasada. El
--   recálculo en cadena contra el avance real es de la Fase 4, cuando ya haya
--   avance real contra el cual recalcular.
-- ============================================================

SET lock_timeout = '10s';
SET statement_timeout = '120s';

-- ============================================================
-- ▶ PARTE 1 de 3 · ACTIVIDADES DEL TREN
-- ============================================================
CREATE TABLE IF NOT EXISTS public."trainActivities" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    TEXT NOT NULL,
  "projectId"   UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  -- Agrupación de la carta: "FASE I", "FASE II". Texto libre, igual que
  -- `groupName` en las unidades y por la misma razón: cambia de obra en obra.
  phase         TEXT,
  name          TEXT NOT NULL,

  -- Orden de la fila. Es el orden en que pasan las cuadrillas por una unidad,
  -- y no se puede derivar de las fechas: dos actividades pueden empezar el
  -- mismo día y aun así una va antes que la otra en el recorrido.
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,

  -- Quién la ejecuta. Igual que en subcontratos: referencia si el subcontrato
  -- existe, y texto libre si todavía no está cargado — no se puede obligar a
  -- firmar un contrato antes de poder programar.
  "subcontractId"   UUID REFERENCES public.subcontracts(id) ON DELETE SET NULL,
  "responsibleName" TEXT,

  -- Partida de la EDT que avanza con esta actividad. Es lo que después deja
  -- que el parte diario mueva el avance físico y el control de costos.
  "workItemId"  UUID REFERENCES public."workItems"(id) ON DELETE SET NULL,

  -- Ritmo. Ver la nota de arriba: 0.5 = dos unidades por día.
  "daysPerUnit" NUMERIC(8,3) NOT NULL DEFAULT 1
                CHECK ("daysPerUnit" > 0),

  -- Dónde arranca la actividad, sobre la PRIMERA unidad del recorrido. El
  -- resto de las fechas sale de acá más el ritmo más el calendario laboral.
  "startDate"   DATE,

  -- Unidades sobre las que corre. Vacío o NULL = todas las unidades activas de
  -- la obra. Con valores, solo esos grupos: hay actividades que van únicamente
  -- en los zócalos o en los primeros pisos, y obligarlas a recorrer el
  -- edificio entero daría un programa que nadie reconoce.
  "unitGroups"  TEXT[],

  -- Cubicación por unidad, para medir rendimiento en la Fase 4 (avance ÷
  -- jornadas). Opcional: hay actividades que se miden por depto terminado.
  unit              TEXT,
  "quantityPerUnit" NUMERIC(18,4),

  status        TEXT NOT NULL DEFAULT 'activa'
                CHECK (status IN ('activa', 'anulada')),

  notes         TEXT,
  "createdBy"   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS train_activities_tenant_idx
  ON public."trainActivities" ("tenantId");
CREATE INDEX IF NOT EXISTS train_activities_project_idx
  ON public."trainActivities" ("projectId", "sortOrder");
CREATE INDEX IF NOT EXISTS train_activities_workitem_idx
  ON public."trainActivities" ("workItemId");

-- ============================================================
-- ▶ PARTE 2 de 3 · RLS
--    Mismo criterio que la 037: la programación la lee toda la obra, la
--    escribe quien programa (`planning:manage`, migración 024).
-- ============================================================
ALTER TABLE public."trainActivities" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "train_activities_select" ON public."trainActivities";
CREATE POLICY "train_activities_select" ON public."trainActivities"
  FOR SELECT USING (
    "tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "train_activities_write" ON public."trainActivities";
CREATE POLICY "train_activities_write" ON public."trainActivities"
  FOR ALL
  USING      (("tenantId" = get_my_tenant_id() AND has_permission('planning:manage'))
              OR get_my_role() = 'super-admin')
  WITH CHECK (("tenantId" = get_my_tenant_id() AND has_permission('planning:manage'))
              OR get_my_role() = 'super-admin');

-- ============================================================
-- ▶ PARTE 3 de 3 · REALTIME
-- ============================================================
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public."trainActivities"; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
