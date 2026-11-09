-- Créno — "Nos réalisations": photo gallery shown as a slider on the booking page.

create table public.salon_photos (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  path text not null,              -- object path in the salon-photos bucket: <salon_id>/<uuid>.<ext>
  caption text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index salon_photos_salon on public.salon_photos (salon_id, position);

alter table public.salon_photos enable row level security;
create policy "members read" on public.salon_photos for select using (public.is_member(salon_id));
create policy "owners insert" on public.salon_photos for insert with check (public.is_owner(salon_id));
create policy "owners update" on public.salon_photos for update using (public.is_owner(salon_id));
create policy "owners delete" on public.salon_photos for delete using (public.is_owner(salon_id));

-- Public storage bucket (uploads go through the server with the service role,
-- after checking the user owns the salon, so no extra storage policies are needed).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('salon-photos', 'salon-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
    on conflict (id) do nothing;
  end if;
end $$;
