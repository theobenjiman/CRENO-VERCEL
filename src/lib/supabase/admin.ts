import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS — use ONLY in server code for the public
 * booking flow, webhooks and cron jobs, and always scope queries by salon_id.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
