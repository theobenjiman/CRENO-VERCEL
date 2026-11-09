-- Créno — initial schema
-- Multi-tenant: every business row carries salon_id; RLS lets a signed-in
-- user touch only salons they are a member of. The public booking flow runs
-- server-side with the service-role key and is scoped by salon in code.

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

-- ───────────────────────── Salons & members ─────────────────────────
create table public.salons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,40}$'),
  phone text,
  address text,
  city text,
  timezone text not null default 'Africa/Abidjan',
  plan text not null default 'free' check (plan in ('free','pro','salon_plus')),
  home_service_enabled boolean not null default false,
  home_deposit_default integer check (home_deposit_default >= 0),
  created_at timestamptz not null default now()
);

create table public.salon_members (
  salon_id uuid not null references public.salons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','staff')),
  staff_id uuid,
  primary key (salon_id, user_id)
);

create or replace function public.is_member(p_salon uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from salon_members where salon_id = p_salon and user_id = auth.uid());
$$;

-- ───────────────────────── Catalogue ─────────────────────────
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  name text not null,
  color text not null default '#C2255C',
  does_home_visits boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  name text not null,
  category text,
  price integer not null check (price >= 0),
  duration_min integer not null check (duration_min between 10 and 720),
  deposit_type text not null default 'none' check (deposit_type in ('none','fixed','percent')),
  deposit_value integer not null default 0 check (deposit_value >= 0),
  home_available boolean not null default false,
  rebook_after_days integer,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- If a stylist has no rows here, she can do every service.
create table public.staff_services (
  staff_id uuid not null references public.staff(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  primary key (staff_id, service_id)
);

create table public.opening_hours (
  salon_id uuid not null references public.salons(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = dimanche
  open_time time,
  close_time time,
  primary key (salon_id, weekday)
);

create table public.staff_time_off (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason text
);

create table public.service_zones (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  name text not null,
  travel_fee integer not null default 0 check (travel_fee >= 0),
  travel_minutes integer not null default 30 check (travel_minutes between 0 and 240),
  deposit_override integer check (deposit_override >= 0),
  active boolean not null default true
);

-- ───────────────────────── Clients ─────────────────────────
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  phone text not null,
  name text not null,
  notes text,
  birthday date,
  marketing_opt_in boolean not null default false,
  opt_in_at timestamptz,
  tags text[] not null default '{}',
  visits_count integer not null default 0,
  total_spent integer not null default 0,
  last_visit_at timestamptz,
  no_show_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (salon_id, phone)
);

-- ───────────────────────── Appointments ─────────────────────────
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  staff_id uuid not null references public.staff(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  -- Time the stylist is busy: equals start/end in salon, widened by travel for home visits.
  block_start timestamptz not null,
  block_end timestamptz not null,
  status text not null default 'confirmed'
    check (status in ('pending_payment','confirmed','done','no_show','cancelled')),
  source text not null default 'online' check (source in ('online','walk_in','phone')),
  location_type text not null default 'salon' check (location_type in ('salon','home')),
  zone_id uuid references public.service_zones(id),
  landmark text,
  geo_lat double precision,
  geo_lng double precision,
  price integer not null,
  travel_fee integer not null default 0,
  deposit_amount integer not null default 0,
  balance_paid integer not null default 0,
  hold_expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_at > start_at and block_end >= end_at and block_start <= start_at),
  -- No double booking for a stylist (active appointments only).
  constraint no_overlap exclude using gist (
    staff_id with =,
    tstzrange(block_start, block_end) with &&
  ) where (status in ('pending_payment','confirmed','done'))
);
create index appointments_salon_day on public.appointments (salon_id, start_at);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  amount integer not null,
  method text not null check (method in ('wave','orange','mtn','cash')),
  type text not null check (type in ('deposit','balance','refund')),
  provider_ref text,
  status text not null default 'paid' check (status in ('pending','paid','failed','refunded')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index payments_salon_day on public.payments (salon_id, paid_at);

-- ───────────────────────── Messaging ─────────────────────────
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  type text not null check (type in ('reminder','offer','greeting')),
  audience text not null,
  template text not null,
  sent_count integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  type text not null, -- confirmation, reminder_day, reminder_2h, rebook, offer, greeting, reminder, cash_summary
  channel text not null default 'whatsapp' check (channel in ('whatsapp','sms')),
  to_phone text not null,
  body text not null,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','sent','failed','cancelled')),
  provider_ref text
);
create index messages_due on public.messages (status, scheduled_at);

-- ───────────────────────── Onboarding RPC ─────────────────────────
create or replace function public.create_salon(
  p_name text, p_slug text, p_city text, p_phone text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into salons (name, slug, city, phone) values (p_name, lower(p_slug), p_city, p_phone)
    returning id into v_id;
  insert into salon_members (salon_id, user_id, role) values (v_id, auth.uid(), 'owner');
  -- Default hours: Monday–Saturday 08:00–19:00, closed Sunday.
  insert into opening_hours (salon_id, weekday, open_time, close_time)
    select v_id, d, case when d = 0 then null else '08:00'::time end,
                    case when d = 0 then null else '19:00'::time end
    from generate_series(0, 6) d;
  return v_id;
end $$;

-- ───────────────────────── Row level security ─────────────────────────
alter table public.salons enable row level security;
alter table public.salon_members enable row level security;
alter table public.staff enable row level security;
alter table public.services enable row level security;
alter table public.staff_services enable row level security;
alter table public.opening_hours enable row level security;
alter table public.staff_time_off enable row level security;
alter table public.service_zones enable row level security;
alter table public.clients enable row level security;
alter table public.appointments enable row level security;
alter table public.payments enable row level security;
alter table public.campaigns enable row level security;
alter table public.messages enable row level security;

create policy "members read salon" on public.salons for select using (public.is_member(id));
create policy "members update salon" on public.salons for update using (public.is_member(id));
create policy "own memberships" on public.salon_members for select using (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['staff','services','opening_hours','staff_time_off','service_zones',
                           'clients','appointments','payments','campaigns','messages']
  loop
    execute format(
      'create policy "members all" on public.%I for all using (public.is_member(salon_id)) with check (public.is_member(salon_id))', t);
  end loop;
end $$;

create policy "members all" on public.staff_services for all
  using (exists (select 1 from public.staff s where s.id = staff_id and public.is_member(s.salon_id)))
  with check (exists (select 1 from public.staff s where s.id = staff_id and public.is_member(s.salon_id)));
