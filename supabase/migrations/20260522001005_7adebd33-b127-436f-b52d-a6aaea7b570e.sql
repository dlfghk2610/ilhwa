ALTER TABLE public.bid_participations
  ADD COLUMN IF NOT EXISTS announcement_date date,
  ADD COLUMN IF NOT EXISTS pq_due_date date,
  ADD COLUMN IF NOT EXISTS bid_start_date date,
  ADD COLUMN IF NOT EXISTS bid_end_at timestamptz,
  ADD COLUMN IF NOT EXISTS share_rates jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS participants jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS evaluation_types text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS service_types text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS agreement_approval_date date,
  ADD COLUMN IF NOT EXISTS notify_hours_before integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS notify_browser boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_email text,
  ADD COLUMN IF NOT EXISTS notify_phone text,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

UPDATE public.bid_participations
  SET bid_start_date = bid_date
  WHERE bid_start_date IS NULL AND bid_date IS NOT NULL;