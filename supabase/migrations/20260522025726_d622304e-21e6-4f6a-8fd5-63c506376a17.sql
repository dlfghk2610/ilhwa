ALTER TABLE public.technicians 
ADD COLUMN IF NOT EXISTS employment_status text NOT NULL DEFAULT 'active';
-- 'active' = 재직중, 'retired' = 퇴사자