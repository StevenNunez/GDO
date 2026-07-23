-- ============================================================
-- Perfil de empresa por tenant: logo y datos que aparecen en los PDF.
--
-- Antes de esto, TODOS los generadores de PDF usaban un logo fijo
-- (/logopdf.jpg) y una razón social escrita a mano, así que cualquier
-- empresa que contratara el servicio emitía documentos con la marca de
-- otra. Estas columnas permiten que cada tenant tenga la suya.
--
-- El logo se guarda como data URL (base64) igual que
-- "representanteSignature": no requiere configurar Storage y la fila de
-- tenants se lee una sola vez por sesión. La UI achica la imagen antes
-- de guardarla para que no crezca sin control.
--
-- Run in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS "logo"      TEXT,
  ADD COLUMN IF NOT EXISTS "rut"       TEXT,
  ADD COLUMN IF NOT EXISTS "giro"      TEXT,
  ADD COLUMN IF NOT EXISTS "direccion" TEXT,
  ADD COLUMN IF NOT EXISTS "comuna"    TEXT,
  ADD COLUMN IF NOT EXISTS "telefono"  TEXT,
  ADD COLUMN IF NOT EXISTS "email"     TEXT,
  ADD COLUMN IF NOT EXISTS "sitioWeb"  TEXT;

-- El RUT venía guardado dentro de "name" con el formato «Razón Social · RUT»
-- (la UI lo partía por el separador). Se migra a su propia columna y se
-- limpia el nombre. Idempotente: solo toca las filas que aún tienen el
-- separador y no tienen rut.
UPDATE public.tenants
SET
  "rut"  = TRIM(SPLIT_PART("name", ' · ', 2)),
  "name" = TRIM(SPLIT_PART("name", ' · ', 1))
WHERE "name" LIKE '% · %'
  AND ("rut" IS NULL OR "rut" = '');
