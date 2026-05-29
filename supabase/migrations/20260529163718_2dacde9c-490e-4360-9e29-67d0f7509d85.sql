CREATE TABLE public.personal_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL,
  technician_name TEXT NOT NULL,
  birth_date DATE,
  specialty TEXT,
  educations JSONB NOT NULL DEFAULT '[]'::jsonb,
  certifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (created_by, technician_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_profiles TO authenticated;
GRANT ALL ON public.personal_profiles TO service_role;

ALTER TABLE public.personal_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "personal_profiles_select" ON public.personal_profiles FOR SELECT TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "personal_profiles_insert" ON public.personal_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "personal_profiles_update" ON public.personal_profiles FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "personal_profiles_delete" ON public.personal_profiles FOR DELETE TO authenticated USING (auth.uid() = created_by);

CREATE TRIGGER personal_profiles_updated_at BEFORE UPDATE ON public.personal_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();