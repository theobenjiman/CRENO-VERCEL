import { loadSalonContext } from "@/lib/salon-context";
import { appUrl } from "@/lib/booking";

const esc = (s: string) => s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");

/** vCard so a client can save the salon (WhatsApp number + booking link) in her contacts. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await loadSalonContext(slug);
  if (!ctx) return new Response("Not found", { status: 404 });
  const s = ctx.salon;
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${esc(s.name)}`,
    `ORG:${esc(s.name)}`,
    s.phone ? `TEL;TYPE=CELL,VOICE:${s.phone}` : "",
    `URL:${appUrl()}/${s.slug}`,
    s.address || s.city ? `ADR;TYPE=WORK:;;${esc(s.address ?? "")};${esc(s.city ?? "")};;;` : "",
    `NOTE:${esc(`Réserver en ligne : ${appUrl()}/${s.slug}`)}`,
    "END:VCARD",
  ].filter(Boolean);
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${s.slug}.vcf"`,
    },
  });
}
