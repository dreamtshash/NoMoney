"use client";

import * as React from "react";
import { X } from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import { BudgetStatusBadge } from "@/components/finance/badges";
import { CategoryBarChart, MoneyChart } from "@/components/finance/spending-chart";
import { Stat } from "@/components/finance/stat";
import { EmptyState } from "@/components/finance/states";
import { TransactionDetailDialog } from "@/components/finance/transaction-detail-dialog";
import { TransactionList } from "@/components/finance/transaction-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { categoryLabel, IMPORTANCE_META, IMPORTANCE_ORDER } from "@/lib/domain/categories";
import {
  calculateSpendingByCategory,
  calculateSpendingByDay,
  spendingTransactions,
  transactionsInMonth,
} from "@/lib/domain/ledger";
import { calculateMonthlyTrend } from "@/lib/domain/snapshot";
import { calculatePeriodComparison, weeklySpendingInMonth, type Period } from "@/lib/domain/periods";
import { sortTransactions } from "@/lib/domain/transactions";
import { useActiveMonth, useMonthSnapshot } from "@/lib/state/hooks";
import { useStore } from "@/lib/state/store";
import type { Importance, SpendingCategoryId } from "@/lib/types/finance";
import { cn } from "@/lib/utils/cn";
import { addDays, daysBetween, monthEnd, monthOf, monthStart, shiftMonth } from "@/lib/utils/dates";
import { formatCurrency, formatDate, formatMonth, formatMonthShort, formatPercent } from "@/lib/utils/format";

export default function SpendingPage() {
  return (
    <AppShell
      title="Spending"
      description="Your share of spending: split bills count only your part, refunds are netted off, and transfers between your own accounts never count."
      showMonth
    >
      <SpendingBody />
    </AppShell>
  );
}

const IMP_FILL: Record<Importance, string> = {
  essential: "bg-imp-essential",
  flexible: "bg-imp-flexible",
  discretionary: "bg-imp-discretionary",
  unknown: "stripes",
};

