import { loadSalonContext } from "@/lib/salon-context";

/** Per-salon manifest: "Add to home screen" opens this salon's booking page. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await loadSalonContext(slug);
  if (!ctx) return new Response("Not found", { status: 404 });
  return Response.json({
    name: `${ctx.salon.name} — Réserver`,
    short_name: ctx.salon.name.slice(0, 12),
    start_url: `/${ctx.salon.slug}?via=homescreen`,
    scope: `/${ctx.salon.slug}`,
    display: "standalone",
    background_color: "#FFF6F8",
    theme_color: "#8E2457",
    icons: [{ src: "/favicon.ico", sizes: "48x48", type: "image/x-icon" }],
  }, { headers: { "Content-Type": "application/manifest+json" } });
}
