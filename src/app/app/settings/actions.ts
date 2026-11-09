"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner, requireSalon } from "@/lib/session";
import { normalizePhone, TIMEZONES } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_PHOTOS, MAX_PHOTO_BYTES, PHOTO_BUCKET, PHOTO_TYPES } from "@/lib/photos";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const int = (f: FormData, k: string) => Math.max(0, Math.round(Number(f.get(k) ?? 0) || 0));
const done = (anchor = "") => { revalidatePath("/app/settings"); redirect(`/app/settings?saved=1${anchor}`); };
const fail = (code: string) => redirect(`/app/settings?e=${code}`);

export async function saveSalon(f: FormData) {
  const { supabase, salon } = await requireOwner();
  const phone = str(f, "phone");
  await supabase.from("salons").update({
    name: str(f, "name") || salon.name,
    phone: phone ? normalizePhone(phone) : null,
    address: str(f, "address") || null,
    city: str(f, "city") || null,
    home_service_enabled: f.get("home") === "on",
    home_deposit_default: str(f, "home_deposit") === "" ? null : int(f, "home_deposit"),
    cancel_notice_hours: Math.min(168, int(f, "notice")),
    timezone: TIMEZONES.some((t) => t.id === str(f, "timezone")) ? str(f, "timezone") : salon.timezone,
  }).eq("id", salon.id);
  done();
}

export async function addService(f: FormData) {
  const { supabase, salon } = await requireOwner();
  const depositType = str(f, "deposit_type");
  await supabase.from("services").insert({
    salon_id: salon.id,
    name: str(f, "name"),
    category: str(f, "category") || null,
    price: int(f, "price"),
    duration_min: Math.min(720, Math.max(10, int(f, "duration"))),
    deposit_type: ["none", "fixed", "percent"].includes(depositType) ? depositType : "none",
    deposit_value: int(f, "deposit_value"),
    home_available: f.get("home") === "on",
    rebook_after_days: int(f, "rebook") || null,
  });
  done();
}

export async function toggleService(f: FormData) {
  const { supabase, salon } = await requireOwner();
  const field = str(f, "field");
  if (!["active", "home_available"].includes(field)) return;
  await supabase.from("services").update({ [field]: f.get("value") === "true" }).eq("id", str(f, "id")).eq("salon_id", salon.id);
  done();
}

export async function addStaff(f: FormData) {
  const { supabase, salon, plan } = await requireOwner();
  const palette = ["#C2255C", "#6D3FA0", "#E07A5F", "#2F7D6D", "#B5651D", "#3A5BA0"];
  const { count: activeCount } = await supabase.from("staff").select("id", { count: "exact", head: true }).eq("salon_id", salon.id).eq("active", true);
  if ((activeCount ?? 0) >= plan.maxStaff) fail("staff_limit");
  const { count } = await supabase.from("staff").select("id", { count: "exact", head: true }).eq("salon_id", salon.id);
  await supabase.from("staff").insert({
    salon_id: salon.id, name: str(f, "name"), color: palette[(count ?? 0) % palette.length],
    does_home_visits: f.get("home") === "on",
  });
  done();
}

export async function toggleStaff(f: FormData) {
  const { supabase, salon, plan } = await requireOwner();
  const field = str(f, "field");
  if (!["active", "does_home_visits"].includes(field)) return;
  if (field === "active" && f.get("value") === "true") {
    const { count } = await supabase.from("staff").select("id", { count: "exact", head: true }).eq("salon_id", salon.id).eq("active", true);
    if ((count ?? 0) >= plan.maxStaff) fail("staff_limit");
  }
  await supabase.from("staff").update({ [field]: f.get("value") === "true" }).eq("id", str(f, "id")).eq("salon_id", salon.id);
  done();
}

export async function saveHours(f: FormData) {
  const { supabase, salon } = await requireOwner();
  const rows = Array.from({ length: 7 }, (_, d) => {
    const closed = f.get(`closed_${d}`) === "on";
    return {
      salon_id: salon.id, weekday: d,
      open_time: closed ? null : str(f, `open_${d}`) || "08:00",
      close_time: closed ? null : str(f, `close_${d}`) || "19:00",
    };
  });
  await supabase.from("opening_hours").upsert(rows, { onConflict: "salon_id,weekday" });
  done();
}

export async function addZone(f: FormData) {
  const { supabase, salon } = await requireOwner();
  await supabase.from("service_zones").insert({
    salon_id: salon.id, name: str(f, "name"), travel_fee: int(f, "fee"),
    travel_minutes: Math.min(240, int(f, "minutes") || 30),
    deposit_override: str(f, "deposit") === "" ? null : int(f, "deposit"),
  });
  done();
}

