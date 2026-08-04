-- ============================================================
-- 021 · Oficina Técnica — Control de costos
-- Ejecutar en Supabase (Dashboard > SQL Editor). Idempotente.
--
-- EL PROBLEMA QUE RESUELVE
--   Hasta ahora una orden de compra o una factura se imputaba a LA OBRA, no a
--   LA PARTIDA. Sin eso no existe costo real por partida, y sin costo real por
--   partida no hay control de costos ni resultado proyectado — que es la mitad
--   del trabajo de una oficina técnica.
--
-- CÓMO SE IMPUTA
--   El gasto se cuelga de CUALQUIER nodo de la EDT, no solo de las hojas. Es
--   como se hace en obra: una factura de cemento no es de una partida, es de
--   "Obra Gruesa". El control de costos suma hacia arriba, así que imputar a la
--   fase o a la partida final da totales correctos en ambos casos.
--
-- LAS TRES PLATAS, QUE NO SON LA MISMA
--   · Comprometido → orden de compra emitida y aún no facturada.
--   · Real         → factura recibida (costo devengado).
--   · Pagado       → factura pagada (caja).
--   El control de costos usa el REAL; el comprometido avisa de lo que viene.
--
-- PRESUPUESTO META
--   `targetUnitCost` es el costo interno que la empresa se propone por unidad,
--   distinto del precio de venta (`unitPrice`). Si queda NULL, la app cae al
--   costo que arroja el APU de la partida — así una obra con APU cargado tiene
--   presupuesto meta sin escribir nada dos veces.
-- ============================================================

-- ============================================================
-- 1. IMPUTACIÓN A PARTIDA
-- ============================================================
ALTER TABLE public."supplierPayments"
  ADD COLUMN IF NOT EXISTS "workItemId" UUID REFERENCES public."workItems"(id) ON DELETE SET NULL;

ALTER TABLE public."purchaseOrders"
  ADD COLUMN IF NOT EXISTS "workItemId" UUID REFERENCES public."workItems"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS supplier_payments_work_item_idx
  ON public."supplierPayments" ("workItemId");
CREATE INDEX IF NOT EXISTS purchase_orders_work_item_idx
  ON public."purchaseOrders" ("workItemId");

-- Las facturas y OC que ya existen quedan SIN imputar a propósito: adivinar la
-- partida a partir de un texto libre produciría un control de costos que se ve
-- completo y está mal. La pantalla las muestra en "Sin imputar" para que alguien
-- las asigne a mano.

-- ============================================================
-- 2. PRESUPUESTO META POR PARTIDA
-- ============================================================
ALTER TABLE public."workItems"
  ADD COLUMN IF NOT EXISTS "targetUnitCost" NUMERIC(18,4);

COMMENT ON COLUMN public."workItems"."targetUnitCost" IS
  'Costo interno objetivo por unidad. NULL = usar el costo que arroje el APU.';

-- ============================================================
-- 3. PERMISO
--    El control de costos expone el MARGEN. No va en los roles de terreno: el
--    jefe de obra no tiene por qué ver cuánto gana la empresa en cada partida.
-- ============================================================
UPDATE public.roles
SET permissions = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(permissions || ARRAY['cost_control:view'])
  )
)
WHERE id = 'jefe-oficina-tecnica' AND "tenantId" = '__default__';
