-- ============================================================
-- 041 · Parte diario — arreglo del índice contra el que se hace el upsert
-- Ejecutar en Supabase (Dashboard > SQL Editor). Idempotente.
--
-- QUÉ RESUELVE
--   Guardar un parte diario fallaba SIEMPRE contra la base real, con el error
--   de Postgres 42P10: «there is no unique or exclusion constraint matching
--   the ON CONFLICT specification».
--
-- POR QUÉ
--   La app escribe el parte con `upsert(..., { onConflict:
--   'activityId,unitId,date' })`, que PostgREST traduce a
--   `ON CONFLICT ("activityId","unitId",date)`. Para resolver eso, Postgres
--   busca un índice único formado EXACTAMENTE por esas tres columnas.
--
--   El único índice único que dejó la migración 039 estaba armado sobre una
--   expresión —`COALESCE("unitId", …)`, para que dos filas sin unidad física
--   chocaran igual— y una expresión no empata con el nombre de la columna. El
--   índice protegía bien la tabla, pero el upsert no lo encontraba, así que
--   toda escritura del parte diario se caía antes de llegar a la fila.
--
--   No se notó antes porque el modo demo no pasa por Postgres: su cliente
--   falso ignoraba el `onConflict`. Ahí el parte «se guardaba» (duplicando).
--
-- LA SOLUCIÓN
--   `NULLS NOT DISTINCT` (Postgres 15+) da las dos cosas a la vez: un índice
--   único sobre las tres columnas tal cual —así el upsert lo infiere— y la
--   regla de que dos NULL sí chocan entre sí, que es justo lo que el COALESCE
--   estaba emulando a mano.
--
-- QUÉ NO CAMBIA
--   La garantía de negocio es la misma de la 039: UN parte por unidad por día,
--   reportar dos veces corrige en vez de duplicar. Solo cambia la forma del
--   índice para que el upsert pueda apuntarle.
-- ============================================================

SET lock_timeout = '10s';

-- Postgres 15 es el piso de todo proyecto Supabase creado desde 2023, pero más
-- vale un mensaje claro que un error de sintaxis a mitad del script.
DO $$
BEGIN
  IF current_setting('server_version_num')::int < 150000 THEN
    RAISE EXCEPTION
      'Esta migración necesita PostgreSQL 15 o superior (NULLS NOT DISTINCT). Versión actual: %',
      current_setting('server_version');
  END IF;
END $$;

-- Si quedaron partes duplicados de cuando el demo insertaba en vez de corregir,
-- el índice único no se podría crear. Se deja el más reciente de cada
-- (actividad, unidad, día), que es la última corrección del capataz.
DELETE FROM public."dailyProgress" a
USING public."dailyProgress" b
WHERE a."activityId" = b."activityId"
  AND a.date = b.date
  AND COALESCE(a."unitId", '00000000-0000-0000-0000-000000000000'::uuid)
    = COALESCE(b."unitId", '00000000-0000-0000-0000-000000000000'::uuid)
  AND (a."updatedAt", a.id) < (b."updatedAt", b.id);

DROP INDEX IF EXISTS public.daily_progress_unicidad_idx;

CREATE UNIQUE INDEX IF NOT EXISTS daily_progress_unicidad_idx
  ON public."dailyProgress" ("activityId", "unitId", date)
  NULLS NOT DISTINCT;
