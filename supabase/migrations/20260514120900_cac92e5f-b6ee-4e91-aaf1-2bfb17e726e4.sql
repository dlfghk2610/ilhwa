-- Add new columns to personal_performances
ALTER TABLE public.personal_performances
  ADD COLUMN IF NOT EXISTS service_overview text,
  ADD COLUMN IF NOT EXISTS contract_start_date date,
  ADD COLUMN IF NOT EXISTS contract_end_date date,
  ADD COLUMN IF NOT EXISTS contract_amount numeric,
  ADD COLUMN IF NOT EXISTS share_rate numeric,
  ADD COLUMN IF NOT EXISTS share_amount numeric,
  ADD COLUMN IF NOT EXISTS evaluation_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS service_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS company_share_rate text,
  ADD COLUMN IF NOT EXISTS participants jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS participant_file_path text;

-- Storage bucket for participant lists (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('participant-lists', 'participant-lists', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: users can manage files inside a folder named with their user id
CREATE POLICY "participant_lists_select_own"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'participant-lists' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "participant_lists_insert_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'participant-lists' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "participant_lists_update_own"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'participant-lists' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "participant_lists_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'participant-lists' AND auth.uid()::text = (storage.foldername(name))[1]);