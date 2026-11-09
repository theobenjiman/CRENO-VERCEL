import { createAdminClient } from "./supabase/admin";
import { computeSlots, type Slot } from "./slots";
import { addDays, dayRange } from "./format";
import { releaseExpiredHolds } from "./booking";
import { candidateStaff, type SalonContext } from "./salon-context";

export interface SlotQuery {
  serviceId: string;
  staffId: string; // "any" or a staff id
  date: string;    // YYYY-MM-DD, salon-local
  mode: "salon" | "home";
  zoneId?: string | null;
  excludeAppointmentId?: string; // when rescheduling
}

export async function slotsFor(ctx: SalonContext, q: SlotQuery): Promise<Slot[]> {
  const service = ctx.services.find((s) => s.id === q.serviceId);
  if (!service) return [];
  const home = q.mode === "home";
  if (home && (!ctx.salon.home_service_enabled || !service.home_available)) return [];
  const zone = home ? ctx.zones.find((z) => z.id === q.zoneId) ?? null : null;
  if (home && !zone) return [];
  const staff = candidateStaff(ctx, service.id, home, q.staffId);
  const tz = ctx.salon.timezone;

  const db = createAdminClient();
  await releaseExpiredHolds(db, ctx.salon.id);
  const from = dayRange(addDays(q.date, -1), tz)[0];
  const to = dayRange(addDays(q.date, 1), tz)[1];
  let busyQ = db
    .from("appointments")
    .select("staff_id, block_start, block_end")
    .eq("salon_id", ctx.salon.id)
    .in("status", ["pending_payment", "confirmed", "done"])
    .lt("block_start", to)
    .gt("block_end", from);
  if (q.excludeAppointmentId) busyQ = busyQ.neq("id", q.excludeAppointmentId);
  const [{ data: busy }, { data: off }] = await Promise.all([
    busyQ,
    db.from("staff_time_off").select("staff_id, start_at, end_at").eq("salon_id", ctx.salon.id).lt("start_at", to).gt("end_at", from),
  ]);

  return computeSlots({
    date: q.date,
    hours: ctx.hours,
    service,
    staff,
    zone,
    tz,
    busy: [
      ...(busy ?? []),
      ...(off ?? []).map((o) => ({ staff_id: o.staff_id, block_start: o.start_at, block_end: o.end_at })),
    ],
  });
}

/** Online bookings created this calendar month (for the free plan limit). */
export async function onlineBookingsThisMonth(salonId: string, tz: string) {
  const db = createAdminClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const monthStart = dayRange(`${today.slice(0, 7)}-01`, tz)[0];
  const { count } = await db.from("appointments").select("id", { count: "exact", head: true })
    .eq("salon_id", salonId).eq("source", "online").neq("status", "cancelled").gte("created_at", monthStart);
  return count ?? 0;
}
