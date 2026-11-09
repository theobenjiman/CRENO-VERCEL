/**
 * Vector map style (MapLibre). Default: OpenFreeMap "liberty" — free, no API
 * key, commercial use allowed. To change the look, point NEXT_PUBLIC_MAP_STYLE
 * to another MapLibre style URL (OpenFreeMap "positron"/"bright", MapTiler,
 * Stadia…). If the style cannot load, the map falls back to a plain background
 * so pins and cards keep working.
 */
export const MAP_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE || "https://tiles.openfreemap.org/styles/liberty";

export const CITIES: { id: string; label: string; lat: number; lng: number }[] = [
  { id: "abidjan", label: "Abidjan", lat: 5.3484, lng: -4.0083 },
  { id: "bouake", label: "Bouaké", lat: 7.6906, lng: -5.0391 },
  { id: "yamoussoukro", label: "Yamoussoukro", lat: 6.8276, lng: -5.2893 },
  { id: "san-pedro", label: "San-Pédro", lat: 4.7485, lng: -6.6363 },
  { id: "korhogo", label: "Korhogo", lat: 9.4580, lng: -5.6296 },
  { id: "daloa", label: "Daloa", lat: 6.8774, lng: -6.4502 },
  { id: "dakar", label: "Dakar", lat: 14.7167, lng: -17.4677 },
  { id: "lome", label: "Lomé", lat: 6.1375, lng: 1.2123 },
];

export interface NearbySalon {
  id: string; name: string; slug: string; address: string | null; city: string | null;
  lat: number; lng: number; home_service: boolean; distance_km: number;
  min_price: number | null; categories: string[]; photo_path: string | null;
}
