import Link from "next/link";
import { requireOwner } from "@/lib/session";
import { dateLong, displayPhone, fcfa, localDate, TIMEZONES, WEEKDAYS_FR } from "@/lib/format";
import { one } from "@/lib/booking";
import { MAX_PHOTOS, photoUrl, type SalonPhoto } from "@/lib/photos";
import LocationPicker from "./LocationPicker";
import PhotoInput from "@/components/PhotoInput";
import type { OpeningHours, Service, Staff, Zone } from "@/lib/types";
import {
  addService, addStaff, addZone, inviteStaff, revokeAccess, saveHours, saveSalon, saveSkills, signOut,
  savePhoto, uploadPhotos, saveLocation,
  toggleService, toggleStaff, toggleZone,
} from "./actions";

type Props = { searchParams: Promise<{ saved?: string; welcome?: string; e?: string }> };

const ERR: Record<string, string> = {
  staff_limit: "Votre abonnement ne permet pas plus de coiffeuses actives. Passez à l'abonnement supérieur.",
  phone: "Numéro invalide. Exemple : 07 00 00 00 00",
  email: "Adresse email invalide.",
  invite: "Invitation impossible. Réessayez.",
  photo_none: "Choisissez au moins une photo.",
  photo_max: `Maximum ${MAX_PHOTOS} photos. Supprimez-en avant d'en ajouter.`,
  photo_type: "Formats acceptés : JPG, PNG ou WebP.",
  photo_size: "Chaque photo doit faire moins de 5 Mo.",
  photo_upload: "L'envoi de la photo a échoué. Réessayez.",
};

