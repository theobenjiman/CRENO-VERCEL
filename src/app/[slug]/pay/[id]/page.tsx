import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmDeposit, one } from "@/lib/booking";
import { dateLong, fcfa, hhmm, localDate } from "@/lib/format";
import type { PayMethod } from "@/lib/types";

type Props = { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ e?: string }> };

const METHODS: { id: PayMethod; label: string; cls: string }[] = [
  { id: "wave", label: "Wave", cls: "bg-[#E8F3FD] text-[#0B4F8A]" },
  { id: "orange", label: "Orange Money", cls: "bg-[#FDEFE3] text-[#8A4B12]" },
  { id: "mtn", label: "MTN MoMo", cls: "bg-[#FBF4D6] text-[#6B5A0A]" },
];

async function simulatePayment(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const slug = String(formData.get("slug"));
  const method = String(formData.get("method")) as PayMethod;
  if (!["wave", "orange", "mtn"].includes(method)) redirect(`/${slug}/pay/${id}?e=method`);
  try {
    await confirmDeposit(id, method, `stub-${Date.now()}`);
  } catch {
    redirect(`/${slug}/pay/${id}?e=expired`);
  }
  redirect(`/${slug}/ok/${id}`);
}

export default async function PayPage({ params, searchParams }: Props) {
  const { slug, id } = await params;
  const { e } = await searchParams;
  const db = createAdminClient();
  const { data: a } = await db
    .from("appointments")
    .select("id, status, deposit_amount, price, travel_fee, start_at, hold_expires_at, salons!inner(slug, name, timezone), services(name)")
    .eq("id", id)
    .eq("salons.slug", slug)
    .maybeSingle();
  if (!a) notFound();
  if (a.status === "confirmed") redirect(`/${slug}/ok/${id}`);
  const salon = one(a.salons)!, service = one(a.services);
  const expired = a.status !== "pending_payment" || (a.hold_expires_at && new Date(a.hold_expires_at) < new Date());

  return (
    <main className="mx-auto max-w-md min-h-screen px-5 py-8 flex flex-col gap-5">
      <div className="font-display italic font-bold text-2xl text-berry">créno</div>
      <div className="card p-5 flex flex-col gap-1">
        <p className="text-sm text-muted">{salon.name}</p>
        <h1 className="font-display font-bold text-2xl">Acompte {fcfa(a.deposit_amount)}</h1>
        <p className="text-sm text-muted">{service?.name} · {dateLong(localDate(a.start_at, salon.timezone))} à {hhmm(a.start_at, salon.timezone)}</p>
        <p className="text-sm text-muted">Reste à régler sur place : {fcfa(a.price + a.travel_fee - a.deposit_amount)}</p>
      </div>

      {expired || e === "expired" ? (
        <div className="card p-5 flex flex-col gap-3">
          <p className="font-semibold">Le délai de paiement (10 min) est dépassé, le créneau a été libéré.</p>
          <a className="btn-primary" href={`/${slug}`}>Choisir un nouveau créneau</a>
        </div>
      ) : (
        <form action={simulatePayment} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={a.id} />
          <input type="hidden" name="slug" value={slug} />
          <fieldset className="flex flex-col gap-2">
            <legend className="section-title mb-2">Payer avec</legend>
            {METHODS.map((m, i) => (
              <label key={m.id} className="card px-4 min-h-14 flex items-center gap-3 cursor-pointer has-[:checked]:border-2 has-[:checked]:border-rose">
                <input type="radio" name="method" value={m.id} defaultChecked={i === 0} className="accent-rose size-4" />
                <span className={`px-2 py-1 rounded-lg text-sm font-semibold ${m.cls}`}>{m.label}</span>
              </label>
            ))}
          </fieldset>
          <button className="btn-primary min-h-13 text-base">Payer {fcfa(a.deposit_amount)}</button>
          <p className="text-xs text-muted text-center">
            Mode démonstration : aucun argent n&apos;est débité. Le vrai paiement mobile money s&apos;active dans <code>src/lib/payments.ts</code>.
          </p>
        </form>
      )}
    </main>
  );
}
