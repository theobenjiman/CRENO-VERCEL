"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dayShort, fcfa } from "@/lib/format";
import { depositFor, type Slot } from "@/lib/slots";
import type { Service, Staff, Zone } from "@/lib/types";
import { createBooking, getSlots } from "./actions";

interface Props {
  slug: string;
  services: Service[];
  staff: Staff[];
  zones: Zone[];
  days: string[];
  homeEnabled: boolean;
  homeDepositDefault: number | null;
  depositsEnabled: boolean;
  skills: { staff_id: string; service_id: string }[];
}

export default function BookingForm(p: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"salon" | "home">("salon");
  const [serviceId, setServiceId] = useState<string>("");
  const [staffId, setStaffId] = useState("any");
  const [zoneId, setZoneId] = useState<string>(p.zones[0]?.id ?? "");
  const [date, setDate] = useState(p.days[0] ?? "");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [start, setStart] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [landmark, setLandmark] = useState("");
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState("");
  const [loadingSlots, startSlots] = useTransition();
  const [submitting, startSubmit] = useTransition();

  const services = useMemo(
    () => p.services.filter((s) => mode === "salon" || s.home_available),
    [p.services, mode],
  );
  const service = services.find((s) => s.id === serviceId) ?? null;
  const zone = mode === "home" ? p.zones.find((z) => z.id === zoneId) ?? null : null;

  const stylists = useMemo(() => {
    if (!service) return [];
    return p.staff.filter((s) => {
      if (mode === "home" && !s.does_home_visits) return false;
      const own = p.skills.filter((k) => k.staff_id === s.id);
      return own.length === 0 || own.some((k) => k.service_id === service.id);
    });
  }, [p.staff, p.skills, service, mode]);

  useEffect(() => {
    if (service && !services.includes(service)) setServiceId("");
  }, [services, service]);

  useEffect(() => {
    setStart("");
    if (!service || !date || (mode === "home" && !zoneId)) { setSlots(null); return; }
    startSlots(async () => {
      const res = await getSlots({ slug: p.slug, serviceId: service.id, staffId, date, mode, zoneId });
      setSlots(res);
    });
  }, [p.slug, service, staffId, date, mode, zoneId]);

  const dep = (s: Service) => (p.depositsEnabled ? depositFor(s, zone, p.homeDepositDefault) : 0);
  const deposit = service ? dep(service) : 0;
  const total = service ? service.price + (zone?.travel_fee ?? 0) : 0;
  const ready = service && start && name.trim().length > 1 && phone.trim().length >= 8;

  function shareLocation() {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setError("Position non partagée. Ajoutez un repère à la place."),
    );
  }

  function submit() {
    if (!service || !start) return;
    setError("");
    startSubmit(async () => {
      const res = await createBooking({
        slug: p.slug, serviceId: service.id, staffId, date, mode, zoneId, start,
        name, phone, landmark, geo,
      });
      if (res.error) setError(res.error);
      else if (res.redirectUrl) router.push(res.redirectUrl);
    });
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 px-5 py-4 flex flex-col gap-5">
        {p.homeEnabled && (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-petal" role="group" aria-label="Lieu">
            {(["salon", "home"] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
                className={`min-h-11 rounded-xl text-sm ${mode === m ? "bg-white font-bold shadow-sm" : "text-muted font-semibold"}`}>
                {m === "salon" ? "Au salon" : "À domicile"}
              </button>
            ))}
          </div>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="section-title">1 · Prestation</h2>
          {services.map((s) => (
            <button key={s.id} type="button" onClick={() => setServiceId(s.id)}
              className={`text-left bg-white rounded-2xl px-4 py-3 flex justify-between items-center gap-3 ${serviceId === s.id ? "border-2 border-rose" : "border border-line"}`}>
              <span>
                <span className="block font-semibold">{s.name}</span>
                <span className="block text-sm text-muted">
                  {formatDuration(s.duration_min)}
                  {dep(s) > 0 && ` · acompte ${fcfa(dep(s))}`}
                </span>
              </span>
              <span className="font-bold whitespace-nowrap">{fcfa(s.price)}</span>
            </button>
          ))}
        </section>

        {service && (
          <section className="flex flex-col gap-2">
            <h2 className="section-title">2 · {mode === "home" ? "Coiffeuse qui se déplace" : "Coiffeuse"}</h2>
            <div className="flex flex-wrap gap-2">
              {[{ id: "any", name: "Peu importe" }, ...stylists].map((s) => (
                <button key={s.id} type="button" onClick={() => setStaffId(s.id)}
                  className={`min-h-11 px-4 rounded-full text-sm ${staffId === s.id ? "bg-ink text-white font-semibold" : "bg-white border border-line"}`}>
                  {s.name}
                </button>
              ))}
            </div>
          </section>
        )}

        {service && mode === "home" && (
          <section className="flex flex-col gap-2">
            <h2 className="section-title">Où venir ?</h2>
            <label className="label">Commune / zone
              <select className="input font-semibold" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                {p.zones.map((z) => <option key={z.id} value={z.id}>{z.name} — déplacement {fcfa(z.travel_fee)}</option>)}
              </select>
            </label>
            <label className="label">Repère / indications
              <input className="input" value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="Ex. Derrière la pharmacie, portail bleu" />
            </label>
            <button type="button" onClick={shareLocation} className="btn border border-dashed border-rose text-rose-dark bg-white">
              {geo ? "Position partagée ✓" : "Partager ma position"}
            </button>
          </section>
        )}

        {service && (
          <section className="flex flex-col gap-2">
            <h2 className="section-title">3 · {mode === "home" ? "Jour et heure d’arrivée" : "Jour et heure"}</h2>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {p.days.map((d) => (
                <button key={d} type="button" onClick={() => setDate(d)}
                  className={`shrink-0 w-14 rounded-xl py-2 text-center ${date === d ? "bg-berry text-white" : "bg-white border border-line"}`}>
                  <span className={`block text-[11px] ${date === d ? "" : "text-muted"}`}>{dayShort(d)}</span>
                  <span className="block font-bold">{Number(d.slice(8, 10))}</span>
                </button>
              ))}
            </div>
            {loadingSlots && <p className="text-sm text-muted">Recherche des créneaux…</p>}
            {!loadingSlots && slots && slots.length === 0 && (
              <p className="text-sm text-muted">Plus de créneau ce jour-là. Essayez un autre jour.</p>
            )}
            {!loadingSlots && slots && slots.length > 0 && (
              <div className={`grid gap-2 ${mode === "home" ? "grid-cols-3" : "grid-cols-4"}`}>
                {slots.map((s) => (
                  <button key={s.start} type="button" onClick={() => setStart(s.start)}
                    className={`min-h-11 rounded-xl text-sm ${start === s.start ? "bg-rose text-white font-bold" : "bg-white border border-line"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {service && start && (
          <section className="flex flex-col gap-2">
            <h2 className="section-title">4 · Vos infos</h2>
            <div className="grid grid-cols-2 gap-2">
              <label className="label">Prénom
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Aïcha" autoComplete="given-name" />
              </label>
              <label className="label">WhatsApp
                <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07 00 00 00 00" inputMode="tel" autoComplete="tel" />
              </label>
            </div>
          </section>
        )}
      </div>

      <div className="sticky bottom-0 bg-white border-t border-line px-5 pt-3 pb-5 flex flex-col gap-2">
        {service && (
          <div className="text-sm text-muted flex flex-col gap-1">
            {zone && <Row label="Prestation" value={fcfa(service.price)} />}
            {zone && <Row label={`Déplacement · ${zone.name}`} value={fcfa(zone.travel_fee)} />}
            <Row label="Total" value={fcfa(total)} strong />
            {deposit > 0 && <p className="text-xs">Acompte maintenant, reste {fcfa(total - deposit)} à régler {zone ? "sur place" : "au salon"}.</p>}
          </div>
        )}
        {error && <p role="alert" className="text-sm font-semibold text-[#A3203F]">{error}</p>}
        <button type="button" disabled={!ready || submitting} onClick={submit} className="btn-primary min-h-13 text-base">
          {submitting ? "Un instant…" : deposit > 0 ? `Payer l’acompte · ${fcfa(deposit)}` : "Confirmer le rendez-vous"}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "text-ink font-bold text-base" : ""}`}>
      <span>{label}</span><span className={strong ? "" : "text-ink"}>{value}</span>
    </div>
  );
}

function formatDuration(min: number) {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h${m ? ` ${m}` : ""}` : `${m} min`;
}