export async function toggleZone(f: FormData) {
  const { supabase, salon } = await requireOwner();
  await supabase.from("service_zones").update({ active: f.get("value") === "true" }).eq("id", str(f, "id")).eq("salon_id", salon.id);
  done();
}

/** Which services a stylist does. All ticked = no rows (does everything). */
export async function saveSkills(f: FormData) {
  const { supabase, salon } = await requireOwner();
  const staffId = str(f, "staff_id");
  const { data: st } = await supabase.from("staff").select("id").eq("id", staffId).eq("salon_id", salon.id).maybeSingle();
  if (!st) return;
  const { data: services } = await supabase.from("services").select("id").eq("salon_id", salon.id).eq("active", true);
  const chosen = f.getAll("service").map(String).filter((id) => (services ?? []).some((s) => s.id === id));
  await supabase.from("staff_services").delete().eq("staff_id", staffId);
  if (chosen.length > 0 && chosen.length < (services ?? []).length) {
    await supabase.from("staff_services").insert(chosen.map((service_id) => ({ staff_id: staffId, service_id })));
  }
  done("#coiffeuses");
}

export async function inviteStaff(f: FormData) {
  const { supabase, salon, plan } = await requireOwner();
  if (!plan.staffLogins) redirect("/app/abonnement");
  const email = str(f, "email").toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) fail("email");
  const staffId = str(f, "staff_id");
  await supabase.from("staff_invites").delete().eq("salon_id", salon.id).eq("email", email).is("accepted_at", null);
  const { error } = await supabase.from("staff_invites").insert({ salon_id: salon.id, staff_id: staffId, email });
  if (error) fail("invite");
  done("#equipe");
}

export async function revokeAccess(f: FormData) {
  const { supabase, salon } = await requireOwner();
  const userId = str(f, "user_id");
  const inviteId = str(f, "invite_id");
  if (userId) await supabase.from("salon_members").delete().eq("salon_id", salon.id).eq("user_id", userId).eq("role", "staff");
  if (inviteId) await supabase.from("staff_invites").delete().eq("salon_id", salon.id).eq("id", inviteId);
  done("#equipe");
}

export async function saveLocation(f: FormData) {
  const { supabase, salon } = await requireOwner();
  const lat = Number(str(f, "lat")), lng = Number(str(f, "lng"));
  const valid = str(f, "lat") !== "" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  await supabase.from("salons").update({
    lat: valid ? lat : null,
    lng: valid ? lng : null,
    listed: f.get("listed") === "on",
  }).eq("id", salon.id);
  done("#carte");
}

export async function uploadPhotos(f: FormData) {
  const { supabase, salon } = await requireOwner();
  const files = f.getAll("photos").filter((x): x is File => x instanceof File && x.size > 0);
  if (files.length === 0) fail("photo_none");
  const { count } = await supabase.from("salon_photos").select("id", { count: "exact", head: true }).eq("salon_id", salon.id);
  if ((count ?? 0) + files.length > MAX_PHOTOS) fail("photo_max");
  const admin = createAdminClient();
  let position = count ?? 0;
  for (const file of files) {
    const ext = PHOTO_TYPES[file.type];
    if (!ext) fail("photo_type");
    if (file.size > MAX_PHOTO_BYTES) fail("photo_size");
    const path = `${salon.id}/${crypto.randomUUID()}.${ext}`;
    const up = await admin.storage.from(PHOTO_BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (up.error) fail("photo_upload");
    await supabase.from("salon_photos").insert({ salon_id: salon.id, path, position: position++ });
  }
  done("#photos");
}

export async function savePhoto(f: FormData) {
  const { supabase, salon } = await requireOwner();
  const id = str(f, "id");
  const { data: photos } = await supabase.from("salon_photos").select("id, path, position").eq("salon_id", salon.id).order("position");
  const list = photos ?? [];
  const photo = list.find((p) => p.id === id);
  if (!photo) return;
  const action = str(f, "action");
  if (action === "delete") {
    await createAdminClient().storage.from(PHOTO_BUCKET).remove([photo.path]);
    await supabase.from("salon_photos").delete().eq("id", id).eq("salon_id", salon.id);
  } else if (action === "first") {
    const ordered = [photo, ...list.filter((p) => p.id !== id)];
    for (const [i, p] of ordered.entries()) await supabase.from("salon_photos").update({ position: i }).eq("id", p.id);
  } else {
    await supabase.from("salon_photos").update({ caption: str(f, "caption").slice(0, 80) || null }).eq("id", id).eq("salon_id", salon.id);
  }
  done("#photos");
}

export async function signOut() {
  const { supabase } = await requireSalon();
  await supabase.auth.signOut();
  redirect("/login");
}
