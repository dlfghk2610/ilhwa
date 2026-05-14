ALTER TABLE public.similar_services 
ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS is_under_90days boolean NOT NULL DEFAULT false;