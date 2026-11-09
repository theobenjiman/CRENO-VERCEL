import type { Config } from "@netlify/functions";

/**
 * Netlify Scheduled Function: every 10 minutes, calls the app's reminder job
 * (sends due WhatsApp reminders, frees expired unpaid slots, downgrades lapsed plans).
 * Needs the env vars URL (set by Netlify) and CRON_SECRET.
 */
export default async () => {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.URL;
  const res = await fetch(`${base}/api/cron/reminders`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  console.log("reminders:", res.status, await res.text());
};

export const config: Config = { schedule: "*/10 * * * *" };
