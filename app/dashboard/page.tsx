"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarCheck, CircleAlert, HandCoins, Plus, Target, Wallet } from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import { PaceBadge, SettlementBadge } from "@/components/finance/badges";
import { BudgetBar } from "@/components/finance/budget-bar";
import { GoalBar } from "@/components/finance/goal-bar";
import { ImportanceBreakdown } from "@/components/finance/importance-breakdown";
import { Money } from "@/components/finance/money";
import { MoneyChart } from "@/components/finance/spending-chart";
import { Stat } from "@/components/finance/stat";
import { EmptyState } from "@/components/finance/states";
import { ContributionDialog } from "@/components/finance/contribution-dialog";
import { TransactionDetailDialog } from "@/components/finance/transaction-detail-dialog";
import { TransactionFormDialog } from "@/components/finance/transaction-form-dialog";
import { TransactionList } from "@/components/finance/transaction-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { categoryLabel } from "@/lib/domain/categories";
import { calculateGoalForecast } from "@/lib/domain/goals";
import { sortTransactions } from "@/lib/domain/transactions";
import { transactionsInMonth } from "@/lib/domain/ledger";
import { calculateMonthlyTrend, type MonthSnapshot } from "@/lib/domain/snapshot";
import { useActiveMonth, useMonthSnapshot } from "@/lib/state/hooks";
import { useStore } from "@/lib/state/store";
import { useDailyPlan } from "@/lib/state/use-daily-plan";
import { cn } from "@/lib/utils/cn";
import { monthOf } from "@/lib/utils/dates";
import { formatCurrency, formatDate, formatMonth, formatMonthShort } from "@/lib/utils/format";

export default function DashboardPage() {
  const [adding, setAdding] = React.useState(false);
  return (
    <AppShell
      title="Overview"
      description="Where your money went this month, and what it means for your goals."
      showMonth
      actions={
        <Button onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add transaction
        </Button>
      }
    >
      <DashboardBody />
      <TransactionFormDialog open={adding} onOpenChange={setAdding} />
    </AppShell>
  );
}

