
-- 통합 마스터 실적 테이블
CREATE TABLE public.performance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  project_name text NOT NULL,
  service_overview text,
  client text,
  contract_periods jsonb NOT NULL DEFAULT '[]'::jsonb,
  contract_start_date date,
  contract_end_date date,
  announcement_date date,
  completion_date date,
  contract_amount numeric,
  share_rate numeric,
  share_amount numeric,
  company_share_rate text,
  evaluation_types text[] NOT NULL DEFAULT '{}'::text[],
  service_types text[] NOT NULL DEFAULT '{}'::text[],
  participation_rate numeric,
  participants jsonb NOT NULL DEFAULT '[]'::jsonb,
  participant_file_path text,
  cert_pdf_path text,
  phases jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_private boolean NOT NULL DEFAULT false,
  is_under_90days boolean NOT NULL DEFAULT false,
  is_lh_completion boolean NOT NULL DEFAULT false,
  is_progress boolean NOT NULL DEFAULT false,
  is_dual_participation boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.performance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "performance_records_select" ON public.performance_records
  FOR SELECT TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "performance_records_insert" ON public.performance_records
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "performance_records_update" ON public.performance_records
  FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "performance_records_delete" ON public.performance_records
  FOR DELETE TO authenticated USING (auth.uid() = created_by);

CREATE TRIGGER performance_records_set_updated_at
  BEFORE UPDATE ON public.performance_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 기존 personal_performances 데이터 복사
INSERT INTO public.performance_records (
  id, created_by, project_name, service_overview, client,
  contract_periods, contract_start_date, contract_end_date,
  contract_amount, share_rate, share_amount, company_share_rate,
  evaluation_types, service_types,
  participants, participant_file_path, cert_pdf_path,
  is_private, notes, created_at, updated_at
)
SELECT
  id, created_by, project_name, service_overview, client,
  COALESCE(contract_periods, '[]'::jsonb),
  contract_start_date, contract_end_date,
  contract_amount, share_rate, share_amount, company_share_rate,
  COALESCE(evaluation_types, '{}'::text[]),
  COALESCE(service_types, '{}'::text[]),
  COALESCE(participants, '[]'::jsonb),
  participant_file_path, cert_pdf_path,
  COALESCE(is_private, false), notes, created_at, updated_at
FROM public.personal_performances;

-- 기존 similar_services 데이터 복사 (단일 → 배열 변환)
INSERT INTO public.performance_records (
  created_by, project_name, service_overview, client,
  contract_periods, contract_start_date, contract_end_date,
  announcement_date, completion_date,
  contract_amount, share_rate, share_amount, company_share_rate,
  evaluation_types, service_types,
  participation_rate, phases, cert_pdf_path,
  is_private, is_under_90days, is_lh_completion, is_progress, is_dual_participation,
  notes, created_at, updated_at
)
SELECT
  created_by, project_name, service_overview, client,
  CASE
    WHEN contract_date IS NOT NULL OR completion_date IS NOT NULL
      THEN jsonb_build_array(jsonb_build_object('start', contract_date, 'end', completion_date))
    ELSE '[]'::jsonb
  END,
  contract_date, completion_date,
  announcement_date, completion_date,
  contract_amount, participation_rate, share_amount, company_share_rate,
  CASE WHEN evaluation_type IS NOT NULL AND evaluation_type <> '' THEN ARRAY[evaluation_type] ELSE '{}'::text[] END,
  CASE
    WHEN service_type IS NULL OR service_type = '' THEN '{}'::text[]
    ELSE ARRAY(SELECT trim(t) FROM unnest(string_to_array(service_type, ',')) AS t WHERE trim(t) <> '')
  END,
  participation_rate,
  COALESCE(phases, '[]'::jsonb),
  cert_pdf_path,
  COALESCE(is_private, false),
  COALESCE(is_under_90days, false),
  COALESCE(is_lh_completion, false),
  COALESCE(is_progress, false),
  COALESCE(is_dual_participation, false),
  notes, created_at, updated_at
FROM public.similar_services;
