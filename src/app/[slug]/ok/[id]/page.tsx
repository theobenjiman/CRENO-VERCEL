import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { one } from "@/lib/booking";
import { dateLong, fcfa, hhmm, localDate } from "@/lib/format";
import Link from "next/link";

type Props = { params: Promise<{ slug: string; id: string }> };

export default async function BookingOkPage({ params }: Props) {
  const { slug, id } = await params;
  const db = createAdminClient();
  const { data: a } = await db
    .from("appointments")
    .select("id, status, start_at, price, travel_fee, deposit_amount, location_type, landmark, manage_token, salons!inner(slug, name, address, phone, timezone), services(name), staff(name), service_zones(name)")
    .eq("id", id)
    .eq("salons.slug", slug)
    .maybeSingle();
  if (!a || a.status !== "confirmed") notFound();
  const salon = one(a.salons)!, service = one(a.services), staff = one(a.staff), zone = one(a.service_zones);

  return (
    <main className="mx-auto max-w-md min-h-screen px-5 py-8 flex flex-col gap-5">
      <div className="font-display italic font-bold text-2xl text-berry">créno</div>
      <div className="card p-6 flex flex-col gap-3">
        <div className="size-12 rounded-full bg-petal text-rose grid place-items-center" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        </div>
        <h1 className="font-display font-bold text-2xl">C&apos;est réservé !</h1>
        <p>
          <strong>{service?.name}</strong>{staff ? ` avec ${staff.name}` : ""}<br />
          {dateLong(localDate(a.start_at, salon.timezone))} à {hhmm(a.start_at, salon.timezone)}<br />
          {a.location_type === "home"
            ? <>À domicile · {zone?.name}{a.landmark ? ` (${a.landmark})` : ""}</>
            : <>{salon.name}{salon.address ? ` · ${salon.address}` : ""}</>}
        </p>
        <div className="text-sm text-muted">
          {a.deposit_amount > 0 && <p>Acompte payé : {fcfa(a.deposit_amount)}</p>}
          <p>Reste à régler : {fcfa(a.price + a.travel_fee - a.deposit_amount)}</p>
        </div>
        <p className="text-sm">Vous allez recevoir la confirmation et les rappels sur WhatsApp.</p>
      </div>
      <Link className="btn-ghost" href={`/r/${a.manage_token}`}>Déplacer ou annuler</Link>
      {salon.phone && (
        <a className="btn-ghost" href={`https://wa.me/${salon.phone.replace("+", "")}`}>Écrire au salon sur WhatsApp</a>
      )}
    </main>
  );
}
