# Créno

Booking and client management for small and medium salons in Côte d'Ivoire.
Next.js 15 (App Router) + Supabase (Postgres, Auth, row-level security) + Tailwind CSS 4.

## What works

| Area | Route | Notes |
| --- | --- | --- |
| Public booking page | `/{salon-slug}` | Au salon / À domicile, service, stylist or "peu importe", day, free slots, name + WhatsApp |
| Home service | same page | Zone with travel fee, landmark, share location, arrival windows, stylist blocked for travel time |
| Deposit (stub) | `/{slug}/pay/{id}` | Wave / Orange Money / MTN choice; slot held 10 min; simulated payment confirms |
| Confirmation | `/{slug}/ok/{id}` | Summary; WhatsApp confirmation sent, reminders scheduled (day before 18:00, 2h before) |
| Owner login | `/login` | Continue with Google, or a sign-in link by email (Supabase Auth) |
| Onboarding | `/onboarding` | Creates the salon, its booking link and default hours |
| Day view | `/app` | Columns per stylist, current-time line, cash of the day, counts, home-visit tags |
| Appointment | `/app/rdv/{id}` | Take the balance (cash / Wave / OM / MTN) and mark done, no-show, cancel |
| Walk-in / phone | `/app/new` | Adds to the schedule, optional WhatsApp confirmation |
| Clients | `/app/clients` | Lists: À relancer (35+ days), Anniversaires (7 days), Fidèles (5+ visits); send Rappel / Offre / Vœux |
| Client file | `/app/clients/{id}` | Notes, birthday, marketing consent, history |
| Cash report | `/app/caisse` | Totals by method and by stylist, send summary to the salon's WhatsApp |
| Settings | `/app/settings` | Salon, services (deposit, home, rebook delay), stylists, hours, home zones, share link |
| Photo slider | `/{slug}` + `/app/settings#photos` | Owner uploads up to 12 photos of her work (JPG/PNG/WebP, 5 MB); they auto-slide at the top of the booking page, swipeable, with captions |
| QR code poster | `/app/qr` | Printable A5/A4 poster with the salon's QR code, PNG/SVG downloads; scanning opens the booking page with a "save this salon" card (contact card + add to home screen) |
| Find a salon (map) | `/salons` | Public map + list of salons near the client (GPS or city), sorted by distance, filters by category and home service, directions and booking. Owners place their salon in Réglages › Votre salon sur la carte |
| Client self-service | `/r/{token}` | Link in every WhatsApp confirmation: reschedule or cancel; deposit rules follow the salon's notice period |
| Stylist skills | `/app/settings#coiffeuses` | Tick which services each stylist does; booking only offers matching stylists |
| Staff logins | `/app/settings#equipe` | Owner invites a stylist by email; she logs in with Google/email and sees only her own agenda (Salon+) |
| Subscription | `/app/abonnement` | Découverte (free) / Pro 7 500 F / Salon+ 15 000 F, monthly or yearly, paid by mobile money (stub) |
| Timezones | Réglages › Salon | Each salon has its own timezone (West & Central Africa, France) |
| Reminder job | `/api/cron/reminders` | Sends due WhatsApp messages, frees expired unpaid holds, downgrades lapsed plans |
| Payment webhook | `/api/payments/webhook` | Ready for your mobile money aggregator |

Stubbed until you add keys: **mobile money** (`src/lib/payments.ts`) and **WhatsApp** (`src/lib/whatsapp.ts`).
Without keys every message is printed in the server console and stored in the `messages` table.

## Set up (about 15 minutes)

1. **Create a Supabase project** at supabase.com.
2. **Create the database**: Supabase › SQL Editor › run, in order,
   `supabase/migrations/0001_init.sql`, `0002_roles_billing_selfservice.sql`, `0003_salon_photos.sql`, `0004_salon_directory.sql`, `0005_tighten_function_grants.sql`, then `0006_email_invites.sql`
   (it also creates the public `salon-photos` storage bucket).
   Optional demo data: then run `supabase/seed.sql` (salon at `/fatou-beaute`, on Salon+ for a year).