function DashboardBody() {
  const { data, today } = useStore();
  const { month } = useActiveMonth();
  const snap = useMonthSnapshot();
  const [openId, setOpenId] = React.useState<string | null>(null);

  const recent = React.useMemo(
    () => sortTransactions(transactionsInMonth(data.transactions, month)).slice(0, 6),
    [data.transactions, month]
  );
  const { surplus } = snap;

  return (
    <div className="space-y-6">
      {snap.reviewCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
          <p className="flex items-center gap-2 text-sm">
            <CircleAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <span>
              <span className="font-semibold">{snap.reviewCount}</span>{" "}
              {snap.reviewCount === 1 ? "transaction needs" : "transactions need"} a category or importance before
              the numbers below are complete.
            </span>
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/transactions?review=1">Review now</Link>
          </Button>
        </div>
      )}

      {/* 1. Headline numbers */}
      <section aria-labelledby="summary-heading" className="space-y-3">
        <h2 id="summary-heading" className="sr-only">
          {formatMonth(month)} summary
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Stat
            label="Incoming"
            amount={surplus.income}
            detail={
              snap.incoming.totalReceived > surplus.income
                ? `Earned income. ${formatCurrency(snap.incoming.totalReceived - surplus.income)} more arrived that isn't income`
                : "Earned income: salary, freelance, interest"
            }
          />
          <Stat
            label="Spending"
            amount={surplus.expenses}
            detail={
              snap.cashPaid !== surplus.expenses
                ? `Your share. Cash paid out: ${formatCurrency(snap.cashPaid)}`
                : "Your share of spending, net of refunds"
            }
          />
          <Stat label="Saved to goals" amount={surplus.goalContributions} detail="Goal contributions this month" />
          <Stat
            label="Surplus"
            amount={surplus.surplus}
            tone={surplus.surplus < 0 ? "negative" : "none"}
            detail={`Incoming − spending. ${formatCurrency(surplus.unallocated)} unallocated after goals`}
          />
        </div>
        <IncomeFlow snap={snap} />
      </section>

      {/* 2. Where the money went */}
      <Card>
        <CardHeaderRow
          title="Where your money went"
          description="Spending grouped by how important it was."
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/spending">Spending details</Link>
            </Button>
          }
        />
        <CardContent className="space-y-3">
          {surplus.expenses > 0 ? (
            <ImportanceBreakdown byImportance={snap.byImportance} total={surplus.expenses} />
          ) : (
            <EmptyState compact title="No spending recorded this month" />
          )}
          {snap.unknownTypeCount > 0 && (
            <p className="text-xs text-muted-foreground">
              Not included: {snap.unknownTypeCount} unclassified{" "}
              {snap.unknownTypeCount === 1 ? "transaction" : "transactions"} worth{" "}
              {formatCurrency(snap.unknownTypeAmount)}.{" "}
              <Link className="text-accent underline-offset-4 hover:underline" href="/transactions?review=1">
                Review them
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      <TrendCard month={month} />

      {/* 3 + 4. Goals and budgets */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeaderRow
            title="Goal progress"
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link href="/goals">All goals</Link>
              </Button>
            }
          />
          <CardContent className="space-y-5">
            {data.goals.length === 0 ? (
              <EmptyState compact icon={Target} title="No goals yet" action={{ label: "Create a goal", href: "/goals" }} />
            ) : (
              data.goals.map((g) => {
                const f = calculateGoalForecast(g, data.goalContributions, today);
                return (
                  <div key={g.id} className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{g.name}</span>
                      <PaceBadge value={f.pace} />
                    </div>
                    <GoalBar goal={g} />
                    <p className="text-xs text-muted-foreground">
                      {f.pace === "complete"
                        ? "Target reached."
                        : f.projection.date
                          ? `At ${formatCurrency(f.savingRate)} a month: ${formatDate(f.projection.date)}. Deadline ${formatDate(g.deadline)}.`
                          : `Deadline ${formatDate(g.deadline)}. No saving rate yet to project from.`}
                    </p>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeaderRow
            title="Budget vs actual"
            description={
              snap.budgetLines.length > 0
                ? `${formatCurrency(snap.budgetTotals.spentInBudgeted)} of ${formatCurrency(snap.budgetTotals.budgeted)} used`
                : undefined
            }
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link href="/budget">Manage</Link>
              </Button>
            }
          />
          <CardContent className="space-y-4">
            {snap.budgetLines.length === 0 ? (
              <EmptyState compact icon={Wallet} title="No budgets yet" action={{ label: "Set a budget", href: "/budget" }} />
            ) : (
              [...snap.budgetLines]
                .sort((a, b) => (b.percentUsed ?? 0) - (a.percentUsed ?? 0))
                .slice(0, 5)
                .map((l) => <BudgetBar key={l.budgetId} line={l} />)
            )}
            {snap.budgetLines.length > 5 && (
              <p className="text-xs text-muted-foreground">
                Showing the 5 most-used of {snap.budgetLines.length} budgets.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 5 + 6. Today's plan and money owed */}
      <div className="grid gap-6 lg:grid-cols-2">
        <TodayPlanCard />
        <Card>
          <CardHeaderRow
            title="Money owed to you"
            description={
              snap.receivables.totalRemaining > 0
                ? `${formatCurrency(snap.receivables.totalRemaining)} outstanding`
                : undefined
            }
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link href="/owed">Details</Link>
              </Button>
            }
          />
          <CardContent>
            {snap.receivables.lines.length === 0 ? (
              <EmptyState
                compact
                icon={HandCoins}
                title="Nobody owes you anything"
                description="Split a shared bill from its transaction to track who owes what."
              />
            ) : (
              <ul className="divide-y divide-border/70">
                {snap.receivables.lines.slice(0, 4).map((l) => (
                  <li key={`${l.splitId}-${l.participantId}`} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{l.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{l.description}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Money amount={l.remaining} className="text-sm font-semibold" />
                      <SettlementBadge status={l.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 7. Recent transactions */}
      <Card>
        <CardHeaderRow
          title="Recent transactions"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/transactions">All transactions</Link>
            </Button>
          }
        />
        <div className="pb-2">
          <TransactionList
            compact
            transactions={recent}
            splitIndex={snap.splitIndex}
            onOpen={(t) => setOpenId(t.id)}
            empty={
              <div className="px-4 pb-4 sm:px-5">
                <EmptyState
                  compact
                  title={`No transactions in ${formatMonth(month)}`}
                  action={{ label: "Import a statement", href: "/data" }}
                />
              </div>
            }
          />
        </div>
      </Card>

      <TransactionDetailDialog transactionId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

/** Incoming split into what was spent, what went to goals, and what's left — plus money in that isn't income. */
function IncomeFlow({ snap }: { snap: MonthSnapshot }) {
  const { data, today } = useStore();
  const [moving, setMoving] = React.useState(false);
  const { income, expenses, goalContributions, unallocated } = snap.surplus;
  const pref = data.settings.surplusHandling;
  const suggestGoal =
    pref.mode === "suggest_goal" ? (data.goals.find((g) => g.id === pref.goalId) ?? data.goals[0] ?? null) : null;
  // Only for the current month: a contribution is dated today, so it belongs to this month's surplus.
  const canMove = !!suggestGoal && unallocated > 0 && snap.month === monthOf(today);
  const inc = snap.incoming;
  if (income <= 0 && expenses <= 0 && inc.totalReceived <= 0) return null;
  const over = expenses + Math.max(0, goalContributions) - income;
  const base = Math.max(income, expenses + Math.max(0, goalContributions), 1);
  const segs = [
    { key: "exp", label: "Spent", amount: expenses, className: "bg-primary" },
    { key: "goal", label: "To goals", amount: Math.max(0, goalContributions), className: "bg-success" },
    { key: "free", label: "Unallocated", amount: Math.max(0, unallocated), className: "bg-accent/30" },
  ];
  const other = [
    { label: "Paid back by friends", amount: inc.reimbursements, note: "settles money owed" },
    { label: "Refunds", amount: inc.refunds, note: "reduces spending" },
    { label: "From your own accounts", amount: inc.transfersIn, note: "transfer" },
    { label: "Not yet classified", amount: inc.unclassifiedIn, note: "needs review" },
  ].filter((o) => o.amount > 0);
  return (
    <Card>
      <CardContent className="grid gap-5 pt-4 sm:pt-5 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">Where this month&apos;s incoming is going</p>
            {over > 0 && (
              <p className="text-xs font-medium text-destructive">
                Spending and goal savings exceed incoming by {formatCurrency(over)}
              </p>
            )}
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary" aria-hidden="true">
            {segs.map((s) =>
              s.amount > 0 ? (
                <div
                  key={s.key}
                  className={cn("h-full border-r-2 border-card last:border-r-0", s.className)}
                  style={{ width: `${(s.amount / base) * 100}%` }}
                />
              ) : null
            )}
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {segs.map((s) => (
              <div key={s.key} className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-sm", s.className)} aria-hidden="true" />
                <dt className="text-muted-foreground">{s.label}</dt>
                <dd className="money font-semibold">{formatCurrency(s.amount)}</dd>
              </div>
            ))}
          </dl>
          {canMove && suggestGoal && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button size="sm" variant="outline" onClick={() => setMoving(true)}>
                Move {formatCurrency(unallocated)} to {suggestGoal.name}
              </Button>
              <span className="text-xs text-muted-foreground">You can change the amount before saving.</span>
            </div>
          )}
          <ContributionDialog
            goal={moving ? suggestGoal : null}
            onOpenChange={(o) => !o && setMoving(false)}
            initialAmount={unallocated}
            initialNote="Unallocated surplus"
          />
        </div>
        <div className="space-y-2 border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <p className="text-sm font-medium">Other money in (not income)</p>
          {other.length === 0 ? (
            <p className="text-xs text-muted-foreground">None this month.</p>
          ) : (
            <dl className="space-y-1.5 text-sm">
              {other.map((o) => (
                <div key={o.label} className="flex items-baseline justify-between gap-3">
                  <dt>
                    {o.label}
                    <span className="block text-xs text-muted-foreground">{o.note}</span>
                  </dt>
                  <dd className="money font-semibold">{formatCurrency(o.amount)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TodayPlanCard() {
  const { plan, progress, proposedAvailable, today } = useDailyPlan();
  return (
    <Card>
      <CardHeaderRow
        title="Today's plan"
        description={formatDate(today)}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/plan-a-day">{plan ? "Open plan" : "Plan today"}</Link>
          </Button>
        }
      />
      <CardContent>
        {!plan || !progress ? (
          <EmptyState
            compact
            icon={CalendarCheck}
            title="No plan for today yet"
            description={`Suggested spending for today: ${formatCurrency(proposedAvailable)}.`}
            action={{ label: "Plan today", href: "/plan-a-day" }}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Spent <span className="money font-semibold text-foreground">{formatCurrency(progress.totalActual)}</span> of{" "}
                <span className="money">{formatCurrency(plan.available)}</span>
              </p>
              <p className={cn("money text-sm font-semibold", progress.totalRemaining < 0 && "text-destructive")}>
                {progress.totalRemaining < 0
                  ? `${formatCurrency(-progress.totalRemaining)} over`
                  : `${formatCurrency(progress.totalRemaining)} left`}
              </p>
            </div>
            <ul className="space-y-2">
              {progress.lines.map((l) => (
                <li key={l.category} className="flex items-center justify-between gap-3 text-sm">
                  <span>{categoryLabel(l.category)}</span>
                  <span className="money">
                    <span className={cn(l.status === "over" && "text-destructive")}>{formatCurrency(l.actual)}</span>
                    <span className="text-muted-foreground"> / {formatCurrency(l.planned)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TrendCard({ month }: { month: string }) {
  const { data } = useStore();
  const trend = React.useMemo(() => calculateMonthlyTrend(data, month, 6), [data, month]);
  if (trend.length < 2) return null;
  return (
    <Card>
      <CardHeaderRow title="Incoming vs spending" description="Last 6 months, up to the month shown" />
      <CardContent>
        <MoneyChart
          kind="bar"
          data={trend.map((p) => ({
            label: formatMonthShort(p.month),
            tooltipLabel: formatMonth(p.month),
            incoming: p.income,
            spending: p.spending,
          }))}
          series={[
            { key: "incoming", name: "Incoming", color: "hsl(var(--success))" },
            { key: "spending", name: "Spending", color: "hsl(var(--primary))" },
          ]}
          xLabel="Month"
          summary={trend.map((p) => `${formatMonth(p.month)}: incoming ${formatCurrency(p.income)}, spending ${formatCurrency(p.spending)}`).join(". ")}
        />
      </CardContent>
    </Card>
  );
}
