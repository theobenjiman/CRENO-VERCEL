import Link from "next/link";
import { requireSalon } from "@/lib/session";
import { one } from "@/lib/booking";
import { addDays, dateLong, dayRange, fcfa, hhmm, localMinutes, minutesOfDay, todayISO, weekday, METHOD_LABEL } from "@/lib/format";
import { signOut } from "./settings/actions";
import type { Staff } from "@/lib/types";

const HOUR_PX = 64;

type Props = { searchParams: Promise<{ d?: string }> };

export default async function DayView({ searchParams }: Props) {
  const { d } = await searchParams;
  const { supabase, salon, isOwner, staffId, tz } = await requireSalon();
  const date = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayISO(tz);
  const [from, to] = dayRange(date, tz);

  const [{ data: staffRows }, { data: appts }, { data: pays }, { data: hours }] = await Promise.all([
    supabase.from("staff").select("*").eq("salon_id", salon.id).eq("active", true).order("created_at"),
    supabase.from("appointments")
      .select("id, staff_id, start_at, end_at, status, location_type, deposit_amount, source, clients(name), services(name), service_zones(name)")
      .eq("salon_id", salon.id).gte("start_at", from).lt("start_at", to)
      .neq("status", "cancelled").order("start_at"),
    supabase.from("payments").select("amount, method, type").eq("salon_id", salon.id).eq("status", "paid")
      .gte("paid_at", from).lt("paid_at", to),
    supabase.from("opening_hours").select("*").eq("salon_id", salon.id).eq("weekday", weekday(date)).maybeSingle(),
  ]);
  const staff = ((staffRows ?? []) as Staff[]).filter((s) => isOwner || s.id === staffId);
  const list = (appts ?? []).filter((a) => isOwner || a.staff_id === staffId);

  let open = hours?.open_time ? minutesOfDay(hours.open_time) : 8 * 60;
  let close = hours?.close_time ? minutesOfDay(hours.close_time) : 19 * 60;
  for (const a of list) {
    open = Math.min(open, localMinutes(a.start_at, tz));
    close = Math.max(close, localMinutes(a.end_at, tz) || 24 * 60);
  }
  open = Math.floor(open / 60) * 60;
  close = Math.ceil(close / 60) * 60;
  const hoursList = Array.from({ length: (close - open) / 60 }, (_, i) => open / 60 + i);

  const cash = (pays ?? []).reduce((s, p) => s + (p.type === "refund" ? -p.amount : p.amount), 0);
  const byMethod = (pays ?? []).reduce<Record<string, number>>((acc, p) => {
    acc[p.method] = (acc[p.method] ?? 0) + p.amount;
    return acc;
  }, {});
  const counts = {
    total: list.filter((a) => a.status !== "no_show").length,
    done: list.filter((a) => a.status === "done").length,
    noShow: list.filter((a) => a.status === "no_show").length,
    home: list.filter((a) => a.location_type === "home").length,
    pending: list.filter((a) => a.status === "pending_payment").length,
  };
  const isToday = date === todayISO(tz);
  const nowMin = localMinutes(new Date(), tz);

  return (
    <div className="flex flex-col gap-3">
      <header className="px-4 pt-5 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-muted">{salon.name}</p>
          <h1 className="font-display font-extrabold text-2xl">{isToday ? "Aujourd'hui" : dateLong(date)}</h1>
        </div>
        <div className="flex gap-2">
          <Link aria-label="Jour précédent" href={`/app?d=${addDays(date, -1)}`} className="size-11 rounded-full bg-white border border-line grid place-items-center">‹</Link>
          {!isToday && <Link href="/app" className="btn-ghost">Aujourd&apos;hui</Link>}
          {!isOwner && <form action={signOut}><button className="btn-ghost" aria-label="Se déconnecter">Sortir</button></form>}
          <Link aria-label="Jour suivant" href={`/app?d=${addDays(date, 1)}`} className="size-11 rounded-full bg-white border border-line grid place-items-center">›</Link>
        </div>
      </header>

      {isOwner && <section className="mx-4 rounded-2xl bg-berry text-white p-4 flex flex-col gap-2">
        <div className="flex justify-between text-sm opacity-90"><span>Caisse du jour</span><Link href={`/app/caisse?d=${date}`} className="underline text-white">Détail</Link></div>
        <div className="font-display font-extrabold text-3xl">{fcfa(cash)}</div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          {(["wave", "cash", "orange"] as const).map((m) => (
            <div key={m} className="rounded-lg bg-white/12 px-2 py-1.5">
              <div className="opacity-90">{m === "orange" ? "Orange / MTN" : METHOD_LABEL[m]}</div>
              <div className="font-bold text-sm">{fcfa(m === "orange" ? (byMethod.orange ?? 0) + (byMethod.mtn ?? 0) : byMethod[m] ?? 0)}</div>
            </div>
          ))}
        </div>
      </section>}

      <div className="px-4 flex flex-wrap gap-2 text-xs font-semibold">
        <span className="px-2.5 py-1 rounded-lg bg-white border border-line">{counts.total} RDV</span>
        <span className="px-2.5 py-1 rounded-lg bg-white border border-line">{counts.done} terminés</span>
        {counts.noShow > 0 && <span className="px-2.5 py-1 rounded-lg bg-[#FDE8EC] text-[#A3203F]">{counts.noShow} absente{counts.noShow > 1 ? "s" : ""}</span>}
        {counts.home > 0 && <span className="px-2.5 py-1 rounded-lg bg-white border border-line">{counts.home} domicile</span>}
        {counts.pending > 0 && <span className="px-2.5 py-1 rounded-lg bg-petal text-berry">{counts.pending} acompte en attente</span>}
      </div>

      {staff.length === 0 ? (
        <div className="card mx-4 p-5 text-sm">{isOwner ? <>Ajoutez vos coiffeuses et prestations dans <Link href="/app/settings" className="text-rose font-semibold">Réglages</Link> pour commencer.</> : "Votre compte n'est relié à aucune coiffeuse. Demandez à la gérante."}</div>
      ) : (
        <div className="overflow-x-auto px-4">
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `40px repeat(${staff.length}, minmax(104px, 1fr))` }}>
            <div />
            {staff.map((s) => (
              <div key={s.id} className="flex items-center gap-1.5 text-sm font-semibold pb-1">
                <span className="size-2 rounded-full" style={{ background: s.color }} />{s.name}
              </div>
            ))}
            <div className="relative" style={{ height: hoursList.length * HOUR_PX }}>
              {hoursList.map((h, i) => (
                <div key={h} className="absolute left-0 text-[11px] text-muted" style={{ top: i * HOUR_PX }}>{String(h).padStart(2, "0")}h</div>
              ))}
            </div>
            {staff.map((s) => (
              <div key={s.id} className="relative border-l border-line" style={{ height: hoursList.length * HOUR_PX }}>
                {hoursList.map((h, i) => <div key={h} className="absolute inset-x-0 border-t border-line" style={{ top: i * HOUR_PX }} />)}
                {isToday && nowMin >= open && nowMin <= close && (
                  <div className="absolute inset-x-0 border-t-2 border-rose z-10" style={{ top: ((nowMin - open) / 60) * HOUR_PX }} />
                )}
                {list.filter((a) => a.staff_id === s.id).map((a) => {
                  const top = ((localMinutes(a.start_at, tz) - open) / 60) * HOUR_PX;
                  const height = Math.max(((new Date(a.end_at).getTime() - new Date(a.start_at).getTime()) / 3600_000) * HOUR_PX - 3, 36);
                  const client = one(a.clients), service = one(a.services), zone = one(a.service_zones);
                  const style =
                    a.status === "done" ? "bg-[#F6EDF1] text-muted"
                    : a.status === "no_show" ? "bg-[#FDE8EC] border border-dashed border-rose text-[#A3203F]"
                    : a.status === "pending_payment" ? "bg-white border border-dashed border-line text-muted"
                    : "text-ink";
                  return (
                    <Link key={a.id} href={`/app/rdv/${a.id}`}
                      className={`absolute left-1 right-1 rounded-xl px-2 py-1.5 text-[11px] leading-tight overflow-hidden ${style}`}
                      style={{ top: top + 2, height, ...(a.status === "confirmed" ? { background: `${s.color}22` } : {}) }}>
                      <div className={`font-bold text-xs ${a.status === "no_show" ? "line-through" : ""}`}>
                        {client?.name ?? "Cliente"}{a.status === "done" ? " ✓" : ""}
                      </div>
                      <div>{hhmm(a.start_at, tz)} · {service?.name}</div>
                      {a.location_type === "home" && <div className="font-semibold">Domicile · {zone?.name}</div>}
                      {a.status === "pending_payment" && <div>Attente acompte</div>}
                      {a.status === "confirmed" && a.deposit_amount > 0 && <div className="mt-0.5 inline-block bg-white rounded px-1 font-semibold whitespace-nowrap">Ac. {fcfa(a.deposit_amount)}</div>}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <Link href={`/app/new?d=${date}`} className="fixed right-4 bottom-24 z-20 btn-primary rounded-full min-h-13 px-5 shadow-lg shadow-rose/30">
        + Client sans RDV
      </Link>
    </div>
  );
}
