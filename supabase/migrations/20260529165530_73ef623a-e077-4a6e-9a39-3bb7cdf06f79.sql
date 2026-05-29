
-- Add PDF document path columns to technician_overlaps
ALTER TABLE public.technician_overlaps
  ADD COLUMN IF NOT EXISTS original_contract_pdf_path text,
  ADD COLUMN IF NOT EXISTS contract_change_pdf_path text,
  ADD COLUMN IF NOT EXISTS end_date_change_pdf_path text,
  ADD COLUMN IF NOT EXISTS suspension_pdf_path text,
  ADD COLUMN IF NOT EXISTS agreement_pdf_path text,
  ADD COLUMN IF NOT EXISTS participant_list_pdf_path text;

-- Create private storage bucket for overlap documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('overlap-documents', 'overlap-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Policies: users can manage only their own files (path begins with their uid/)
CREATE POLICY "overlap_docs_select_own"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'overlap-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "overlap_docs_insert_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'overlap-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "overlap_docs_update_own"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'overlap-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "overlap_docs_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'overlap-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
