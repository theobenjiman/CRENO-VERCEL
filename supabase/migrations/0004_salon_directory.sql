-- Créno — public directory: salons placed on a map, searchable by distance.

alter table public.salons
  add column lat double precision check (lat between -90 and 90),
  add column lng double precision check (lng between -180 and 180),
  add column listed boolean not null default true;   -- show in the public "Trouver un salon" map

grant update (lat, lng, listed) on public.salons to authenticated;
create index salons_geo on public.salons (lat, lng) where listed and lat is not null;

-- Salons within p_km of a point, nearest first (haversine; no PostGIS needed).
-- Returns only public information. Callable by anyone.
create or replace function public.nearby_salons(
  p_lat double precision, p_lng double precision, p_km double precision default 15, p_limit integer default 60
) returns table (
  id uuid, name text, slug text, address text, city text, lat double precision, lng double precision,
  home_service boolean, distance_km double precision, min_price integer, categories text[], photo_path text
) language sql stable security definer set search_path = public as $$
  with box as (
    select p_km / 111.0 as dlat, p_km / (111.0 * greatest(cos(radians(p_lat)), 0.01)) as dlng
  ), near as (
    select s.*, 2 * 6371 * asin(sqrt(
             power(sin(radians(s.lat - p_lat) / 2), 2) +
             cos(radians(p_lat)) * cos(radians(s.lat)) * power(sin(radians(s.lng - p_lng) / 2), 2)
           )) as dist
    from salons s, box
    where s.listed and s.lat is not null
      and s.lat between p_lat - box.dlat and p_lat + box.dlat
      and s.lng between p_lng - box.dlng and p_lng + box.dlng
  )
  select n.id, n.name, n.slug, n.address, n.city, n.lat, n.lng,
         n.home_service_enabled
           and exists (select 1 from service_zones z where z.salon_id = n.id and z.active)
           and exists (select 1 from staff st where st.salon_id = n.id and st.active and st.does_home_visits),
         round(n.dist::numeric, 2)::double precision,
         (select min(sv.price) from services sv where sv.salon_id = n.id and sv.active),
         coalesce((select array_agg(distinct sv.category order by sv.category) from services sv
                   where sv.salon_id = n.id and sv.active and sv.category is not null), '{}'),
         (select ph.path from salon_photos ph where ph.salon_id = n.id order by ph.position, ph.created_at limit 1)
  from near n
  where n.dist <= p_km
    and exists (select 1 from services sv where sv.salon_id = n.id and sv.active)   -- bookable salons only
  order by n.dist
  limit least(p_limit, 200);
$$;
grant execute on function public.nearby_salons(double precision, double precision, double precision, integer) to anon, authenticated;
