"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { cancelScheduledMessages, one, queueBookingMessages } from "@/lib/booking";
import { slotsFor } from "@/lib/availability";
import { loadSalonContext } from "@/lib/salon-context";
import { sendWhatsApp } from "@/lib/whatsapp";
import { dateLong, hhmm, localDate } from "@/lib/format";
import type { Slot } from "@/lib/slots";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadByToken(token: string) {
  if (!UUID.test(token)) return null;
  const db = createAdminClient();
  const { data: a } = await db
    .from("appointments")
    .select("id, salon_id, service_id, staff_id, zone_id, status, start_at, end_at, location_type, landmark, price, travel_fee, deposit_amount, manage_token, salons(id, slug, name, phone, address, timezone, cancel_notice_hours), services(name, duration_min), staff(name), clients(name, phone), service_zones(name, travel_minutes)")
    .eq("manage_token", token)
    .maybeSingle();
  if (!a) return null;
  const salon = one(a.salons)!;
  const hoursLeft = (new Date(a.start_at).getTime() - Date.now()) / 3600_000;
  return {
    a,
    salon,
    service: one(a.services),
    staff: one(a.staff),
    client: one(a.clients),
    zone: one(a.service_zones),
    upcoming: a.status === "confirmed" && hoursLeft > 0,
    canChange: a.status === "confirmed" && hoursLeft >= salon.cancel_notice_hours,
  };
}

export async function getRescheduleSlots(token: string, date: string): Promise<Slot[]> {
  const r = await loadByToken(token);
  if (!r?.canChange) return [];
  const ctx = await loadSalonContext(r.salon.slug);
  if (!ctx) return [];
  return slotsFor(ctx, {
    serviceId: r.a.service_id, staffId: "any", date,
    mode: r.a.location_type as "salon" | "home", zoneId: r.a.zone_id, excludeAppointmentId: r.a.id,
  });
}

async function notifySalon(phone: string | null, body: string) {
  if (phone) await sendWhatsApp(phone, body);
}

export async function reschedule(token: string, start: string, date: string): Promise<{ error?: string; ok?: boolean }> {
  const r = await loadByToken(token);
  if (!r) return { error: "Rendez-vous introuvable." };
  if (!r.canChange) return { error: `Ce rendez-vous ne peut plus être déplacé en ligne (moins de ${r.salon.cancel_notice_hours} h avant). Contactez le salon.` };
  const slots = await getRescheduleSlots(token, date);
  const slot = slots.find((s) => s.start === start);
  if (!slot) return { error: "Ce créneau n'est plus disponible." };

  const travel = r.zone?.travel_minutes ?? 0;
  const s = new Date(slot.start);
  const e = new Date(s.getTime() + (r.service?.duration_min ?? 60) * 60_000);
  const db = createAdminClient();
  const old = r.a.start_at;
  const { error } = await db.from("appointments").update({
    start_at: s.toISOString(), end_at: e.toISOString(), staff_id: slot.staffId,
    block_start: new Date(s.getTime() - travel * 60_000).toISOString(),
    block_end: new Date(e.getTime() + travel * 60_000).toISOString(),
  }).eq("id", r.a.id).eq("status", "confirmed");
  if (error) return { error: error.code === "23P01" ? "Ce créneau vient d'être pris." : "Le changement a échoué." };

  await cancelScheduledMessages(db, r.a.id);
  await queueBookingMessages(db, r.a.id, "moved");
  const tz = r.salon.timezone;
  await notifySalon(r.salon.phone,
    `Créno : ${r.client?.name} a déplacé son RDV (${r.service?.name}) du ${dateLong(localDate(old, tz))} ${hhmm(old, tz)} au ${dateLong(localDate(s, tz))} ${hhmm(s, tz)}.`);
  return { ok: true };
}

export async function cancelByClient(token: string): Promise<{ error?: string; ok?: boolean }> {
  const r = await loadByToken(token);
  if (!r?.upcoming) return { error: "Ce rendez-vous ne peut plus être annulé." };
  const db = createAdminClient();
  await db.from("appointments").update({
    status: "cancelled", cancelled_by: "client", cancelled_at: new Date().toISOString(),
  }).eq("id", r.a.id).eq("status", "confirmed");
  await cancelScheduledMessages(db, r.a.id);
  const tz = r.salon.timezone;
  const late = !r.canChange;
  await notifySalon(r.salon.phone,
    `Créno : ${r.client?.name} a annulé son RDV (${r.service?.name}) du ${dateLong(localDate(r.a.start_at, tz))} à ${hhmm(r.a.start_at, tz)}.` +
    (r.a.deposit_amount > 0 ? (late ? " Annulation tardive : acompte conservé." : " Annulation dans les délais : acompte à rembourser ou à garder en avoir.") : ""));
  return { ok: true };
}
