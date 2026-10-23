CREATE TABLE public.temp_accounts (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  login_email text NOT NULL,
  label text,
  expires_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.temp_accounts TO authenticated;
GRANT ALL ON public.temp_accounts TO service_role;

ALTER TABLE public.temp_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY temp_accounts_select_self_or_admin ON public.temp_accounts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));