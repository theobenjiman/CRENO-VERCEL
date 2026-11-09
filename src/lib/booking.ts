import { createAdminClient } from "./supabase/admin";
import { sendWhatsApp } from "./whatsapp";
import { addDays, atMinutes, dateLong, firstName, hhmm, fcfa, localDate } from "./format";
import { effectivePlan, planPrice, PLANS } from "./plans";
import type { PayMethod, PlanId } from "./types";

type Admin = ReturnType<typeof createAdminClient>;

export const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
export const manageUrl = (token: string) => `${appUrl()}/r/${token}`;

/** Free slots held by unpaid bookings whose 10-minute hold ran out. */
export async function releaseExpiredHolds(db: Admin, salonId?: string) {
  let q = db.from("appointments").update({ status: "cancelled" })
    .eq("status", "pending_payment").lt("hold_expires_at", new Date().toISOString());
  if (salonId) q = q.eq("salon_id", salonId);
  await q;
}

/** Called by the payment stub and by the real provider webhook. Idempotent. */
export async function confirmDeposit(appointmentId: string, method: PayMethod, providerRef: string) {
  const db = createAdminClient();
  const { data: appt } = await db
    .from("appointments").select("id, salon_id, status, deposit_amount").eq("id", appointmentId).single();
  if (!appt) throw new Error("Rendez-vous introuvable");
  if (appt.status === "confirmed") return appt;
  if (appt.status !== "pending_payment") throw new Error("Ce créneau n'est plus réservé. Merci de recommencer.");

  await db.from("payments").insert({
    salon_id: appt.salon_id, appointment_id: appt.id, amount: appt.deposit_amount, method,
    type: "deposit", provider_ref: providerRef, status: "paid", paid_at: new Date().toISOString(),
  });
  await db.from("appointments").update({ status: "confirmed", hold_expires_at: null }).eq("id", appt.id);
  await queueBookingMessages(db, appt.id);
  return appt;
}

/**
 * Confirmation now (every plan) + reminders the day before at 18:00 and 2h
 * before (paid plans). `kind` = "new" or "moved" (after a reschedule).
 */
export async function queueBookingMessages(db: Admin, appointmentId: string, kind: "new" | "moved" = "new") {
  const { data: a } = await db
    .from("appointments")
    .select("id, salon_id, client_id, start_at, deposit_amount, price, travel_fee, location_type, landmark, manage_token, salons(name, slug, address, timezone, plan, plan_expires_at), clients(name, phone), services(name), staff(name), service_zones(name)")
    .eq("id", appointmentId)
    .single();
  if (!a) return;
  const salon = one(a.salons), client = one(a.clients), service = one(a.services), staff = one(a.staff), zone = one(a.service_zones);
  if (!salon || !client || !service) return;
  const tz = salon.timezone;
  const plan = effectivePlan(salon);

  const localDay = localDate(a.start_at, tz);
  const time = hhmm(a.start_at, tz);
  const where = a.location_type === "home"
    ? `à domicile (${zone?.name ?? ""}${a.landmark ? `, ${a.landmark}` : ""})`
    : `au salon${salon.address ? ` (${salon.address})` : ""}`;
  const rest = a.price + a.travel_fee - a.deposit_amount;
  const hi = `Bonjour ${firstName(client.name)}`;

  const confirmation =
    `${hi}, votre rendez-vous chez ${salon.name} est ${kind === "moved" ? "déplacé" : "confirmé"} ✅\n` +
    `${service.name}${staff ? ` avec ${staff.name}` : ""}\n${dateLong(localDay)} à ${time}, ${where}.\n` +
    (a.deposit_amount > 0 ? `Acompte reçu : ${fcfa(a.deposit_amount)}. Reste à régler : ${fcfa(rest)}.\n` : "") +
    `Déplacer ou annuler : ${manageUrl(a.manage_token)}`;

  const rows: { type: string; body: string; scheduled_at: Date }[] = [
    { type: "confirmation", body: confirmation, scheduled_at: new Date() },
  ];
  if (plan.reminders) {
    rows.push(
      { type: "reminder_day", body: `${hi}, petit rappel : demain à ${time}, ${service.name} chez ${salon.name}. À demain !\nBesoin de changer ? ${manageUrl(a.manage_token)}`, scheduled_at: atMinutes(addDays(localDay, -1), 18 * 60, tz) },
      { type: "reminder_2h", body: `${hi}, on vous attend à ${time} chez ${salon.name} 💗`, scheduled_at: new Date(new Date(a.start_at).getTime() - 2 * 3600_000) },
    );
  }

  for (const r of rows) {
    const isNow = r.type === "confirmation";
    if (!isNow && r.scheduled_at.getTime() < Date.now()) continue;
    const res = isNow ? await sendWhatsApp(client.phone, r.body) : null;
    await db.from("messages").insert({
      salon_id: a.salon_id, client_id: a.client_id, appointment_id: a.id, type: r.type, to_phone: client.phone, body: r.body,
      scheduled_at: r.scheduled_at.toISOString(),
      status: isNow ? (res?.ok ? "sent" : "failed") : "scheduled",
      sent_at: isNow && res?.ok ? new Date().toISOString() : null,
      provider_ref: res?.ref ?? null,
    });
  }
}

export async function cancelScheduledMessages(db: Admin, appointmentId: string) {
  await db.from("messages").update({ status: "cancelled" }).eq("appointment_id", appointmentId).eq("status", "scheduled");
}

/** Records a Créno subscription payment and extends the salon's plan. Idempotent per providerRef. */
export async function confirmSubscription(input: {
  salonId: string; plan: Exclude<PlanId, "free">; period: "month" | "year"; method: Exclude<PayMethod, "cash">; providerRef: string;
}) {
  const db = createAdminClient();
  const { data: existing } = await db.from("subscription_payments").select("id").eq("provider_ref", input.providerRef).maybeSingle();
  if (existing) return;
  const { data: salon } = await db.from("salons").select("plan, plan_expires_at").eq("id", input.salonId).single();
  if (!salon) throw new Error("Salon introuvable");
  const now = Date.now();
  const current = salon.plan_expires_at ? new Date(salon.plan_expires_at).getTime() : 0;
  // Same plan: extend from the current end date. Changing plan: start from now.
  const base = salon.plan === input.plan && current > now ? current : now;
  const end = new Date(base + (input.period === "year" ? 365 : 30) * 86400_000);
  await db.from("subscription_payments").insert({
    salon_id: input.salonId, plan: input.plan, period: input.period, amount: planPrice(input.plan, input.period),
    method: input.method, provider_ref: input.providerRef, status: "paid", period_end: end.toISOString(), paid_at: new Date().toISOString(),
  });
  await db.from("salons").update({ plan: input.plan, plan_expires_at: end.toISOString() }).eq("id", input.salonId);
  return { plan: PLANS[input.plan], end };
}

/** Supabase returns to-one joins as object or array depending on FK shape. */
export function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}
