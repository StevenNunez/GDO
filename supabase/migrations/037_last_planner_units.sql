-- ============================================================
-- 037 · Módulo Last Planner (Fase 1) — Unidades de obra y calendario laboral
-- Ejecutar en Supabase (Dashboard > SQL Editor). Idempotente.
--
-- QUÉ RESUELVE
--   El programa de terminaciones de una obra real no es una lista de tareas:
--   es una MATRIZ. Las filas son actividades (pulido, yeso, cerámica, pintura)
--   y las columnas son las unidades donde esas actividades se repiten una y
--   otra vez: depto 112, 113, 114, piso por piso. Un edificio de 16 pisos con
--   15 deptos son 240 columnas y 60 filas: 14.400 celdas que hoy se llevan en
--   un Excel que una sola persona sabe mantener.
--
--   La migración 024 dejó el Last Planner "de escritorio" (lookahead, semana,
--   PPC). Le falta la unidad. Sin unidad no hay tren de actividades, no hay
--   avance por depto y no hay parte diario: el supervisor no reporta "avancé
--   la cerámica", reporta "terminé la cerámica del 312".
--
-- POR QUÉ NO SE LLAMA `units`
--   Ese nombre ya está tomado desde la migración 001: `units` son las unidades
--   de MEDIDA (m2, kg, saco) que usan materiales y partidas. Son otra cosa por
--   completo y mezclarlas obligaría a desambiguar en cada consulta. Acá son
--   unidades FÍSICAS de la obra, de ahí `workUnits`.
--
-- POR QUÉ EL PISO ES UN TEXTO Y NO UNA TABLA
--   Tentaba hacer `floors` → `workUnits` para tener el piso como entidad. Se
--   descartó: la agrupación cambia de obra en obra —pisos en un edificio,
--   torres en un condominio, tramos en un camino, frentes en un movimiento de
--   tierra— y una tabla de pisos obliga a inventar un nombre para todos esos
--   casos. `groupName` es texto libre y agrupa igual, sin una tabla que
--   mantener ni un join más en la matriz.
--
-- SI LA CONEXIÓN SE CORTA A MEDIO CAMINO
--   Todo el archivo es idempotente: se puede volver a correr entero sin
--   romper nada ni duplicar filas. Si igual se corta, está partido en cuatro
--   PARTES marcadas más abajo; se pueden correr de a una, en orden.
--
--   `lock_timeout` hace que, si otra sesión tiene tomada la tabla `projects`,
--   la migración falle en 10 segundos con un mensaje claro en vez de quedarse
--   esperando hasta que se caiga la conexión.
-- ============================================================

SET lock_timeout = '10s';
SET statement_timeout = '120s';

-- ============================================================
-- ▶ PARTE 1 de 4 · UNIDADES DE OBRA
--    Cada columna de la matriz. Se crean de a cientos con el generador de la
--    app ("16 pisos × 15 deptos"), por eso `sortOrder` es explícito: el orden
--    en pantalla es el orden en que avanza el tren, y no coincide con el orden
--    alfabético ni numérico (en Los Fundadores el piso 1 va 112, 113, 114,
--    111, 110, 115, 108, 101… porque ese es el recorrido de la cuadrilla).
-- ============================================================
CREATE TABLE IF NOT EXISTS public."workUnits" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"   TEXT NOT NULL,
  "projectId"  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  -- Lo que dice el plano: "112", "PASILLO", "Torre B - 305".
  name         TEXT NOT NULL,
  -- Cómo se agrupan en pantalla: "PISO 1", "TORRE A", "FRENTE NORTE".
  "groupName"  TEXT,
  -- Tipología del depto (SM3b, FV, SM2). Dos unidades de la misma tipología
  -- tienen la misma cubicación, así que el rendimiento se compara entre ellas.
  typology     TEXT,

  -- Orden del recorrido. Lo fija el generador y se puede reordenar a mano.
  "sortOrder"  INTEGER NOT NULL DEFAULT 0,

  -- Superficie de la unidad. Opcional: sirve para prorratear avance y para
  -- comparar rendimientos entre unidades de distinto tamaño.
  area         NUMERIC(12,2),

  --  activa   → entra en el tren y en el parte diario
  --  excluida → existe, pero no se programa (entregada, fuera de contrato)
  status       TEXT NOT NULL DEFAULT 'activa'
               CHECK (status IN ('activa', 'excluida')),

  notes        TEXT,
  "createdBy"  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS work_units_tenant_idx  ON public."workUnits" ("tenantId");
CREATE INDEX IF NOT EXISTS work_units_project_idx ON public."workUnits" ("projectId", "sortOrder");

