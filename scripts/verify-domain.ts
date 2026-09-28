import { createSeedData } from "@/lib/data/seed";
import { buildMonthSnapshot } from "@/lib/domain/snapshot";
import { calculateGoalForecast, monthlyContributionHistory } from "@/lib/domain/goals";
import { calculateTradeOff } from "@/lib/domain/tradeoff";
import { calculateCarryOver, calculateSuggestedDailyAmount, latestPlanBefore } from "@/lib/domain/daily-plan";
import { calculateIncoming, calculateTransfers, indexSplits, transactionsInMonth } from "@/lib/domain/ledger";
import { calculatePeriodComparison, periodRanges, weeklySpendingInMonth } from "@/lib/domain/periods";
import { calculateCarryForward, calculateDailyVariance, calculateNextDayAdjustment } from "@/lib/domain/daily-plan";
import { calculateNewSurplus, validatePurchaseAmount } from "@/lib/domain/tradeoff";
import { calculateReceivables } from "@/lib/domain/splits";
import { reducer } from "@/lib/state/reducer";
import { createEmptyData } from "@/lib/data/seed";
import type { DailyPlan, Transaction } from "@/lib/types/finance";

let failures = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${JSON.stringify(actual)}${ok ? "" : `  (expected ${JSON.stringify(expected)})`}`);
}

const data = createSeedData();
const s = buildMonthSnapshot(data, "2026-09");
eq("income", s.income, 35000);
eq("expenses (personal, net of refund & split)", s.expenses, 22800);
eq("cash paid", s.cashPaid, 25450);
eq("surplus", s.surplus.surplus, 12200);
eq("goal contributions", s.surplus.goalContributions, 8000);
eq("unallocated", s.surplus.unallocated, 4200);
eq("refunds not income", s.refunds, 650);
eq("reimbursements not income", s.reimbursements, 1000);
eq("food (Toit counted at own 1,000)", s.byCategory.food, 4870);
eq("shopping net of refund", s.byCategory.shopping, 1349);
eq("receivable remaining", s.receivables.totalRemaining, 1000);
eq("review count", s.reviewCount, 3);
eq("unknown-type excluded", s.unknownTypeAmount, 1500);
eq("savings plan (20% of 32k + 50% of 3k)", s.savingsPlan.plannedSavings, 7900);
eq("entertainment over", s.budgetLines.find((b) => b.category === "entertainment")?.status, "over");
eq("entertainment overspending", s.budgetLines.find((b) => b.category === "entertainment")?.overspending, 60);
eq("bills on target", s.budgetLines.find((b) => b.category === "bills")?.status, "on_target");

const today = "2026-09-27";
const laptop = data.goals[0]!;
const f = calculateGoalForecast(laptop, data.goalContributions, today);
eq("laptop avg saving (history)", [f.savingRate, f.rateBasis, f.historyMonths], [5000, "history", 5]);
eq("laptop remaining", f.remaining, 25000);
eq("laptop safety target 1.5x", f.safetyTarget, 75000);
eq("laptop pace", f.pace, "on_track");
console.log("      projected:", f.projection.date, "required/mo:", f.requiredMonthly);

for (const amt of [1000, 6000, 20000, 0]) {
  const r = calculateTradeOff({
    purchaseAmount: amt, goal: laptop, currentSurplus: s.surplus.surplus,
    goalContributionsThisPeriod: s.surplus.goalContributions, monthlySavingRate: f.savingRate,
    funding: "surplus", useSafetyTarget: false, today,
  });
  console.log(`      ₹${amt}: surplus ${r.before.surplus}→${r.after.surplus}, remaining ${r.before.goalRemaining}→${r.after.goalRemaining}, done ${r.before.projection.date}→${r.after.projection.date}, delay ${r.delayDays}d, ${r.verdict}`);
}
const r6 = calculateTradeOff({ purchaseAmount: 6000, goal: laptop, currentSurplus: 12200, goalContributionsThisPeriod: 8000, monthlySavingRate: 5000, funding: "surplus", useSafetyTarget: false, today });
eq("6k: 4,200 from unallocated, 1,800 shortfall", [r6.coveredByUnallocated, r6.goalShortfall], [4200, 1800]);
const r20 = calculateTradeOff({ purchaseAmount: 20000, goal: laptop, currentSurplus: 12200, goalContributionsThisPeriod: 8000, monthlySavingRate: 5000, funding: "surplus", useSafetyTarget: false, today });
eq("20k misses deadline", r20.verdict, "misses_deadline");
const rg = calculateTradeOff({ purchaseAmount: 6000, goal: laptop, currentSurplus: 12200, goalContributionsThisPeriod: 8000, monthlySavingRate: 5000, funding: "goal", useSafetyTarget: false, today });
eq("6k from goal savings → full 6,000 shortfall", rg.goalShortfall, 6000);
const rHuge = calculateTradeOff({ purchaseAmount: 100000, goal: laptop, currentSurplus: 12200, goalContributionsThisPeriod: 8000, monthlySavingRate: 5000, funding: "surplus", useSafetyTarget: false, today });
eq("1L purchase: shortfall not capped at saved", rHuge.goalShortfall, 95800);
const r0rate = calculateTradeOff({ purchaseAmount: 6000, goal: laptop, currentSurplus: 12200, goalContributionsThisPeriod: 8000, monthlySavingRate: 0, funding: "surplus", useSafetyTarget: false, today });
eq("no saving rate → cannot_project", r0rate.verdict, "cannot_project");

const idx = indexSplits(data.splits);
const sug = calculateSuggestedDailyAmount({ today, mode: "budget", fixedAmount: 0, budgets: data.budgets, planCategories: data.settings.dailyPlanCategories, transactions: data.transactions, splits: idx });
eq("daily suggestion (2,566 left / 4 days → floor 10)", [sug.remainingFlexibleBudget, sug.daysLeft, sug.amount], [2566, 4, 640]);
const co = calculateCarryOver(latestPlanBefore(data.dailyPlans, today), data.transactions, idx, "carry_forward");
eq("carry-over from 26 Sep (700 planned, 120 spent)", [co.unused, co.adjustment], [580, 580]);
const coSplit = calculateCarryOver(latestPlanBefore(data.dailyPlans, today), data.transactions, idx, "split");
eq("split: 290 carried, 290 to savings", [coSplit.adjustment, coSplit.toSavings], [290, 290]);

// ---- Spending hierarchy: importance → category adds up to the flat totals.
const matrixTotal = Object.values(s.matrix).reduce((sum, row) => sum + Object.values(row).reduce((a, v) => a + (v ?? 0), 0), 0);
eq("matrix total = total spending", Math.round(matrixTotal), s.expenses);
eq(
  "matrix per importance = byImportance",
  (["essential", "flexible", "discretionary", "unknown"] as const).map((i) => Math.round(Object.values(s.matrix[i]).reduce((a, v) => a + (v ?? 0), 0))),
  (["essential", "flexible", "discretionary", "unknown"] as const).map((i) => Math.round(s.byImportance[i]))
);
eq("incoming breakdown: income only in headline", [s.incoming.income, s.incoming.reimbursements, s.incoming.refunds], [35000, 1000, 650]);

// ---- Trade-off input validation.
eq("purchase: empty", validatePurchaseAmount(null).ok ? "ok" : (validatePurchaseAmount(null) as { reason: string }).reason, "empty");
eq("purchase: zero", (validatePurchaseAmount(0) as { reason: string }).reason, "zero");
eq("purchase: negative", (validatePurchaseAmount(-5) as { reason: string }).reason, "negative");
eq("purchase: NaN", (validatePurchaseAmount(NaN) as { reason: string }).reason, "invalid");
eq("purchase: 5 crore", (validatePurchaseAmount(50_000_000) as { reason: string }).reason, "too_large");
eq("new surplus 12,200 − 20,000", calculateNewSurplus(12200, 20000), -7800);

// ---- Plan a Day overspend: plan 1,000, spent 1,250 → tomorrow −250.
const mk = (id: string, date: string, amount: number, category: Transaction["category"], type: Transaction["type"] = "expense"): Transaction => ({
  id, accountId: "acc-bank", date, description: id, merchant: id, amount, type, category, importance: "flexible",
  confidence: 1, classificationSource: "user", needsReview: false, isRecurring: false, transactionHash: id,
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
});
const plan: DailyPlan = { date: "2026-10-05", available: 1000, allocations: [{ category: "food", amount: 600 }, { category: "transport", amount: 400 }], createdAt: "", updatedAt: "" };
const over = calculateCarryOver(plan, [mk("a", "2026-10-05", -900, "food"), mk("b", "2026-10-05", -350, "transport"), mk("rent", "2026-10-05", -12000, "housing")], new Map(), "carry_forward");
eq("overspend 250 → adjustment −250 (rent ignored)", [over.actual, over.overspent, over.adjustment], [1250, 250, -250]);
const under = calculateCarryOver(plan, [mk("a", "2026-10-05", -800, "food")], new Map(), "savings");
eq("underspend 200 with 'add to savings' → 0 carried, 200 to savings", [under.unused, under.adjustment, under.toSavings], [200, 0, 200]);

// ---- Spec scenario: salary 35k, dinner 3k split with two friends, one pays back 1k.
let d = createEmptyData();
d = reducer(d, { type: "transaction/upsert", transaction: { ...mk("sal", "2026-10-01", 35000, "income", "income") } });
d = reducer(d, { type: "transaction/upsert", transaction: { ...mk("din", "2026-10-02", -3000, "food") } });
d = reducer(d, {
  type: "split/upsert",
  split: { id: "sp", transactionId: "din", createdAt: "", participants: [
    { id: "r", name: "Rahul", share: 1000, payments: [] },
    { id: "a", name: "Arjun", share: 1000, payments: [] },
  ] },
});
let sc = buildMonthSnapshot(d, "2026-10");
eq("scenario: incoming / cash / personal / receivable", [sc.income, sc.cashPaid, sc.expenses, sc.receivables.totalRemaining], [35000, 3000, 1000, 2000]);
d = reducer(d, { type: "transaction/upsert", transaction: mk("pay", "2026-10-04", 1000, "reimbursement", "reimbursement") });
d = reducer(d, { type: "split/payment", splitId: "sp", participantId: "r", payment: { id: "p1", date: "2026-10-04", amount: 1000, transactionId: "pay" } });
sc = buildMonthSnapshot(d, "2026-10");
eq("scenario: after Rahul pays — incoming unchanged, reimbursement 1k, 1k still owed", [sc.income, sc.reimbursements, sc.receivables.totalRemaining], [35000, 1000, 1000]);
eq("scenario: statuses", calculateReceivables(d.splits, d.transactions).lines.map((l) => `${l.name}:${l.status}`).sort(), ["Arjun:pending", "Rahul:settled"]);
d = reducer(d, { type: "split/payment", splitId: "sp", participantId: "a", payment: { id: "p2", date: "2026-10-06", amount: 600 } });
const arjun = calculateReceivables(d.splits, d.transactions).lines.find((l) => l.name === "Arjun")!;
eq("partial: Arjun paid 600 of 1,000", [arjun.paid, arjun.remaining, arjun.status], [600, 400, "partial"]);

// ---- Consistency: add → edit → delete an expense; every total follows.
let c = createSeedData();
const base = buildMonthSnapshot(c, "2026-09");
c = reducer(c, { type: "transaction/upsert", transaction: { ...mk("x", "2026-09-20", -2000, "shopping"), importance: "discretionary" } });
let cs = buildMonthSnapshot(c, "2026-09");
eq("add ₹2,000: spending/surplus/shopping/discretionary", [cs.expenses - base.expenses, base.surplus.surplus - cs.surplus.surplus, (cs.byCategory.shopping ?? 0) - (base.byCategory.shopping ?? 0), cs.byImportance.discretionary - base.byImportance.discretionary], [2000, 2000, 2000, 2000]);
c = reducer(c, { type: "transaction/upsert", transaction: { ...mk("x", "2026-09-20", -500, "shopping"), importance: "discretionary" } });
cs = buildMonthSnapshot(c, "2026-09");
eq("edit to ₹500", cs.expenses - base.expenses, 500);
c = reducer(c, { type: "transaction/upsert", transaction: { ...mk("x", "2026-09-20", -500, "reimbursement", "reimbursement") } });
cs = buildMonthSnapshot(c, "2026-09");
eq("retype expense → other type: spending back to base", cs.expenses, base.expenses);
c = reducer(c, { type: "transaction/delete", id: "x" });
cs = buildMonthSnapshot(c, "2026-09");
eq("delete: all totals back to base", [cs.expenses, cs.income, cs.surplus.surplus, cs.transactionCount], [base.expenses, base.income, base.surplus.surplus, base.transactionCount]);

// ---- Spec-named functions, several values each.
eq("calculateIncoming (Sep)", calculateIncoming(transactionsInMonth(data.transactions, "2026-09")), 35000);
eq("calculateTransfers (Sep): 8,000 in; 8,000 + 4,500 card bill out", calculateTransfers(transactionsInMonth(data.transactions, "2026-09")), { in: 8000, out: 12500 });
eq("transfers never reach spending or income", [s.expenses, s.income], [22800, 35000]);
eq("daily variance 1000 vs 800", calculateDailyVariance(1000, 800), { variance: 200, unused: 200, overspent: 0 });
eq("daily variance 1000 vs 1250", calculateDailyVariance(1000, 1250), { variance: -250, unused: 0, overspent: 250 });
eq("carry-forward 200: carry/split/savings", [calculateCarryForward(200, "carry_forward"), calculateCarryForward(200, "split"), calculateCarryForward(200, "savings")], [{ carried: 200, toSavings: 0 }, { carried: 100, toSavings: 100 }, { carried: 0, toSavings: 200 }]);
eq("next day after overspend 250 (normal 1000)", calculateNextDayAdjustment(1000, 1000, 1250, "carry_forward"), { adjustment: -250, adjustedAllowance: 750, toSavings: 0 });
eq("next day after 200 unused, carry", calculateNextDayAdjustment(1000, 1000, 800, "carry_forward").adjustedAllowance, 1200);
eq("next day after 200 unused, savings", calculateNextDayAdjustment(1000, 1000, 800, "savings"), { adjustment: 0, adjustedAllowance: 1000, toSavings: 200 });
eq("next day never negative (overspend 1,500 on 1,000)", calculateNextDayAdjustment(1000, 1000, 2500, "carry_forward").adjustedAllowance, 0);

// ---- Periods (27 Sep 2026 is a Sunday).
eq("week ranges: Mon 21–Sun 27 vs Mon 14–Sun 20", periodRanges("week", "2026-09-27"), { current: { start: "2026-09-21", end: "2026-09-27" }, previous: { start: "2026-09-14", end: "2026-09-20" } });
eq("partial week: Wed 23 → previous Mon 14–Wed 16", periodRanges("week", "2026-09-23").previous, { start: "2026-09-14", end: "2026-09-16" });
eq("month to date 31 Mar → 1–28 Feb", periodRanges("month", "2027-03-31").previous, { start: "2027-02-01", end: "2027-02-28" });
const weeks = weeklySpendingInMonth(data.transactions, idx, "2026-09", "2026-09-30");
eq("weeks in Sep 2026 add up to the month's spending", Math.round(weeks.reduce((a, w) => a + w.amount, 0)), 22800);
eq("first week clipped to the month (Tue 1 – Sun 6)", [weeks[0]!.start, weeks[0]!.end], ["2026-09-01", "2026-09-06"]);
const mc = calculatePeriodComparison(data.transactions, idx, "month", "2026-09-30");
eq("Sep vs Aug: Aug has no detailed transactions → flagged", mc.previousHasData, false);
const dc = calculatePeriodComparison(data.transactions, idx, "day", "2026-09-27");
eq("day comparison has data", dc.previousHasData, true);

// ---- Forecast from the spec example: 5,500 / 7,000 / 8,000 → 6,833/month.
const hist = [
  { id: "a", goalId: "g", date: "2026-07-10", amount: 5500 },
  { id: "b", goalId: "g", date: "2026-08-10", amount: 7000 },
  { id: "c", goalId: "g", date: "2026-09-10", amount: 8000 },
];
const g = { ...laptop, id: "g", targetAmount: 50000, currentAmount: 20500, plannedMonthlyContribution: 0 };
const gf = calculateGoalForecast(g, hist, "2026-09-27");
eq("avg of 5,500/7,000/8,000", [gf.savingRate, gf.historyMonths], [6833.33, 3]);
eq("months to goal = 29,500 / 6,833.33", Math.round(gf.projection.months * 100) / 100, 4.32);
eq("history list", monthlyContributionHistory(hist, "2026-09-27", { goalId: "g" }).map((m) => m.amount), [5500, 7000, 8000]);
const gap = calculateGoalForecast(g, hist.filter((h) => h.id !== "b"), "2026-09-27");
eq("a month with no saving counts as ₹0 (avg 13,500/3)", gap.savingRate, 4500);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
