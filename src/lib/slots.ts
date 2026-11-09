import { atMinutes, minutesOfDay, weekday } from "./format";
import type { OpeningHours, Service, Staff, Zone } from "./types";

export interface BusyRange { staff_id: string; block_start: string; block_end: string }

export interface Slot {
  start: string;       // ISO, appointment start (arrival time for home visits)
  label: string;       // "09:30" or "08:00–09:00" for home windows
  staffId: string;     // stylist assigned if the client picked "any"
}

const STEP_MIN = 30;
const HOME_WINDOW_MIN = 60;

/**
 * Free start times for one service on one day.
 * Salon: every 30 min where the stylist is free for the whole service.
 * Home: hourly arrival windows; the stylist is blocked for travel before and after.
 */
export function computeSlots(opts: {
  date: string;
  hours: OpeningHours[];
  service: Service;
  staff: Staff[];               // candidates already filtered (skills, home visits)
  busy: BusyRange[];
  zone?: Zone | null;
  now?: Date;
  tz?: string;
}): Slot[] {
  const { date, hours, service, staff, busy, zone } = opts;
  const now = opts.now ?? new Date();
  const h = hours.find((x) => x.weekday === weekday(date));
  if (!h?.open_time || !h.close_time || staff.length === 0) return [];

  const open = minutesOfDay(h.open_time);
  const close = minutesOfDay(h.close_time);
  const travel = zone ? zone.travel_minutes : 0;
  const step = zone ? HOME_WINDOW_MIN : STEP_MIN;
  const minLead = new Date(now.getTime() + 60 * 60 * 1000); // book at least 1h ahead

  const busyByStaff = new Map<string, { s: number; e: number }[]>();
  for (const b of busy) {
    const list = busyByStaff.get(b.staff_id) ?? [];
    list.push({ s: new Date(b.block_start).getTime(), e: new Date(b.block_end).getTime() });
    busyByStaff.set(b.staff_id, list);
  }

  const slots: Slot[] = [];
  for (let m = open; m + service.duration_min <= close; m += step) {
    const start = atMinutes(date, m, opts.tz);
    if (start < minLead) continue;
    const blockS = start.getTime() - travel * 60_000;
    const blockE = start.getTime() + (service.duration_min + travel) * 60_000;
    const free = staff.find((st) =>
      !(busyByStaff.get(st.id) ?? []).some((r) => r.s < blockE && r.e > blockS),
    );
    if (!free) continue;
    const label = zone
      ? `${fmt(m)}–${fmt(m + HOME_WINDOW_MIN)}`
      : fmt(m);
    slots.push({ start: start.toISOString(), label, staffId: free.id });
  }
  return slots;
}

function fmt(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function depositFor(service: Service, zone?: Zone | null, homeDefault?: number | null): number {
  if (zone) {
    if (zone.deposit_override != null) return zone.deposit_override;
    if (homeDefault != null) return homeDefault;
  }
  if (service.deposit_type === "fixed") return service.deposit_value;
  if (service.deposit_type === "percent") return Math.round((service.price * service.deposit_value) / 100 / 100) * 100;
  return 0;
}
