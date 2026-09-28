"use client";

import * as React from "react";
import { History, Pencil, PiggyBank, Plus, Target, Trash2 } from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import { PaceBadge } from "@/components/finance/badges";
import { ContributionDialog } from "@/components/finance/contribution-dialog";
import { GoalBar } from "@/components/finance/goal-bar";
import { GoalFormDialog } from "@/components/finance/goal-form-dialog";
import { EmptyState } from "@/components/finance/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { calculateGoalForecast, monthlyContributionHistory, type GoalForecast } from "@/lib/domain/goals";
import { useStore } from "@/lib/state/store";
import type { Goal } from "@/lib/types/finance";
import { formatCurrency, formatCurrencySigned, formatDate, formatMonthShort, formatMonthsAsDuration, formatShortDate } from "@/lib/utils/format";

export default function GoalsPage() {
  const [form, setForm] = React.useState<{ open: boolean; goal?: Goal }>({ open: false });
  return (
    <AppShell
      title="Goals"
      description="What you're saving for, how fast you're getting there, and what you'd need to save to hit the deadline."
      actions={
        <Button onClick={() => setForm({ open: true })}>
          <Plus className="h-4 w-4" aria-hidden="true" /> New goal
        </Button>
      }
    >
      <GoalsBody onEdit={(goal) => setForm({ open: true, goal })} onCreate={() => setForm({ open: true })} />
      <GoalFormDialog open={form.open} onOpenChange={(o) => setForm((f) => ({ ...f, open: o }))} goal={form.goal ?? null} />
    </AppShell>
  );
}

