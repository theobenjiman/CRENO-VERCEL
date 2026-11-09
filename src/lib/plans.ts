import type { PlanId, Salon } from "./types";

export interface Plan {
  id: PlanId;
  label: string;
  monthly: number;          // FCFA
  yearly: number;           // FCFA (2 months free)
  maxStaff: number;
  monthlyOnlineBookings: number;
  deposits: boolean;        // mobile money deposits
  reminders: boolean;       // automatic WhatsApp reminders + rebook nudges
  cashSummary: boolean;     // daily cash summary on WhatsApp
  campaigns: boolean;       // offers / greetings / reminder campaigns
  staffLogins: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free", label: "Découverte", monthly: 0, yearly: 0, maxStaff: 1, monthlyOnlineBookings: 40,
    deposits: false, reminders: false, cashSummary: false, campaigns: false, staffLogins: false,
  },
  pro: {
    id: "pro", label: "Pro", monthly: 7500, yearly: 75000, maxStaff: 4, monthlyOnlineBookings: Infinity,
    deposits: true, reminders: true, cashSummary: true, campaigns: false, staffLogins: false,
  },
  salon_plus: {
    id: "salon_plus", label: "Salon+", monthly: 15000, yearly: 150000, maxStaff: Infinity, monthlyOnlineBookings: Infinity,
    deposits: true, reminders: true, cashSummary: true, campaigns: true, staffLogins: true,
  },
};

export const GRACE_DAYS = 3;

/** Plan in force right now: a paid plan whose period ended (+ grace) counts as free. */
export function effectivePlan(salon: Pick<Salon, "plan" | "plan_expires_at">): Plan {
  const plan = PLANS[salon.plan] ?? PLANS.free;
  if (plan.id === "free") return plan;
  if (salon.plan_expires_at && new Date(salon.plan_expires_at).getTime() + GRACE_DAYS * 86400_000 < Date.now()) {
    return PLANS.free;
  }
  return plan;
}

export function planPrice(plan: PlanId, period: "month" | "year") {
  return period === "year" ? PLANS[plan].yearly : PLANS[plan].monthly;
}
