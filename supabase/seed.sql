-- Demo salon so the public booking page works right away: /fatou-beaute
-- Run AFTER all migrations (0001 → 0004).
-- To manage it from the owner app, sign in once, then run:
--   insert into salon_members (salon_id, user_id, role)
--   select id, '<your auth user id>', 'owner' from salons where slug = 'fatou-beaute';

insert into salons (id, name, slug, phone, address, city, home_service_enabled, home_deposit_default, plan, plan_expires_at, lat, lng)
values ('00000000-0000-0000-0000-00000000f001', 'Chez Fatou Beauté', 'fatou-beaute',
        '+2250700000000', 'Cocody Angré, 8e tranche', 'Abidjan', true, 5000, 'salon_plus', now() + interval '1 year', 5.3965, -3.9890);

insert into opening_hours (salon_id, weekday, open_time, close_time)
select '00000000-0000-0000-0000-00000000f001', d,
       case when d = 0 then null else '08:00'::time end,
       case when d = 0 then null else '19:00'::time end
from generate_series(0, 6) d;

insert into staff (salon_id, name, color, does_home_visits) values
  ('00000000-0000-0000-0000-00000000f001', 'Awa',    '#C2255C', true),
  ('00000000-0000-0000-0000-00000000f001', 'Mariam', '#6D3FA0', false),
  ('00000000-0000-0000-0000-00000000f001', 'Grâce',  '#E07A5F', true);

insert into services (salon_id, name, category, price, duration_min, deposit_type, deposit_value, home_available, rebook_after_days) values
  ('00000000-0000-0000-0000-00000000f001', 'Tresses knotless — moyennes', 'Tresses', 15000, 180, 'fixed', 3000, true, 42),
  ('00000000-0000-0000-0000-00000000f001', 'Box braids', 'Tresses', 13000, 180, 'fixed', 3000, true, 42),
  ('00000000-0000-0000-0000-00000000f001', 'Pose gel + nail art', 'Ongles', 10000, 90, 'fixed', 2000, true, 21),
  ('00000000-0000-0000-0000-00000000f001', 'Pédicure', 'Ongles', 6000, 60, 'none', 0, false, 28),
  ('00000000-0000-0000-0000-00000000f001', 'Coupe + brushing', 'Coiffure', 5000, 60, 'none', 0, false, 30);

insert into service_zones (salon_id, name, travel_fee, travel_minutes) values
  ('00000000-0000-0000-0000-00000000f001', 'Cocody Angré', 1500, 20),
  ('00000000-0000-0000-0000-00000000f001', 'Riviera 3', 2000, 30),
  ('00000000-0000-0000-0000-00000000f001', 'Bingerville', 3500, 45);

insert into clients (salon_id, phone, name, marketing_opt_in, visits_count, total_spent, last_visit_at, birthday) values
  ('00000000-0000-0000-0000-00000000f001', '+2250701020304', 'Aïcha Traoré', true, 9, 132000, now() - interval '49 days', null),
  ('00000000-0000-0000-0000-00000000f001', '+2250505060708', 'Marie Diallo', true, 5, 48000, now() - interval '42 days', (current_date + 3) - interval '30 years'),
  ('00000000-0000-0000-0000-00000000f001', '+2250102030405', 'Kadi Bamba', false, 3, 39000, now() - interval '35 days', null);

-- More demo salons around Abidjan for the "Trouver un salon" map.
with s as (
  insert into salons (name, slug, phone, address, city, lat, lng, plan, plan_expires_at) values
    ('Nails by Grâce',      'nails-by-grace',    '+2250700000011', 'Riviera 3, près du carrefour', 'Abidjan', 5.3610, -3.9530, 'pro', now() + interval '1 year'),
    ('Barber Prestige',     'barber-prestige',   '+2250700000012', 'Plateau, avenue Chardy',       'Abidjan', 5.3230, -4.0190, 'free', null),
    ('Tresses & Co',        'tresses-and-co',    '+2250700000013', 'Marcory Zone 4',               'Abidjan', 5.2990, -3.9800, 'pro', now() + interval '1 year'),
    ('Institut Belle Peau', 'institut-belle-peau','+2250700000014','Deux Plateaux Vallon',         'Abidjan', 5.3640, -4.0010, 'pro', now() + interval '1 year')
  returning id, slug
), h as (
  insert into opening_hours (salon_id, weekday, open_time, close_time)
  select s.id, d, case when d = 0 then null else '09:00'::time end, case when d = 0 then null else '19:00'::time end
  from s, generate_series(0, 6) d returning salon_id
), st as (
  insert into staff (salon_id, name) select id, 'Équipe' from s returning salon_id
)
insert into services (salon_id, name, category, price, duration_min, deposit_type, deposit_value)
select s.id, v.name, v.cat, v.price, v.dur, 'fixed', 2000
from s join (values
  ('nails-by-grace', 'Pose gel', 'Ongles', 8000, 75), ('nails-by-grace', 'Manucure', 'Ongles', 4000, 45),
  ('barber-prestige', 'Coupe homme', 'Barbier', 3000, 30), ('barber-prestige', 'Coupe + barbe', 'Barbier', 5000, 45),
  ('tresses-and-co', 'Box braids', 'Tresses', 12000, 180), ('tresses-and-co', 'Nattes collées', 'Tresses', 6000, 90),
  ('institut-belle-peau', 'Soin visage', 'Soins', 15000, 60), ('institut-belle-peau', 'Épilation sourcils', 'Soins', 2500, 20)
) v(slug, name, cat, price, dur) on v.slug = s.slug;
