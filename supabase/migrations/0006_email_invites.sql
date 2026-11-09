-- Créno — logins are Google / email now: stylists are invited by email (phone kept as an alternative).

alter table public.staff_invites alter column phone drop not null;
alter table public.staff_invites add column email text;
alter table public.staff_invites add constraint staff_invites_contact check (email is not null or phone is not null);
create unique index staff_invites_salon_email on public.staff_invites (salon_id, lower(email)) where email is not null;

create or replace function public.accept_invites()
returns integer language plpgsql security definer set search_path = public, auth as $$
declare v_phone text; v_email text; v_count integer := 0; r record;
begin
  if auth.uid() is null then return 0; end if;
  select phone, lower(email) into v_phone, v_email from auth.users where id = auth.uid();
  for r in
    select * from staff_invites
    where accepted_at is null
      and ((v_email is not null and lower(email) = v_email)
        or (coalesce(v_phone, '') <> '' and phone is not null and replace(phone, '+', '') = replace(v_phone, '+', '')))
  loop
    insert into salon_members (salon_id, user_id, role, staff_id)
      values (r.salon_id, auth.uid(), 'staff', r.staff_id)
      on conflict (salon_id, user_id) do nothing;
    update staff_invites set accepted_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function public.accept_invites() from anon, public;
grant execute on function public.accept_invites() to authenticated;
