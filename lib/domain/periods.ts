import type { Transaction } from "@/lib/types/finance";
import { personalSpendingOf, type SplitIndex } from "@/lib/domain/ledger";
import { addDays, daysBetween, daysInMonth, monthEnd, monthOf, monthStart, shiftMonth, weekStart } from "@/lib/utils/dates";
import { roundMoney } from "@/lib/utils/money";

/**
 * Spending by period (day / week / month), and like-for-like comparisons.
 *
 * A period that isn't over yet is compared with the SAME number of days of
 * the previous period (e.g. 1–27 Sep vs 1–27 Aug), never with a full one.
 */

export type Period = "day" | "week" | "month";

export interface DateRange {
  start: string;
  end: string;
}

export function spendingInRange(transactions: readonly Transaction[], splits: SplitIndex, range: DateRange): number {
  let total = 0;
  for (const t of transactions) {
    if (t.date < range.start || t.date > range.end) continue;
    total += personalSpendingOf(t, splits);
  }
  return roundMoney(Math.max(0, total));
}

/** The current period up to `anchor`, and the matching slice of the previous period. */
export function periodRanges(period: Period, anchor: string): { current: DateRange; previous: DateRange } {
  if (period === "day") {
    const prev = addDays(anchor, -1);
    return { current: { start: anchor, end: anchor }, previous: { start: prev, end: prev } };
  }
  if (period === "week") {
    const start = weekStart(anchor);
    const elapsed = daysBetween(start, anchor);
    const prevStart = addDays(start, -7);
    return { current: { start, end: anchor }, previous: { start: prevStart, end: addDays(prevStart, elapsed) } };
  }
  const month = monthOf(anchor);
  const day = Number(anchor.slice(8, 10));
  const prevMonth = shiftMonth(month, -1);
  const prevEndDay = Math.min(day, daysInMonth(prevMonth));
  return {
    current: { start: monthStart(month), end: anchor },
    previous: { start: monthStart(prevMonth), end: `${prevMonth}-${String(prevEndDay).padStart(2, "0")}` },
  };
}

export interface PeriodComparison {
  period: Period;
  current: DateRange & { amount: number };
  previous: DateRange & { amount: number };
  difference: number;
  /** null when the previous amount is 0 (a % change would be meaningless). */
  percentChange: number | null;
  /** False when there are no transactions at all in the previous range's month — "₹0 last time" would be misleading. */
  previousHasData: boolean;
}

export function calculatePeriodComparison(
  transactions: readonly Transaction[],
  splits: SplitIndex,
  period: Period,
  anchor: string
): PeriodComparison {
  const { current, previous } = periodRanges(period, anchor);
  const cur = spendingInRange(transactions, splits, current);
  const prev = spendingInRange(transactions, splits, previous);
  const earliest = transactions.reduce<string | null>((m, t) => (m === null || t.date < m ? t.date : m), null);
  const previousHasData = earliest !== null && earliest <= previous.end;
  return {
    period,
    current: { ...current, amount: cur },
    previous: { ...previous, amount: prev },
    difference: roundMoney(cur - prev),
    percentChange: prev > 0 ? ((cur - prev) / prev) * 100 : null,
    previousHasData,
  };
}

/** Monday-start weeks overlapping a month, clipped to the month (and to `upTo`). */
export function weeklySpendingInMonth(
  transactions: readonly Transaction[],
  splits: SplitIndex,
  month: string,
  upTo: string
): (DateRange & { amount: number })[] {
  const out: (DateRange & { amount: number })[] = [];
  const last = upTo < monthEnd(month) ? upTo : monthEnd(month);
  let start = monthStart(month);
  while (start <= last) {
    const weekEnd = addDays(weekStart(start), 6);
    const end = weekEnd < last ? weekEnd : last;
    out.push({ start, end, amount: spendingInRange(transactions, splits, { start, end }) });
    start = addDays(end, 1);
  }
  return out;
}
