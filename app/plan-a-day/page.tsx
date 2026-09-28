"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarCheck, CheckCircle2, Pencil, RotateCcw } from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import { Money } from "@/components/finance/money";
import { Stat } from "@/components/finance/stat";
import { EmptyState } from "@/components/finance/states";
import { AmountInput } from "@/components/ui/amount-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Segmented } from "@/components/ui/segmented";
import { SimpleSelect } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { categoryLabel } from "@/lib/domain/categories";
import { calculateDailyPlanProgress, suggestAllocations, type AllocationProgress } from "@/lib/domain/daily-plan";
import { useStore } from "@/lib/state/store";
import { useDailyPlan } from "@/lib/state/use-daily-plan";
import type { DailyPlan, DailyPlanAllocation, SpendingCategoryId } from "@/lib/types/finance";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatDate, formatShortDate } from "@/lib/utils/format";
import { createId, nowIso } from "@/lib/utils/id";
import { roundMoney, sumBy } from "@/lib/utils/money";

export default function PlanPage() {
  return (
    <AppShell
      title="Plan a day"
      description="Decide how much to spend today and where. Transactions you record today count against the plan automatically."
    >
      <PlanBody />
    </AppShell>
  );
}

const ACTION_TEXT = {
  carry_forward: "carried to tomorrow",
  split: "half carried to tomorrow, half to savings",
  savings: "added to savings",
} as const;

