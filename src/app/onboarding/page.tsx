import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const RESERVED = new Set(["app", "login", "onboarding", "api", "admin", "aide", "help", "creno", "salons", "r"]);

async function createSalon(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const city = String(formData.get("city") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (name.length < 2 || slug.length < 3 || RESERVED.has(slug)) redirect("/onboarding?e=slug");
  const { error } = await supabase.rpc("create_salon", { p_name: name, p_slug: slug, p_city: city, p_phone: phone });
  if (error) redirect(`/onboarding?e=${error.code === "23505" ? "taken" : "fail"}`);
  redirect("/app/settings?welcome=1");
}

const ERR: Record<string, string> = {
  slug: "Choisissez un nom et un lien d'au moins 3 lettres.",
  taken: "Ce lien est déjà pris. Essayez une autre variante.",
  fail: "Création impossible. Réessayez.",
};

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <main className="mx-auto max-w-sm min-h-screen px-6 py-12 flex flex-col gap-6">
      <div className="font-display italic font-bold text-3xl text-berry">créno</div>
      <h1 className="font-display font-bold text-2xl">Créez votre salon</h1>
      <form action={createSalon} className="flex flex-col gap-3">
        <label className="label">Nom du salon<input className="input" name="name" required placeholder="Chez Fatou Beauté" /></label>
        <label className="label">Lien de réservation
          <span className="flex items-center gap-1 text-sm text-ink">creno.app/<input className="input" name="slug" required placeholder="fatou-beaute" /></span>
        </label>
        <label className="label">Ville<input className="input" name="city" placeholder="Abidjan" /></label>
        <label className="label">WhatsApp du salon<input className="input" name="phone" inputMode="tel" placeholder="07 00 00 00 00" /></label>
        {e && <p role="alert" className="text-sm font-semibold text-[#A3203F]">{ERR[e] ?? ERR.fail}</p>}
        <button className="btn-primary">Créer mon salon</button>
      </form>
    </main>
  );
}
