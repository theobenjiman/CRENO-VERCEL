/**
 * WhatsApp sending. Without WHATSAPP_TOKEN the stub logs the message and
 * reports success, so the whole flow works in development.
 *
 * Production note: messages sent outside the 24h customer-service window
 * (reminders, offers, greetings) must use pre-approved message TEMPLATES in
 * the WhatsApp Business Cloud API. Swap `sendText` for a template call once
 * your templates are approved.
 */
export async function sendWhatsApp(toE164: string, body: string): Promise<{ ok: boolean; ref?: string; error?: string }> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    console.log(`[whatsapp:stub] → ${toE164}\n${body}\n`);
    return { ok: true, ref: "stub" };
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toE164.replace("+", ""),
        type: "text",
        text: { body },
      }),
    });
    const json = (await res.json()) as { messages?: { id: string }[]; error?: { message: string } };
    if (!res.ok) return { ok: false, error: json.error?.message ?? res.statusText };
    return { ok: true, ref: json.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
