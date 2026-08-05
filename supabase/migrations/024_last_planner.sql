-- ============================================================
-- 024 · Oficina Técnica — Programación (Last Planner)
-- Ejecutar en Supabase (Dashboard > SQL Editor). Idempotente.
--
-- EL PROBLEMA QUE RESUELVE
--   La carta Gantt dice lo que DEBERÍA pasar. No dice por qué no pasó. Una obra
--   se atrasa por cosas concretas y repetidas —no llegó el material, no estaba
--   el plano, la cuadrilla se fue a otro frente, no había cancha— y si eso no
--   se registra, cada semana se vuelve a tropezar con lo mismo.
--
--   El sistema Last Planner ataca eso con tres piezas:
--     1. LOOKAHEAD: mirar 3 a 6 semanas hacia adelante y sacarle las
--        RESTRICCIONES a cada tarea antes de que llegue su semana.
--     2. PROGRAMA SEMANAL: comprometer solo lo que está liberado.
--     3. PPC + CAUSAS: medir qué porcentaje de lo comprometido se cumplió y
--        por qué falló el resto.
--
-- UNA SOLA TABLA DE TAREAS, NO DOS
--   Lo natural sería una tabla de lookahead y otra de programa semanal, y un
--   paso que copie de una a otra. Se descartó: copiar duplica la tarea y la
--   primera vez que alguien edite un lado, los dos dejan de coincidir. Acá la
--   tarea es UNA y lo que cambia es la semana a la que está asignada
--   (`weekStart`) y su estado. Moverla de semana es cambiarle una fecha.
--
-- POR QUÉ `weekStart` ES EL LUNES
--   Todas las agrupaciones (PPC semanal, tendencia) necesitan una clave estable
--   de semana. Guardar "semana 32 de 2026" obliga a decidir reglas de calendario
--   raras a fin de año; guardar el lunes es una fecha común y corriente que se
--   ordena y se compara sola.
-- ============================================================

-- ============================================================
-- 1. TAREAS DE PROGRAMACIÓN
-- ============================================================
CREATE TABLE IF NOT EXISTS public."lookaheadTasks" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    TEXT NOT NULL,
  "projectId"   UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  -- Partida de la EDT que avanza con esta tarea. Opcional: hay tareas de obra
  -- que no son partida (instalar la grúa, recibir un ensayo).
  "workItemId"  UUID REFERENCES public."workItems"(id) ON DELETE SET NULL,

  name          TEXT NOT NULL,
  -- Quién se compromete. Puede ser alguien sin cuenta (un subcontratista), por
  -- eso hay texto libre además de la referencia al usuario.
  "responsibleId"   TEXT,
  "responsibleName" TEXT,

  -- Lunes de la semana a la que está asignada.
  "weekStart"   DATE NOT NULL,

  unit          TEXT,
  "quantityPlanned" NUMERIC(18,4) NOT NULL DEFAULT 0,
  "quantityDone"    NUMERIC(18,4) NOT NULL DEFAULT 0,

  --  planificada  → está en el lookahead, todavía no se compromete
  --  comprometida → entra al programa semanal: alguien dijo "esta semana la hago"
  --  cumplida     → se hizo completa
  --  no_cumplida  → no se hizo, o se hizo a medias (ver nota del PPC)
  --  anulada      → se descartó; no entra en el PPC
  status        TEXT NOT NULL DEFAULT 'planificada'
                CHECK (status IN ('planificada', 'comprometida', 'cumplida',
                                  'no_cumplida', 'anulada')),

  -- Causa de No Cumplimiento. Solo tiene sentido en 'no_cumplida'; es lo que
  -- después se ordena en un Pareto para atacar lo que más repite.
  "causeCode"   TEXT
                CHECK ("causeCode" IS NULL OR "causeCode" IN
                  ('materiales', 'mano_obra', 'equipos', 'informacion',
                   'cancha', 'subcontrato', 'clima', 'cambio_mandante',
                   'mala_programacion', 'otra')),
  "causeNote"   TEXT,

  notes         TEXT,
  "createdBy"   TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lookahead_tasks_tenant_idx  ON public."lookaheadTasks" ("tenantId");
CREATE INDEX IF NOT EXISTS lookahead_tasks_project_idx ON public."lookaheadTasks" ("projectId");
CREATE INDEX IF NOT EXISTS lookahead_tasks_week_idx    ON public."lookaheadTasks" ("weekStart");

