"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { CITIES } from "@/lib/map";

const SalonMap = dynamic(() => import("@/components/SalonMap"), {
  ssr: false,
  loading: () => <div className="h-64 w-full rounded-xl bg-petal grid place-items-center text-sm text-muted">Chargement de la carte…</div>,
});

/** Form fields for the salon's position: tap the map, drag the pin, or use the phone's GPS. */
export default function LocationPicker({ lat, lng }: { lat: number | null; lng: number | null }) {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(lat != null && lng != null ? { lat, lng } : null);
  const [center, setCenter] = useState(pos ?? { lat: CITIES[0].lat, lng: CITIES[0].lng });
  const [msg, setMsg] = useState("");

  function useGps() {
    setMsg("Localisation…");
    navigator.geolocation?.getCurrentPosition(
      (p) => { const v = { lat: p.coords.latitude, lng: p.coords.longitude }; setPos(v); setCenter(v); setMsg("Position trouvée. Ajustez le repère si besoin."); },
      () => setMsg("Position non autorisée : touchez la carte à l'emplacement du salon."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="lat" value={pos?.lat.toFixed(6) ?? ""} />
      <input type="hidden" name="lng" value={pos?.lng.toFixed(6) ?? ""} />
      <button type="button" onClick={useGps} className="btn-ghost">Je suis au salon : utiliser ma position</button>
      <SalonMap className="relative h-64 w-full rounded-xl overflow-hidden" center={center} zoom={pos ? 16 : 12} pick={pos} onPick={setPos} />
      <p className="text-xs text-muted" role="status">
        {msg || (pos ? "Faites glisser le repère pour l'ajuster." : "Touchez la carte à l'emplacement exact du salon.")}
      </p>
    </div>
  );
}
