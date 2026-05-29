ALTER TABLE public.technician_overlaps
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
  ADD COLUMN IF NOT EXISTS contract_amount_change_date DATE,
  ADD COLUMN IF NOT EXISTS contract_amount_new NUMERIC,
  ADD COLUMN IF NOT EXISTS end_date_change_date DATE,
  ADD COLUMN IF NOT EXISTS end_date_new DATE;