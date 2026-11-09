import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/session";
import { PLANS, planPrice, type Plan } from "@/lib/plans";
import { startCheckout } from "@/lib/payments";
import { onlineBookingsThisMonth } from "@/lib/availability";
import { dateLong, fcfa, localDate, METHOD_LABEL } from "@/lib/format";

type Props = { searchParams: Promise<{ paid?: string }> };

async function choosePlan(formData: FormData) {
  "use server";
  const { salon } = await requireOwner();
  const plan = String(formData.get("plan"));
  const period = String(formData.get("period"));
  if (!["pro", "salon_plus"].includes(plan) || !["month", "year"].includes(period)) redirect("/app/abonnement");
  const p = plan as "pro" | "salon_plus", per = period as "month" | "year";
  const { redirectUrl } = await startCheckout({
    kind: "subscription", salonId: salon.id, plan: p, period: per, amount: planPrice(p, per),
    description: `Créno ${PLANS[p].label} — ${salon.name}`,
  });
  redirect(redirectUrl);
}

function features(p: Plan) {
  return [
    Number.isFinite(p.maxStaff) ? `${p.maxStaff} coiffeuse${p.maxStaff > 1 ? "s" : ""}` : "Coiffeuses illimitées",
    Number.isFinite(p.monthlyOnlineBookings) ? `${p.monthlyOnlineBookings} réservations en ligne / mois` : "Réservations illimitées",
    "Lien de réservation + fichier clientes",
    p.deposits && "Acompte mobile money",
    p.reminders && "Rappels WhatsApp automatiques",
    p.cashSummary && "Résumé de caisse sur WhatsApp",
    p.campaigns && "Offres, vœux et relances aux clientes",
    p.staffLogins && "Un accès par coiffeuse",
  ].filter(Boolean) as string[];
}

export default async function SubscriptionPage({ searchParams }: Props) {
  const { paid } = await searchParams;
  const { supabase, salon, plan, tz } = await requireOwner();
  const [{ count: staffCount }, bookings, { data: history }] = await Promise.all([
    supabase.from("staff").select("id", { count: "exact", head: true }).eq("salon_id", salon.id).eq("active", true),
    onlineBookingsThisMonth(salon.id, tz),
    supabase.from("subscription_payments").select("*").eq("salon_id", salon.id).order("created_at", { ascending: false }).limit(12),
  ]);
  const expires = salon.plan !== "free" && salon.plan_expires_at ? new Date(salon.plan_expires_at) : null;
  const lapsed = salon.plan !== "free" && plan.id === "free";

  return (
    <div className="px-4 pt-5 flex flex-col gap-4">
      <Link href="/app/settings" className="text-sm text-rose font-semibold">‹ Réglages</Link>
      <h1 className="font-display font-extrabold text-2xl">Abonnement</h1>
      {paid && <p role="status" className="card p-4 font-semibold text-berry">Paiement reçu, merci ! Votre abonnement est actif.</p>}

      <section className="rounded-2xl bg-berry text-white p-5 flex flex-col gap-1">
        <p className="text-sm opacity-90">Abonnement actuel</p>
        <p className="font-display font-extrabold text-3xl">{plan.label}</p>
        {expires && !lapsed && <p className="text-sm opacity-90">Valable jusqu&apos;au {dateLong(localDate(expires, tz))}</p>}
        {lapsed && <p className="text-sm font-semibold">Votre abonnement a expiré : renouvelez pour retrouver acomptes et rappels.</p>}
        <p className="text-sm opacity-90 mt-1">
          {staffCount ?? 0} coiffeuse(s) active(s) · {bookings} réservation(s) en ligne ce mois
          {Number.isFinite(plan.monthlyOnlineBookings) && ` sur ${plan.monthlyOnlineBookings}`}
        </p>
      </section>

      {(["free", "pro", "salon_plus"] as const).map((id) => {
        const p = PLANS[id];
        const current = plan.id === id;
        return (
          <section key={id} className={`card p-5 flex flex-col gap-3 ${current ? "border-2 border-rose" : ""}`}>
            <div className="flex items-baseline justify-between">
              <h2 className="font-display font-bold text-xl">{p.label}</h2>
              <span className="font-bold">{p.monthly ? `${fcfa(p.monthly)} / mois` : "Gratuit"}</span>
            </div>
            <ul className="text-sm flex flex-col gap-1">
              {features(p).map((f) => <li key={f}>• {f}</li>)}
            </ul>
            {id !== "free" && (
              <form action={choosePlan} className="grid grid-cols-2 gap-2">
                <input type="hidden" name="plan" value={id} />
                <button name="period" value="month" className={current ? "btn-primary" : "btn-ghost"}>
                  {current ? "Renouveler" : "Choisir"} · 1 mois
                </button>
                <button name="period" value="year" className="btn-ghost">
                  1 an · {fcfa(p.yearly)} <span className="text-xs text-berry">(2 mois offerts)</span>
                </button>
              </form>
            )}
            {current && id === "free" && <p className="text-xs text-muted">Vous êtes sur l&apos;offre gratuite.</p>}
          </section>
        );
      })}

      {(history ?? []).length > 0 && (
        <section className="card p-4 flex flex-col gap-2">
          <h2 className="section-title">Paiements</h2>
          {(history ?? []).map((h) => (
            <div key={h.id} className="flex justify-between text-sm">
              <span>{dateLong(localDate(h.paid_at ?? h.created_at, tz))} · {PLANS[h.plan as "pro"].label} {h.period === "year" ? "1 an" : "1 mois"}</span>
              <span className="font-semibold">{fcfa(h.amount)} · {METHOD_LABEL[h.method]}</span>
            </div>
          ))}
        </section>
      )}
      <p className="text-xs text-muted">Après expiration, vous gardez {3} jours de grâce avant le retour à l&apos;offre gratuite. Vos données restent intactes.</p>
    </div>
  );
}
