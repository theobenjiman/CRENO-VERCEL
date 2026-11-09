-- Créno — staff roles, client self-service links, subscriptions, timezone

-- ───────────────────────── Salon settings ─────────────────────────
alter table public.salons
  add column plan_expires_at timestamptz,
  add column cancel_notice_hours integer not null default 24 check (cancel_notice_hours between 0 and 168);

create or replace function public.is_owner(p_salon uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from salon_members where salon_id = p_salon and user_id = auth.uid() and role = 'owner');
$$;

-- Owners may edit their salon, but never its plan (only the server, via billing).
drop policy "members update salon" on public.salons;
create policy "owners update salon" on public.salons for update using (public.is_owner(id));
revoke update on public.salons from authenticated, anon;
grant update (name, phone, address, city, timezone, home_service_enabled, home_deposit_default, cancel_notice_hours)
  on public.salons to authenticated;

-- New salons start with a 30-day Pro trial.
create or replace function public.create_salon(
  p_name text, p_slug text, p_city text, p_phone text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into salons (name, slug, city, phone, plan, plan_expires_at)
    values (p_name, lower(p_slug), p_city, p_phone, 'pro', now() + interval '30 days')
    returning id into v_id;
  insert into salon_members (salon_id, user_id, role) values (v_id, auth.uid(), 'owner');
  insert into opening_hours (salon_id, weekday, open_time, close_time)
    select v_id, d, case when d = 0 then null else '08:00'::time end,
                    case when d = 0 then null else '19:00'::time end
    from generate_series(0, 6) d;
  return v_id;
end $$;

-- ───────────────────────── Owner-only configuration ─────────────────────────
-- Staff can read the catalogue and work the schedule; only owners change settings.
do $$
declare t text;
begin
  foreach t in array array['staff','services','opening_hours','service_zones','staff_time_off','campaigns']
  loop
    execute format('drop policy "members all" on public.%I', t);
    execute format('create policy "members read" on public.%I for select using (public.is_member(salon_id))', t);
    execute format('create policy "owners insert" on public.%I for insert with check (public.is_owner(salon_id))', t);
    execute format('create policy "owners update" on public.%I for update using (public.is_owner(salon_id))', t);
    execute format('create policy "owners delete" on public.%I for delete using (public.is_owner(salon_id))', t);
  end loop;
end $$;

drop policy "members all" on public.staff_services;
create policy "members read" on public.staff_services for select
  using (exists (select 1 from public.staff s where s.id = staff_id and public.is_member(s.salon_id)));
create policy "owners write" on public.staff_services for all
  using (exists (select 1 from public.staff s where s.id = staff_id and public.is_owner(s.salon_id)))
  with check (exists (select 1 from public.staff s where s.id = staff_id and public.is_owner(s.salon_id)));

-- ───────────────────────── Staff logins ─────────────────────────
alter table public.salon_members
  add constraint salon_members_staff_fk foreign key (staff_id) references public.staff(id) on delete set null;

create policy "owners read members" on public.salon_members for select using (public.is_owner(salon_id));
create policy "owners remove staff" on public.salon_members for delete
  using (public.is_owner(salon_id) and role = 'staff');

create table public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  phone text not null,                 -- +225XXXXXXXXXX
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (salon_id, phone)
);
alter table public.staff_invites enable row level security;
create policy "owners all" on public.staff_invites for all
  using (public.is_owner(salon_id)) with check (public.is_owner(salon_id));

-- Called after login: turns pending invites for the user's phone into memberships.
create or replace function public.accept_invites()
returns integer language plpgsql security definer set search_path = public, auth as $$
declare v_phone text; v_count integer := 0; r record;
begin
  if auth.uid() is null then return 0; end if;
  select phone into v_phone from auth.users where id = auth.uid();
  if v_phone is null or v_phone = '' then return 0; end if;
  for r in
    select * from staff_invites
    where accepted_at is null and replace(phone, '+', '') = replace(v_phone, '+', '')
  loop
    insert into salon_members (salon_id, user_id, role, staff_id)
      values (r.salon_id, auth.uid(), 'staff', r.staff_id)
      on conflict (salon_id, user_id) do nothing;
    update staff_invites set accepted_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ───────────────────────── Client self-service link ─────────────────────────
alter table public.appointments
  add column manage_token uuid not null default gen_random_uuid(),
  add column cancelled_by text check (cancelled_by in ('client','salon')),
  add column cancelled_at timestamptz;
create unique index appointments_manage_token on public.appointments (manage_token);

-- ───────────────────────── Créno subscriptions ─────────────────────────
create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  plan text not null check (plan in ('pro','salon_plus')),
  period text not null check (period in ('month','year')),
  amount integer not null,
  method text not null check (method in ('wave','orange','mtn')),
  provider_ref text,
  status text not null default 'paid' check (status in ('pending','paid','failed')),
  period_end timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.subscription_payments enable row level security;
create policy "owners read" on public.subscription_payments for select using (public.is_owner(salon_id));
-- No insert/update policy: only the server (service role) records subscription payments.
