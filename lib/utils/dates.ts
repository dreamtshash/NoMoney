/**
 * Calendar-date helpers. All dates in NoMoney are "YYYY-MM-DD" strings with
 * no time zone. `new Date("2026-09-01")` parses as UTC midnight, which shows
 * the previous day in any negative-offset zone — so everything here works on
 * local-calendar components instead.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

/** Parse "YYYY-MM-DD" into a local Date at midnight. */
export function parseIsoDate(value: string): Date {
  const m = ISO_DATE.exec(value);
  if (!m) return new Date(NaN);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

/** Add whole months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso: string, months: number): string {
  const d = parseIsoDate(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return toIsoDate(d);
}

/** "YYYY-MM" for a date string. */
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function monthStart(month: string): string {
  return `${month}-01`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y ?? 1970, m ?? 1, 0).getDate();
}

export function monthEnd(month: string): string {
  return `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number): string {
  return monthOf(addMonths(monthStart(month), delta));
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  const ms = parseIsoDate(b).getTime() - parseIsoDate(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** Average Gregorian month length, used for fractional month arithmetic. */
export const DAYS_PER_MONTH = 30.4375;

/** Fractional months from a to b. */
export function monthsBetween(a: string, b: string): number {
  return daysBetween(a, b) / DAYS_PER_MONTH;
}

/** Add a fractional number of months, as days. */
export function addFractionalMonths(iso: string, months: number): string {
  return addDays(iso, Math.round(months * DAYS_PER_MONTH));
}

/** Monday of the week containing `iso` (weeks run Monday–Sunday). */
export function weekStart(iso: string): string {
  const dow = parseIsoDate(iso).getDay(); // 0 = Sunday
  return addDays(iso, -((dow + 6) % 7));
}