function SpendingBody() {
  const { data, today } = useStore();
  const { month } = useActiveMonth();
  const snap = useMonthSnapshot();
  const [trendView, setTrendView] = React.useState<"daily" | "weekly" | "monthly">("daily");
  const [importance, setImportance] = React.useState<Importance | null>(null);
  const [category, setCategory] = React.useState<SpendingCategoryId | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);

  // Reset drill-down when the month changes.
  React.useEffect(() => {
    setImportance(null);
    setCategory(null);
  }, [month]);

  const monthTxns = React.useMemo(() => transactionsInMonth(data.transactions, month), [data.transactions, month]);
  const prevMonth = shiftMonth(month, -1);
  const trend = React.useMemo(() => calculateMonthlyTrend(data, month, 6), [data, month]);
  const prevPoint = trend.find((p) => p.month === prevMonth);
  const prevByCategory = React.useMemo(
    () =>
      prevPoint?.source === "ledger"
        ? calculateSpendingByCategory(transactionsInMonth(data.transactions, prevMonth), snap.splitIndex)
        : null,
    [data.transactions, prevMonth, prevPoint?.source, snap.splitIndex]
  );

  const lastDay = monthOf(today) === month ? today : monthEnd(month);
  const daysElapsed = month > monthOf(today) ? 0 : daysBetween(monthStart(month), lastDay) + 1;
  const daily = React.useMemo(() => {
    const byDay = new Map(calculateSpendingByDay(monthTxns, snap.splitIndex).map((d) => [d.date, d.amount]));
    return Array.from({ length: daysElapsed }, (_, i) => {
      const d = addDays(monthStart(month), i);
      return { label: String(i + 1), tooltipLabel: formatDate(d), spent: byDay.get(d) ?? 0 };
    });
  }, [monthTxns, month, snap.splitIndex, daysElapsed]);

  const weekly = React.useMemo(
    () => (daysElapsed > 0 ? weeklySpendingInMonth(data.transactions, snap.splitIndex, month, lastDay) : []),
    [data.transactions, snap.splitIndex, month, lastDay, daysElapsed]
  );

  // Level 2: categories, narrowed by the selected importance.
  const categoryAmounts = (
    Object.entries(importance ? snap.matrix[importance] : snap.byCategory) as [SpendingCategoryId, number][]
  )
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const levelTotal = importance ? snap.byImportance[importance] : snap.expenses;
  const budgetFor = new Map(snap.budgetLines.map((l) => [l.category, l]));

  // Level 3: transactions, narrowed by both.
  const txList = React.useMemo(
    () =>
      sortTransactions(
        spendingTransactions(monthTxns, { importance: importance ?? undefined, category: category ?? undefined })
      ),
    [monthTxns, importance, category]
  );

  if (snap.transactionCount === 0) {
    return (
      <EmptyState
        title={`No transactions in ${formatMonth(month)}`}
        description="Import a statement or add transactions to see where your money went."
        action={{ label: "Import a statement", href: "/data" }}
      />
    );
  }

  const scopeLabel = [importance ? IMPORTANCE_META[importance].label : null, category ? categoryLabel(category) : null]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      {/* Total */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <Stat label="Total spending" amount={snap.expenses} detail={`${formatMonth(month)}, your share`} />
        <Stat
          label="Daily average"
          amount={daysElapsed > 0 ? Math.round(snap.expenses / daysElapsed) : 0}
          detail={`Over ${daysElapsed} ${daysElapsed === 1 ? "day" : "days"}`}
        />
        <Stat
          label="Cash paid out"
          amount={snap.cashPaid}
          className="col-span-2 lg:col-span-1"
          detail={
            snap.cashPaid > snap.expenses
              ? `${formatCurrency(snap.cashPaid - snap.expenses)} was others' share or came back as refunds`
              : "Before splits and refunds"
          }
        />
      </div>

      <ComparisonCard anchor={lastDay} month={month} />

      {/* Over time */}
      <Card>
        <CardHeaderRow
          title="Spending over time"
          description={
            trendView === "daily" ? `Each day in ${formatMonth(month)}` : trendView === "weekly" ? `Each week (Mon–Sun) in ${formatMonth(month)}` : "Last 6 months"
          }
          actions={
            <Segmented
              label="Trend view"
              value={trendView}
              onChange={setTrendView}
              options={[
                { value: "daily", label: "Daily" },
                { value: "weekly", label: "Weekly" },
                { value: "monthly", label: "Monthly" },
              ]}
            />
          }
        />
        <CardContent>
          {trendView === "daily" ? (
            <MoneyChart
              kind="bar"
              data={daily}
              series={[{ key: "spent", name: "Spent", color: "hsl(var(--accent))" }]}
              xLabel={`Day of ${formatMonth(month)}`}
              summary={`Daily spending in ${formatMonth(month)}. Highest day: ${formatCurrency(Math.max(0, ...daily.map((d) => d.spent)))}.`}
            />
          ) : trendView === "weekly" ? (
            <MoneyChart
              kind="bar"
              data={weekly.map((w) => ({
                label: `${Number(w.start.slice(8))}–${Number(w.end.slice(8))}`,
                tooltipLabel: `${formatDate(w.start)} to ${formatDate(w.end)}`,
                spent: w.amount,
              }))}
              series={[{ key: "spent", name: "Spent", color: "hsl(var(--accent))" }]}
              xLabel={`Week (days of ${formatMonth(month)})`}
              summary={weekly.map((w) => `${formatDate(w.start)} to ${formatDate(w.end)}: ${formatCurrency(w.amount)}`).join(". ")}
            />
          ) : (
            <>
              <MoneyChart
                kind="line"
                data={trend.map((p) => ({ label: formatMonthShort(p.month), tooltipLabel: formatMonth(p.month), spent: p.spending, incoming: p.income }))}
                series={[
                  { key: "incoming", name: "Incoming", color: "hsl(var(--success))" },
                  { key: "spent", name: "Spending", color: "hsl(var(--accent))" },
                ]}
                xLabel="Month"
                summary={trend.map((p) => `${formatMonth(p.month)}: incoming ${formatCurrency(p.income)}, spending ${formatCurrency(p.spending)}`).join(". ")}
              />
              {trend.some((p) => p.source === "summary") && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Months before your first imported transaction use stored monthly totals.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Level 1: importance */}
      <Card>
        <CardHeaderRow
          title="How necessary was it?"
          description="Spending by importance. Choose one to see its categories and transactions."
        />
        <CardContent className="space-y-4">
          <div className="flex h-4 w-full overflow-hidden rounded-full bg-secondary" aria-hidden="true">
            {IMPORTANCE_ORDER.map((imp) =>
              snap.byImportance[imp] > 0 ? (
                <div
                  key={imp}
                  className={cn("h-full border-r-2 border-card last:border-r-0 transition-opacity", IMP_FILL[imp], importance && importance !== imp && "opacity-30")}
                  style={{ width: `${(snap.byImportance[imp] / Math.max(1, snap.expenses)) * 100}%` }}
                />
              ) : null
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="group" aria-label="Filter by importance">
            {IMPORTANCE_ORDER.map((imp) => {
              const v = snap.byImportance[imp];
              const selected = importance === imp;
              return (
                <button
                  key={imp}
                  type="button"
                  aria-pressed={selected}
                  disabled={v <= 0}
                  onClick={() => {
                    setImportance(selected ? null : imp);
                    setCategory(null);
                  }}
                  className={cn(
                    "flex items-start gap-2 rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                    selected ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/60"
                  )}
                >
                  <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-sm", IMP_FILL[imp])} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-xs text-muted-foreground">{IMPORTANCE_META[imp].label}</span>
                    <span className="money block text-sm font-semibold">
                      {formatCurrency(v)}
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        {formatPercent((v / Math.max(1, snap.expenses)) * 100)}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {snap.byImportance.unknown > 0 && (
            <p className="text-xs text-muted-foreground">
              Unknown importance means a transaction hasn&apos;t been reviewed yet. It still counts as spending.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Level 2: category */}
      <Card>
        <CardHeaderRow
          title={importance ? `What was ${IMPORTANCE_META[importance].label.toLowerCase()} spending for?` : "What was it for?"}
          description={`${categoryAmounts.length} ${categoryAmounts.length === 1 ? "category" : "categories"}, ${formatCurrency(levelTotal)} in total. Choose a category to see its transactions.`}
          actions={
            importance && (
              <Button size="sm" variant="ghost" onClick={() => (setImportance(null), setCategory(null))}>
                <X className="h-3.5 w-3.5" aria-hidden="true" /> All importance levels
              </Button>
            )
          }
        />
        <CardContent className="grid gap-6 lg:grid-cols-2">
          {categoryAmounts.length === 0 ? (
            <p className="text-sm text-muted-foreground lg:col-span-2">No spending here this month.</p>
          ) : (
            <>
              <CategoryBarChart
                data={categoryAmounts.map(([c, v]) => ({ label: categoryLabel(c), value: v }))}
                summary={categoryAmounts.map(([c, v]) => `${categoryLabel(c)} ${formatCurrency(v)}`).join(", ")}
              />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th scope="col" className="py-2 pr-2 font-medium">Category</th>
                      <th scope="col" className="py-2 pr-2 text-right font-medium">Spent</th>
                      <th scope="col" className="py-2 pr-2 text-right font-medium">Share</th>
                      {!importance && prevByCategory && (
                        <th scope="col" className="py-2 pr-2 text-right font-medium">vs {formatMonthShort(prevMonth)}</th>
                      )}
                      {!importance && <th scope="col" className="py-2 font-medium">Budget</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {categoryAmounts.map(([c, v]) => {
                      const b = budgetFor.get(c);
                      const diff = v - (prevByCategory?.[c] ?? 0);
                      const selected = category === c;
                      return (
                        <tr key={c} className={cn("border-b border-border/70 last:border-0", selected && "bg-primary/5")}>
                          <td className="py-2 pr-2">
                            <button
                              type="button"
                              aria-pressed={selected}
                              onClick={() => setCategory(selected ? null : c)}
                              className="rounded-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {categoryLabel(c)}
                            </button>
                          </td>
                          <td className="money py-2 pr-2 text-right font-semibold">{formatCurrency(v)}</td>
                          <td className="money py-2 pr-2 text-right text-muted-foreground">
                            {formatPercent((v / Math.max(1, levelTotal)) * 100)}
                          </td>
                          {!importance && prevByCategory && (
                            <td className="money py-2 pr-2 text-right text-muted-foreground">
                              {diff === 0 ? "No change" : `${diff > 0 ? "+" : "−"}${formatCurrency(Math.abs(diff))}`}
                            </td>
                          )}
                          {!importance && (
                            <td className="py-2">
                              {b ? <BudgetStatusBadge status={b.status} /> : <span className="text-xs text-muted-foreground">None</span>}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Level 3: transactions */}
      <Card>
        <CardHeaderRow
          title="Transactions"
          description={`${txList.length} ${txList.length === 1 ? "transaction" : "transactions"}${scopeLabel ? ` in ${scopeLabel}` : ""}. Refunds reduce spending; split bills show the full amount paid.`}
          actions={
            category && (
              <Button size="sm" variant="ghost" onClick={() => setCategory(null)}>
                <X className="h-3.5 w-3.5" aria-hidden="true" /> All categories
              </Button>
            )
          }
        />
        <div className="pb-2">
          <TransactionList compact transactions={txList} splitIndex={snap.splitIndex} onOpen={(t) => setOpenId(t.id)} />
        </div>
      </Card>

      <TransactionDetailDialog transactionId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

const PERIOD_LABEL: Record<Period, { current: string; previous: string }> = {
  day: { current: "Today", previous: "Yesterday" },
  week: { current: "This week so far", previous: "Same days last week" },
  month: { current: "This month so far", previous: "Same days last month" },
};

/** Like-for-like comparison: a partial period is compared with the same number of days before it. */
function ComparisonCard({ anchor, month }: { anchor: string; month: string }) {
  const { data, today } = useStore();
  const snap = useMonthSnapshot();
  const [period, setPeriod] = React.useState<Period>("month");
  const isCurrent = monthOf(today) === month;
  const c = React.useMemo(
    () => calculatePeriodComparison(data.transactions, snap.splitIndex, period, anchor),
    [data.transactions, snap.splitIndex, period, anchor]
  );
  const labels = isCurrent
    ? PERIOD_LABEL[period]
    : { current: `Period ending ${formatDate(anchor)}`, previous: "The period before" };
  const range = (r: { start: string; end: string }) => (r.start === r.end ? formatDate(r.start) : `${formatDate(r.start)} to ${formatDate(r.end)}`);
  const summary = data.history.find((h) => h.month === shiftMonth(month, -1));

  return (
    <Card>
      <CardHeaderRow
        title="Compared with the previous period"
        description="Spending up to the same point in the previous period, so partial periods are compared fairly."
        actions={
          <Segmented
            label="Compare by"
            value={period}
            onChange={setPeriod}
            options={[
              { value: "day", label: "Day" },
              { value: "week", label: "Week" },
              { value: "month", label: "Month" },
            ]}
          />
        }
      />
      <CardContent>
        {!c.previousHasData ? (
          <p className="text-sm text-muted-foreground">
            No transaction-level data for {range(c.previous)}, so there&apos;s nothing to compare with.
            {period === "month" && summary && ` Only a whole-month total (${formatCurrency(summary.spending)}) is stored for ${formatMonth(summary.month)}; it's shown on the Monthly chart below but can't be compared day for day.`}
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">{labels.current}</dt>
              <dd className="money text-lg font-semibold">{formatCurrency(c.current.amount)}</dd>
              <dd className="text-xs text-muted-foreground">{range(c.current)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{labels.previous}</dt>
              <dd className="money text-lg font-semibold">{formatCurrency(c.previous.amount)}</dd>
              <dd className="text-xs text-muted-foreground">{range(c.previous)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Difference</dt>
              <dd className={cn("money text-lg font-semibold", c.difference > 0 && "text-destructive", c.difference < 0 && "text-success")}>
                {c.difference === 0 ? "No change" : `${c.difference > 0 ? "+" : "−"}${formatCurrency(Math.abs(c.difference))}`}
              </dd>
              <dd className="text-xs text-muted-foreground">{c.difference > 0 ? "More spent" : c.difference < 0 ? "Less spent" : ""}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Change</dt>
              <dd className="money text-lg font-semibold">
                {c.percentChange === null ? "—" : `${c.percentChange > 0 ? "+" : "−"}${formatPercent(Math.abs(c.percentChange))}`}
              </dd>
              <dd className="text-xs text-muted-foreground">
                {c.percentChange === null ? "Not meaningful (nothing spent before)" : "vs previous period"}
              </dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
