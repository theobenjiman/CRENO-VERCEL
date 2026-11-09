"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CITIES, type NearbySalon } from "@/lib/map";
import { fcfa } from "@/lib/format";
import { photoUrl } from "@/lib/photos";

const SalonMap = dynamic(() => import("@/components/SalonMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#F3ECEF] grid place-items-center text-sm text-muted">Chargement de la carte…</div>,
});

type LatLng = { lat: number; lng: number };
const RADII = [3, 5, 10, 20];
const CARDS_H = 196; // space the bottom cards take over the map (px)
const TOP_H = 132;   // space the floating search bar takes (px)

const priceTag = (n: number | null) => (n == null ? null : n >= 1000 ? `${Math.round(n / 100) / 10}k F`.replace(".", ",") : `${n} F`);
const formatKm = (k: number) => (k < 1 ? `${Math.round(k * 1000)} m` : `${k.toFixed(1).replace(".", ",")} km`);
const initials = (name: string) => name.split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export default function Directory() {
  const [center, setCenter] = useState<LatLng>({ lat: CITIES[0].lat, lng: CITIES[0].lng });
  const [me, setMe] = useState<LatLng | null>(null);
  const [cityId, setCityId] = useState(CITIES[0].id);
  const [km, setKm] = useState(10);
  const [salons, setSalons] = useState<NearbySalon[] | null>(null);
  const [category, setCategory] = useState("Toutes");
  const [homeOnly, setHomeOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"map" | "list">("map");
  const [fitKey, setFitKey] = useState(0);
  const [moved, setMoved] = useState<{ c: LatLng; km: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState("");
  const rail = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const fromRail = useRef(false);

  const load = useCallback(async (c: LatLng, radius: number, refit: boolean) => {
    setSalons(null);
    setMoved(null);
    try {
      const res = await fetch(`/api/salons/nearby?lat=${c.lat}&lng=${c.lng}&km=${radius}`);
      const json = (await res.json()) as { salons?: NearbySalon[] };
      setSalons(json.salons ?? []);
      setSelected(null);
      if (refit) setFitKey((k) => k + 1);
    } catch {
      setSalons([]);
      setNotice("Connexion impossible. Réessayez.");
    }
  }, []);

  useEffect(() => { void load(center, km, true); }, [center, km, load]);

  const locate = useCallback(() => {
    if (!navigator.geolocation) { setNotice("Position indisponible. Choisissez une ville."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMe(p); setCenter(p); setCityId(""); setLocating(false); setNotice("");
      },
      () => { setLocating(false); setNotice("Position non autorisée. Choisissez une ville."); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    (salons ?? []).forEach((s) => s.categories.forEach((c) => set.add(c)));
    return ["Toutes", ...Array.from(set).sort()];
  }, [salons]);

  const shown = useMemo(() => (salons ?? []).filter((s) =>
    (category === "Toutes" || s.categories.includes(category)) && (!homeOnly || s.home_service)), [salons, category, homeOnly]);

  const pins = useMemo(() => shown.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, label: s.name, price: priceTag(s.min_price) })), [shown]);

  // Pin tapped → bring its card to the centre of the rail.
  const selectFromMap = useCallback((id: string) => {
    setSelected(id);
    const card = cardRefs.current.get(id);
    if (card && rail.current) {
      fromRail.current = true;
      rail.current.scrollTo({ left: card.offsetLeft - (rail.current.clientWidth - card.clientWidth) / 2, behavior: "smooth" });
      setTimeout(() => { fromRail.current = false; }, 600);
    }
  }, []);

  // Card swiped into the centre → select it (the map flies to its pin).
  useEffect(() => {
    const r = rail.current;
    if (!r || view !== "map") return;
    let t: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (fromRail.current) return;
        const mid = r.scrollLeft + r.clientWidth / 2;
        let best: string | null = null, dist = Infinity;
        cardRefs.current.forEach((elm, id) => {
          const d = Math.abs(elm.offsetLeft + elm.clientWidth / 2 - mid);
          if (d < dist) { dist = d; best = id; }
        });
        if (best) setSelected(best);
      }, 120);
    };
    r.addEventListener("scroll", onScroll, { passive: true });
    return () => { r.removeEventListener("scroll", onScroll); clearTimeout(t); };
  }, [view, shown]);

  const onUserMove = useCallback((c: LatLng, radius: number) => {
    const far = km * 0.3;
    const dLat = (c.lat - center.lat) * 111, dLng = (c.lng - center.lng) * 111 * Math.cos((center.lat * Math.PI) / 180);
    if (Math.hypot(dLat, dLng) > far || radius > km * 1.6 || radius < km * 0.4) setMoved({ c, km: radius });
  }, [center, km]);

  function searchHere() {
    if (!moved) return;
    const radius = RADII.reduce((a, b) => (Math.abs(b - moved.km) < Math.abs(a - moved.km) ? b : a), RADII[0]);
    setCityId("");
    setKm(radius);
    setCenter(moved.c); // triggers load
  }

  const count = salons === null ? "Recherche…" : `${shown.length} salon${shown.length > 1 ? "s" : ""}`;

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#F3ECEF]">
      {/* Map */}
      <SalonMap
        className="absolute inset-0"
        center={center}
        zoom={13}
        me={me}
        pins={pins}
        selectedId={selected}
        onSelect={selectFromMap}
        fitKey={fitKey}
        followSelected
        topPadding={TOP_H}
        bottomPadding={view === "map" ? CARDS_H : 40}
        onUserMove={onUserMove}
        controls
        onLocate={locate}
      />

      {/* Floating search bar */}
      <div className="absolute inset-x-0 top-0 z-20 p-3 flex flex-col gap-2 pointer-events-none">
        <div className="pointer-events-auto mx-auto w-full max-w-xl rounded-2xl bg-white/95 backdrop-blur shadow-lg shadow-black/10 p-2 flex items-center gap-2">
          <Link href="/" aria-label="Accueil Créno" className="px-2 font-display italic font-bold text-xl text-berry">créno</Link>
          <label className="sr-only" htmlFor="city">Ville</label>
          <select id="city" value={cityId} className="min-w-0 flex-1 min-h-11 rounded-xl bg-petal px-3 text-sm font-semibold text-ink outline-none"
            onChange={(e) => { const c = CITIES.find((x) => x.id === e.target.value); if (c) { setCityId(c.id); setCenter({ lat: c.lat, lng: c.lng }); } }}>
            {!cityId && <option value="">{me ? "Autour de moi" : "Zone de la carte"}</option>}
            {CITIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <label className="sr-only" htmlFor="radius">Distance</label>
          <select id="radius" value={km} onChange={(e) => setKm(Number(e.target.value))}
            className="min-h-11 rounded-xl bg-petal px-2 text-sm font-semibold text-ink outline-none">
            {RADII.map((r) => <option key={r} value={r}>{r} km</option>)}
          </select>
          <button type="button" onClick={locate} disabled={locating} aria-label="Autour de moi"
            className={`size-11 shrink-0 rounded-xl grid place-items-center ${me ? "bg-berry text-white" : "bg-rose text-white"} ${locating ? "animate-pulse" : ""}`}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" fill="currentColor" /></svg>
          </button>
        </div>
        <div className="pointer-events-auto mx-auto w-full max-w-xl flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categories.map((c) => (
            <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c}
              className={`shrink-0 min-h-9 px-3.5 rounded-full text-sm shadow-md shadow-black/10 ${category === c ? "bg-ink text-white font-semibold" : "bg-white text-ink"}`}>
              {c}
            </button>
          ))}
          <button type="button" aria-pressed={homeOnly} onClick={() => setHomeOnly((v) => !v)}
            className={`shrink-0 min-h-9 px-3.5 rounded-full text-sm shadow-md shadow-black/10 ${homeOnly ? "bg-rose text-white font-semibold" : "bg-white text-ink"}`}>
            À domicile
          </button>
        </div>
        {moved && view === "map" && (
          <button type="button" onClick={searchHere}
            className="pointer-events-auto self-center min-h-10 px-4 rounded-full bg-ink text-white text-sm font-semibold shadow-lg shadow-black/20 flex items-center gap-2">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" /></svg>
            Rechercher dans cette zone
          </button>
        )}
        {notice && <p role="status" className="pointer-events-auto self-center rounded-full bg-white px-4 py-2 text-xs font-semibold text-berry shadow">{notice}</p>}
      </div>

      {/* Bottom: count + view toggle + swipeable cards */}
      {view === "map" && (
        <div className="absolute inset-x-0 bottom-0 z-20 pb-[max(12px,env(safe-area-inset-bottom))] pointer-events-none">
          <div className="mx-auto max-w-xl px-3 mb-2 flex justify-between items-center">
            <span aria-live="polite" className="pointer-events-auto rounded-full bg-white px-3 py-1.5 text-xs font-bold shadow-md shadow-black/10">{count}</span>
            <button type="button" onClick={() => setView("list")}
              className="pointer-events-auto rounded-full bg-white px-3.5 py-1.5 text-xs font-bold shadow-md shadow-black/10 flex items-center gap-1.5">
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
              Liste
            </button>
          </div>
          <div ref={rail} className="pointer-events-auto flex gap-3 overflow-x-auto snap-x snap-mandatory px-[7.5%] pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {shown.map((s) => (
              <article key={s.id} ref={(n) => { if (n) cardRefs.current.set(s.id, n); else cardRefs.current.delete(s.id); }}
                onClick={() => setSelected(s.id)}
                className={`snap-center shrink-0 w-[85%] max-w-sm rounded-2xl bg-white shadow-xl shadow-black/15 overflow-hidden flex transition ${selected === s.id ? "ring-2 ring-berry" : ""}`}>
                <Thumb s={s} className="w-24" />
                <div className="flex-1 min-w-0 p-3 flex flex-col gap-1">
                  <div className="flex justify-between gap-2">
                    <h2 className="font-semibold leading-tight truncate">{s.name}</h2>
                    <span className="text-xs font-semibold text-muted whitespace-nowrap">{formatKm(s.distance_km)}</span>
                  </div>
                  <p className="text-xs text-muted truncate">{[s.address, s.city].filter(Boolean).join(" · ")}</p>
                  <Tags s={s} />
                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <span className="text-xs leading-tight text-muted">{s.min_price != null ? <>Dès<br /><b className="text-ink whitespace-nowrap">{fcfa(s.min_price)}</b></> : ""}</span>
                    <span className="flex gap-1.5 shrink-0">
                      <a aria-label={`Itinéraire vers ${s.name}`} className="size-9 rounded-xl border border-line grid place-items-center text-ink"
                        target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`}>
                        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z" /></svg>
                      </a>
                      <Link className="btn-primary min-h-9 px-3 text-xs" href={`/${s.slug}?via=map`}>Réserver</Link>
                    </span>
                  </div>
                </div>
              </article>
            ))}
            {salons !== null && shown.length === 0 && (
              <div className="snap-center shrink-0 w-[85%] max-w-sm rounded-2xl bg-white shadow-xl shadow-black/15 p-4 text-sm text-muted">
                Aucun salon Créno ici pour l&apos;instant. Dézoomez, augmentez la distance ou cherchez ailleurs.
              </div>
            )}
          </div>
        </div>
      )}

      {/* List view */}
      {view === "list" && (
        <section className="absolute inset-x-0 bottom-0 top-[132px] z-30 bg-blush rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] flex flex-col">
          <div className="mx-auto w-full max-w-xl px-4 pt-3 pb-2 flex items-center justify-between">
            <span aria-live="polite" className="text-sm font-bold">{count} · {km} km</span>
            <button type="button" onClick={() => setView("map")}
              className="rounded-full bg-ink text-white px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5">
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" /></svg>
              Carte
            </button>
          </div>
          <ul className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-4 pb-6 flex flex-col gap-3">
            {shown.map((s) => (
              <li key={s.id} className="card overflow-hidden flex">
                <Thumb s={s} className="w-24" />
                <div className="flex-1 min-w-0 p-3 flex flex-col gap-1">
                  <div className="flex justify-between gap-2">
                    <h2 className="font-semibold leading-tight">{s.name}</h2>
                    <span className="text-xs font-semibold text-muted whitespace-nowrap">{formatKm(s.distance_km)}</span>
                  </div>
                  <p className="text-xs text-muted truncate">{[s.address, s.city].filter(Boolean).join(" · ")}</p>
                  <Tags s={s} />
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted">{s.min_price != null ? `Dès ${fcfa(s.min_price)}` : ""}</span>
                    <span className="flex gap-2">
                      <button type="button" className="btn-ghost min-h-9 px-3 text-xs" onClick={() => { setView("map"); setTimeout(() => selectFromMap(s.id), 50); }}>Voir</button>
                      <Link className="btn-primary min-h-9 px-3 text-xs" href={`/${s.slug}?via=map`}>Réserver</Link>
                    </span>
                  </div>
                </div>
              </li>
            ))}
            {salons !== null && shown.length === 0 && <li className="card p-5 text-sm text-center text-muted">Aucun salon ici pour l&apos;instant.</li>}
          </ul>
        </section>
      )}
    </main>
  );
}

function Thumb({ s, className }: { s: NearbySalon; className: string }) {
  if (s.photo_path) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl(s.photo_path)} alt="" className={`${className} shrink-0 object-cover`} loading="lazy" />;
  }
  return (
    <div className={`${className} shrink-0 bg-[#F9C9D8] text-berry grid place-items-center font-display font-extrabold text-2xl`} aria-hidden="true">
      {initials(s.name)}
    </div>
  );
}

function Tags({ s }: { s: NearbySalon }) {
  return (
    <div className="flex flex-wrap gap-1">
      {s.categories.slice(0, 3).map((c) => <span key={c} className="text-[11px] px-2 py-0.5 rounded-md bg-petal text-berry font-semibold">{c}</span>)}
      {s.home_service && <span className="text-[11px] px-2 py-0.5 rounded-md bg-peach text-[#8A3A1A] font-semibold">À domicile</span>}
    </div>
  );
}