-- ============================================================
-- 2. RESTRICCIONES
--    Lo que impide que una tarea se pueda ejecutar. Cada una con responsable y
--    fecha: una restricción sin dueño no se levanta nunca.
--
--    `rdiId` conecta con la Fase 5: la restricción más común de todas es "falta
--    información", y esa información se pide con una RDI.
-- ============================================================
CREATE TABLE IF NOT EXISTS public."taskConstraints" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    TEXT NOT NULL,
  "taskId"      UUID NOT NULL REFERENCES public."lookaheadTasks"(id) ON DELETE CASCADE,
  "rdiId"       UUID REFERENCES public.rdis(id) ON DELETE SET NULL,

  type          TEXT NOT NULL DEFAULT 'otra'
                CHECK (type IN ('materiales', 'mano_obra', 'equipos',
                                'informacion', 'cancha', 'permisos',
                                'subcontrato', 'seguridad', 'otra')),
  description   TEXT NOT NULL,
  "responsibleName" TEXT,
  "dueDate"     DATE,

  -- "Vencida" no se guarda: se deriva de dueDate, igual que en garantías y RDI.
  status        TEXT NOT NULL DEFAULT 'pendiente'
                CHECK (status IN ('pendiente', 'liberada', 'anulada')),
  "releasedAt"  TIMESTAMPTZ,
  notes         TEXT,
  "createdBy"   TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS task_constraints_tenant_idx ON public."taskConstraints" ("tenantId");
CREATE INDEX IF NOT EXISTS task_constraints_task_idx   ON public."taskConstraints" ("taskId");

-- La fecha de liberación acompaña al estado: una restricción "liberada" sin
-- fecha no permite medir cuánto tardó en levantarse.
CREATE OR REPLACE FUNCTION public.constraint_stamp_release()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'liberada' AND NEW."releasedAt" IS NULL THEN
    NEW."releasedAt" := NOW();
  END IF;
  IF NEW.status <> 'liberada' THEN
    NEW."releasedAt" := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS task_constraints_release ON public."taskConstraints";
CREATE TRIGGER task_constraints_release
  BEFORE INSERT OR UPDATE ON public."taskConstraints"
  FOR EACH ROW EXECUTE FUNCTION public.constraint_stamp_release();

-- NOTA SOBRE UNA REGLA QUE **NO** SE PUSO ACÁ
--   El corazón del Last Planner es "solo se compromete lo que está liberado".
--   Sería tentador bloquearlo con un trigger. No se hizo a propósito: en obra
--   se compromete a veces sabiendo que la restricción se levanta mañana, y una
--   base que lo prohíbe termina con la gente inventando tareas falsas para
--   saltarse el sistema. La app lo MUESTRA y lo CUENTA (tareas comprometidas
--   con restricción pendiente), que es lo que sirve para corregir la conducta.

-- ============================================================
-- 3. RLS
--    La programación la lee toda la obra: el jefe de terreno, los supervisores
--    y los subcontratistas trabajan contra ella. Escribir exige permiso.
-- ============================================================
ALTER TABLE public."lookaheadTasks"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."taskConstraints" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lookahead_tasks_select" ON public."lookaheadTasks";
CREATE POLICY "lookahead_tasks_select" ON public."lookaheadTasks"
  FOR SELECT USING (
    "tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "lookahead_tasks_write" ON public."lookaheadTasks";
CREATE POLICY "lookahead_tasks_write" ON public."lookaheadTasks"
  FOR ALL
  USING      ("tenantId" = get_my_tenant_id() AND has_permission('planning:manage'))
  WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('planning:manage'));

DROP POLICY IF EXISTS "task_constraints_select" ON public."taskConstraints";
CREATE POLICY "task_constraints_select" ON public."taskConstraints"
  FOR SELECT USING (
    "tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "task_constraints_write" ON public."taskConstraints";
CREATE POLICY "task_constraints_write" ON public."taskConstraints"
  FOR ALL
  USING      ("tenantId" = get_my_tenant_id() AND has_permission('planning:manage'))
  WITH CHECK ("tenantId" = get_my_tenant_id() AND has_permission('planning:manage'));

-- ============================================================
-- 4. PERMISOS
--    El "último planificador" es el jefe de terreno: es quien se compromete y
--    quien sabe por qué no se cumplió. Sin `planning:manage` la base rechaza
--    todo aunque la UI muestre los botones.
-- ============================================================
UPDATE public.roles
SET permissions = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(permissions || ARRAY['planning:view', 'planning:manage'])
  )
)
WHERE id IN ('jefe-oficina-tecnica', 'jefe-terreno') AND "tenantId" = '__default__';

-- El supervisor ve la programación de la semana, pero no la edita.
UPDATE public.roles
SET permissions = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(permissions || ARRAY['planning:view'])
  )
)
WHERE id = 'supervisor' AND "tenantId" = '__default__';
