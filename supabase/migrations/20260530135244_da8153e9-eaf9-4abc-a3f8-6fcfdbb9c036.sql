ALTER TABLE public.technician_overlaps
  ADD COLUMN IF NOT EXISTS amendments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS suspensions jsonb NOT NULL DEFAULT '[]'::jsonb;