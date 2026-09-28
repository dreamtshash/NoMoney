import type { NoMoneyData } from "@/lib/types/finance";

/**
 * Structural check for data read from storage. This is not a full schema
 * validator — it guards against truncated/foreign JSON so a bad value falls
 * back to demo data with a warning instead of crashing a page.
 */
export function isNoMoneyData(value: unknown): value is NoMoneyData {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const arrays = [
    "accounts",
    "transactions",
    "budgets",
    "goals",
    "goalContributions",
    "splits",
    "dailyPlans",
    "rules",
    "history",
  ];
  if (!arrays.every((k) => Array.isArray(v[k]))) return false;
  if (!v.settings || typeof v.settings !== "object") return false;
  const txns = v.transactions as unknown[];
  return txns.every(
    (t) =>
      !!t &&
      typeof t === "object" &&
      typeof (t as Record<string, unknown>).id === "string" &&
      typeof (t as Record<string, unknown>).date === "string" &&
      typeof (t as Record<string, unknown>).amount === "number" &&
      Number.isFinite((t as Record<string, unknown>).amount)
  );
}
