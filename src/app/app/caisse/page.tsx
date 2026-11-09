import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/session";
import { one } from "@/lib/booking";
import { sendWhatsApp } from "@/lib/whatsapp";
import { addDays, dateLong, dayRange, fcfa, todayISO, METHOD_LABEL } from "@/lib/format";

type Props = { searchParams: Promise<{ d?: string; sent?: string }> };

async function loadDay(date: string) {
  const { supabase, salon, tz, plan } = await requireOwner();
  const [from, to] = dayRange(date, tz);
  const [{ data: pays }, { data: appts }] = await Promise.all([
    supabase.from("payments").select("amount, method, type, appointments(staff(name))").eq("salon_id", salon.id).eq("status", "paid")
      .gte("paid_at", from).lt("paid_at", to),
    supabase.from("appointments").select("status").eq("salon_id", salon.id)
      .gte("start_at", from).lt("start_at", to),
  ]);
  const p = pays ?? [];
  const sign = (x: { type: string; amount: number }) => (x.type === "refund" ? -x.amount : x.amount);
  const total = p.reduce((s, x) => s + sign(x), 0);
  const byMethod: Record<string, number> = {};
  const byStaff: Record<string, number> = {};
  let deposits = 0, balances = 0;
  for (const x of p) {
    byMethod[x.method] = (byMethod[x.method] ?? 0) + sign(x);
    const staffName = one(one(x.appointments)?.staff)?.name ?? "Autre";
    byStaff[staffName] = (byStaff[staffName] ?? 0) + sign(x);
    if (x.type === "deposit") deposits += x.amount;
    if (x.type === "balance") balances += x.amount;
  }
  const a = appts ?? [];
  return {
    salon, plan, tz, total, byMethod, byStaff, deposits, balances,
    done: a.filter((x) => x.status === "done").length,
    noShow: a.filter((x) => x.status === "no_show").length,
  };
}

async function sendSummary(formData: FormData) {
  "use server";
  const date = String(formData.get("d"));
  const s = await loadDay(date);
  if (!s.plan.cashSummary) redirect("/app/abonnement");
  if (!s.salon.phone) redirect(`/app/caisse?d=${date}&sent=nophone`);
  const lines = [
    `Caisse ${s.salon.name} — ${dateLong(date)}`,
    `Total : ${fcfa(s.total)}`,
    ...Object.entries(s.byMethod).map(([m, v]) => `• ${METHOD_LABEL[m] ?? m} : ${fcfa(v)}`),
    `Prestations terminées : ${s.done} · Absentes : ${s.noShow}`,
  ];
  const res = await sendWhatsApp(s.salon.phone!, lines.join("\n"));
  redirect(`/app/caisse?d=${date}&sent=${res.ok ? "1" : "fail"}`);
}

export default async function CashPage({ searchParams }: Props) {
  const { d, sent } = await searchParams;
  const { tz } = await requireOwner();
  const date = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayISO(tz);
  const s = await loadDay(date);

  return (
    <div className="px-4 pt-5 flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted">Caisse</p>
          <h1 className="font-display font-extrabold text-2xl">{dateLong(date)}</h1>
        </div>
        <div className="flex gap-2">
          <Link aria-label="Jour précédent" href={`/app/caisse?d=${addDays(date, -1)}`} className="size-11 rounded-full bg-white border border-line grid place-items-center">‹</Link>
          <Link aria-label="Jour suivant" href={`/app/caisse?d=${addDays(date, 1)}`} className="size-11 rounded-full bg-white border border-line grid place-items-center">›</Link>
        </div>
      </header>
      <section className="rounded-2xl bg-berry text-white p-5">
        <p className="text-sm opacity-90">Total encaissé</p>
        <p className="font-display font-extrabold text-4xl">{fcfa(s.total)}</p>
        <p className="text-sm opacity-90 mt-1">Acomptes {fcfa(s.deposits)} · Soldes {fcfa(s.balances)}</p>
      </section>
      <div className="grid grid-cols-2 gap-3">
        <Table title="Par moyen" rows={Object.entries(s.byMethod).map(([k, v]) => [METHOD_LABEL[k] ?? k, fcfa(v)])} />
        <Table title="Par coiffeuse" rows={Object.entries(s.byStaff).map(([k, v]) => [k, fcfa(v)])} />
      </div>
      <p className="text-sm text-muted">{s.done} prestation(s) terminée(s) · {s.noShow} absente(s)</p>
      <form action={sendSummary}>
        <input type="hidden" name="d" value={date} />
        <button className="btn-primary w-full" disabled={!s.plan.cashSummary}>Recevoir ce résumé sur WhatsApp</button>
        {!s.plan.cashSummary && <p className="text-xs text-muted mt-2">Disponible avec l&apos;abonnement Pro. <Link href="/app/abonnement" className="text-rose font-semibold">Voir</Link></p>}
      </form>
      {sent === "1" && <p role="status" className="text-sm font-semibold text-berry">Résumé envoyé au WhatsApp du salon.</p>}
      {sent === "nophone" && <p role="alert" className="text-sm font-semibold text-[#A3203F]">Ajoutez le WhatsApp du salon dans Réglages.</p>}
    </div>
  );
}

function Table({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div className="card p-4 flex flex-col gap-2">
      <h2 className="section-title">{title}</h2>
      {rows.length === 0 && <p className="text-sm text-muted">Rien encore.</p>}
      {rows.map(([k, v]) => <div key={k} className="flex justify-between text-sm"><span>{k}</span><span className="font-semibold">{v}</span></div>)}
    </div>
  );
}