-- No puede haber dos "312" en el mismo piso de la misma obra: el parte diario
-- quedaría ambiguo. Se compara sin distinguir mayúsculas y con el grupo vacío
-- normalizado, porque NULL no choca contra NULL en un índice único común.
CREATE UNIQUE INDEX IF NOT EXISTS work_units_unicidad_idx
  ON public."workUnits" ("projectId", lower(COALESCE("groupName", '')), lower(name));

-- ============================================================
-- ▶ PARTE 2 de 4 · CALENDARIO LABORAL
--
-- 2.1 DÍAS DE LA SEMANA QUE SE TRABAJA — columna en `projects`
--     Es un dato por obra, uno solo, que no crece nunca: una tabla aparte con
--     una fila por obra sería un join permanente para leer cinco números. Va
--     como columna. ISO: 1 = lunes … 7 = domingo. Por defecto lunes a viernes.
-- ============================================================
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS "workDays" SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5}';

COMMENT ON COLUMN public.projects."workDays" IS
  'Días de la semana que se trabaja en la obra. ISO: 1=lunes … 7=domingo.';

-- ============================================================
-- 2.2 EXCEPCIONES DEL CALENDARIO — los feriados, y los días que sí se trabajó
--
--     Una sola tabla para las dos cosas, distinguidas por `type`. Separarlas
--     en "feriados" y "días extra" duplicaría índices y consultas para lo
--     mismo: una fecha que no sigue la regla general.
--
--     `projectId` NULL = vale para toda la empresa. Así los feriados legales
--     de Chile se cargan UNA vez por empresa y valen para todas sus obras; una
--     obra que trabaja un 18 de septiembre lo anota como excepción propia.
-- ============================================================
CREATE TABLE IF NOT EXISTS public."workCalendarExceptions" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"   TEXT NOT NULL,
  -- NULL = aplica a todas las obras de la empresa.
  "projectId"  UUID REFERENCES public.projects(id) ON DELETE CASCADE,

  date         DATE NOT NULL,
  name         TEXT NOT NULL,

  --  feriado   → ese día NO se trabaja aunque sea día hábil
  --  trabajado → ese día SÍ se trabaja aunque sea feriado o fin de semana
  type         TEXT NOT NULL DEFAULT 'feriado'
               CHECK (type IN ('feriado', 'trabajado')),

  "createdBy"  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS work_calendar_tenant_idx
  ON public."workCalendarExceptions" ("tenantId", date);

-- Una fecha, una sola regla por ámbito. Sin esto, cargar dos veces los
-- feriados del año deja el calendario duplicado y el conteo de días hábiles
-- deja de cuadrar.
CREATE UNIQUE INDEX IF NOT EXISTS work_calendar_unicidad_idx
  ON public."workCalendarExceptions"
     ("tenantId", COALESCE("projectId", '00000000-0000-0000-0000-000000000000'::uuid), date);

-- ============================================================
-- ▶ PARTE 3 de 4 · RLS
--    Las unidades y el calendario los lee toda la obra: el supervisor necesita
--    la lista de deptos para reportar, y el subcontratista para ver lo suyo.
--    Escribir es del que programa (`planning:manage`, migración 024) — no se
--    inventa un permiso nuevo para no llenar la pantalla de permisos con uno
--    por tabla.
-- ============================================================
ALTER TABLE public."workUnits"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."workCalendarExceptions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "work_units_select" ON public."workUnits";
CREATE POLICY "work_units_select" ON public."workUnits"
  FOR SELECT USING (
    "tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "work_units_write" ON public."workUnits";
CREATE POLICY "work_units_write" ON public."workUnits"
  FOR ALL
  USING      (("tenantId" = get_my_tenant_id() AND has_permission('planning:manage'))
              OR get_my_role() = 'super-admin')
  WITH CHECK (("tenantId" = get_my_tenant_id() AND has_permission('planning:manage'))
              OR get_my_role() = 'super-admin');

DROP POLICY IF EXISTS "work_calendar_select" ON public."workCalendarExceptions";
CREATE POLICY "work_calendar_select" ON public."workCalendarExceptions"
  FOR SELECT USING (
    "tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "work_calendar_write" ON public."workCalendarExceptions";
CREATE POLICY "work_calendar_write" ON public."workCalendarExceptions"
  FOR ALL
  USING      (("tenantId" = get_my_tenant_id() AND has_permission('planning:manage'))
              OR get_my_role() = 'super-admin')
  WITH CHECK (("tenantId" = get_my_tenant_id() AND has_permission('planning:manage'))
              OR get_my_role() = 'super-admin');

-- ============================================================
-- ▶ PARTE 4 de 4 · REALTIME
-- ============================================================
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public."workUnits"; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public."workCalendarExceptions"; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
