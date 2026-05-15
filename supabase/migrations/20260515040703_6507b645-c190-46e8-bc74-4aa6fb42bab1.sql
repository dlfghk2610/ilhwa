
CREATE TABLE public.technicians (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL,
  name TEXT NOT NULL,
  birth_date DATE,
  specialty TEXT,
  company TEXT,
  position TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;

CREATE POLICY "technicians_select" ON public.technicians FOR SELECT TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "technicians_insert" ON public.technicians FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "technicians_update" ON public.technicians FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "technicians_delete" ON public.technicians FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_technicians_updated_at BEFORE UPDATE ON public.technicians
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.career_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL,
  technician_id UUID NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  project_name TEXT,
  client TEXT,
  service_field TEXT,
  specialty TEXT,
  duties TEXT,
  evaluation_category TEXT,
  participation_company TEXT,
  participation_position TEXT,
  period_start DATE,
  period_end_text TEXT,
  recognized_days NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_career_entries_tech ON public.career_entries(technician_id);

ALTER TABLE public.career_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "career_entries_select" ON public.career_entries FOR SELECT TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "career_entries_insert" ON public.career_entries FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "career_entries_update" ON public.career_entries FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "career_entries_delete" ON public.career_entries FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_career_entries_updated_at BEFORE UPDATE ON public.career_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
