ALTER TABLE public.similar_services
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS evaluation_type text,
  ADD COLUMN IF NOT EXISTS service_overview text,
  ADD COLUMN IF NOT EXISTS participation_rate numeric,
  ADD COLUMN IF NOT EXISTS company_share_rate numeric,
  ADD COLUMN IF NOT EXISTS share_amount numeric,
  ADD COLUMN IF NOT EXISTS is_dual_participation boolean NOT NULL DEFAULT false;