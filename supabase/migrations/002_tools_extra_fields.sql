-- Add optional detail columns to the tools table
ALTER TABLE public.tools
  ADD COLUMN IF NOT EXISTS brand          TEXT,
  ADD COLUMN IF NOT EXISTS model          TEXT,
  ADD COLUMN IF NOT EXISTS "serialNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "purchaseDate" DATE,
  ADD COLUMN IF NOT EXISTS notes          TEXT;
