-- Add phase and activity columns to materialRequests
ALTER TABLE public."materialRequests"
  ADD COLUMN IF NOT EXISTS phase    TEXT,
  ADD COLUMN IF NOT EXISTS activity TEXT;
