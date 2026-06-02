
CREATE TABLE public.pq_forms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_name TEXT NOT NULL,
  client TEXT NOT NULL,
  notice_date DATE NOT NULL,
  evaluation_type TEXT NOT NULL,
  project_type TEXT NOT NULL,
  year TEXT NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 0,
  cover_thumb TEXT,
  pdf_path TEXT,
  hwp_path TEXT,
  hwp_file_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pq_forms TO authenticated;
GRANT ALL ON public.pq_forms TO service_role;

ALTER TABLE public.pq_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own select" ON public.pq_forms FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own insert" ON public.pq_forms FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own update" ON public.pq_forms FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own delete" ON public.pq_forms FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX pq_forms_user_created_idx ON public.pq_forms (user_id, created_at DESC);

INSERT INTO storage.buckets (id, name, public) VALUES ('pq-files', 'pq-files', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "pq own read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'pq-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "pq own insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'pq-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "pq own update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'pq-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "pq own delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'pq-files' AND auth.uid()::text = (storage.foldername(name))[1]);
