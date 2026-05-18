ALTER TABLE public.performance_records 
ADD COLUMN IF NOT EXISTS is_external_company boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS external_company_name text;