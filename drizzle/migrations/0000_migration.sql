ALTER TABLE public.technicians ADD COLUMN IF NOT EXISTS career_pdf_path text;
ALTER TABLE public.career_entries ADD COLUMN IF NOT EXISTS pdf_order integer, ADD COLUMN IF NOT EXISTS pdf_page integer;
CREATE POLICY "career pdfs read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'career-pdfs');
CREATE POLICY "career pdfs insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'career-pdfs');
CREATE POLICY "career pdfs update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'career-pdfs');
CREATE POLICY "career pdfs delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'career-pdfs');