ALTER TABLE public.technicians
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT '재직중',
  ADD COLUMN IF NOT EXISTS selected_association text NOT NULL DEFAULT 'kepa';