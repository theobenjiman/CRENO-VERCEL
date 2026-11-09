/**
 * Mobile money checkouts — for client deposits and for salons paying their
 * Créno subscription.
 *
 * PAYMENT_PROVIDER=stub  → internal pages simulate the payment:
 *   deposits:      /[slug]/pay/[appointmentId]
 *   subscriptions: /app/abonnement/payer?plan=…&period=…
 *
 * To go live, implement `startCheckout` for your aggregator (CinetPay,
 * PayDunya, Wave Business…): create a payment for `amount` with the metadata
 * below, return its hosted checkout URL, and point the provider's webhook to
 * /api/payments/webhook, which calls confirmDeposit() / confirmSubscription().
 */
export type CheckoutInput =
  | { kind: "deposit"; appointmentId: string; salonSlug: string; amount: number; clientPhone: string; description: string }
  | { kind: "subscription"; salonId: string; plan: "pro" | "salon_plus"; period: "month" | "year"; amount: number; description: string };

export async function startCheckout(input: CheckoutInput): Promise<{ redirectUrl: string }> {
  const provider = process.env.PAYMENT_PROVIDER ?? "stub";
  if (provider === "stub") {
    if (input.kind === "deposit") return { redirectUrl: `/${input.salonSlug}/pay/${input.appointmentId}` };
    return { redirectUrl: `/app/abonnement/payer?plan=${input.plan}&period=${input.period}` };
  }
  throw new Error(`Payment provider "${provider}" is not implemented yet — see src/lib/payments.ts`);
}
