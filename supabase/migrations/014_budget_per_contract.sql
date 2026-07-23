-- ============================================================
-- 014 — Cada "Contrato" raíz de la EDT = un Presupuesto
-- Ejecutar en Supabase (Dashboard > SQL Editor). Idempotente.
--
-- CONTEXTO
--   En el módulo Control de Obra, las partidas cuelgan de un nodo raíz
--   `type='project'` ("📁 Contrato / Obra"). Ese Contrato NO estaba conectado
--   con la tabla de obras (`projects`) ni con los clientes, así que el control
--   de gastos por cliente no encontraba con qué llenar el presupuesto.
--
--   Decisión del usuario (2026-07-21): cada Contrato raíz se convierte en un
--   `budget` (presupuesto). El usuario luego le asigna la obra desde la app.
--
-- QUÉ HACE
--   Por cada raíz de la EDT que aún no tenga presupuesto, crea uno y le cuelga
--   todo su subárbol (raíz + descendientes) vía `budgetId`. La obra queda como
--   la que ya tuviera la raíz (si apuntaba a una real) o NULL = "sin asignar".
--
--   Complementa a 013 (que solo alcanzó a las partidas cuyo projectId ya era una
--   obra real). Re-ejecutable: solo toca raíces con budgetId NULL.
-- ============================================================

DO $$
DECLARE
  r RECORD;
  new_budget_id UUID;
BEGIN
  FOR r IN
    SELECT id, "tenantId", name, "projectId"
    FROM public."workItems"
    WHERE "parentId" IS NULL
      AND "budgetId" IS NULL
  LOOP
    INSERT INTO public.budgets (id, "tenantId", "projectId", name, type, status)
    VALUES (
      gen_random_uuid(),
      r."tenantId",
      -- Solo se conserva la obra si el projectId apunta a una que existe;
      -- si es el tenantId (dato heredado) o algo inválido, queda NULL.
      (SELECT p.id FROM public.projects p WHERE p.id::text = r."projectId"::text),
      COALESCE(NULLIF(r.name, ''), 'Presupuesto'),
      'principal',
      'approved'
    )
    RETURNING id INTO new_budget_id;

    WITH RECURSIVE subtree AS (
      SELECT id FROM public."workItems" WHERE id = r.id
      UNION ALL
      SELECT wi.id
      FROM public."workItems" wi
      JOIN subtree s ON wi."parentId" = s.id
    )
    UPDATE public."workItems" wi
    SET "budgetId" = new_budget_id
    FROM subtree
    WHERE wi.id = subtree.id
      AND wi."budgetId" IS NULL;
  END LOOP;
END $$;
