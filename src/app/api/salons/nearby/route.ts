import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** GET /api/salons/nearby?lat=&lng=&km= — public list of bookable salons near a point. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat"));
  const lng = Number(u.searchParams.get("lng"));
  const km = Math.min(50, Math.max(1, Number(u.searchParams.get("km")) || 10));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "lat/lng invalides" }, { status: 400 });
  }
  const { data, error } = await createAdminClient().rpc("nearby_salons", { p_lat: lat, p_lng: lng, p_km: km, p_limit: 60 });
  if (error) return NextResponse.json({ error: "indisponible" }, { status: 500 });
  return NextResponse.json({ salons: data ?? [] }, { headers: { "Cache-Control": "public, max-age=60" } });
}
