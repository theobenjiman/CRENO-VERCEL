import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSalon } from "@/lib/session";
import { one } from "@/lib/booking";
import { addDays, atMinutes, dateLong, displayPhone, fcfa, hhmm, localDate, METHOD_LABEL } from "@/lib/format";

type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  const { supabase, salon, isOwner, staffId, tz, plan } = await requireSalon();
  const { data: row } = await supabase
    .from("appointments")
    .select("*, clients(id, name, phone, visits_count, total_spent, no_show_count, last_visit_at), services(name, rebook_after_days), staff(name), service_zones(name)")
    .eq("id", id).eq("salon_id", salon.id).maybeSingle();
  const a = row && (isOwner || row.staff_id === staffId) ? row : null;
  return { supabase, salon, a, tz, plan };
}

async function markDone(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const { supabase, salon, a, tz, plan } = await load(id);
  if (!a || !["confirmed", "pending_payment"].includes(a.status)) redirect(`/app/rdv/${id}`);
  const amount = Math.max(0, Math.round(Number(formData.get("amount") ?? 0)));
  const method = String(formData.get("method") ?? "cash");
  const client = one(a.clients)!, service = one(a.services);

  await supabase.from("appointments").update({ status: "done", balance_paid: amount, hold_expires_at: null }).eq("id", id);
  if (amount > 0) {
    await supabase.from("payments").insert({
      salon_id: salon.id, appointment_id: id, amount, method, type: "balance", status: "paid", paid_at: new Date().toISOString(),
    });
  }
  await supabase.from("clients").update({
    visits_count: client.visits_count + 1,
    total_spent: client.total_spent + (a.status === "confirmed" ? a.deposit_amount : 0) + amount,
    last_visit_at: a.start_at,
  }).eq("id", client.id);

  if (service?.rebook_after_days && plan.reminders) {
    const when = atMinutes(addDays(localDate(a.start_at, tz), service.rebook_after_days), 10 * 60, tz);
    await supabase.from("messages").insert({
      salon_id: salon.id, client_id: client.id, appointment_id: null, type: "rebook", to_phone: client.phone,
      body: `Bonjour ${client.name.split(" ")[0]}, c'est peut-être le moment de refaire votre ${service.name} chez ${salon.name} ? Réservez ici : ${process.env.NEXT_PUBLIC_APP_URL ?? ""}/${salon.slug}`,
      scheduled_at: when.toISOString(),
    });
  }
  revalidatePath("/app");
  redirect(`/app?d=${localDate(a.start_at, tz)}`);
}

async function setStatus(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!["no_show", "cancelled"].includes(status)) return;
  const { supabase, a, tz } = await load(id);
  if (!a) return;
  await supabase.from("appointments").update({
    status, ...(status === "cancelled" ? { cancelled_by: "salon", cancelled_at: new Date().toISOString() } : {}),
  }).eq("id", id);
  await supabase.from("messages").update({ status: "cancelled" }).eq("appointment_id", id).eq("status", "scheduled");
  if (status === "no_show") {
    const c = one(a.clients)!;
    await supabase.from("clients").update({ no_show_count: c.no_show_count + 1 }).eq("id", c.id);
  }
  revalidatePath("/app");
  redirect(`/app?d=${localDate(a.start_at, tz)}`);
}

export default async function AppointmentPage({ params }: Props) {
  const { id } = await params;
  const { a, tz } = await load(id);
  if (!a) notFound();
  const client = one(a.clients)!, service = one(a.services), staff = one(a.staff), zone = one(a.service_zones);
  const rest = a.price + a.travel_fee - a.deposit_amount;
  const active = a.status === "confirmed" || a.status === "pending_payment";
  const STATUS: Record<string, string> = {
    pending_payment: "En attente d'acompte", confirmed: "Confirmé", done: "Terminé", no_show: "Absente", cancelled: "Annulé",
  };

  return (
    <div className="px-4 pt-5 flex flex-col gap-4">
      <Link href={`/app?d=${localDate(a.start_at, tz)}`} className="text-sm text-rose font-semibold">‹ Agenda</Link>
      <div className="card p-5 flex flex-col gap-2">
        <span className="self-start text-xs font-semibold px-2 py-1 rounded-lg bg-petal text-berry">{STATUS[a.status]}</span>
        <h1 className="font-display font-bold text-2xl">{client.name}</h1>
        <a className="text-sm text-rose font-semibold" href={`https://wa.me/${client.phone.replace("+", "")}`}>{displayPhone(client.phone)} · WhatsApp</a>
        <p className="text-sm">
          <strong>{service?.name}</strong> avec {staff?.name}<br />
          {dateLong(localDate(a.start_at, tz))}, {hhmm(a.start_at, tz)}–{hhmm(a.end_at, tz)}<br />
          {a.location_type === "home" ? `À domicile · ${zone?.name}${a.landmark ? ` — ${a.landmark}` : ""}` : "Au salon"}
          {a.geo_lat && <> · <a className="text-rose" href={`https://maps.google.com/?q=${a.geo_lat},${a.geo_lng}`}>Voir sur la carte</a></>}
        </p>
        <div className="text-sm text-muted grid grid-cols-2 gap-1 mt-1">
          <span>Prix</span><span className="text-ink text-right">{fcfa(a.price)}</span>
          {a.travel_fee > 0 && <><span>Déplacement</span><span className="text-ink text-right">{fcfa(a.travel_fee)}</span></>}
          <span>Acompte payé</span><span className="text-ink text-right">{fcfa(a.status === "pending_payment" ? 0 : a.deposit_amount)}</span>
          <span className="font-bold text-ink">Reste</span><span className="text-ink text-right font-bold">{fcfa(rest)}</span>
        </div>
        <p className="text-xs text-muted">{client.visits_count} visite(s) · {fcfa(client.total_spent)} dépensés{client.no_show_count ? ` · ${client.no_show_count} absence(s)` : ""}</p>
      </div>

      {active && (
        <>
          <form action={markDone} className="card p-5 flex flex-col gap-3">
            <h2 className="section-title">Encaisser et terminer</h2>
            <input type="hidden" name="id" value={a.id} />
            <div className="grid grid-cols-2 gap-2">
              <label className="label">Montant reçu (F)<input className="input" name="amount" type="number" min={0} step={100} defaultValue={rest} /></label>
              <label className="label">Moyen
                <select className="input" name="method" defaultValue="cash">
                  {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            </div>
            <button className="btn-primary">Marquer comme terminé</button>
          </form>
          <div className="grid grid-cols-2 gap-2">
            <form action={setStatus}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="status" value="no_show" />
              <button className="btn-ghost w-full text-[#A3203F]">Absente</button></form>
            <form action={setStatus}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="status" value="cancelled" />
              <button className="btn-ghost w-full">Annuler le RDV</button></form>
          </div>
          {a.status === "confirmed" && a.deposit_amount > 0 && (
            <p className="text-xs text-muted">Absente : l&apos;acompte reste acquis au salon. Annulation : remboursez si besoin depuis votre compte mobile money.</p>
          )}
        </>
      )}
    </div>
  );
}
