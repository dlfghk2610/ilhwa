-- bid_participations
DROP POLICY IF EXISTS bid_participations_select ON public.bid_participations;
DROP POLICY IF EXISTS bid_participations_update ON public.bid_participations;
DROP POLICY IF EXISTS bid_participations_delete ON public.bid_participations;
CREATE POLICY bid_participations_select ON public.bid_participations FOR SELECT TO authenticated USING (auth.uid() = created_by);
CREATE POLICY bid_participations_update ON public.bid_participations FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY bid_participations_delete ON public.bid_participations FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- career_entries
DROP POLICY IF EXISTS career_entries_select ON public.career_entries;
DROP POLICY IF EXISTS career_entries_update ON public.career_entries;
DROP POLICY IF EXISTS career_entries_delete ON public.career_entries;
CREATE POLICY career_entries_select ON public.career_entries FOR SELECT TO authenticated USING (auth.uid() = created_by);
CREATE POLICY career_entries_update ON public.career_entries FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY career_entries_delete ON public.career_entries FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- personal_careers
DROP POLICY IF EXISTS personal_careers_select ON public.personal_careers;
DROP POLICY IF EXISTS personal_careers_update ON public.personal_careers;
DROP POLICY IF EXISTS personal_careers_delete ON public.personal_careers;
CREATE POLICY personal_careers_select ON public.personal_careers FOR SELECT TO authenticated USING (auth.uid() = created_by);
CREATE POLICY personal_careers_update ON public.personal_careers FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY personal_careers_delete ON public.personal_careers FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- personal_performances
DROP POLICY IF EXISTS personal_performances_select ON public.personal_performances;
DROP POLICY IF EXISTS personal_performances_update ON public.personal_performances;
DROP POLICY IF EXISTS personal_performances_delete ON public.personal_performances;
CREATE POLICY personal_performances_select ON public.personal_performances FOR SELECT TO authenticated USING (auth.uid() = created_by);
CREATE POLICY personal_performances_update ON public.personal_performances FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY personal_performances_delete ON public.personal_performances FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- similar_services
DROP POLICY IF EXISTS similar_services_select ON public.similar_services;
DROP POLICY IF EXISTS similar_services_update ON public.similar_services;
DROP POLICY IF EXISTS similar_services_delete ON public.similar_services;
CREATE POLICY similar_services_select ON public.similar_services FOR SELECT TO authenticated USING (auth.uid() = created_by);
CREATE POLICY similar_services_update ON public.similar_services FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY similar_services_delete ON public.similar_services FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- technician_overlaps
DROP POLICY IF EXISTS technician_overlaps_select ON public.technician_overlaps;
DROP POLICY IF EXISTS technician_overlaps_update ON public.technician_overlaps;
DROP POLICY IF EXISTS technician_overlaps_delete ON public.technician_overlaps;
CREATE POLICY technician_overlaps_select ON public.technician_overlaps FOR SELECT TO authenticated USING (auth.uid() = created_by);
CREATE POLICY technician_overlaps_update ON public.technician_overlaps FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY technician_overlaps_delete ON public.technician_overlaps FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- technicians
DROP POLICY IF EXISTS technicians_select ON public.technicians;
DROP POLICY IF EXISTS technicians_update ON public.technicians;
DROP POLICY IF EXISTS technicians_delete ON public.technicians;
CREATE POLICY technicians_select ON public.technicians FOR SELECT TO authenticated USING (auth.uid() = created_by);
CREATE POLICY technicians_update ON public.technicians FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY technicians_delete ON public.technicians FOR DELETE TO authenticated USING (auth.uid() = created_by);