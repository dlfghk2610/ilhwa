-- Restrict SELECT on business tables to owner or admin
DROP POLICY IF EXISTS "personal_performances_select" ON public.personal_performances;
CREATE POLICY "personal_performances_select" ON public.personal_performances
  FOR SELECT TO authenticated
  USING ((auth.uid() = created_by) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "personal_careers_select" ON public.personal_careers;
CREATE POLICY "personal_careers_select" ON public.personal_careers
  FOR SELECT TO authenticated
  USING ((auth.uid() = created_by) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "bid_participations_select" ON public.bid_participations;
CREATE POLICY "bid_participations_select" ON public.bid_participations
  FOR SELECT TO authenticated
  USING ((auth.uid() = created_by) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "technician_overlaps_select" ON public.technician_overlaps;
CREATE POLICY "technician_overlaps_select" ON public.technician_overlaps
  FOR SELECT TO authenticated
  USING ((auth.uid() = created_by) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "similar_services_select" ON public.similar_services;
CREATE POLICY "similar_services_select" ON public.similar_services
  FOR SELECT TO authenticated
  USING ((auth.uid() = created_by) OR has_role(auth.uid(), 'admin'::app_role));

-- Restrict profiles SELECT to self or admin
DROP POLICY IF EXISTS "profiles_select_authed" ON public.profiles;
CREATE POLICY "profiles_select_self_or_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING ((auth.uid() = id) OR has_role(auth.uid(), 'admin'::app_role));