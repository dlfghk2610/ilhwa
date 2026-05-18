-- 1) approved 컬럼 추가
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;

-- 2) 관리자 정책 (수정/조회 확장)
DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
CREATE POLICY profiles_update_admin ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3) handle_new_user 갱신: 첫 사용자 또는 지정 관리자 이메일은 자동 승인 + admin 권한 부여
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_count INT;
  is_designated_admin BOOLEAN;
BEGIN
  is_designated_admin := LOWER(NEW.email) = LOWER('dlfghk2610@naver.com');

  INSERT INTO public.profiles (id, display_name, approved)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    is_designated_admin
  );

  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 OR is_designated_admin THEN
    UPDATE public.profiles SET approved = true WHERE id = NEW.id;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4) 기존에 가입된 지정 관리자 계정(있다면) 승인 + admin 부여
DO $$
DECLARE
  admin_id uuid;
BEGIN
  SELECT id INTO admin_id FROM auth.users WHERE LOWER(email) = LOWER('dlfghk2610@naver.com') LIMIT 1;
  IF admin_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, display_name, approved)
      VALUES (admin_id, 'Admin', true)
      ON CONFLICT (id) DO UPDATE SET approved = true;
    INSERT INTO public.user_roles (user_id, role) VALUES (admin_id, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;

-- 5) 첫 가입자(이미 있는 경우)도 승인 처리
UPDATE public.profiles
SET approved = true
WHERE id IN (SELECT user_id FROM public.user_roles WHERE role = 'admin');