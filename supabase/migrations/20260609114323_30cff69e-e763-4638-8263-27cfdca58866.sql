ALTER TABLE public.technician_overlaps
  ADD COLUMN IF NOT EXISTS is_lh boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lh_main_contract_amount bigint,
  ADD COLUMN IF NOT EXISTS lh_main_end_date date,
  ADD COLUMN IF NOT EXISTS lh_main_end_text text,
  ADD COLUMN IF NOT EXISTS lh_mgmt_contract_amount bigint,
  ADD COLUMN IF NOT EXISTS lh_mgmt_end_date date,
  ADD COLUMN IF NOT EXISTS lh_mgmt_end_text text;