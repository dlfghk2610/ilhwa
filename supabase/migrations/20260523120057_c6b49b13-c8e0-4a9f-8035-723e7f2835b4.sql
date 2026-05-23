DO $$
DECLARE j RECORD;
BEGIN
  FOR j IN SELECT jobid, jobname FROM cron.job WHERE command ILIKE '%send-bid-notifications%' LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;