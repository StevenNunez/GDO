-- Add createdAt to tools so we can track when each tool was registered
ALTER TABLE public.tools
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
