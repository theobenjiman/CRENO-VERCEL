import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { one } from "./booking";
import { effectivePlan } from "./plans";
import type { Salon } from "./types";

async function membership(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from("salon_members")
    .select("role, staff_id, salons(*)")
    .eq("user_id", userId)
    .order("role", { ascending: true }) // 'owner' before 'staff'
    .limit(1)
    .maybeSingle();
  return data;
}

/**
 * Signed-in owner or stylist and their salon. Pending stylist invites for the
 * user's phone are accepted on first visit. Redirects to login / onboarding.
 */
export const requireSalon = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  let m = await membership(supabase, user.id);
  if (!m) {
    const { data: accepted } = await supabase.rpc("accept_invites");
    if (accepted) m = await membership(supabase, user.id);
  }
  const salon = one(m?.salons as Salon | Salon[] | null);
  if (!m || !salon) redirect("/onboarding");
  const role = m.role as "owner" | "staff";
  return {
    supabase,
    user,
    salon,
    role,
    staffId: (m.staff_id as string | null) ?? null,
    isOwner: role === "owner",
    plan: effectivePlan(salon),
    tz: salon.timezone || "Africa/Abidjan",
  };
});

/** Same as requireSalon, but stylists are sent back to their agenda. */
export async function requireOwner() {
  const s = await requireSalon();
  if (!s.isOwner) redirect("/app");
  return s;
}
