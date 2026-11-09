import { createAdminClient } from "@/lib/supabase/admin";
import type { OpeningHours, Salon, Service, Staff, Zone } from "@/lib/types";
import type { SalonPhoto } from "@/lib/photos";

export async function loadSalonContext(slug: string) {
  const db = createAdminClient();
  const { data: salon } = await db.from("salons").select("*").eq("slug", slug).maybeSingle<Salon>();
  if (!salon) return null;
  const [staff, services, zones, hours, skills, photos] = await Promise.all([
    db.from("staff").select("*").eq("salon_id", salon.id).eq("active", true).order("created_at"),
    db.from("services").select("*").eq("salon_id", salon.id).eq("active", true).order("category").order("price"),
    db.from("service_zones").select("*").eq("salon_id", salon.id).eq("active", true).order("travel_fee"),
    db.from("opening_hours").select("*").eq("salon_id", salon.id),
    db.from("staff_services").select("staff_id, service_id, staff!inner(salon_id)").eq("staff.salon_id", salon.id),
    db.from("salon_photos").select("id, path, caption, position").eq("salon_id", salon.id).order("position").order("created_at"),
  ]);
  return {
    salon,
    staff: (staff.data ?? []) as Staff[],
    services: (services.data ?? []) as Service[],
    zones: (zones.data ?? []) as Zone[],
    hours: (hours.data ?? []) as OpeningHours[],
    skills: (skills.data ?? []) as { staff_id: string; service_id: string }[],
    photos: (photos.data ?? []) as SalonPhoto[],
  };
}

export type SalonContext = NonNullable<Awaited<ReturnType<typeof loadSalonContext>>>;

/** Stylists who can do this service (and travel, for home visits). */
export function candidateStaff(ctx: SalonContext, serviceId: string, home: boolean, staffId: string) {
  return ctx.staff.filter((s) => {
    if (staffId !== "any" && s.id !== staffId) return false;
    if (home && !s.does_home_visits) return false;
    const own = ctx.skills.filter((k) => k.staff_id === s.id);
    return own.length === 0 || own.some((k) => k.service_id === serviceId);
  });
}
