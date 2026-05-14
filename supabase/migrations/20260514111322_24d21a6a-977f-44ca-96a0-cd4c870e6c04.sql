
-- Create private bucket for performance certificate PDFs
insert into storage.buckets (id, name, public) values ('performance-certs', 'performance-certs', false)
on conflict (id) do nothing;

-- RLS policies: authenticated users can manage files under their own user-id folder
create policy "perf_certs_select_own"
on storage.objects for select
to authenticated
using (bucket_id = 'performance-certs' and (auth.uid()::text = (storage.foldername(name))[1]));

create policy "perf_certs_insert_own"
on storage.objects for insert
to authenticated
with check (bucket_id = 'performance-certs' and (auth.uid()::text = (storage.foldername(name))[1]));

create policy "perf_certs_update_own"
on storage.objects for update
to authenticated
using (bucket_id = 'performance-certs' and (auth.uid()::text = (storage.foldername(name))[1]));

create policy "perf_certs_delete_own"
on storage.objects for delete
to authenticated
using (bucket_id = 'performance-certs' and (auth.uid()::text = (storage.foldername(name))[1]));

-- Add a column on similar_services for the (non-phase) certificate PDF path
alter table public.similar_services add column if not exists cert_pdf_path text;
