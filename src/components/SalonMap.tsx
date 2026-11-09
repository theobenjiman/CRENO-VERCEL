"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MLMap, Marker, StyleSpecification, MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_STYLE } from "@/lib/map";

export interface MapPin { id: string; lat: number; lng: number; label: string; price?: string | null }
type LatLng = { lat: number; lng: number };

interface Props {
  center: LatLng;
  zoom?: number;
  pins?: MapPin[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  me?: LatLng | null;
  /** Change this number to zoom the map so all pins (and "me") fit. */
  fitKey?: number;
  /** Fly to the selected pin (leaving room at the bottom for cards). */
  followSelected?: boolean;
  bottomPadding?: number;
  topPadding?: number;
  /** Called after the user pans/zooms: map centre and visible radius in km. */
  onUserMove?: (center: LatLng, radiusKm: number) => void;
  /** Show the floating zoom / locate buttons. */
  controls?: boolean;
  onLocate?: () => void;
  /** Picker mode: one draggable pin; tap or drag to move it. */
  pick?: LatLng | null;
  onPick?: (p: LatLng) => void;
  className?: string;
}

const FALLBACK_STYLE: StyleSpecification = {
  version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#F3ECEF" } }],
};

function km(a: LatLng, b: LatLng) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function pinElement(pin: MapPin, onClick: () => void) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "creno-pin";
  el.setAttribute("aria-label", `${pin.label}${pin.price ? `, dès ${pin.price}` : ""}`);
  el.innerHTML = `<span class="creno-pin-label">${pin.price ?? "•"}</span>`;
  el.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  return el;
}

