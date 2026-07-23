-- ============================================================
-- Agrega coordenadas GPS a los registros de asistencia
-- Permite verificar que el guardia estaba en la obra al registrar
-- Run in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

ALTER TABLE public."attendanceLogs"
  ADD COLUMN IF NOT EXISTS "latitude"  NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS "longitude" NUMERIC(10, 7);
