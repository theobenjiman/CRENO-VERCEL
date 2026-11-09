-- Onboarding and invite acceptance are for signed-in users only.
-- (is_member / is_owner stay callable: RLS policies use them, they only answer for the caller's own uid.
--  nearby_salons is public on purpose: it powers the "Trouver un salon" map.)
revoke execute on function public.create_salon(text, text, text, text) from anon, public;
revoke execute on function public.accept_invites() from anon, public;
grant execute on function public.create_salon(text, text, text, text) to authenticated;
grant execute on function public.accept_invites() to authenticated;
