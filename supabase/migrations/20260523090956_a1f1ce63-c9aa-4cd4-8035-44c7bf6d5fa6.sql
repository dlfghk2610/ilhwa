
ALTER TABLE public.technician_overlaps
  ADD COLUMN IF NOT EXISTS client text,
  ADD COLUMN IF NOT EXISTS contract_amount numeric,
  ADD COLUMN IF NOT EXISTS suspension_date date,
  ADD COLUMN IF NOT EXISTS agreement_date date,
  ADD COLUMN IF NOT EXISTS participants jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.technician_overlaps ALTER COLUMN technician_name DROP NOT NULL;
ALTER TABLE public.technician_overlaps ALTER COLUMN start_date DROP NOT NULL;
ALTER TABLE public.technician_overlaps ALTER COLUMN end_date DROP NOT NULL;
