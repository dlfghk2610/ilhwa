
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme_primary text,
  ADD COLUMN IF NOT EXISTS theme_sidebar text,
  ADD COLUMN IF NOT EXISTS theme_background text;
