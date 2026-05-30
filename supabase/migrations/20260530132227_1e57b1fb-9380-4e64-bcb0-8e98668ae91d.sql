
-- 1) PQ 개발/투자/활용실적
CREATE TABLE public.pq_dev_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  record_type text NOT NULL CHECK (record_type IN ('개발','투자','활용')),
  title text NOT NULL,
  amount numeric,
  record_date date,
  institution text,
  notes text,
  attachment_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pq_dev_records TO authenticated;
GRANT ALL ON public.pq_dev_records TO service_role;
ALTER TABLE public.pq_dev_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY pq_dev_records_select ON public.pq_dev_records FOR SELECT TO authenticated USING (auth.uid() = created_by);
CREATE POLICY pq_dev_records_insert ON public.pq_dev_records FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY pq_dev_records_update ON public.pq_dev_records FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY pq_dev_records_delete ON public.pq_dev_records FOR DELETE TO authenticated USING (auth.uid() = created_by);
CREATE TRIGGER trg_pq_dev_records_updated BEFORE UPDATE ON public.pq_dev_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) PQ 기술자별 교육현황
CREATE TABLE public.pq_educations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  technician_name text NOT NULL,
  course_name text NOT NULL,
  hours numeric,
  completed_date date,
  institution text,
  certificate_path text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pq_educations TO authenticated;
GRANT ALL ON public.pq_educations TO service_role;
ALTER TABLE public.pq_educations ENABLE ROW LEVEL SECURITY;
CREATE POLICY pq_educations_select ON public.pq_educations FOR SELECT TO authenticated USING (auth.uid() = created_by);
CREATE POLICY pq_educations_insert ON public.pq_educations FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY pq_educations_update ON public.pq_educations FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY pq_educations_delete ON public.pq_educations FOR DELETE TO authenticated USING (auth.uid() = created_by);
CREATE TRIGGER trg_pq_educations_updated BEFORE UPDATE ON public.pq_educations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) PQ 배점 기준표 (사용자별 1개)
CREATE TABLE public.pq_score_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL UNIQUE,
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pq_score_criteria TO authenticated;
GRANT ALL ON public.pq_score_criteria TO service_role;
ALTER TABLE public.pq_score_criteria ENABLE ROW LEVEL SECURITY;
CREATE POLICY pq_score_criteria_select ON public.pq_score_criteria FOR SELECT TO authenticated USING (auth.uid() = created_by);
CREATE POLICY pq_score_criteria_insert ON public.pq_score_criteria FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY pq_score_criteria_update ON public.pq_score_criteria FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY pq_score_criteria_delete ON public.pq_score_criteria FOR DELETE TO authenticated USING (auth.uid() = created_by);
CREATE TRIGGER trg_pq_score_criteria_updated BEFORE UPDATE ON public.pq_score_criteria
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) PQ 배점계산기 사업
CREATE TABLE public.pq_calc_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  project_name text NOT NULL,
  client text,
  announcement_date date,
  companies jsonb NOT NULL DEFAULT '[]'::jsonb,
  personnel jsonb NOT NULL DEFAULT '{}'::jsonb,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pq_calc_projects TO authenticated;
GRANT ALL ON public.pq_calc_projects TO service_role;
ALTER TABLE public.pq_calc_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY pq_calc_projects_select ON public.pq_calc_projects FOR SELECT TO authenticated USING (auth.uid() = created_by);
CREATE POLICY pq_calc_projects_insert ON public.pq_calc_projects FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY pq_calc_projects_update ON public.pq_calc_projects FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY pq_calc_projects_delete ON public.pq_calc_projects FOR DELETE TO authenticated USING (auth.uid() = created_by);
CREATE TRIGGER trg_pq_calc_projects_updated BEFORE UPDATE ON public.pq_calc_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
