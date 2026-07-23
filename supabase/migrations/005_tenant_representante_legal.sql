-- ============================================================
-- Agrega datos del representante legal a la tabla tenants
-- Run in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS "representanteLegal"  TEXT,
  ADD COLUMN IF NOT EXISTS "representanteRut"    TEXT,
  ADD COLUMN IF NOT EXISTS "representanteCargo"  TEXT;
