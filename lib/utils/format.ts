import { parseIsoDate } from "@/lib/utils/dates";

/**
 * Display formatting. Rupees are always shown with Indian digit grouping and
 * no decimals unless the value has paise (₹1,000 · ₹12,500 · ₹1,250.50).
 */

const inrWhole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inrPaise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const groupWhole = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const groupPaise = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function hasPaise(amount: number): boolean {
  return Math.round(Math.abs(amount) * 100) % 100 !== 0;
}

export function formatCurrency(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  const value = Object.is(amount, -0) ? 0 : amount;
  return (hasPaise(value) ? inrPaise : inrWhole).format(value);
}

/** "+₹1,500" / "−₹900". Uses a true minus sign so negative amounts read clearly. */
export function formatCurrencySigned(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  if (amount === 0) return formatCurrency(0);
  const body = formatCurrency(Math.abs(amount));
  return amount > 0 ? `+${body}` : `−${body}`;
}

/** Plain grouped number for editable inputs, e.g. 125000 → "1,25,000". */
export function formatAmountForInput(amount: number): string {
  return (hasPaise(amount) ? groupPaise : groupWhole).format(amount);
}

export function formatCompactCurrency(amount: number): string {
  if (Math.abs(amount) < 1000) return formatCurrency(Math.round(amount));
  if (Math.abs(amount) < 100000) return `₹${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1)}k`;
  return `₹${(amount / 100000).toFixed(1)}L`;
}

export function formatPercent(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(fractionDigits)}%`;
}

export function formatDate(iso: string): string {
  const d = parseIsoDate(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatShortDate(iso: string): string {
  const d = parseIsoDate(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function formatWeekday(iso: string): string {
  const d = parseIsoDate(iso);
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}

/** "2026-09" → "September 2026" */
export function formatMonth(month: string): string {
  const d = parseIsoDate(`${month}-01`);
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/** "2026-09" → "Sep" */
export function formatMonthShort(month: string): string {
  const d = parseIsoDate(`${month}-01`);
  return d.toLocaleDateString("en-IN", { month: "short" });
}

/** 5.1 → "5 months, 3 days"; 0.4 → "12 days". */
export function formatMonthsAsDuration(months: number): string {
  if (!Number.isFinite(months)) return "not reachable at this rate";
  if (months <= 0) return "0 days";
  if (months >= 1200) return "more than 100 years";
  if (months >= 24) {
    const years = Math.floor(months / 12);
    const rest = Math.round(months - years * 12);
    return `${years} years${rest ? `, ${rest} month${rest === 1 ? "" : "s"}` : ""}`;
  }
  const whole = Math.floor(months);
  const days = Math.round((months - whole) * 30.4375);
  if (whole === 0) return `${Math.max(1, days)} day${days === 1 ? "" : "s"}`;
  if (days === 0) return `${whole} month${whole === 1 ? "" : "s"}`;
  return `${whole} month${whole === 1 ? "" : "s"}, ${days} day${days === 1 ? "" : "s"}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "")).toUpperCase();
}