3. **Login (Google + email link)** — owners and stylists sign in with Google, or with a link sent by email.
   - Google Cloud Console › new project › *Google Auth Platform*: app name "Créno", support email, audience
     External › *Clients* › Create client › Web application › Authorized redirect URI:
     `https://<your-project-ref>.supabase.co/auth/v1/callback`. Copy the Client ID and Client secret.
   - Supabase › Authentication › Sign In / Providers › Google: enable, paste ID + secret, save.
   - Supabase › Authentication › URL Configuration: Site URL = your app URL; Redirect URLs:
     `http://localhost:3000/**` and your production URL `https://…/**`.
   - The email link works out of the box (Supabase's built-in mailer is rate-limited; add your own SMTP before launch).
4. **Environment**: copy `.env.example` to `.env.local` and fill in the Supabase URL, anon key and service-role key
   (Project settings › API). Keep the service-role key secret.
5. **Run it**
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000 → "Créer mon salon", log in with your test number, create the salon,
   add services and stylists in Réglages, then open your booking link.

To manage the demo salon from the owner app, sign in once and run in SQL:
```sql
insert into salon_members (salon_id, user_id, role)
select s.id, u.id, 'owner' from salons s, auth.users u
where s.slug = 'fatou-beaute' and u.phone = '2250700000001';
```

## Map

The map uses MapLibre GL (vector maps: smooth zoom, pinch, fly-to) with the free OpenFreeMap "liberty" style
— no API key, commercial use allowed. To change the look, set `NEXT_PUBLIC_MAP_STYLE` to another MapLibre
style URL (OpenFreeMap positron/bright, MapTiler, Stadia…). If the style can't load, the map falls back to a
plain background so pins and cards still work.

On `/salons`: full-screen map, floating search (city, distance, "autour de moi"), category chips, price pins,
swipeable salon cards linked to the pins, "Rechercher dans cette zone" after panning, zoom/locate buttons, and a
list view.

## Plans and limits

Defined in `src/lib/plans.ts` (change prices or limits there).

| | Découverte | Pro | Salon+ |
| --- | --- | --- | --- |
| Price / month | free | 7 500 F | 15 000 F |
| Yearly | – | 75 000 F | 150 000 F |
| Active stylists | 1 | 4 | unlimited |
| Online bookings / month | 40 | unlimited | unlimited |
| Mobile money deposits | – | ✓ | ✓ |
| Automatic WhatsApp reminders + rebook nudges | – | ✓ | ✓ |
| Daily cash summary on WhatsApp | – | ✓ | ✓ |
| Offers / greetings / reminder campaigns | – | – | ✓ |
| One login per stylist | – | – | ✓ |

New salons get 30 days of Pro. When a paid period ends there are 3 days of grace, then the cron job moves the
salon to Découverte; nothing is deleted. Salons cannot change their own plan in the database (column-level
grants): only `confirmSubscription()` on the server does.

## Roles

- **Owner** (created the salon): everything.
- **Stylist** (invited by phone): her own agenda only — see appointments, take the balance, mark done/absent,
  add walk-ins for herself. Settings, prices, cash and client campaigns are blocked in the UI and by RLS
  (owner-only write policies in migration 0002).

## Deploy on Netlify

1. Push the project to GitHub, then Netlify › Add new site › Import from GitHub (Next.js is detected automatically).
2. Site configuration › Environment variables: add everything from `.env.example`, with
   `NEXT_PUBLIC_APP_URL=https://<your-site>.netlify.app` (your custom domain later).
3. Deploy. Reminders run by themselves through `netlify/functions/reminders.mts` (every 10 min, uses `CRON_SECRET`).
4. Supabase › Authentication › URL Configuration: Site URL = your Netlify URL; add `https://<your-site>.netlify.app/**`
   to Redirect URLs. Nothing changes in Google Cloud (Google only redirects to Supabase).

## Deploy on Vercel

1. Push the project to GitHub, then vercel.com › Add New › Project › import the repo (Next.js is detected).
2. Environment variables: everything from `.env.example`, with `NEXT_PUBLIC_APP_URL=https://<project>.vercel.app`
   and a long random `CRON_SECRET` (Vercel sends it to the cron route automatically).
3. Deploy. `vercel.json` pins server functions to London (`lhr1`, next to Supabase eu-west-2) and runs the
   reminder job every 10 minutes — sub-daily crons need the Pro plan (also required for commercial use).
4. Supabase › Authentication › URL Configuration: Site URL = your Vercel URL, add `https://<project>.vercel.app/**`.

## Going live

**Mobile money** — implement `startCheckout()` in `src/lib/payments.ts` for your aggregator (CinetPay, PayDunya,
Wave Business…). It handles two kinds of checkout: client deposits (metadata: appointment id) and salon
subscriptions (metadata: salon id, plan, period). Return the hosted checkout URL, set `PAYMENT_PROVIDER` to its
name, and point the provider's webhook to `/api/payments/webhook` (adapt the signature check there).
`confirmDeposit()` and `confirmSubscription()` do the rest.

**WhatsApp** — set `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` (WhatsApp Business Cloud API).
Messages outside the 24-hour reply window (reminders, offers, greetings) must use approved message templates:
create them in Meta Business Manager and switch `sendWhatsApp()` to a template call.
Offers and greetings only go to clients with `marketing_opt_in = true`.

## Code map

```
supabase/migrations/0001_init.sql   schema, double-booking guard, RLS, create_salon()
supabase/migrations/0002_…sql       owner/staff roles, invites, manage tokens, subscriptions, trial
supabase/migrations/0003_…sql       salon photo gallery + storage bucket
supabase/migrations/0004_…sql       salon position, listed flag, nearby_salons() search
supabase/migrations/0005/0006       tighter function grants, stylist invites by email
supabase/seed.sql                   demo salon
src/lib/slots.ts                    slot engine + deposit rules
src/lib/availability.ts             busy times → free slots (booking + reschedule)
src/lib/plans.ts                    plans, prices, limits, effectivePlan()
src/lib/format.ts                   timezone-aware date helpers, FCFA, phone numbers
src/lib/booking.ts                  confirmDeposit, booking messages, hold release
src/lib/payments.ts                 mobile money adapter (stub)
src/lib/whatsapp.ts                 WhatsApp adapter (stub / Cloud API)
src/lib/session.ts                  requireSalon() for owner pages
src/app/[slug]/…                    public booking, payment, confirmation
src/app/r/[token]/…                 client reschedule / cancel
src/app/app/…                       owner & stylist app (agenda, clients, caisse, réglages, abonnement)
src/app/api/…                       cron + payment webhook
```

## Known limits

- Mobile money and WhatsApp are stubs until you connect real providers (see "Going live").
- Refunds for deposits cancelled within the notice period are done by the salon in its mobile money account
  (the salon gets a WhatsApp alert saying a refund or credit is due).
- One salon per owner account in the UI (the database supports more).
