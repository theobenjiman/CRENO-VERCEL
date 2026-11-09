import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { addDays, todayISO, weekday, initials } from "@/lib/format";
import { loadSalonContext } from "@/lib/salon-context";
import { effectivePlan } from "@/lib/plans";
import BookingForm from "./BookingForm";
import PhotoSlider from "@/components/PhotoSlider";
import SaveSalon from "@/components/SaveSalon";
import { photoUrl } from "@/lib/photos";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ via?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const ctx = await loadSalonContext(slug);
  return {
    title: ctx ? `Réserver — ${ctx.salon.name}` : "Salon introuvable",
    ...(ctx ? { manifest: `/${ctx.salon.slug}/manifest.webmanifest` } : {}),
  };
}

export default async function SalonBookingPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { via } = await searchParams;
  const ctx = await loadSalonContext(slug);
  if (!ctx) notFound();

  const openDays = new Set(ctx.hours.filter((h) => h.open_time).map((h) => h.weekday));
  const days: string[] = [];
  for (let i = 0; days.length < 10 && i < 30; i++) {
    const d = addDays(todayISO(ctx.salon.timezone), i);
    if (openDays.has(weekday(d))) days.push(d);
  }

  const homeEnabled =
    ctx.salon.home_service_enabled &&
    ctx.zones.length > 0 &&
    ctx.services.some((s) => s.home_available) &&
    ctx.staff.some((s) => s.does_home_visits);

  return (
    <main className="mx-auto max-w-md min-h-screen flex flex-col">
      <header className="bg-berry text-white px-5 pt-5 pb-5 flex flex-col gap-3">
        <div className="font-display italic font-bold text-2xl">créno</div>
        <div className="flex items-center gap-3">
          <div className="size-13 rounded-2xl bg-[#F9C9D8] text-berry grid place-items-center font-display font-extrabold text-xl">
            {initials(ctx.salon.name)}
          </div>
          <div>
            <h1 className="font-display font-bold text-xl leading-tight">{ctx.salon.name}</h1>
            <p className="text-sm opacity-90">{[ctx.salon.address, ctx.salon.city].filter(Boolean).join(" — ")}</p>
          </div>
        </div>
      </header>
      {ctx.photos.length > 0 && (
        <div className="relative">
          <PhotoSlider title={`Réalisations de ${ctx.salon.name}`}
            slides={ctx.photos.map((p) => ({ src: photoUrl(p.path), caption: p.caption }))} />
          <span className="absolute top-3 left-3 rounded-full bg-white/90 text-berry text-xs font-bold px-3 py-1">Nos réalisations</span>
        </div>
      )}
      <SaveSalon slug={ctx.salon.slug} fromQr={via === "qr"} />
      {ctx.services.length === 0 || ctx.staff.length === 0 ? (
        <p className="p-6 text-muted">Ce salon n&apos;a pas encore ouvert ses réservations en ligne.</p>
      ) : (
        <BookingForm
          slug={ctx.salon.slug}
          services={ctx.services}
          staff={ctx.staff}
          zones={ctx.zones}
          days={days}
          homeEnabled={homeEnabled}
          homeDepositDefault={ctx.salon.home_deposit_default}
          depositsEnabled={effectivePlan(ctx.salon).deposits}
          skills={ctx.skills}
        />
      )}
    </main>
  );
}