export default async function SettingsPage({ searchParams }: Props) {
  const { saved, welcome, e } = await searchParams;
  const { supabase, salon, plan, tz } = await requireOwner();
  const [{ data: services }, { data: staff }, { data: zones }, { data: hours }, { data: skills }, { data: members }, { data: invites }, { data: photoRows }] = await Promise.all([
    supabase.from("services").select("*").eq("salon_id", salon.id).order("created_at"),
    supabase.from("staff").select("*").eq("salon_id", salon.id).order("created_at"),
    supabase.from("service_zones").select("*").eq("salon_id", salon.id).order("travel_fee"),
    supabase.from("opening_hours").select("*").eq("salon_id", salon.id),
    supabase.from("staff_services").select("staff_id, service_id, staff!inner(salon_id)").eq("staff.salon_id", salon.id),
    supabase.from("salon_members").select("user_id, role, staff_id, staff(name)").eq("salon_id", salon.id).eq("role", "staff"),
    supabase.from("staff_invites").select("id, phone, email, staff_id, accepted_at, staff(name)").eq("salon_id", salon.id).is("accepted_at", null),
    supabase.from("salon_photos").select("id, path, caption, position").eq("salon_id", salon.id).order("position").order("created_at"),
  ]);
  const photos = (photoRows ?? []) as SalonPhoto[];
  const activeServices = ((services ?? []) as Service[]).filter((x) => x.active);
  const link = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/${salon.slug}`;
  const order = [1, 2, 3, 4, 5, 6, 0];

  return (
    <div className="px-4 pt-5 flex flex-col gap-5">
      <h1 className="font-display font-extrabold text-2xl">Réglages</h1>
      {welcome && (
        <div className="card p-4 text-sm bg-petal border-transparent">
          Bienvenue ! Vous avez 30 jours de Créno Pro offerts. Ajoutez vos prestations et vos coiffeuses, puis partagez votre lien sur WhatsApp.
        </div>
      )}
      {saved && <p role="status" className="text-sm font-semibold text-berry">Enregistré.</p>}
      {e && <p role="alert" className="text-sm font-semibold text-[#A3203F]">{ERR[e] ?? "Une erreur est survenue."}</p>}

      <Link href="/app/abonnement" className="card p-4 flex items-center justify-between">
        <span>
          <span className="section-title block">Abonnement</span>
          <span className="font-bold">{plan.label}</span>
          {salon.plan !== "free" && salon.plan_expires_at && (
            <span className="text-sm text-muted"> · jusqu&apos;au {dateLong(localDate(salon.plan_expires_at, tz))}</span>
          )}
        </span>
        <span className="text-rose font-semibold text-sm">Gérer ›</span>
      </Link>

      <section className="card p-4 flex flex-col gap-2">
        <h2 className="section-title">Votre lien de réservation</h2>
        <a href={`/${salon.slug}`} className="font-semibold text-rose break-all">{link}</a>
        <div className="grid grid-cols-2 gap-2">
          <a className="btn-ghost" href={`https://wa.me/?text=${encodeURIComponent(`Réservez chez ${salon.name} ici : ${link}`)}`}>Partager sur WhatsApp</a>
          <Link className="btn-primary" href="/app/qr">QR code à afficher</Link>
        </div>
      </section>

      <Section title="Votre salon sur la carte" id="carte">
        <p className="text-sm text-muted">
          Placez le salon sur la carte pour que les clientes du quartier vous trouvent dans « Trouver un salon près de moi ».
          {salon.lat == null && <strong className="text-berry"> Pas encore placé.</strong>}
        </p>
        <form action={saveLocation} className="flex flex-col gap-3">
          <LocationPicker lat={salon.lat} lng={salon.lng} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="listed" defaultChecked={salon.listed} className="accent-rose size-4" />
            Apparaître dans la recherche de salons
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/salons" className="btn-ghost">Voir la carte</Link>
            <button className="btn-primary">Enregistrer</button>
          </div>
        </form>
      </Section>

      <Section title={`Photos de vos réalisations (${photos.length}/${MAX_PHOTOS})`} id="photos">
        <p className="text-sm text-muted">Elles défilent en haut de votre page de réservation. Mettez vos plus belles coiffures, avec l&apos;accord de vos clientes.</p>
        {photos.length > 0 && (
          <ul className="grid grid-cols-2 gap-3">
            {photos.map((p, i) => (
              <li key={p.id} className="flex flex-col gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl(p.path)} alt={p.caption ?? `Photo ${i + 1}`} className="aspect-[4/3] w-full object-cover rounded-xl border border-line" />
                <form action={savePhoto} className="flex flex-col gap-1.5">
                  <input type="hidden" name="id" value={p.id} />
                  <input className="input min-h-9 text-xs" name="caption" defaultValue={p.caption ?? ""} placeholder="Légende (ex. Knotless moyennes)" aria-label={`Légende photo ${i + 1}`} />
                  <div className="flex gap-1.5">
                    <button name="action" value="caption" className="btn-ghost min-h-9 flex-1 px-2 text-xs">OK</button>
                    {i > 0 && <button name="action" value="first" className="btn-ghost min-h-9 px-2 text-xs">En 1er</button>}
                    <button name="action" value="delete" className="btn-ghost min-h-9 px-2 text-xs text-[#A3203F]">Suppr.</button>
                  </div>
                </form>
              </li>
            ))}
          </ul>
        )}
        {photos.length < MAX_PHOTOS && (
          <form action={uploadPhotos} className="flex flex-col gap-2 pt-2 border-t border-line">
            <label className="label">Ajouter des photos (elles sont réduites automatiquement)
              <PhotoInput name="photos" max={MAX_PHOTOS - photos.length} />
            </label>
            <button className="btn-primary">Envoyer</button>
          </form>
        )}
      </Section>

      <Section title="Salon">
        <form action={saveSalon} className="flex flex-col gap-3">
          <label className="label">Nom<input className="input" name="name" defaultValue={salon.name} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="label">WhatsApp du salon<input className="input" name="phone" defaultValue={salon.phone ? displayPhone(salon.phone) : ""} /></label>
            <label className="label">Ville<input className="input" name="city" defaultValue={salon.city ?? ""} /></label>
          </div>
          <label className="label">Adresse / quartier<input className="input" name="address" defaultValue={salon.address ?? ""} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="home" defaultChecked={salon.home_service_enabled} className="accent-rose size-4" /> Proposer les prestations à domicile</label>
          <div className="grid grid-cols-2 gap-2">
            <label className="label">Fuseau horaire
              <select className="input" name="timezone" defaultValue={salon.timezone}>
                {TIMEZONES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
            <label className="label">Délai pour déplacer / annuler (h)
              <input className="input" name="notice" type="number" min={0} max={168} defaultValue={salon.cancel_notice_hours} />
            </label>
          </div>
          <label className="label">Acompte par défaut à domicile (F, vide = celui de la prestation)
            <input className="input" name="home_deposit" type="number" min={0} step={500} defaultValue={salon.home_deposit_default ?? ""} />
          </label>
          <button className="btn-primary">Enregistrer</button>
        </form>
      </Section>

      <Section title="Prestations">
        <ul className="flex flex-col gap-2">
          {((services ?? []) as Service[]).map((s) => (
            <li key={s.id} className={`rounded-xl border border-line p-3 flex flex-col gap-2 ${s.active ? "" : "opacity-60"}`}>
              <div className="flex justify-between gap-2 text-sm">
                <span><strong>{s.name}</strong><br /><span className="text-muted">{s.duration_min} min · acompte {s.deposit_type === "none" ? "aucun" : s.deposit_type === "fixed" ? fcfa(s.deposit_value) : `${s.deposit_value} %`}</span></span>
                <span className="font-bold">{fcfa(s.price)}</span>
              </div>
              <div className="flex gap-2">
                <Toggle action={toggleService} id={s.id} field="home_available" on={s.home_available} labelOn="À domicile ✓" labelOff="Pas à domicile" />
                <Toggle action={toggleService} id={s.id} field="active" on={s.active} labelOn="Active" labelOff="Masquée" />
              </div>
            </li>
          ))}
        </ul>
        <form action={addService} className="flex flex-col gap-2 pt-2 border-t border-line">
          <p className="text-sm font-semibold">Ajouter une prestation</p>
          <input className="input" name="name" required placeholder="Ex. Tresses knotless — moyennes" />
          <div className="grid grid-cols-3 gap-2">
            <label className="label">Prix (F)<input className="input" name="price" type="number" min={0} step={500} required /></label>
            <label className="label">Durée (min)<input className="input" name="duration" type="number" min={10} step={15} defaultValue={60} required /></label>
            <label className="label">Catégorie<input className="input" name="category" placeholder="Tresses" /></label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="label">Acompte
              <select className="input" name="deposit_type" defaultValue="fixed">
                <option value="none">Aucun</option><option value="fixed">Montant</option><option value="percent">%</option>
              </select>
            </label>
            <label className="label">Valeur<input className="input" name="deposit_value" type="number" min={0} defaultValue={2000} /></label>
            <label className="label">Relance (jours)<input className="input" name="rebook" type="number" min={0} placeholder="30" /></label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="home" className="accent-rose size-4" /> Disponible à domicile</label>
          <button className="btn-primary">Ajouter</button>
        </form>
      </Section>

      <Section title={`Coiffeuses (${((staff ?? []) as Staff[]).filter((x) => x.active).length}/${Number.isFinite(plan.maxStaff) ? plan.maxStaff : "∞"})`} id="coiffeuses">
        <ul className="flex flex-col gap-2">
          {((staff ?? []) as Staff[]).map((s) => {
            const own = (skills ?? []).filter((k) => k.staff_id === s.id).map((k) => k.service_id);
            const doesAll = own.length === 0;
            return (
              <li key={s.id} className={`rounded-xl border border-line p-3 flex flex-col gap-2 ${s.active ? "" : "opacity-60"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-semibold"><span className="size-3 rounded-full" style={{ background: s.color }} />{s.name}</span>
                  <span className="flex gap-2">
                    <Toggle action={toggleStaff} id={s.id} field="does_home_visits" on={s.does_home_visits} labelOn="Se déplace" labelOff="Salon seul." />
                    <Toggle action={toggleStaff} id={s.id} field="active" on={s.active} labelOn="Active" labelOff="Inactive" />
                  </span>
                </div>
                <details>
                  <summary className="text-xs text-muted cursor-pointer">
                    Prestations : {doesAll ? "toutes" : `${own.length} sur ${activeServices.length}`}
                  </summary>
                  <form action={saveSkills} className="flex flex-col gap-1.5 pt-2">
                    <input type="hidden" name="staff_id" value={s.id} />
                    {activeServices.map((sv) => (
                      <label key={sv.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="service" value={sv.id} defaultChecked={doesAll || own.includes(sv.id)} className="accent-rose size-4" />
                        {sv.name}
                      </label>
                    ))}
                    <button className="btn-ghost mt-1">Enregistrer ses prestations</button>
                  </form>
                </details>
              </li>
            );
          })}
        </ul>
        <form action={addStaff} className="flex flex-col gap-2 pt-2 border-t border-line">
          <div className="flex gap-2">
            <input className="input" name="name" required placeholder="Prénom de la coiffeuse" />
            <button className="btn-primary shrink-0">Ajouter</button>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="home" className="accent-rose size-4" /> Fait des prestations à domicile</label>
        </form>
      </Section>

      <Section title="Accès de l'équipe" id="equipe">
        {!plan.staffLogins ? (
          <p className="text-sm text-muted">
            Donnez à chaque coiffeuse son propre accès (elle ne voit que ses rendez-vous) avec l&apos;abonnement Salon+.{" "}
            <Link href="/app/abonnement" className="text-rose font-semibold">Voir les abonnements</Link>
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-2 text-sm">
              {(members ?? []).map((m) => (
                <li key={m.user_id} className="rounded-xl border border-line p-3 flex items-center justify-between">
                  <span><strong>{one(m.staff)?.name ?? "Coiffeuse"}</strong> · accès actif</span>
                  <form action={revokeAccess}><input type="hidden" name="user_id" value={m.user_id} /><button className="text-xs text-[#A3203F] font-semibold min-h-9">Retirer</button></form>
                </li>
              ))}
              {(invites ?? []).map((i) => (
                <li key={i.id} className="rounded-xl border border-dashed border-line p-3 flex items-center justify-between">
                  <span><strong>{one(i.staff)?.name}</strong> · invitée ({i.email ?? (i.phone ? displayPhone(i.phone) : "")})</span>
                  <form action={revokeAccess}><input type="hidden" name="invite_id" value={i.id} /><button className="text-xs text-muted font-semibold min-h-9">Annuler</button></form>
                </li>
              ))}
            </ul>
            <form action={inviteStaff} className="flex flex-col gap-2 pt-2 border-t border-line">
              <p className="text-sm font-semibold">Inviter une coiffeuse</p>
              <div className="grid grid-cols-2 gap-2">
                <select className="input" name="staff_id" required aria-label="Coiffeuse">
                  {((staff ?? []) as Staff[]).filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                <input className="input" name="email" type="email" inputMode="email" required placeholder="Son email (Gmail)" aria-label="Email de la coiffeuse" />
              </div>
              <p className="text-xs text-muted">Elle se connecte sur {process.env.NEXT_PUBLIC_APP_URL ?? ""}/login avec Google (ou un lien email) en utilisant cette adresse, et voit seulement ses rendez-vous.</p>
              <button className="btn-primary">Envoyer l&apos;invitation</button>
            </form>
          </>
        )}
      </Section>

      <Section title="Horaires">
        <form action={saveHours} className="flex flex-col gap-2">
          {order.map((d) => {
            const h = ((hours ?? []) as OpeningHours[]).find((x) => x.weekday === d);
            return (
              <div key={d} className="grid grid-cols-[80px_1fr_1fr_auto] items-center gap-2 text-sm">
                <span className="font-semibold">{WEEKDAYS_FR[d]}</span>
                <input aria-label={`Ouverture ${WEEKDAYS_FR[d]}`} className="input" type="time" name={`open_${d}`} defaultValue={h?.open_time?.slice(0, 5) ?? "08:00"} />
                <input aria-label={`Fermeture ${WEEKDAYS_FR[d]}`} className="input" type="time" name={`close_${d}`} defaultValue={h?.close_time?.slice(0, 5) ?? "19:00"} />
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" name={`closed_${d}`} defaultChecked={!h?.open_time} className="accent-rose" />Fermé</label>
              </div>
            );
          })}
          <button className="btn-primary">Enregistrer les horaires</button>
        </form>
      </Section>

      <Section title="Zones à domicile">
        <ul className="flex flex-col gap-2">
          {((zones ?? []) as Zone[]).map((z) => (
            <li key={z.id} className={`rounded-xl border border-line p-3 flex items-center justify-between gap-2 text-sm ${z.active ? "" : "opacity-60"}`}>
              <span><strong>{z.name}</strong><br /><span className="text-muted">Déplacement {fcfa(z.travel_fee)} · {z.travel_minutes} min de trajet{z.deposit_override != null ? ` · acompte ${fcfa(z.deposit_override)}` : ""}</span></span>
              <Toggle action={toggleZone} id={z.id} field="active" on={z.active} labelOn="Active" labelOff="Inactive" />
            </li>
          ))}
        </ul>
        <form action={addZone} className="flex flex-col gap-2 pt-2 border-t border-line">
          <input className="input" name="name" required placeholder="Commune / quartier, ex. Riviera 3" />
          <div className="grid grid-cols-3 gap-2">
            <label className="label">Frais (F)<input className="input" name="fee" type="number" min={0} step={500} defaultValue={2000} /></label>
            <label className="label">Trajet (min)<input className="input" name="minutes" type="number" min={0} step={5} defaultValue={30} /></label>
            <label className="label">Acompte (F)<input className="input" name="deposit" type="number" min={0} step={500} placeholder="défaut" /></label>
          </div>
          <button className="btn-primary">Ajouter la zone</button>
        </form>
      </Section>

      <form action={signOut}><button className="btn-ghost w-full">Se déconnecter</button></form>
    </div>
  );
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="card p-4 flex flex-col gap-3 scroll-mt-4">
      <h2 className="section-title">{title}</h2>
      {children}
    </section>
  );
}

function Toggle({ action, id, field, on, labelOn, labelOff }: {
  action: (f: FormData) => Promise<void>; id: string; field: string; on: boolean; labelOn: string; labelOff: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="value" value={String(!on)} />
      <button className={`min-h-9 px-3 rounded-full text-xs font-semibold ${on ? "bg-petal text-berry" : "bg-white border border-line text-muted"}`}>
        {on ? labelOn : labelOff}
      </button>
    </form>
  );
}
