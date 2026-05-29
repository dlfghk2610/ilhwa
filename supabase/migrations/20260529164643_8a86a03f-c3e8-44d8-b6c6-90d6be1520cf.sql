ALTER TABLE public.personal_profiles
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS grade_kepa text,
ADD COLUMN IF NOT EXISTS grade_eval text;