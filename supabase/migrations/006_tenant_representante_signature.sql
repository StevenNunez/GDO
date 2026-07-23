-- ============================================================
-- Agrega firma digital del representante legal a la tabla tenants
-- Run in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS "representanteSignature" TEXT;
