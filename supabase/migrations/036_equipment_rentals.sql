-- ============================================================
-- 036 · Bloque C — Equipos y Maquinaria en arriendo
-- Ejecutar en Supabase (Dashboard > SQL Editor). Idempotente.
--
-- QUÉ RESUELVE
--   La grúa que quedó en obra tres semanas después de que se terminó el
--   montaje, y que nadie devolvió porque nadie tenía la fecha a la vista. El
--   arriendo es de los pocos costos que crecen SOLOS: todos los días, sin que
--   nadie apruebe nada. Un moldaje olvidado no aparece en ninguna orden de
--   compra hasta que llega la factura del mes.
--
-- POR QUÉ NO SE LLAMA «RECURSOS»
--   Ese nombre ya está tomado: `resources` es el catálogo de materiales, mano
--   de obra y equipos que alimenta los APU (`/oficina-tecnica/recursos`). Y
--   «Herramientas» es Bodega, y «Personal» es Asistencia. Meter todo bajo un
--   nombre nuevo obligaría a duplicar tres módulos que ya funcionan. Lo que sí
--   se toma de esa idea es el fondo: todo lo que cuesta plata tiene que
--   imputarse a partida y llegar al control de costos — por eso `workItemId`.
--
-- POR QUÉ EL COSTO ACUMULADO NO SE GUARDA
--   Cambia todos los días por el solo paso del tiempo. Una columna
--   `costoAcumulado` estaría desactualizada apenas se escribe, y obligaría a un
--   proceso que la refresque de noche. Se calcula: tarifa × períodos
--   transcurridos (`src/lib/equipment.ts`). Lo que sí se guarda es lo que
--   alguien decidió: la tarifa, las fechas y cuándo se devolvió de verdad.
-- ============================================================

CREATE TABLE IF NOT EXISTS public."equipmentRentals" (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"     TEXT NOT NULL,
  "projectId"    UUID REFERENCES public.projects(id) ON DELETE CASCADE,

  -- El arrendador suele estar cargado como proveedor; se permite texto libre
  -- para no obligar a crear la ficha antes de registrar el arriendo.
  "supplierId"   UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  "supplierName" TEXT,

  name           TEXT NOT NULL,
  -- Patente, número de serie o interno con que se identifica en terreno.
  code           TEXT,
  category       TEXT NOT NULL DEFAULT 'otro'
                 CHECK (category IN (
                   'grua', 'andamio', 'moldaje', 'maquinaria', 'vehiculo',
                   'generador', 'contenedor', 'herramienta_mayor', 'otro'
                 )),

  -- Cómo se cobra. La unidad importa: una grúa por hora y un andamio por mes
  -- no se pueden sumar sin normalizar.
  "rateMode"     TEXT NOT NULL DEFAULT 'dia'
                 CHECK ("rateMode" IN ('hora', 'dia', 'semana', 'mes')),
  rate           NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (rate >= 0),
  currency       TEXT NOT NULL DEFAULT 'CLP' CHECK (currency IN ('CLP', 'UF')),
  -- Horas por día cuando se cobra por hora: sin esto no se puede proyectar el
  -- costo de un arriendo que se paga por hora pero se controla por días.
  "hoursPerDay"  NUMERIC(6,2),
  -- Mínimo facturable pactado (muchos arriendos cobran una semana aunque se
  -- use un día).
  "minimumUnits" NUMERIC(10,2),

  "startDate"    DATE NOT NULL,
  -- Término PROGRAMADO. Es la fecha contra la que se avisa.
  "endDate"      DATE,
  -- Devolución REAL. Mientras sea NULL, el equipo sigue costando.
  "returnedAt"   DATE,

  -- La imputación a partida: es lo que hace que el arriendo llegue al control
  -- de costos en vez de quedar como un gasto suelto de la obra.
  "workItemId"   UUID REFERENCES public."workItems"(id) ON DELETE SET NULL,

  status         TEXT NOT NULL DEFAULT 'activo'
                 CHECK (status IN ('activo', 'devuelto', 'cancelado')),
  notes          TEXT,
  "createdBy"    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT equipment_rental_dates
    CHECK ("endDate" IS NULL OR "endDate" >= "startDate"),
  CONSTRAINT equipment_rental_return_after_start
    CHECK ("returnedAt" IS NULL OR "returnedAt" >= "startDate")
);

CREATE INDEX IF NOT EXISTS equipment_rentals_tenant_idx
  ON public."equipmentRentals" ("tenantId");
CREATE INDEX IF NOT EXISTS equipment_rentals_project_idx
  ON public."equipmentRentals" ("projectId");
CREATE INDEX IF NOT EXISTS equipment_rentals_workitem_idx
  ON public."equipmentRentals" ("workItemId");
-- Los activos son los que cuestan plata hoy: se consultan siempre.
CREATE INDEX IF NOT EXISTS equipment_rentals_activos_idx
  ON public."equipmentRentals" ("tenantId", "endDate") WHERE status = 'activo';

-- ============================================================
-- DEVOLVER CIERRA EL ARRIENDO, Y AL REVÉS
--   Dos formas de decir lo mismo (la fecha de devolución y el estado) siempre
--   terminan discrepando. Acá se sincronizan solas: poner fecha de devolución
--   marca «devuelto», y marcar «devuelto» sin fecha la pone en hoy.
-- ============================================================
CREATE OR REPLACE FUNCTION public.equipment_rental_sync_return()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW."returnedAt" IS NOT NULL AND NEW.status = 'activo' THEN
    NEW.status := 'devuelto';
  END IF;

  IF NEW.status = 'devuelto' AND NEW."returnedAt" IS NULL THEN
    NEW."returnedAt" := CURRENT_DATE;
  END IF;

  -- Reabrir un arriendo (volvió a obra) limpia la devolución: si no, quedaría
  -- «activo» con fecha de devuelto y el costo dejaría de correr.
  IF NEW.status = 'activo' AND OLD."returnedAt" IS NOT NULL THEN
    NEW."returnedAt" := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_equipment_rental_sync ON public."equipmentRentals";
CREATE TRIGGER trg_equipment_rental_sync
  BEFORE INSERT OR UPDATE ON public."equipmentRentals"
  FOR EACH ROW EXECUTE FUNCTION public.equipment_rental_sync_return();

-- ============================================================
-- RLS
--   Se apoya en los permisos de compras/finanzas: quien decide un arriendo es
--   quien decide una compra. No se inventa un permiso nuevo para no llenar la
--   pantalla de permisos con uno por módulo.
-- ============================================================
ALTER TABLE public."equipmentRentals" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipment_rentals_select" ON public."equipmentRentals";
CREATE POLICY "equipment_rentals_select" ON public."equipmentRentals"
  FOR SELECT USING (
    "tenantId" = get_my_tenant_id() OR get_my_role() = 'super-admin'
  );

DROP POLICY IF EXISTS "equipment_rentals_write" ON public."equipmentRentals";
CREATE POLICY "equipment_rentals_write" ON public."equipmentRentals"
  FOR ALL USING (
    ("tenantId" = get_my_tenant_id() AND has_permission('equipment:manage'))
    OR get_my_role() = 'super-admin'
  ) WITH CHECK (
    ("tenantId" = get_my_tenant_id() AND has_permission('equipment:manage'))
    OR get_my_role() = 'super-admin'
  );

-- ============================================================
-- REALTIME
-- ============================================================
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public."equipmentRentals"; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
