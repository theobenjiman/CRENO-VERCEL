import QRCode from "qrcode";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/booking";

/** QR code of a salon's booking link. ?format=svg|png  &size=px (png)  &download=1 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: salon } = await createAdminClient().from("salons").select("slug").eq("slug", slug).maybeSingle();
  if (!salon) return new Response("Not found", { status: 404 });

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "png" ? "png" : "svg";
  const size = Math.min(2400, Math.max(200, Number(url.searchParams.get("size")) || 1200));
  const target = `${appUrl()}/${salon.slug}?via=qr`;
  const opts = { errorCorrectionLevel: "M" as const, margin: 2, color: { dark: "#2A1620", light: "#FFFFFF" } };
  const disposition = url.searchParams.get("download") ? `attachment; filename="creno-${salon.slug}-qr.${format}"` : "inline";
  const headers = { "Content-Disposition": disposition, "Cache-Control": "public, max-age=3600" };

  if (format === "png") {
    const buf = await QRCode.toBuffer(target, { ...opts, type: "png", width: size });
    return new Response(new Uint8Array(buf), { headers: { ...headers, "Content-Type": "image/png" } });
  }
  const svg = await QRCode.toString(target, { ...opts, type: "svg" });
  return new Response(svg, { headers: { ...headers, "Content-Type": "image/svg+xml" } });
}
