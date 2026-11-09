export type DepositType = "none" | "fixed" | "percent";
export type LocationType = "salon" | "home";
export type AppointmentStatus = "pending_payment" | "confirmed" | "done" | "no_show" | "cancelled";
export type PayMethod = "wave" | "orange" | "mtn" | "cash";

export interface Salon {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  home_service_enabled: boolean;
  home_deposit_default: number | null;
  timezone: string;
  plan: PlanId;
  plan_expires_at: string | null;
  cancel_notice_hours: number;
  lat: number | null;
  lng: number | null;
  listed: boolean;
}

export type PlanId = "free" | "pro" | "salon_plus";

export interface Staff {
  id: string;
  salon_id: string;
  name: string;
  color: string;
  does_home_visits: boolean;
  active: boolean;
}

export interface Service {
  id: string;
  salon_id: string;
  name: string;
  category: string | null;
  price: number;
  duration_min: number;
  deposit_type: DepositType;
  deposit_value: number;
  home_available: boolean;
  rebook_after_days: number | null;
  active: boolean;
}

export interface Zone {
  id: string;
  salon_id: string;
  name: string;
  travel_fee: number;
  travel_minutes: number;
  deposit_override: number | null;
  active: boolean;
}

export interface OpeningHours {
  salon_id: string;
  weekday: number; // 0 = dimanche
  open_time: string | null; // "08:00:00"
  close_time: string | null;
}

export interface Client {
  id: string;
  salon_id: string;
  phone: string;
  name: string;
  notes: string | null;
  birthday: string | null;
  marketing_opt_in: boolean;
  visits_count: number;
  total_spent: number;
  last_visit_at: string | null;
  no_show_count: number;
}

export interface Appointment {
  id: string;
  salon_id: string;
  client_id: string;
  staff_id: string;
  service_id: string;
  start_at: string;
  end_at: string;
  block_start: string;
  block_end: string;
  status: AppointmentStatus;
  source: "online" | "walk_in" | "phone";
  location_type: LocationType;
  zone_id: string | null;
  landmark: string | null;
  price: number;
  travel_fee: number;
  deposit_amount: number;
  balance_paid: number;
  hold_expires_at: string | null;
}