export default function SalonMap(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const markers = useRef<Map<string, Marker>>(new Map());
  const meMarker = useRef<Marker | null>(null);
  const picker = useRef<Marker | null>(null);
  const cb = useRef(p);
  cb.current = p;
  const [ready, setReady] = useState(false);

  // Create the map once.
  useEffect(() => {
    if (!el.current || map.current) return;
    let loaded = false, fellBack = false;
    // Served from /public (copied on npm install) — the bundler can't resolve MapLibre's own worker path.
    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    const m = new maplibregl.Map({
      container: el.current,
      style: MAP_STYLE,
      center: [p.center.lng, p.center.lat],
      zoom: p.zoom ?? 13,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    m.on("load", () => { loaded = true; });
    m.on("error", () => {
      if (!loaded && !fellBack) { fellBack = true; m.setStyle(FALLBACK_STYLE); }
    });
    m.on("moveend", (e: { originalEvent?: unknown }) => {
      if (!e.originalEvent) return; // ignore programmatic moves
      const c = m.getCenter(), ne = m.getBounds().getNorthEast();
      cb.current.onUserMove?.({ lat: c.lat, lng: c.lng }, km({ lat: c.lat, lng: c.lng }, { lat: ne.lat, lng: ne.lng }));
    });
    if (p.pick !== undefined) m.on("click", (e: MapMouseEvent) => cb.current.onPick?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
    // Keep the canvas in sync with its container (layout settles after mount, screen rotation…).
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(el.current);
    map.current = m;
    setReady(true);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move to a new search centre.
  useEffect(() => {
    if (!ready || p.pick !== undefined) return;
    map.current?.easeTo({ center: [p.center.lng, p.center.lat], zoom: p.zoom ?? map.current.getZoom(), duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, p.center.lat, p.center.lng]);

  // Salon pins (diffed by id).
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const next = new Map((p.pins ?? []).map((x) => [x.id, x]));
    markers.current.forEach((mk, id) => { if (!next.has(id)) { mk.remove(); markers.current.delete(id); } });
    next.forEach((pin, id) => {
      const old = markers.current.get(id);
      if (old) { old.setLngLat([pin.lng, pin.lat]); return; }
      const mk = new maplibregl.Marker({ element: pinElement(pin, () => cb.current.onSelect?.(id)), anchor: "bottom" })
        .setLngLat([pin.lng, pin.lat]).addTo(m);
      markers.current.set(id, mk);
    });
    markers.current.forEach((mk, id) => mk.getElement().classList.toggle("is-active", id === p.selectedId));
  }, [ready, p.pins, p.selectedId]);

  // "Me" dot.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!p.me) { meMarker.current?.remove(); meMarker.current = null; return; }
    if (!meMarker.current) {
      const dot = document.createElement("span");
      dot.className = "creno-me";
      dot.setAttribute("aria-hidden", "true");
      meMarker.current = new maplibregl.Marker({ element: dot }).setLngLat([p.me.lng, p.me.lat]).addTo(m);
    } else meMarker.current.setLngLat([p.me.lng, p.me.lat]);
  }, [ready, p.me]);

  // Fit all pins when asked.
  useEffect(() => {
    const m = map.current;
    if (!m || !p.fitKey || !(p.pins?.length)) return;
    const b = new maplibregl.LngLatBounds();
    p.pins.forEach((x) => b.extend([x.lng, x.lat]));
    if (p.me) b.extend([p.me.lng, p.me.lat]);
    m.fitBounds(b, { padding: { top: p.topPadding ?? 40, bottom: p.bottomPadding ?? 40, left: 40, right: 40 }, maxZoom: 15, duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.fitKey]);

  // Fly to the selected salon.
  useEffect(() => {
    const m = map.current;
    if (!m || !p.followSelected || !p.selectedId) return;
    const pin = p.pins?.find((x) => x.id === p.selectedId);
    if (!pin) return;
    m.easeTo({ center: [pin.lng, pin.lat], zoom: Math.max(m.getZoom(), 14), offset: [0, -((p.bottomPadding ?? 0) - (p.topPadding ?? 0)) / 2], duration: 500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.selectedId]);

  // Picker pin.
  useEffect(() => {
    const m = map.current;
    if (!m || p.pick === undefined) return;
    if (!p.pick) { picker.current?.remove(); picker.current = null; return; }
    if (!picker.current) {
      const e = document.createElement("span");
      e.className = "creno-pick";
      e.setAttribute("aria-hidden", "true");
      const mk = new maplibregl.Marker({ element: e, draggable: true, anchor: "bottom" }).setLngLat([p.pick.lng, p.pick.lat]).addTo(m);
      picker.current = mk;
      mk.on("dragend", () => {
        const ll = mk.getLngLat();
        cb.current.onPick?.({ lat: ll.lat, lng: ll.lng });
      });
      m.easeTo({ center: [p.pick.lng, p.pick.lat], zoom: Math.max(m.getZoom(), 16) });
    } else picker.current.setLngLat([p.pick.lng, p.pick.lat]);
  }, [ready, p.pick]);

  // Recentre picker map when the caller moves the centre (e.g. GPS).
  useEffect(() => {
    if (!ready || p.pick === undefined) return;
    map.current?.easeTo({ center: [p.center.lng, p.center.lat], zoom: p.zoom ?? 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, p.center.lat, p.center.lng]);

  return (
    <div className={p.className ?? "relative h-72 w-full"}>
      <div ref={el} style={{ position: "absolute", inset: 0 }} role="application" aria-label="Carte des salons" />
      {p.controls && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-10">
          <MapButton label="Zoomer" onClick={() => map.current?.zoomIn()} d="M12 5v14M5 12h14" />
          <MapButton label="Dézoomer" onClick={() => map.current?.zoomOut()} d="M5 12h14" />
          {p.onLocate && <MapButton label="Me localiser" onClick={p.onLocate} d="M12 2v3M12 19v3M2 12h3M19 12h3M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />}
        </div>
      )}
    </div>
  );
}

function MapButton({ label, onClick, d }: { label: string; onClick: () => void; d: string }) {
  return (
    <button type="button" aria-label={label} onClick={onClick}
      className="size-11 rounded-full bg-white text-ink shadow-lg shadow-black/15 grid place-items-center active:scale-95 transition">
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
    </button>
  );
}
