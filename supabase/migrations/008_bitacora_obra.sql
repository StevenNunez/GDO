-- Bitácora de Obra: registro diario de actividades en terreno
CREATE TABLE IF NOT EXISTS public."bitacoraEntries" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    TEXT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  "projectId"   TEXT,
  date          DATE NOT NULL,
  weather       TEXT NOT NULL DEFAULT 'soleado',
  "workerCount" INT NOT NULL DEFAULT 0,
  "workPerformed" TEXT NOT NULL,
  equipment     TEXT,
  incidents     TEXT,
  observations  TEXT,
  "authorId"    TEXT NOT NULL,
  "authorName"  TEXT NOT NULL,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- rejectionReason en workItems
ALTER TABLE public."workItems"
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
