import { NextResponse } from "next/server";
import { confirmDeposit, confirmSubscription } from "@/lib/booking";
import type { PayMethod } from "@/lib/types";

/**
 * Generic payment webhook. Adapt body parsing and signature check to your
 * aggregator. Expected JSON (for testing), header x-webhook-secret: $PAYMENT_WEBHOOK_SECRET
 *   deposit:      { "kind": "deposit", "appointment_id": "...", "method": "wave", "reference": "...", "status": "paid" }
 *   subscription: { "kind": "subscription", "salon_id": "...", "plan": "pro", "period": "month", "method": "wave", "reference": "...", "status": "paid" }
 */
export async function POST(req: Request) {
  if (req.headers.get("x-webhook-secret") !== process.env.PAYMENT_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const b = (await req.json()) as {
    kind?: string; appointment_id?: string; salon_id?: string; plan?: string; period?: string;
    method?: PayMethod; reference?: string; status?: string;
  };
  if (b.status !== "paid") return NextResponse.json({ ignored: true });
  const method = (["wave", "orange", "mtn"].includes(b.method ?? "") ? b.method : "wave") as "wave" | "orange" | "mtn";
  try {
    if (b.kind === "subscription") {
      if (!b.salon_id || !["pro", "salon_plus"].includes(b.plan ?? "") || !["month", "year"].includes(b.period ?? "")) {
        return NextResponse.json({ error: "bad request" }, { status: 400 });
      }
      await confirmSubscription({
        salonId: b.salon_id, plan: b.plan as "pro" | "salon_plus", period: b.period as "month" | "year",
        method, providerRef: b.reference ?? `webhook-${Date.now()}`,
      });
    } else {
      if (!b.appointment_id) return NextResponse.json({ error: "bad request" }, { status: 400 });
      await confirmDeposit(b.appointment_id, method, b.reference ?? "webhook");
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
