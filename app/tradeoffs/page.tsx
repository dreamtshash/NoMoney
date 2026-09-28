"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Clock, HelpCircle, Target } from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import { EmptyState } from "@/components/finance/states";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { SimpleSelect } from "@/components/ui/select";
import { calculateGoalForecast } from "@/lib/domain/goals";
import {
  calculateTradeOffImpact,
  MAX_PURCHASE_AMOUNT,
  validatePurchaseAmount,
  type TradeOffResult,
  type TradeOffSnapshot,
} from "@/lib/domain/tradeoff";
import { useActiveMonth, useMonthSnapshot } from "@/lib/state/hooks";
import { useStore } from "@/lib/state/store";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatDate, formatMonth, formatMonthsAsDuration } from "@/lib/utils/format";

const QUICK_AMOUNTS = [1000, 6000, 20000];

export default function TradeOffsPage() {
  return (
    <AppShell
      title="Trade-offs"
      description="Before you spend: see what a purchase does to this month's surplus and to a goal's completion date."
      showMonth
    >
      <TradeOffBody />
    </AppShell>
  );
}

function TradeOffBody() {
  const { data, today, dispatch } = useStore();
  const { month } = useActiveMonth();
  const snap = useMonthSnapshot();
  const prefs = data.settings.tradeOff;
  const [amount, setAmount] = React.useState<number | null>(6000);
  const [what, setWhat] = React.useState("");
  const check = validatePurchaseAmount(amount);

  const goal = data.goals.find((g) => g.id === prefs.goalId) ?? data.goals[0] ?? null;
  const setPrefs = (p: Partial<typeof prefs>) => dispatch({ type: "settings/update", settings: { tradeOff: { ...prefs, ...p } } });

  const forecast = goal ? calculateGoalForecast(goal, data.goalContributions, today) : null;

  const result: TradeOffResult | null = React.useMemo(() => {
    if (!goal || !forecast || !check.ok) return null;
    return calculateTradeOffImpact({
      purchaseAmount: check.value,
      goal,
      currentSurplus: snap.surplus.surplus,
      goalContributionsThisPeriod: snap.surplus.goalContributions,
      monthlySavingRate: forecast.savingRate,
      funding: prefs.funding,
      useSafetyTarget: prefs.useSafetyTarget,
      today,
    });
  }, [goal, forecast, check, snap.surplus, prefs.funding, prefs.useSafetyTarget, today]);

  if (!goal || !forecast) {
    return (
      <EmptyState
        icon={Target}
        title="Add a goal to compare against"
        description="Trade-offs show how a purchase changes a goal's completion date, so you need at least one goal."
        action={{ label: "Create a goal", href: "/goals" }}
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="h-fit lg:col-span-2">
        <CardHeaderRow title="The purchase" />
        <CardContent className="space-y-5">
          <Field id="purchase-what" label="What is it?" optional>
            {(aria) => (
              <Input {...aria} value={what} maxLength={60} placeholder="e.g. New headphones" onChange={(e) => setWhat(e.target.value)} />
            )}
          </Field>
          <Field
            id="purchase-amount"
            label="Purchase amount"
            error={!check.ok && check.reason !== "empty" ? check.message : undefined}
            hint={`Whole rupees, up to ${formatCurrency(MAX_PURCHASE_AMOUNT)}.`}
          >
            {(aria) => (
              <AmountInput
                {...aria}
                decimals={0}
                max={MAX_PURCHASE_AMOUNT * 10}
                value={amount}
                onValueChange={setAmount}
                placeholder="0"
                className="h-11 text-lg"
              />
            )}
          </Field>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Example amounts">
            {QUICK_AMOUNTS.map((v) => (
              <Button key={v} size="sm" variant={amount === v ? "secondary" : "outline"} onClick={() => setAmount(v)} aria-pressed={amount === v}>
                {formatCurrency(v)}
              </Button>
            ))}
          </div>

          <Field id="tradeoff-goal" label="Goal to compare against">
            {(aria) => (
              <SimpleSelect
                {...aria}
                value={goal.id}
                onValueChange={(v) => setPrefs({ goalId: v })}
                options={data.goals.map((g) => ({ value: g.id, label: g.name }))}
              />
            )}
          </Field>

          <div className="space-y-1.5">
            <p className="text-sm font-medium" id="funding-label">
              Pay for it from
            </p>
            <Segmented
              label="Pay for it from"
              value={prefs.funding}
              onChange={(v) => setPrefs({ funding: v })}
              options={[
                { value: "surplus", label: "This month's surplus" },
                { value: "goal", label: "Goal savings" },
              ]}
            />
            <p className="text-xs text-muted-foreground">
              {prefs.funding === "surplus"
                ? "Unallocated surplus is used first. Anything beyond it is money that would otherwise have gone to the goal."
                : "Taken out of what's already saved for the goal."}
            </p>
          </div>

          <Checkbox
            checked={prefs.useSafetyTarget}
            onCheckedChange={(v) => setPrefs({ useSafetyTarget: v })}
            label={`Measure against the safety target (${formatCurrency(forecast.safetyTarget)})`}
            description={`Actual target: ${formatCurrency(goal.targetAmount)}. The actual target isn't changed.`}
          />

          <div className="rounded-md bg-secondary/60 p-3 text-xs text-muted-foreground">
            <p>
              Using {formatMonth(month)}: surplus {formatCurrency(snap.surplus.surplus)}, of which{" "}
              {formatCurrency(snap.surplus.goalContributions)} already went to goals.
            </p>
            <p className="mt-1">
              Saving rate for {goal.name}:{" "}
              {forecast.rateBasis === "none"
                ? "none recorded yet"
                : `${formatCurrency(forecast.savingRate)} a month (${forecast.rateBasis === "history" ? "your recent average" : "your planned amount"})`}
              .
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6 lg:col-span-3">
        {result ? (
          <>
            <Verdict r={result} what={what.trim()} />
            <Card>
              <CardHeaderRow title="Before and after" />
              <div className="overflow-x-auto pb-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th scope="col" className="py-2 pl-4 pr-2 font-medium sm:pl-5"><span className="sr-only">Measure</span></th>
                      <th scope="col" className="py-2 pr-2 text-right font-medium">Before</th>
                      <th scope="col" className="py-2 pl-2 pr-4 text-right font-medium sm:pr-5">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    <CompareRow label="Surplus this month (incoming − spending)" before={result.before.surplus} after={result.after.surplus} money />
                    <CompareRow label="Unallocated surplus" before={result.before.unallocated} after={result.after.unallocated} money />
                    <CompareRow label={`Effectively saved for ${result.goalName}`} before={result.before.goalSaved} after={result.after.goalSaved} money />
                    <CompareRow label="Still needed for the goal" before={result.before.goalRemaining} after={result.after.goalRemaining} money invert />
                    <tr className="border-b border-border/70">
                      <th scope="row" className="py-2.5 pl-4 pr-2 text-left font-normal text-muted-foreground sm:pl-5">
                        Projected completion
                      </th>
                      <td className="py-2.5 pr-2 text-right">{projectionText(result.before)}</td>
                      <td className="py-2.5 pl-2 pr-4 text-right font-semibold sm:pr-5">{projectionText(result.after)}</td>
                    </tr>
                    <tr className="border-b border-border/70">
                      <th scope="row" className="py-2.5 pl-4 pr-2 text-left font-normal text-muted-foreground sm:pl-5">
                        Estimated delay
                      </th>
                      <td className="py-2.5 pr-2 text-right text-muted-foreground">—</td>
                      <td className="py-2.5 pl-2 pr-4 text-right font-semibold sm:pr-5">
                        {result.goalShortfall <= 0
                          ? "None"
                          : result.delayMonths === null
                            ? "Can't project"
                            : formatMonthsAsDuration(result.delayMonths)}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row" className="py-2.5 pl-4 pr-2 text-left font-normal text-muted-foreground sm:pl-5">
                        Meets deadline ({formatDate(result.deadline)})
                      </th>
                      <td className="py-2.5 pr-2 text-right">{deadlineText(result.before)}</td>
                      <td className="py-2.5 pl-2 pr-4 text-right font-semibold sm:pr-5">{deadlineText(result.after)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
            <Card>
              <CardHeaderRow title="How this was worked out" />
              <CardContent>
                <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                  <li>
                    Purchase: {formatCurrency(result.purchaseAmount)}.{" "}
                    {result.funding === "surplus"
                      ? `${formatCurrency(result.coveredByUnallocated)} comes from unallocated surplus.`
                      : `Taken from the goal's savings first.`}
                  </li>
                  <li>
                    {result.goalShortfall > 0
                      ? `${formatCurrency(result.goalShortfall)} is money the goal will now have to make up.`
                      : "Nothing is taken from the goal."}
                  </li>
                  <li>
                    {result.monthlySavingRate > 0
                      ? `At ${formatCurrency(result.monthlySavingRate)} a month, ${formatCurrency(result.goalShortfall)} takes ${formatMonthsAsDuration(result.goalShortfall / result.monthlySavingRate)} to re-save.`
                      : "With no saving rate recorded, a new completion date can't be projected."}
                  </li>
                  {result.deficit > 0 && (
                    <li className="text-destructive">
                      This month would end {formatCurrency(result.deficit)} below zero.
                    </li>
                  )}
                </ol>
              </CardContent>
            </Card>
          </>
        ) : (
          <EmptyState
            title={check.ok ? "Nothing to compare yet" : check.reason === "empty" ? "Enter a purchase amount" : "Check the amount"}
            description={check.ok ? undefined : check.reason === "empty" ? "Results update as you type." : check.message}
          />
        )}
      </div>
    </div>
  );
}

function projectionText(s: TradeOffSnapshot) {
  if (s.goalRemaining === 0) return "Reached";
  return s.projection.date ? formatDate(s.projection.date) : "Can't project";
}

function deadlineText(s: TradeOffSnapshot) {
  if (s.meetsDeadline === null) return "Unknown";
  return s.meetsDeadline ? "Yes" : "No";
}

function CompareRow({
  label,
  before,
  after,
  invert = false,
}: {
  label: string;
  before: number;
  after: number;
  money?: boolean;
  /** Higher is worse (e.g. amount still needed). */
  invert?: boolean;
}) {
  const worse = invert ? after > before : after < before;
  return (
    <tr className="border-b border-border/70">
      <th scope="row" className="py-2.5 pl-4 pr-2 text-left font-normal text-muted-foreground sm:pl-5">
        {label}
      </th>
      <td className={cn("money py-2.5 pr-2 text-right", before < 0 && "text-destructive")}>{formatCurrency(before)}</td>
      <td className={cn("money py-2.5 pl-2 pr-4 text-right font-semibold sm:pr-5", (after < 0 || worse) && "text-destructive")}>
        {formatCurrency(after)}
        {worse && <span className="sr-only"> (worse)</span>}
      </td>
    </tr>
  );
}

function Verdict({ r, what }: { r: TradeOffResult; what: string }) {
  const subject = what ? `Buying ${what}` : `This ${formatCurrency(r.purchaseAmount)} purchase`;
  const delay = r.delayMonths !== null && r.delayMonths > 0 ? formatMonthsAsDuration(r.delayMonths) : null;
  const config = {
    no_goal_impact: {
      Icon: CheckCircle2,
      tone: "border-success/30 bg-success/5 text-success",
      title: `${subject} is covered by unallocated surplus. ${r.goalName} isn't affected.`,
      body: `${formatCurrency(r.after.unallocated)} unallocated would remain this month.`,
    },
    goal_complete: {
      Icon: CheckCircle2,
      tone: "border-success/30 bg-success/5 text-success",
      title: `${r.goalName} is already reached.`,
      body: "This purchase doesn't take it below target.",
    },
    delays_goal: {
      Icon: Clock,
      tone: "border-warning/30 bg-warning/5 text-warning",
      title: `${subject} delays ${r.goalName} by ${delay ?? "a short time"}.`,
      body: `${formatCurrency(r.goalShortfall)} of this purchase comes out of goal money. ${
        r.after.meetsDeadline ? "You'd still make the deadline." : ""
      }`,
    },
    misses_deadline: {
      Icon: AlertTriangle,
      tone: "border-destructive/30 bg-destructive/5 text-destructive",
      title: `${subject} delays ${r.goalName} by ${delay ?? "some time"} and misses the deadline.`,
      body: `Projected completion moves past ${formatDate(r.deadline)}.`,
    },
    cannot_project: {
      Icon: HelpCircle,
      tone: "border-border bg-secondary/60 text-foreground",
      title: `${subject} takes ${formatCurrency(r.goalShortfall)} away from ${r.goalName}.`,
      body: "There's no saving history or planned amount, so a delay can't be calculated.",
    },
  }[r.verdict];

  return (
    <div className={cn("flex gap-3 rounded-lg border p-4 sm:p-5", config.tone)} role="status" aria-live="polite">
      <config.Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">{config.title}</p>
        <p className="mt-1 text-sm text-foreground/80">{config.body}</p>
      </div>
    </div>
  );
}
