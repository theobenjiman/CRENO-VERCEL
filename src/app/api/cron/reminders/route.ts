import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { releaseExpiredHolds } from "@/lib/booking";
import { sendWhatsApp } from "@/lib/whatsapp";
import { GRACE_DAYS } from "@/lib/plans";

/**
 * Run every 5–15 minutes (Vercel Cron, Supabase pg_cron + http, or any
 * scheduler):  GET /api/cron/reminders  with  Authorization: Bearer $CRON_SECRET
 * Sends due WhatsApp reminders, frees expired unpaid holds, downgrades lapsed plans.
 */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();
  await releaseExpiredHolds(db);

  // Paid plans that ended more than GRACE_DAYS ago fall back to the free plan.
  await db.from("salons").update({ plan: "free" }).neq("plan", "free")
    .lt("plan_expires_at", new Date(Date.now() - GRACE_DAYS * 86400_000).toISOString());

  const { data: due } = await db
    .from("messages")
    .select("id, to_phone, body, appointment_id, appointments(status)")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .limit(200);

  let sent = 0, skipped = 0;
  for (const m of due ?? []) {
    const appt = Array.isArray(m.appointments) ? m.appointments[0] : m.appointments;
    if (m.appointment_id && appt && appt.status !== "confirmed") {
      await db.from("messages").update({ status: "cancelled" }).eq("id", m.id);
      skipped++;
      continue;
    }
    const res = await sendWhatsApp(m.to_phone, m.body);
    await db.from("messages").update({
      status: res.ok ? "sent" : "failed",
      sent_at: res.ok ? new Date().toISOString() : null,
      provider_ref: res.ref ?? null,
    }).eq("id", m.id);
    if (res.ok) sent++;
  }
  return NextResponse.json({ sent, skipped });
}
