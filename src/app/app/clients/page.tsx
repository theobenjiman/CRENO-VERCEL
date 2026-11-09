import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/session";
import { addDays } from "@/lib/format";
import { sendWhatsApp } from "@/lib/whatsapp";
import { fcfa, firstName, initials, todayISO } from "@/lib/format";
import { PLANS } from "@/lib/plans";
import type { Client } from "@/lib/types";

type ListKey = "all" | "relancer" | "anniv" | "fideles";
type MsgType = "reminder" | "offer" | "greeting";

const LISTS: { key: ListKey; label: string }[] = [
  { key: "all", label: "Toutes" },
  { key: "relancer", label: "À relancer" },
  { key: "anniv", label: "Anniv." },
  { key: "fideles", label: "Fidèles" },
];

const TYPES: { key: MsgType; label: string; d: string }[] = [
  { key: "reminder", label: "Rappel", d: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" },
  { key: "offer", label: "Offre", d: "M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" },
  { key: "greeting", label: "Vœux", d: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" },
];

const TEMPLATES: Record<MsgType, string> = {
  reminder: "Bonjour {prénom}, ça fait un moment ! Vos clientes préférées vous attendent chez {salon}. Réservez votre prochain créneau ici : {lien}",
  offer: "Bonjour {prénom}, ce week-end -20 % sur la pose gel chez {salon}. Places limitées, réservez ici : {lien}",
  greeting: "Bonjour {prénom}, toute l'équipe de {salon} vous souhaite un joyeux anniversaire ! Un petit cadeau vous attend à votre prochaine visite : {lien}",
};

const DAY = 86400_000;

function inList(c: Client, list: ListKey, today: string): boolean {
  if (list === "all") return true;
  if (list === "fideles") return c.visits_count >= 5;
  if (list === "relancer") return !!c.last_visit_at && Date.now() - new Date(c.last_visit_at).getTime() > 35 * DAY;
  if (list === "anniv") {
    if (!c.birthday) return false;
    for (let i = 0; i < 7; i++) if (addDays(today, i).slice(5) === c.birthday.slice(5, 10)) return true;
  }
  return false;
}

function weeksAgo(iso: string | null) {
  if (!iso) return "jamais venue";
  const w = Math.floor((Date.now() - new Date(iso).getTime()) / (7 * DAY));
  return w === 0 ? "cette semaine" : `il y a ${w} sem.`;
}

async function sendCampaign(formData: FormData) {
  "use server";
  const { supabase, salon, plan, tz } = await requireOwner();
  const list = String(formData.get("list")) as ListKey;
  if (!plan.campaigns) redirect("/app/abonnement");
  const type = String(formData.get("type")) as MsgType;
  const template = String(formData.get("template") ?? "").trim().slice(0, 1000);
  if (!TEMPLATES[type] || template.length < 5) redirect(`/app/clients?list=${list}&type=${type}`);

  const { data } = await supabase.from("clients").select("*").eq("salon_id", salon.id).limit(2000);
  const targets = ((data ?? []) as Client[])
    .filter((c) => inList(c, list, todayISO(tz)))
    .filter((c) => type === "reminder" || c.marketing_opt_in);

  const { data: campaign } = await supabase.from("campaigns").insert({
    salon_id: salon.id, type, audience: list, template, sent_count: 0,
  }).select("id").single();

  const link = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/${salon.slug}`;
  let sent = 0;
  for (const c of targets) {
    const body = template.replaceAll("{prénom}", firstName(c.name)).replaceAll("{salon}", salon.name).replaceAll("{lien}", link);
    const res = await sendWhatsApp(c.phone, body);
    await supabase.from("messages").insert({
      salon_id: salon.id, client_id: c.id, campaign_id: campaign?.id ?? null, type, to_phone: c.phone, body,
      status: res.ok ? "sent" : "failed", sent_at: res.ok ? new Date().toISOString() : null, provider_ref: res.ref ?? null,
    });
    if (res.ok) sent++;
  }
  if (campaign) await supabase.from("campaigns").update({ sent_count: sent, sent_at: new Date().toISOString() }).eq("id", campaign.id);
  redirect(`/app/clients?list=${list}&type=${type}&sent=${sent}`);
}

type Props = { searchParams: Promise<{ list?: string; type?: string; q?: string; sent?: string }> };

export default async function ClientsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const list = (LISTS.some((l) => l.key === sp.list) ? sp.list : "relancer") as ListKey;
  const type = (TYPES.some((t) => t.key === sp.type) ? sp.type : "offer") as MsgType;
  const q = (sp.q ?? "").trim().toLowerCase();
  const { supabase, salon, plan, tz } = await requireOwner();
  const today = todayISO(tz);

  const { data } = await supabase.from("clients").select("*").eq("salon_id", salon.id)
    .order("last_visit_at", { ascending: true, nullsFirst: false }).limit(2000);
  const all = (data ?? []) as Client[];
  const counts = Object.fromEntries(LISTS.map((l) => [l.key, all.filter((c) => inList(c, l.key, today)).length]));
  const shown = all.filter((c) => inList(c, list, today)).filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q.replace(/\s/g, "")));
  const reachable = shown.filter((c) => type === "reminder" || c.marketing_opt_in).length;

  return (
    <div className="px-4 pt-5 flex flex-col gap-3">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-xs text-muted">{salon.name}</p>
          <h1 className="font-display font-extrabold text-2xl">Mes clientes</h1>
        </div>
        <span className="text-sm font-semibold text-muted">{all.length} au total</span>
      </header>

      <form className="flex gap-2">
        <input type="hidden" name="list" value={list} />
        <label className="flex-1"><span className="sr-only">Rechercher</span>
          <input className="input" type="search" name="q" defaultValue={sp.q} placeholder="Nom ou numéro" /></label>
      </form>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {LISTS.map((l) => (
          <Link key={l.key} href={`/app/clients?list=${l.key}&type=${type}`}
            className={`shrink-0 min-h-9 px-3 rounded-full text-sm flex items-center ${list === l.key ? "bg-ink text-white font-semibold" : "bg-white border border-line"}`}>
            {l.label} · {counts[l.key]}
          </Link>
        ))}
      </div>

      <form action={sendCampaign} className="card p-3 flex flex-col gap-3">
        <input type="hidden" name="list" value={list} />
        <input type="hidden" name="type" value={type} />
        <div className="grid grid-cols-3 gap-1.5">
          {TYPES.map((t) => (
            <Link key={t.key} href={`/app/clients?list=${list}&type=${t.key}`} aria-current={t.key === type ? "true" : undefined}
              className={`min-h-13 rounded-xl text-xs flex flex-col items-center justify-center gap-1 ${t.key === type ? "bg-rose text-white font-bold" : "bg-petal text-muted font-semibold"}`}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={t.d} /></svg>
              {t.label}
            </Link>
          ))}
        </div>
        <label className="label">Message (utilisez {"{prénom}"}, {"{salon}"}, {"{lien}"})
          <textarea key={type} name="template" rows={3} defaultValue={TEMPLATES[type]}
            className="input py-2 bg-[#E9F7EE] border-transparent text-[#1E3A2A] leading-snug" />
        </label>
        <p className="text-xs text-muted">
          Pour : {LISTS.find((l) => l.key === list)?.label} · <strong className="text-ink">{reachable} sur {shown.length}</strong>
          {type === "reminder" ? " recevront le rappel" : " ont accepté les messages"}
        </p>
        {!plan.campaigns && (
          <p className="text-xs rounded-xl bg-petal text-berry p-3">
            L&apos;envoi de messages aux clientes fait partie de l&apos;abonnement {PLANS.salon_plus.label}.{" "}
            <Link href="/app/abonnement" className="font-semibold underline">Voir les abonnements</Link>
          </p>
        )}
        {sp.sent && <p role="status" className="text-sm font-semibold text-berry">Envoyé à {sp.sent} cliente(s).</p>}
        <button className="btn-primary min-h-12" disabled={reachable === 0 || !plan.campaigns}>Envoyer sur WhatsApp · {reachable}</button>
      </form>

      <ul className="flex flex-col gap-2">
        {shown.slice(0, 200).map((c) => (
          <li key={c.id}>
            <Link href={`/app/clients/${c.id}`} className="card px-3 py-2.5 flex items-center gap-3">
              <span className="size-10 rounded-full bg-[#F9C9D8] text-berry grid place-items-center font-bold text-sm">{initials(c.name)}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold truncate">{c.name}{!c.marketing_opt_in && <span className="ml-1 text-[11px] text-muted font-normal">(pas d&apos;offres)</span>}</span>
                <span className="block text-xs text-muted">{c.visits_count} visite(s) · {fcfa(c.total_spent)}</span>
              </span>
              <span className={`text-xs font-semibold ${list === "relancer" ? "text-[#A3203F]" : "text-muted"}`}>{weeksAgo(c.last_visit_at)}</span>
            </Link>
          </li>
        ))}
        {shown.length === 0 && <li className="text-sm text-muted p-4 text-center">Aucune cliente dans cette liste.</li>}
      </ul>
    </div>
  );
}
