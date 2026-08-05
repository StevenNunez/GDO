-- 028_tenant_module_overrides.sql
--
-- El plan contratado define el ESTÁNDAR de módulos que ve una empresa
-- (src/lib/plan-features.ts). Esta columna guarda las excepciones que el
-- super-admin decide caso a caso desde el módulo de Suscripciones: activarle un
-- módulo a un cliente que no lo tiene en su plan, o quitárselo aunque le toque.
--
-- Formato: { "<feature>": true | false }. Solo se guardan las DIFERENCIAS con el
-- plan; un módulo que no aparece acá sigue el estándar. Así, si mañana cambia
-- qué trae cada plan, los clientes que no fueron tocados a mano lo heredan solo.
--
-- Las claves válidas son las de PLAN_FEATURES: safety, payments, reports,
-- site_book, cost_control, documents, last_planner, subcontracts, receptions,
-- company_links. El frontend ignora cualquier clave que no reconozca.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS "moduleOverrides" JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tenants."moduleOverrides" IS
  'Excepciones al estándar del plan, por módulo. {"cost_control": true} lo activa aunque el plan no lo traiga; false lo quita aunque sí. Lo escribe solo el super-admin (política tenants_all_superadmin).';

-- La escritura ya está cubierta: `tenants_all_superadmin` es la única política
-- de escritura sobre `tenants`, así que nadie más puede tocar esta columna.
-- La lectura también: cada empresa lee su propia fila con `tenants_select`, que
-- es lo que necesita el frontend para saber qué módulos mostrar.
