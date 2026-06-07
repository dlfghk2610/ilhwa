
ALTER TABLE public.pq_educations
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date;

CREATE POLICY "edu certs select own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pq-education-certs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "edu certs insert own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pq-education-certs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "edu certs update own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'pq-education-certs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "edu certs delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'pq-education-certs' AND auth.uid()::text = (storage.foldername(name))[1]);
