-- Update handle_new_user to populate company from signup metadata
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

  INSERT INTO public.profiles (id, display_name, company, approved)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'company', NEW.raw_user_meta_data->>'display_name'),
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

-- Backfill existing profiles where company is empty, using auth metadata or display_name as fallback
UPDATE public.profiles p
SET company = COALESCE(
  NULLIF(u.raw_user_meta_data->>'company', ''),
  NULLIF(u.raw_user_meta_data->>'display_name', ''),
  p.display_name
)
FROM auth.users u
WHERE u.id = p.id
  AND (p.company IS NULL OR p.company = '');