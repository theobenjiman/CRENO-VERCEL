import { notFound } from "next/navigation";
import { addDays, dateLong, fcfa, hhmm, localDate, todayISO, weekday } from "@/lib/format";
import { loadSalonContext } from "@/lib/salon-context";
import { loadByToken } from "./actions";
import ManageBooking from "./ManageBooking";

type Props = { params: Promise<{ token: string }> };

export const metadata = { title: "Mon rendez-vous — Créno" };

export default async function ManagePage({ params }: Props) {
  const { token } = await params;
  const r = await loadByToken(token);
  if (!r) notFound();
  const { a, salon, service, staff, zone } = r;
  const tz = salon.timezone;

  let days: string[] = [];
  if (r.canChange) {
    const ctx = await loadSalonContext(salon.slug);
    const open = new Set((ctx?.hours ?? []).filter((h) => h.open_time).map((h) => h.weekday));
    for (let i = 0; days.length < 10 && i < 30; i++) {
      const d = addDays(todayISO(tz), i);
      if (open.has(weekday(d))) days.push(d);
    }
  }

  const STATUS: Record<string, string> = {
    pending_payment: "En attente de paiement", confirmed: "Confirmé", done: "Terminé", no_show: "Manqué", cancelled: "Annulé",
  };

  return (
    <main className="mx-auto max-w-md min-h-screen px-5 py-8 flex flex-col gap-5">
      <div className="font-display italic font-bold text-2xl text-berry">créno</div>
      <div className="card p-5 flex flex-col gap-2">
        <span className="self-start text-xs font-semibold px-2 py-1 rounded-lg bg-petal text-berry">{STATUS[a.status]}</span>
        <p className="text-sm text-muted">{salon.name}</p>
        <h1 className="font-display font-bold text-2xl">{service?.name}</h1>
        <p>
          {dateLong(localDate(a.start_at, tz))} à {hhmm(a.start_at, tz)}{staff ? ` avec ${staff.name}` : ""}<br />
          {a.location_type === "home" ? `À domicile · ${zone?.name}${a.landmark ? ` (${a.landmark})` : ""}` : salon.address ?? "Au salon"}
        </p>
        {a.deposit_amount > 0 && <p className="text-sm text-muted">Acompte payé : {fcfa(a.deposit_amount)} · Reste : {fcfa(a.price + a.travel_fee - a.deposit_amount)}</p>}
      </div>

      {r.upcoming && (
        <ManageBooking
          token={token}
          days={days}
          canChange={r.canChange}
          noticeHours={salon.cancel_notice_hours}
          hasDeposit={a.deposit_amount > 0}
          salonWhatsApp={salon.phone}
        />
      )}
      {!r.upcoming && a.status === "cancelled" && <p className="text-sm text-muted">Ce rendez-vous est annulé. <a className="text-rose font-semibold" href={`/${salon.slug}`}>Réserver à nouveau</a></p>}
    </main>
  );
}
