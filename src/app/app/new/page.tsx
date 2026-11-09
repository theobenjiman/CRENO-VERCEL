import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSalon } from "@/lib/session";
import { queueBookingMessages } from "@/lib/booking";
import { createAdminClient } from "@/lib/supabase/admin";
import { atMinutes, fcfa, localMinutes, minutesOfDay, normalizePhone, todayISO } from "@/lib/format";
import type { Service, Staff } from "@/lib/types";

type Props = { searchParams: Promise<{ d?: string; e?: string }> };

async function addWalkIn(formData: FormData) {
  "use server";
  const { supabase, salon, tz, isOwner, staffId } = await requireSalon();
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const date = get("date"), time = get("time");
  const phone = normalizePhone(get("phone"));
  const name = get("name") || "Cliente";
  const back = (e: string) => redirect(`/app/new?d=${date}&e=${e}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) back("time");
  if (!phone) back("phone");

  const { data: service } = await supabase.from("services").select("*").eq("id", get("service")).eq("salon_id", salon.id).single<Service>();
  if (!service) back("service");

  let { data: client } = await supabase.from("clients").select("id").eq("salon_id", salon.id).eq("phone", phone!).maybeSingle();
  if (!client) {
    const ins = await supabase.from("clients").insert({ salon_id: salon.id, phone, name }).select("id").single();
    client = ins.data;
  }
  if (!client) back("fail");

  const start = atMinutes(date, minutesOfDay(time), tz);
  const end = new Date(start.getTime() + service!.duration_min * 60_000);
  const { data: appt, error } = await supabase.from("appointments").insert({
    salon_id: salon.id, client_id: client!.id, staff_id: isOwner ? get("staff") : staffId, service_id: service!.id,
    start_at: start.toISOString(), end_at: end.toISOString(), block_start: start.toISOString(), block_end: end.toISOString(),
    status: "confirmed", source: get("source") === "phone" ? "phone" : "walk_in", location_type: "salon",
    price: service!.price, deposit_amount: 0,
  }).select("id").single();
  if (error) back(error.code === "23P01" ? "busy" : "fail");

  if (formData.get("notify") === "on") await queueBookingMessages(createAdminClient(), appt!.id);
  revalidatePath("/app");
  redirect(`/app?d=${date}`);
}

const ERR: Record<string, string> = {
  time: "Date ou heure invalide.",
  phone: "Numéro invalide. Exemple : 07 00 00 00 00",
  service: "Choisissez une prestation.",
  busy: "Cette coiffeuse est déjà occupée à cette heure.",
  fail: "Enregistrement impossible. Réessayez.",
};

export default async function NewAppointment({ searchParams }: Props) {
  const { d, e } = await searchParams;
  const { supabase, salon, tz, isOwner, staffId } = await requireSalon();
  const [{ data: services }, { data: staff }] = await Promise.all([
    supabase.from("services").select("*").eq("salon_id", salon.id).eq("active", true).order("name"),
    supabase.from("staff").select("*").eq("salon_id", salon.id).eq("active", true).order("created_at"),
  ]);
  const nowMin = localMinutes(new Date(), tz);
  const roundedTime = `${String(Math.floor(nowMin / 60)).padStart(2, "0")}:${nowMin % 60 < 30 ? "00" : "30"}`;

  return (
    <div className="px-4 pt-5 flex flex-col gap-4">
      <Link href="/app" className="text-sm text-rose font-semibold">‹ Agenda</Link>
      <h1 className="font-display font-bold text-2xl">Client sans RDV / par téléphone</h1>
      <form action={addWalkIn} className="card p-5 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="label">Téléphone<input className="input" name="phone" inputMode="tel" required placeholder="07 00 00 00 00" /></label>
          <label className="label">Prénom<input className="input" name="name" placeholder="Si nouvelle cliente" /></label>
        </div>
        <label className="label">Prestation
          <select className="input" name="service" required>
            {(services as Service[] ?? []).map((s) => <option key={s.id} value={s.id}>{s.name} — {fcfa(s.price)}</option>)}
          </select>
        </label>
        <label className="label">Coiffeuse
          <select className="input" name="staff" required>
            {(staff as Staff[] ?? []).filter((s) => isOwner || s.id === staffId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="label">Date<input className="input" type="date" name="date" defaultValue={d ?? todayISO(tz)} required /></label>
          <label className="label">Heure<input className="input" type="time" name="time" step={900} defaultValue={roundedTime} required /></label>
        </div>
        <fieldset className="flex gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name="source" value="walk_in" defaultChecked className="accent-rose" /> Sur place</label>
          <label className="flex items-center gap-2"><input type="radio" name="source" value="phone" className="accent-rose" /> Par téléphone</label>
        </fieldset>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify" className="accent-rose size-4" /> Envoyer la confirmation et les rappels WhatsApp</label>
        {e && <p role="alert" className="text-sm font-semibold text-[#A3203F]">{ERR[e] ?? ERR.fail}</p>}
        <button className="btn-primary">Ajouter à l&apos;agenda</button>
      </form>
    </div>
  );
}
