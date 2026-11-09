import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSalon } from "@/lib/session";
import { one } from "@/lib/booking";
import { dateLong, displayPhone, fcfa, hhmm, localDate } from "@/lib/format";
import type { Client } from "@/lib/types";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> };

async function saveClient(formData: FormData) {
  "use server";
  const { supabase, salon } = await requireSalon();
  const id = String(formData.get("id"));
  const optIn = formData.get("opt_in") === "on";
  const { data: prev } = await supabase.from("clients").select("marketing_opt_in").eq("id", id).eq("salon_id", salon.id).single();
  const birthday = String(formData.get("birthday") ?? "");
  await supabase.from("clients").update({
    name: String(formData.get("name") ?? "").trim() || "Cliente",
    notes: String(formData.get("notes") ?? "").trim() || null,
    birthday: /^\d{4}-\d{2}-\d{2}$/.test(birthday) ? birthday : null,
    marketing_opt_in: optIn,
    ...(optIn && !prev?.marketing_opt_in ? { opt_in_at: new Date().toISOString() } : {}),
  }).eq("id", id).eq("salon_id", salon.id);
  redirect(`/app/clients/${id}?saved=1`);
}

export default async function ClientPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { saved } = await searchParams;
  const { supabase, salon, tz } = await requireSalon();
  const { data: c } = await supabase.from("clients").select("*").eq("id", id).eq("salon_id", salon.id).maybeSingle<Client>();
  if (!c) notFound();
  const { data: history } = await supabase.from("appointments")
    .select("id, start_at, status, price, location_type, services(name), staff(name)")
    .eq("client_id", c.id).order("start_at", { ascending: false }).limit(20);

  return (
    <div className="px-4 pt-5 flex flex-col gap-4">
      <Link href="/app/clients" className="text-sm text-rose font-semibold">‹ Clientes</Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl">{c.name}</h1>
          <a className="text-sm text-rose font-semibold" href={`https://wa.me/${c.phone.replace("+", "")}`}>{displayPhone(c.phone)} · WhatsApp</a>
        </div>
        <Link href={`/app/new`} className="btn-ghost">+ RDV</Link>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Visites" value={String(c.visits_count)} />
        <Stat label="Dépensé" value={fcfa(c.total_spent)} />
        <Stat label="Absences" value={String(c.no_show_count)} />
      </div>
      <form action={saveClient} className="card p-5 flex flex-col gap-3">
        <input type="hidden" name="id" value={c.id} />
        <label className="label">Nom<input className="input" name="name" defaultValue={c.name} /></label>
        <label className="label">Anniversaire<input className="input" type="date" name="birthday" defaultValue={c.birthday ?? ""} /></label>
        <label className="label">Notes (ex. taille des tresses, allergies)<textarea className="input py-2" name="notes" rows={3} defaultValue={c.notes ?? ""} /></label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="opt_in" defaultChecked={c.marketing_opt_in} className="accent-rose size-4 mt-0.5" />
          <span>La cliente accepte de recevoir les offres et vœux sur WhatsApp</span>
        </label>
        {saved && <p role="status" className="text-sm font-semibold text-berry">Enregistré.</p>}
        <button className="btn-primary">Enregistrer</button>
      </form>
      <section className="flex flex-col gap-2">
        <h2 className="section-title">Historique</h2>
        {(history ?? []).map((h) => (
          <Link key={h.id} href={`/app/rdv/${h.id}`} className="card px-4 py-3 flex justify-between text-sm">
            <span>
              <span className="block font-semibold">{one(h.services)?.name}</span>
              <span className="block text-muted text-xs">{dateLong(localDate(h.start_at, tz))} · {hhmm(h.start_at, tz)} · {one(h.staff)?.name}{h.location_type === "home" ? " · domicile" : ""}</span>
            </span>
            <span className="text-muted text-xs">{h.status === "done" ? fcfa(h.price) : h.status === "no_show" ? "Absente" : h.status === "cancelled" ? "Annulé" : "À venir"}</span>
          </Link>
        ))}
        {(history ?? []).length === 0 && <p className="text-sm text-muted">Pas encore de rendez-vous.</p>}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="card py-3"><div className="font-bold">{value}</div><div className="text-xs text-muted">{label}</div></div>;
}