function GoalsBody({ onEdit, onCreate }: { onEdit: (g: Goal) => void; onCreate: () => void }) {
  const { data, today, dispatch } = useStore();
  const toast = useToast();
  const [contributing, setContributing] = React.useState<Goal | null>(null);
  const [deleting, setDeleting] = React.useState<Goal | null>(null);

  if (data.goals.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="No goals yet"
        description="Add something you're saving for. NoMoney will show the monthly saving needed and project when you'll get there."
        action={{ label: "Create a goal", onClick: onCreate }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {data.goals.map((goal) => (
        <GoalCard
          key={goal.id}
          goal={goal}
          forecast={calculateGoalForecast(goal, data.goalContributions, today)}
          onContribute={() => setContributing(goal)}
          onEdit={() => onEdit(goal)}
          onDelete={() => setDeleting(goal)}
        />
      ))}

      <ContributionDialog goal={contributing} onOpenChange={(o) => !o && setContributing(null)} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this goal?"
        description={
          deleting
            ? `"${deleting.name}" and its ${
                data.goalContributions.filter((c) => c.goalId === deleting.id).length
              } recorded contributions will be removed. Transactions are not affected.`
            : ""
        }
        confirmLabel="Delete goal"
        onConfirm={() => {
          if (!deleting) return;
          const goal = deleting;
          const contributions = data.goalContributions.filter((c) => c.goalId === goal.id);
          dispatch({ type: "goal/delete", id: goal.id });
          toast({
            title: "Goal deleted",
            description: goal.name,
            action: { label: "Undo", onClick: () => dispatch({ type: "goal/restore", goal, contributions }) },
          });
          setDeleting(null);
        }}
      />
    </div>
  );
}

function GoalCard({
  goal,
  forecast: f,
  onContribute,
  onEdit,
  onDelete,
}: {
  goal: Goal;
  forecast: GoalForecast;
  onContribute: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { data, today, dispatch } = useStore();
  const toast = useToast();
  const [showHistory, setShowHistory] = React.useState(false);
  const history = data.goalContributions
    .filter((c) => c.goalId === goal.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const months = monthlyContributionHistory(data.goalContributions, today, { goalId: goal.id });

  return (
    <Card>
      <CardHeaderRow
        title={
          <span className="flex flex-wrap items-center gap-2">
            {goal.name} <PaceBadge value={f.pace} />
          </span>
        }
        description={`Deadline ${formatDate(goal.deadline)}`}
        actions={
          <>
            <Button size="sm" onClick={onContribute}>
              <PiggyBank className="h-3.5 w-3.5" aria-hidden="true" /> Update savings
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label={`Edit ${goal.name}`} onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button size="icon-sm" variant="destructive-ghost" aria-label={`Delete ${goal.name}`} onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </>
        }
      />
      <CardContent className="space-y-5">
        <GoalBar goal={goal} />

        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-5">
          <Figure label="Still needed" value={formatCurrency(f.remaining)} detail={`Target ${formatCurrency(goal.targetAmount)}`} />
          <Figure
            label="Safety target"
            value={formatCurrency(f.safetyTarget)}
            detail={`${goal.safetyMultiplier}× target, ${formatCurrency(f.safetyRemaining)} to go`}
          />
          <Figure
            label="Required pace"
            value={f.requiredMonthly === null ? "—" : formatCurrency(f.requiredMonthly)}
            detail={
              f.requiredMonthly === null
                ? "Deadline has passed"
                : f.remaining === 0
                  ? "Nothing more needed"
                  : `To reach the target by ${formatShortDate(goal.deadline)}`
            }
          />
          <Figure
            label="Current pace"
            value={f.rateBasis === "none" ? "—" : `${formatCurrency(f.savingRate)}/mo`}
            detail={
              f.rateBasis === "history"
                ? `Average of the last ${f.historyMonths} ${f.historyMonths === 1 ? "month" : "months"}`
                : f.rateBasis === "planned"
                  ? "Your planned amount (no history yet)"
                  : "No contributions or plan yet"
            }
          />
          <Figure
            label="Projected completion"
            value={f.pace === "complete" ? "Reached" : f.projection.date ? formatDate(f.projection.date) : "—"}
            detail={
              f.pace === "complete"
                ? undefined
                : f.projection.date
                  ? `In ${formatMonthsAsDuration(f.projection.months)}`
                  : "Record a contribution or set a planned saving"
            }
          />
        </dl>

        {f.rateBasis === "history" && months.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Saved per month: {months.map((m) => `${formatMonthShort(m.month)} ${formatCurrency(m.amount)}`).join(", ")}. Average{" "}
            {formatCurrency(f.savingRate)} = {formatCurrency(months.reduce((a, m) => a + m.amount, 0))} ÷ {months.length}. Months with no
            contribution count as ₹0.
          </p>
        )}
        {f.pace === "behind" && f.requiredMonthly !== null && (
          <p className="text-sm text-warning">
            Current pace is {formatCurrency(Math.max(0, f.requiredMonthly - f.savingRate))} a month short of the required pace for{" "}
            {formatDate(goal.deadline)}.
          </p>
        )}
        {f.pace === "on_track" && f.requiredMonthly !== null && (
          <p className="text-sm text-muted-foreground">
            Current pace ({formatCurrency(f.savingRate)}/mo) is at or above the required pace ({formatCurrency(f.requiredMonthly)}/mo).
          </p>
        )}

        <div>
          <Button variant="ghost" size="sm" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            {showHistory ? "Hide" : "Show"} contributions ({history.length})
          </Button>
          {showHistory &&
            (history.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No contributions recorded yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border/70 rounded-md border border-border">
                {history.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="text-muted-foreground">{formatDate(c.date)}</span>
                      {c.note && <span className="ml-2 truncate">{c.note}</span>}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className={`money font-medium ${c.amount < 0 ? "text-destructive" : ""}`}>
                        {formatCurrencySigned(c.amount)}
                      </span>
                      <Button
                        size="icon-sm"
                        variant="destructive-ghost"
                        aria-label={`Remove contribution of ${formatCurrency(Math.abs(c.amount))} on ${formatDate(c.date)}`}
                        onClick={() => {
                          dispatch({ type: "contribution/delete", id: c.id });
                          toast({
                            title: "Contribution removed",
                            description: `Saved amount adjusted by ${formatCurrencySigned(-c.amount)}`,
                            action: { label: "Undo", onClick: () => dispatch({ type: "contribution/add", contribution: c }) },
                          });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Figure({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="money mt-0.5 text-lg font-semibold">{value}</dd>
      {detail && <dd className="text-xs text-muted-foreground">{detail}</dd>}
    </div>
  );
}
