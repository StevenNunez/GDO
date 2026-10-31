-- ============================================================
-- 042 · Cupo de correos compartido + índices por empresa/obra
-- Ejecutar en Supabase (Dashboard > SQL Editor). Idempotente.
--
-- 1) mailSendLog: registro de cada correo que sale por /api/documents/send y
--    /api/payment-orders/send. El límite de envíos vivía en memoria del
--    servidor, y en Vercel cada instancia tiene la suya: no frenaba nada. Con
--    la cuota en la base, el tope es el mismo para todas las instancias.
--    Solo la clave de servicio escribe y lee (RLS activa, sin políticas).
--
-- 2) Índices: las tablas del esquema inicial se filtran siempre por
--    "tenantId" (y casi siempre por "projectId") y no tenían índice. Este
--    bloque crea (tenantId) o (tenantId, projectId) en cada tabla que tenga
--    esas columnas y todavía no tenga un índice que empiece por "tenantId".
--    No toca las tablas que ya lo tienen.
-- ============================================================

CREATE TABLE IF NOT EXISTS public."mailSendLog" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"    UUID NOT NULL,
  "tenantId"  TEXT,
  kind        TEXT NOT NULL DEFAULT 'document',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public."mailSendLog" ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_mail_send_log_user   ON public."mailSendLog" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_mail_send_log_tenant ON public."mailSendLog" ("tenantId", "createdAt" DESC);

-- Índices por empresa / obra
DO $$
DECLARE
  t RECORD;
  has_project BOOLEAN;
  already BOOLEAN;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenantId'
      AND tb.table_type = 'BASE TABLE'
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = t.table_name
        AND indexdef ~ '\("tenantId"[,)]'
    ) INTO already;
    CONTINUE WHEN already;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t.table_name AND column_name = 'projectId'
    ) INTO has_project;

    IF has_project THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I ("tenantId", "projectId")',
                     'idx_' || left(t.table_name, 40) || '_tenant_project', t.table_name);
    ELSE
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I ("tenantId")',
                     'idx_' || left(t.table_name, 50) || '_tenant', t.table_name);
    END IF;
  END LOOP;
END $$;
