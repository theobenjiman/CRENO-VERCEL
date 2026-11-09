"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { depositFor, type Slot } from "@/lib/slots";
import { normalizePhone } from "@/lib/format";
import { queueBookingMessages } from "@/lib/booking";
import { startCheckout } from "@/lib/payments";
import { onlineBookingsThisMonth, slotsFor, type SlotQuery } from "@/lib/availability";
import { effectivePlan } from "@/lib/plans";
import { loadSalonContext } from "@/lib/salon-context";

type PublicSlotQuery = Omit<SlotQuery, "excludeAppointmentId"> & { slug: string };

export async function getSlots(q: PublicSlotQuery): Promise<Slot[]> {
  const ctx = await loadSalonContext(q.slug);
  if (!ctx) return [];
  return slotsFor(ctx, q);
}

export async function createBooking(input: PublicSlotQuery & {
  start: string;
  name: string;
  phone: string;
  landmark?: string;
  geo?: { lat: number; lng: number } | null;
}): Promise<{ error?: string; redirectUrl?: string }> {
  const ctx = await loadSalonContext(input.slug);
  if (!ctx) return { error: "Salon introuvable." };
  const plan = effectivePlan(ctx.salon);

  const name = input.name.trim().slice(0, 80);
  const phone = normalizePhone(input.phone);
  if (name.length < 2) return { error: "Merci d'indiquer votre prénom." };
  if (!phone) return { error: "Numéro invalide. Exemple : 07 00 00 00 00" };

  if (Number.isFinite(plan.monthlyOnlineBookings) &&
      (await onlineBookingsThisMonth(ctx.salon.id, ctx.salon.timezone)) >= plan.monthlyOnlineBookings) {
    return { error: "Les réservations en ligne de ce salon sont complètes ce mois-ci. Contactez le salon sur WhatsApp." };
  }

  const slots = await slotsFor(ctx, input);
  const slot = slots.find((s) => s.start === input.start);
  if (!slot) return { error: "Ce créneau n'est plus disponible. Choisissez-en un autre." };

  const service = ctx.services.find((s) => s.id === input.serviceId)!;
  const home = input.mode === "home";
  const zone = home ? ctx.zones.find((z) => z.id === input.zoneId)! : null;
  const travel = zone?.travel_minutes ?? 0;
  const deposit = plan.deposits ? depositFor(service, zone, ctx.salon.home_deposit_default) : 0;

  const db = createAdminClient();
  let { data: client } = await db.from("clients").select("id").eq("salon_id", ctx.salon.id).eq("phone", phone).maybeSingle();
  if (!client) {
    const ins = await db.from("clients").insert({ salon_id: ctx.salon.id, phone, name }).select("id").single();
    if (ins.error) return { error: "Impossible d'enregistrer vos informations. Réessayez." };
    client = ins.data;
  }

  const start = new Date(slot.start);
  const end = new Date(start.getTime() + service.duration_min * 60_000);
  const { data: appt, error } = await db.from("appointments").insert({
    salon_id: ctx.salon.id,
    client_id: client.id,
    staff_id: slot.staffId,
    service_id: service.id,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    block_start: new Date(start.getTime() - travel * 60_000).toISOString(),
    block_end: new Date(end.getTime() + travel * 60_000).toISOString(),
    status: deposit > 0 ? "pending_payment" : "confirmed",
    hold_expires_at: deposit > 0 ? new Date(Date.now() + 10 * 60_000).toISOString() : null,
    source: "online",
    location_type: home ? "home" : "salon",
    zone_id: zone?.id ?? null,
    landmark: home ? input.landmark?.trim().slice(0, 200) || null : null,
    geo_lat: home ? input.geo?.lat ?? null : null,
    geo_lng: home ? input.geo?.lng ?? null : null,
    price: service.price,
    travel_fee: zone?.travel_fee ?? 0,
    deposit_amount: deposit,
  }).select("id").single();

  if (error) {
    if (error.code === "23P01") return { error: "Ce créneau vient d'être réservé. Choisissez-en un autre." };
    return { error: "La réservation a échoué. Réessayez." };
  }

  if (deposit === 0) {
    await queueBookingMessages(db, appt.id);
    return { redirectUrl: `/${ctx.salon.slug}/ok/${appt.id}` };
  }
  const { redirectUrl } = await startCheckout({
    kind: "deposit",
    appointmentId: appt.id,
    salonSlug: ctx.salon.slug,
    amount: deposit,
    clientPhone: phone,
    description: `Acompte ${service.name} — ${ctx.salon.name}`,
  });
  return { redirectUrl };
}
