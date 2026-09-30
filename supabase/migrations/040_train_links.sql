-- ============================================================
-- 040 · Módulo Last Planner (Fase 5) — Enganches del tren
-- Ejecutar en Supabase (Dashboard > SQL Editor). Idempotente.
--
-- QUÉ RESUELVE
--   Las fases 1 a 4 dejaron el tren funcionando solo: unidades, actividades,
--   parte diario y números. Pero el tren seguía siendo una isla — el jefe de
--   terreno reportaba el depto 312 en el teléfono y después alguien tenía que
--   volver a escribir lo mismo en el avance de la partida, en la bitácora y en
--   el compromiso de la semana. Cuatro veces el mismo dato, y las cuatro
--   terminan diciendo cosas distintas.
--
--   Esta migración agrega UNA columna: de qué actividad del tren nació un
--   compromiso semanal. Todo el resto del enganche es cálculo (ver
--   `src/lib/train-links.ts`) y no necesita tablas nuevas.
--
-- POR QUÉ HACE FALTA LA COLUMNA
--   Los compromisos de la semana se generan desde el tren: las actividades a
--   las que esa semana les toca alguna unidad. Sin saber de qué actividad vino
--   cada tarea, apretar «traer del tren» dos veces duplica el programa
--   semanal, y cerrar la semana con el parte diario obliga a adivinar qué
--   tarea corresponde a qué actividad comparando nombres escritos a mano.
--
--   Va NULL para las tareas escritas a mano, que siguen siendo la mayoría: hay
--   trabajo de obra que no es tren (instalar la grúa, recibir un ensayo).
--
-- POR QUÉ EL ÍNDICE ES ÚNICO Y PARCIAL
--   Una actividad no puede tener dos compromisos en la misma semana: sería el
--   mismo trabajo contado dos veces en el PPC. El índice lo impide en la base
--   —no solo en la app— y es PARCIAL (`WHERE ... IS NOT NULL`) para que las
--   tareas escritas a mano, que van todas con NULL, no choquen entre ellas.
-- ============================================================

SET lock_timeout = '10s';
SET statement_timeout = '120s';

-- ============================================================
-- ▶ PARTE 1 de 2 · LA COLUMNA
-- ============================================================
ALTER TABLE public."lookaheadTasks"
  ADD COLUMN IF NOT EXISTS "trainActivityId" UUID
    REFERENCES public."trainActivities"(id) ON DELETE SET NULL;

COMMENT ON COLUMN public."lookaheadTasks"."trainActivityId" IS
  'Actividad del tren que generó este compromiso (migración 040). NULL = tarea escrita a mano.';

-- ============================================================
-- ▶ PARTE 2 de 2 · EL ÍNDICE
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS lookahead_tasks_train_week_uidx
  ON public."lookaheadTasks" ("trainActivityId", "weekStart")
  WHERE "trainActivityId" IS NOT NULL;

-- Búsqueda por actividad, para el cierre semanal desde el parte diario.
CREATE INDEX IF NOT EXISTS lookahead_tasks_train_idx
  ON public."lookaheadTasks" ("trainActivityId")
  WHERE "trainActivityId" IS NOT NULL;

-- Las políticas RLS de la migración 024 sobre "lookaheadTasks" siguen valiendo
-- tal cual: una columna nueva no cambia quién ve la fila.