function PlanBody() {
  const { data, dispatch } = useStore();
  const toast = useToast();
  const { today, plan, proposedAvailable, progress, splits } = useDailyPlan();
  const [editing, setEditing] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);
  const s = data.settings;
  const planCategories = s.dailyPlanCategories;

  const recent = React.useMemo(
    () =>
      [...data.dailyPlans]
        .filter((p) => p.date < today)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 7)
        .map((p) => ({ plan: p, progress: calculateDailyPlanProgress(p, data.transactions, splits, planCategories) })),
    [data.dailyPlans, data.transactions, splits, planCategories, today]
  );

  function save(available: number, allocations: DailyPlanAllocation[]) {
    const next: DailyPlan = {
      date: today,
      available,
      allocations,
      createdAt: plan?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    dispatch({ type: "plan/upsert", plan: next });
    toast({
      tone: "success",
      title: plan ? "Plan updated" : "Today's plan saved",
      description: `${formatCurrency(available)} for ${formatShortDate(today)}`,
    });
    setEditing(false);
  }

  const explanation = <AllowanceBreakdown />;

  if (planCategories.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No categories selected for daily planning"
        description="Choose which day-to-day categories to plan in Settings."
        action={{ label: "Open settings", href: "/settings#daily-plan" }}
      />
    );
  }

  if (!plan || editing) {
    const initialAvailable = plan?.available ?? proposedAvailable;
    const initialAllocations = plan
      ? mergeCategories(plan.allocations, planCategories)
      : suggestAllocations(proposedAvailable, planCategories, data.budgets);
    return (
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeaderRow title={plan ? "Edit today's plan" : "Plan today"} description={formatDate(today)} />
          <CardContent>
            <PlanEditor
              key={plan?.updatedAt ?? "new"}
              initialAvailable={initialAvailable}
              initialAllocations={initialAllocations}
              suggestedAvailable={proposedAvailable}
              budgets={data.budgets}
              onSave={save}
              onCancel={plan ? () => setEditing(false) : undefined}
            />
          </CardContent>
        </Card>
        <Card className="h-fit lg:col-span-2">
          <CardHeaderRow title="Today's allowance" description="How today's suggested amount is worked out." />
          <CardContent>{explanation}</CardContent>
        </Card>
      </div>
    );
  }

  const p = progress!;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Available today" amount={plan.available} detail={formatDate(today)} />
        <Stat label="Spent so far" amount={p.totalActual} detail="In planned categories" />
        <Stat
          label={p.totalRemaining < 0 ? "Over plan" : "Left today"}
          amount={Math.abs(p.totalRemaining)}
          tone={p.totalRemaining < 0 ? "negative" : "positive"}
          detail={
            p.totalRemaining < 0
              ? `Tomorrow's adjustment: −${formatCurrency(-p.totalRemaining)} (flexible spending only)`
              : `If unused: ${ACTION_TEXT[s.unusedDailyAction]}`
          }
        />
      </div>

      <Card>
        <CardHeaderRow
          title="Today's categories"
          actions={
            <>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit plan
              </Button>
              <Button size="sm" variant="destructive-ghost" onClick={() => setResetting(true)}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reset
              </Button>
            </>
          }
        />
        <CardContent className="space-y-4">
          {p.lines.map((l) => (
            <AllocationRow key={l.category} line={l} />
          ))}
          {p.unplanned.length > 0 && (
            <p className="text-sm text-warning">
              Spent without a plan: {p.unplanned.map((u) => `${categoryLabel(u.category)} ${formatCurrency(u.actual)}`).join(", ")}.
            </p>
          )}
          {p.unallocated > 0 && (
            <p className="text-xs text-muted-foreground">
              {formatCurrency(p.unallocated)} of today&apos;s amount isn&apos;t assigned to a category.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Spent something today?{" "}
            <Link className="text-accent underline-offset-4 hover:underline" href="/transactions">
              Add it as a transaction
            </Link>{" "}
            and it counts here.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeaderRow title="Today's allowance" description="How today's suggested amount is worked out." />
          <CardContent>{explanation}</CardContent>
        </Card>
        <Card>
          <CardHeaderRow title="Recent days" />
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No earlier plans yet.</p>
            ) : (
              <ul className="divide-y divide-border/70">
                {recent.map(({ plan: rp, progress: rpp }) => (
                  <li key={rp.date} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="text-muted-foreground">{formatDate(rp.date)}</span>
                    <span className="money flex items-center gap-2">
                      <span>
                        {formatCurrency(rpp.totalActual)} <span className="text-muted-foreground">of {formatCurrency(rp.available)}</span>
                      </span>
                      <Badge variant={rpp.totalRemaining < 0 ? "destructive" : "success"}>
                        {rpp.totalRemaining < 0
                          ? `${formatCurrency(-rpp.totalRemaining)} over`
                          : `${formatCurrency(rpp.totalRemaining)} unused`}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={resetting}
        onOpenChange={setResetting}
        title="Reset today's plan?"
        description="Today's allocations are removed so you can plan again from the suggestion. Transactions are not affected."
        confirmLabel="Reset plan"
        onConfirm={() => {
          const removed = plan;
          dispatch({ type: "plan/delete", date: today });
          toast({
            title: "Today's plan reset",
            action: { label: "Undo", onClick: () => dispatch({ type: "plan/upsert", plan: removed }) },
          });
        }}
      />
    </div>
  );
}

function mergeCategories(allocs: DailyPlanAllocation[], cats: SpendingCategoryId[]): DailyPlanAllocation[] {
  const have = new Set(allocs.map((a) => a.category));
  return [...allocs, ...cats.filter((c) => !have.has(c)).map((category) => ({ category, amount: 0 }))];
}

function AllocationRow({ line }: { line: AllocationProgress }) {
  const pct = line.planned > 0 ? Math.min(100, (line.actual / line.planned) * 100) : line.actual > 0 ? 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">{categoryLabel(line.category)}</span>
        <span className="money">
          <span className="font-semibold">{formatCurrency(line.actual)}</span>
          <span className="text-muted-foreground"> of {formatCurrency(line.planned)}</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary" aria-hidden="true">
        <div
          className={cn(
            "h-full rounded-full",
            line.status === "over" ? "bg-destructive" : line.status === "used_up" ? "bg-warning" : "bg-accent"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={cn("text-xs", line.status === "over" ? "text-destructive" : "text-muted-foreground")}>
        {line.status === "over" ? `${formatCurrency(-line.remaining)} over` : `${formatCurrency(line.remaining)} left`}
      </p>
    </div>
  );
}

function PlanEditor({
  initialAvailable,
  initialAllocations,
  suggestedAvailable,
  budgets,
  onSave,
  onCancel,
}: {
  initialAvailable: number;
  initialAllocations: DailyPlanAllocation[];
  suggestedAvailable: number;
  budgets: Parameters<typeof suggestAllocations>[2];
  onSave: (available: number, allocations: DailyPlanAllocation[]) => void;
  onCancel?: () => void;
}) {
  const [available, setAvailable] = React.useState<number | null>(initialAvailable);
  const [allocs, setAllocs] = React.useState<{ category: SpendingCategoryId; amount: number | null }[]>(initialAllocations);
  const [submitted, setSubmitted] = React.useState(false);

  const allocated = roundMoney(sumBy(allocs, (a) => a.amount ?? 0));
  const avail = available ?? 0;
  const availableError = available === null ? "Enter today's amount (₹0 is allowed)." : undefined;
  const totalError =
    allocated > avail ? `Allocations add up to ${formatCurrency(allocated)}, more than the ${formatCurrency(avail)} available.` : undefined;
  const invalid = !!availableError || !!totalError;

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
        if (invalid) {
          document.getElementById(availableError ? "plan-available" : "alloc-first")?.focus();
          return;
        }
        onSave(avail, allocs.map((a) => ({ category: a.category, amount: a.amount ?? 0 })));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="space-y-1.5">
          <label htmlFor="plan-available" className="text-sm font-medium">
            Available today
          </label>
          <AmountInput
            id="plan-available"
            decimals={0}
            value={available}
            onValueChange={setAvailable}
            aria-invalid={(submitted && !!availableError) || undefined}
            aria-describedby="plan-available-hint"
            className="h-11 text-lg"
          />
          <p
            id="plan-available-hint"
            className={cn("text-xs", submitted && availableError ? "text-destructive" : "text-muted-foreground")}
          >
            {submitted && availableError ? availableError : `Suggested: ${formatCurrency(suggestedAvailable)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:pt-7">
          {available !== suggestedAvailable && (
            <Button variant="outline" onClick={() => setAvailable(suggestedAvailable)}>
              Use suggestion
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setAllocs(suggestAllocations(avail, allocs.map((a) => a.category), budgets))}
            disabled={avail <= 0}
          >
            Split by budgets
          </Button>
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-medium">By category</legend>
        {allocs.map((a, i) => (
          <div key={a.category} className="grid grid-cols-[1fr_9rem] items-center gap-3">
            <label htmlFor={i === 0 ? "alloc-first" : `alloc-${a.category}`} className="text-sm">
              {categoryLabel(a.category)}
            </label>
            <AmountInput
              id={i === 0 ? "alloc-first" : `alloc-${a.category}`}
              decimals={0}
              value={a.amount}
              onValueChange={(v) => setAllocs((prev) => prev.map((x, j) => (j === i ? { ...x, amount: v } : x)))}
              placeholder="0"
            />
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
          <span className="text-muted-foreground">Allocated</span>
          <span>
            <Money amount={allocated} className="font-semibold" />{" "}
            <span className="text-muted-foreground">of {formatCurrency(avail)}</span>
          </span>
        </div>
        {totalError ? (
          <p role="alert" className="text-xs text-destructive">
            {totalError}
          </p>
        ) : allocated < avail ? (
          <p className="text-xs text-muted-foreground">{formatCurrency(avail - allocated)} left unassigned.</p>
        ) : null}
      </fieldset>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit">Save plan</Button>
      </div>
    </form>
  );
}

/**
 * Normal allowance → yesterday's adjustment → adjusted amount, with the
 * user's persisted choice for unused money and a real "move to savings".
 */
function AllowanceBreakdown() {
  const { data, dispatch } = useStore();
  const toast = useToast();
  const { suggested, carry, proposedAvailable, yesterdayPlan } = useDailyPlan();
  const s = data.settings;
  const [goalId, setGoalId] = React.useState<string | undefined>(data.goals[0]?.id);
  const goal = data.goals.find((g) => g.id === goalId) ?? data.goals[0];
  // Still counts as saved only while that contribution exists (the user may have removed it on Goals).
  const alreadySaved =
    !!yesterdayPlan?.savedContributionId && data.goalContributions.some((c) => c.id === yesterdayPlan.savedContributionId);

  function moveToSavings() {
    if (!goal || !yesterdayPlan || carry.toSavings <= 0 || alreadySaved) return;
    const contributionId = createId("con");
    dispatch({
      type: "contribution/add",
      contribution: {
        id: contributionId,
        goalId: goal.id,
        date: yesterdayPlan.date,
        amount: carry.toSavings,
        note: `Unused from daily plan, ${formatShortDate(yesterdayPlan.date)}`,
      },
    });
    dispatch({ type: "plan/upsert", plan: { ...yesterdayPlan, savedContributionId: contributionId, updatedAt: nowIso() } });
    toast({ tone: "success", title: `${formatCurrency(carry.toSavings)} added to ${goal.name}` });
  }

  return (
    <div className="space-y-4 text-sm">
      <dl className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <dt>
            Normal daily allowance
            <span className="block text-xs text-muted-foreground">
              {suggested.basis === "budget"
                ? `${formatCurrency(suggested.remainingFlexibleBudget)} left in day-to-day budgets ÷ ${suggested.daysLeft} ${suggested.daysLeft === 1 ? "day" : "days"}, rounded down to ₹10`
                : "Fixed amount from Settings"}
            </span>
          </dt>
          <dd className="money font-semibold">{formatCurrency(suggested.amount)}</dd>
        </div>
        {carry.fromDate ? (
          carry.overspent > 0 ? (
            <div className="flex items-baseline justify-between gap-3">
              <dt>
                Yesterday&apos;s overspend
                <span className="block text-xs text-muted-foreground">
                  {formatShortDate(carry.fromDate)}: spent {formatCurrency(carry.actual)} of {formatCurrency(carry.planned)}
                </span>
              </dt>
              <dd className="money font-semibold text-destructive">−{formatCurrency(carry.overspent)}</dd>
            </div>
          ) : carry.unused > 0 ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <dt>
                  Carried from yesterday
                  <span className="block text-xs text-muted-foreground">
                    {formatShortDate(carry.fromDate)}: {formatCurrency(carry.unused)} unused of {formatCurrency(carry.planned)}
                  </span>
                </dt>
                <dd className="money font-semibold text-success">+{formatCurrency(carry.adjustment)}</dd>
              </div>
              {carry.toSavings > 0 && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">For savings instead</dt>
                  <dd className="money">{formatCurrency(carry.toSavings)}</dd>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Yesterday was spent exactly as planned.</p>
          )
        ) : (
          <p className="text-xs text-muted-foreground">No plan yesterday, so there&apos;s no adjustment.</p>
        )}
        <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
          <dt className="font-medium">Adjusted amount for today</dt>
          <dd className="money text-base font-semibold">{formatCurrency(proposedAvailable)}</dd>
        </div>
      </dl>

      {carry.toSavings > 0 && yesterdayPlan && (
        <div className="space-y-2 rounded-md border border-border p-3">
          {alreadySaved ? (
            <p className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Yesterday&apos;s {formatCurrency(carry.toSavings)} was added to a goal.
            </p>
          ) : data.goals.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Create a goal to move {formatCurrency(carry.toSavings)} of unused money into it.
            </p>
          ) : (
            <>
              <p className="text-sm">Move {formatCurrency(carry.toSavings)} of yesterday&apos;s unused money into a goal:</p>
              <div className="flex flex-wrap gap-2">
                <div className="min-w-[10rem] flex-1">
                  <SimpleSelect
                    aria-label="Goal"
                    value={goal?.id}
                    onValueChange={setGoalId}
                    options={data.goals.map((g) => ({ value: g.id, label: g.name }))}
                  />
                </div>
                <Button size="sm" onClick={moveToSavings}>
                  Add to savings
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <p className="font-medium">When a day ends with money unspent</p>
        <Segmented
          label="When a day ends with money unspent"
          value={s.unusedDailyAction}
          onChange={(v) => {
            dispatch({ type: "settings/update", settings: { unusedDailyAction: v } });
            toast({ tone: "success", title: "Preference saved", description: `Unused money will be ${ACTION_TEXT[v]}.` });
          }}
          options={[
            { value: "carry_forward", label: "Carry to tomorrow" },
            { value: "split", label: "Split" },
            { value: "savings", label: "Add to savings" },
          ]}
        />
        <p className="text-xs text-muted-foreground">
          Overspending is always taken off the next day. Only day-to-day categories ({s.dailyPlanCategories.map(categoryLabel).join(", ")}) are
          planned, so rent, bills and other essentials are never cut.{" "}
          <Link className="text-accent underline-offset-4 hover:underline" href="/settings#daily-plan">
            Change categories
          </Link>
        </p>
      </div>
    </div>
  );
}
