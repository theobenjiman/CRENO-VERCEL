import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/session";
import { confirmSubscription } from "@/lib/booking";
import { PLANS, planPrice } from "@/lib/plans";
import { fcfa } from "@/lib/format";

type Props = { searchParams: Promise<{ plan?: string; period?: string }> };

const METHODS = [
  { id: "wave", label: "Wave", cls: "bg-[#E8F3FD] text-[#0B4F8A]" },
  { id: "orange", label: "Orange Money", cls: "bg-[#FDEFE3] text-[#8A4B12]" },
  { id: "mtn", label: "MTN MoMo", cls: "bg-[#FBF4D6] text-[#6B5A0A]" },
] as const;

function parse(plan?: string, period?: string) {
  if (!["pro", "salon_plus"].includes(plan ?? "") || !["month", "year"].includes(period ?? "")) return null;
  return { plan: plan as "pro" | "salon_plus", period: period as "month" | "year" };
}

async function simulate(formData: FormData) {
  "use server";
  if ((process.env.PAYMENT_PROVIDER ?? "stub") !== "stub") redirect("/app/abonnement");
  const { salon } = await requireOwner();
  const sel = parse(String(formData.get("plan")), String(formData.get("period")));
  const method = String(formData.get("method"));
  if (!sel || !["wave", "orange", "mtn"].includes(method)) redirect("/app/abonnement");
  await confirmSubscription({
    salonId: salon.id, plan: sel!.plan, period: sel!.period,
    method: method as "wave" | "orange" | "mtn", providerRef: `stub-sub-${salon.id}-${Date.now()}`,
  });
  redirect("/app/abonnement?paid=1");
}

export default async function PaySubscription({ searchParams }: Props) {
  const sp = await searchParams;
  await requireOwner();
  const sel = parse(sp.plan, sp.period);
  if (!sel) redirect("/app/abonnement");
  const amount = planPrice(sel.plan, sel.period);

  return (
    <div className="px-4 pt-5 flex flex-col gap-4">
      <Link href="/app/abonnement" className="text-sm text-rose font-semibold">‹ Abonnement</Link>
      <div className="card p-5">
        <p className="text-sm text-muted">Créno {PLANS[sel.plan].label} · {sel.period === "year" ? "1 an" : "1 mois"}</p>
        <h1 className="font-display font-bold text-2xl">{fcfa(amount)}</h1>
      </div>
      <form action={simulate} className="flex flex-col gap-3">
        <input type="hidden" name="plan" value={sel.plan} />
        <input type="hidden" name="period" value={sel.period} />
        <fieldset className="flex flex-col gap-2">
          <legend className="section-title mb-2">Payer avec</legend>
          {METHODS.map((m, i) => (
            <label key={m.id} className="card px-4 min-h-14 flex items-center gap-3 cursor-pointer has-[:checked]:border-2 has-[:checked]:border-rose">
              <input type="radio" name="method" value={m.id} defaultChecked={i === 0} className="accent-rose size-4" />
              <span className={`px-2 py-1 rounded-lg text-sm font-semibold ${m.cls}`}>{m.label}</span>
            </label>
          ))}
        </fieldset>
        <button className="btn-primary min-h-13 text-base">Payer {fcfa(amount)}</button>
        <p className="text-xs text-muted text-center">Mode démonstration : aucun argent n&apos;est débité.</p>
      </form>
    </div>
  );
}
