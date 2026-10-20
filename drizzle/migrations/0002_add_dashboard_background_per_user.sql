ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS dashboard_bg_path text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS dashboard_bg_tf jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.profiles.dashboard_bg_path IS '계정별 대시보드 배경 이미지 경로 (dashboard-backgrounds 버킷)';
COMMENT ON COLUMN public.profiles.dashboard_bg_tf IS '기기 종류별(pc/mobile) 배경 확대·이동 값';

CREATE POLICY "dash bg own read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'dashboard-backgrounds' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "dash bg own insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'dashboard-backgrounds' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "dash bg own update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'dashboard-backgrounds' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "dash bg own delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'dashboard-backgrounds' AND auth.uid()::text = (storage.foldername(name))[1]);