
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.pq_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pq_folders TO authenticated;
GRANT ALL ON public.pq_folders TO service_role;
ALTER TABLE public.pq_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own select folders" ON public.pq_folders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own insert folders" ON public.pq_folders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own update folders" ON public.pq_folders FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own delete folders" ON public.pq_folders FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX pq_folders_user_idx ON public.pq_folders(user_id, created_at DESC);

CREATE TRIGGER update_pq_folders_updated_at BEFORE UPDATE ON public.pq_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.pq_forms ADD COLUMN folder_id UUID REFERENCES public.pq_folders(id) ON DELETE SET NULL;
CREATE INDEX pq_forms_folder_idx ON public.pq_forms(folder_id);
