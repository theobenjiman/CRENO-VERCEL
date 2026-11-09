/**
 * Salon-local time helpers. Every salon has an IANA timezone (default
 * Africa/Abidjan). Dates written as "YYYY-MM-DD" are calendar days in the
 * salon's zone; instants are ISO strings in UTC.
 */
export const TZ = "Africa/Abidjan";

export const TIMEZONES: { id: string; label: string }[] = [
  { id: "Africa/Abidjan", label: "Côte d'Ivoire (GMT)" },
  { id: "Africa/Dakar", label: "Sénégal (GMT)" },
  { id: "Africa/Lome", label: "Togo (GMT)" },
  { id: "Africa/Accra", label: "Ghana (GMT)" },
  { id: "Africa/Bamako", label: "Mali (GMT)" },
  { id: "Africa/Ouagadougou", label: "Burkina Faso (GMT)" },
  { id: "Africa/Conakry", label: "Guinée (GMT)" },
  { id: "Africa/Porto-Novo", label: "Bénin (GMT+1)" },
  { id: "Africa/Lagos", label: "Nigeria (GMT+1)" },
  { id: "Africa/Douala", label: "Cameroun (GMT+1)" },
  { id: "Africa/Libreville", label: "Gabon (GMT+1)" },
  { id: "Africa/Kinshasa", label: "RDC Kinshasa (GMT+1)" },
  { id: "Africa/Niamey", label: "Niger (GMT+1)" },
  { id: "Europe/Paris", label: "France" },
];

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function parts(at: Date, tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    fmtCache.set(tz, f);
  }
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(at)) if (p.type !== "literal") o[p.type] = Number(p.value);
  return { y: o.year, m: o.month, d: o.day, h: o.hour === 24 ? 0 : o.hour, mi: o.minute };
}

/** Offset of `tz` from UTC at instant `at`, in minutes (e.g. +60 for Lagos). */
export function offsetMinutes(at: Date, tz: string): number {
  const t = Math.floor(at.getTime() / 60_000) * 60_000;
  const p = parts(new Date(t), tz);
  return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - t) / 60_000);
}

/** The instant when the wall clock in `tz` shows `dateISO` + `minutes` after midnight. */
export function atMinutes(dateISO: string, minutes: number, tz: string = TZ): Date {
  const guess = Date.UTC(Number(dateISO.slice(0, 4)), Number(dateISO.slice(5, 7)) - 1, Number(dateISO.slice(8, 10)), 0, minutes);
  const off1 = offsetMinutes(new Date(guess), tz);
  let t = guess - off1 * 60_000;
  const off2 = offsetMinutes(new Date(t), tz);
  if (off2 !== off1) t = guess - off2 * 60_000;
  return new Date(t);
}

/** Calendar day (YYYY-MM-DD) of an instant in `tz`. */
export function localDate(at: string | Date, tz: string = TZ): string {
  const p = parts(typeof at === "string" ? new Date(at) : at, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function hhmm(at: string | Date, tz: string = TZ): string {
  const p = parts(typeof at === "string" ? new Date(at) : at, tz);
  return `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;
}

/** Minutes after local midnight. */
export function localMinutes(at: string | Date, tz: string = TZ): number {
  const p = parts(typeof at === "string" ? new Date(at) : at, tz);
  return p.h * 60 + p.mi;
}

export function todayISO(tz: string = TZ): string {
  return localDate(new Date(), tz);
}

/** [start, end) of a local calendar day, as UTC ISO strings for queries. */
export function dayRange(dateISO: string, tz: string = TZ): [string, string] {
  return [atMinutes(dateISO, 0, tz).toISOString(), atMinutes(addDays(dateISO, 1), 0, tz).toISOString()];
}

export function fcfa(n: number | null | undefined): string {
  return `${new Intl.NumberFormat("fr-FR").format(n ?? 0).replace(/\u202f|\u00a0/g, " ")} F`;
}

export function addDays(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekday(dateISO: string): number {
  return new Date(`${dateISO}T00:00:00Z`).getUTCDay();
}

export function minutesOfDay(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

const DAY = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const DAY_LONG = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MONTH = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export function dayShort(dateISO: string) {
  return DAY[weekday(dateISO)];
}

export function dateLong(dateISO: string) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  return `${DAY_LONG[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
}

export const WEEKDAYS_FR = DAY_LONG;

/** Normalises an Ivorian number to +225XXXXXXXXXX. Returns null if invalid. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  let local = digits;
  if (local.startsWith("+225")) local = local.slice(4);
  else if (local.startsWith("00225")) local = local.slice(5);
  else if (local.startsWith("225") && local.length === 13) local = local.slice(3);
  if (!/^\d{10}$/.test(local)) return null;
  return `+225${local}`;
}

export function displayPhone(e164: string) {
  const local = e164.replace(/^\+225/, "");
  return local.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}

export function initials(name: string) {
  return name.split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

export const METHOD_LABEL: Record<string, string> = {
  wave: "Wave",
  orange: "Orange Money",
  mtn: "MTN MoMo",
  cash: "Espèces",
};
