ALTER TABLE public.pq_forms
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS xlsx_path text,
  ADD COLUMN IF NOT EXISTS xlsx_file_name text;

CREATE INDEX IF NOT EXISTS pq_forms_tags_idx ON public.pq_forms USING GIN (tags);