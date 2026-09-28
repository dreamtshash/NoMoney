"use client";

import * as React from "react";
import Link from "next/link";
import { Pencil, Plus, Trash2, Wallet } from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import { BudgetBar } from "@/components/finance/budget-bar";
import { BudgetFormDialog } from "@/components/finance/budget-form-dialog";
import { Stat } from "@/components/finance/stat";
import { MoneyChart } from "@/components/finance/spending-chart";
import { EmptyState } from "@/components/finance/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { categoryLabel } from "@/lib/domain/categories";
import { useActiveMonth, useMonthSnapshot } from "@/lib/state/hooks";
import { useStore } from "@/lib/state/store";
import type { Budget, SpendingCategoryId } from "@/lib/types/finance";
import { formatCurrency, formatMonth, formatPercent } from "@/lib/utils/format";

type FormState = { open: false } | { open: true; budget?: Budget; category?: SpendingCategoryId };

export default function BudgetPage() {
  const [form, setForm] = React.useState<FormState>({ open: false });
  return (
    <AppShell
      title="Budget"
      description="Monthly limits per category, compared with what you actually spent."
      showMonth
      actions={
        <Button onClick={() => setForm({ open: true })}>
          <Plus className="h-4 w-4" aria-hidden="true" /> New budget
        </Button>
      }
    >
      <BudgetBody onEdit={(budget) => setForm({ open: true, budget })} onCreate={(category) => setForm({ open: true, category })} />
      <FormHost form={form} setForm={setForm} />
    </AppShell>
  );
}

function FormHost({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  const snap = useMonthSnapshot();
  return (
    <BudgetFormDialog
      open={form.open}
      onOpenChange={(o) => !o && setForm({ open: false })}
      budget={form.open ? form.budget : null}
      initialCategory={form.open ? form.category : undefined}
      actualFor={(c) => snap.byCategory[c] ?? 0}
    />
  );
}

function BudgetBody({
  onEdit,
  onCreate,
}: {
  onEdit: (b: Budget) => void;
  onCreate: (c?: SpendingCategoryId) => void;
}) {
  const { data, dispatch } = useStore();
  const { month } = useActiveMonth();
  const snap = useMonthSnapshot();
  const toast = useToast();
  const [deleting, setDeleting] = React.useState<Budget | null>(null);
  const t = snap.budgetTotals;
  const plan = snap.savingsPlan;
  const s = data.settings;

  const lines = [...snap.budgetLines].sort((a, b) => {
    const order = { over: 0, on_target: 1, under: 2 } as const;
    return order[a.status] - order[b.status] || b.actual - a.actual;
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Budgeted" amount={t.budgeted} detail={`${snap.budgetLines.length} categories, ${formatMonth(month)}`} />
        <Stat label="Spent in budgeted categories" amount={t.spentInBudgeted} />
        <Stat
          label={t.remaining >= 0 ? "Remaining" : "Over in total"}
          amount={Math.abs(t.remaining)}
          tone={t.remaining < 0 ? "negative" : "none"}
          detail={
            t.overspending > 0
              ? `${formatCurrency(t.overspending)} overspent across ${t.overCount} ${t.overCount === 1 ? "category" : "categories"}`
              : "No category is over budget"
          }
        />
        <Stat
          label="Unused budget"
          amount={t.unused}
          tone={t.unused > 0 ? "positive" : "none"}
          detail="Left in categories still under budget"
        />
      </div>

      <Card>
        <CardHeaderRow
          title="Budget vs actual"
          description={`${t.overCount} over, ${t.onTargetCount} on target (90% or more used), ${t.underCount} under`}
        />
        <CardContent className="space-y-5">
          {lines.length > 0 && (
            <MoneyChart
              kind="bar"
              data={lines.map((l) => ({ label: categoryLabel(l.category), budget: l.budget, actual: l.actual }))}
              series={[
                { key: "budget", name: "Budget", color: "hsl(var(--imp-discretionary))" },
                { key: "actual", name: "Actual", color: "hsl(var(--primary))" },
              ]}
              xLabel="Category"
              summary={lines.map((l) => `${categoryLabel(l.category)}: budget ${formatCurrency(l.budget)}, actual ${formatCurrency(l.actual)}`).join(". ")}
            />
          )}
          {lines.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No budgets yet"
              description="Set a monthly limit for a category to track it here."
              action={{ label: "Create a budget", onClick: () => onCreate() }}
            />
          ) : (
            lines.map((line) => {
              const budget = data.budgets.find((b) => b.id === line.budgetId);
              if (!budget) return null;
              const label = categoryLabel(line.category);
              return (
                <BudgetBar
                  key={line.budgetId}
                  line={line}
                  actions={
                    <span className="flex">
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${label} budget`} onClick={() => onEdit(budget)}>
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="destructive-ghost"
                        size="icon-sm"
                        aria-label={`Delete ${label} budget`}
                        onClick={() => setDeleting(budget)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </span>
                  }
                />
              );
            })
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeaderRow title="Spending without a budget" description="Categories you spent in this month that have no limit." />
          <CardContent>
            {snap.unbudgeted.length === 0 ? (
              <p className="text-sm text-muted-foreground">All spending this month falls inside a budgeted category.</p>
            ) : (
              <ul className="divide-y divide-border/70">
                {snap.unbudgeted.map((u) => (
                  <li key={u.category} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="text-sm font-medium">{categoryLabel(u.category)}</span>
                    <span className="flex items-center gap-3">
                      <span className="money text-sm font-semibold">{formatCurrency(u.actual)}</span>
                      {u.category !== "unknown" ? (
                        <Button size="sm" variant="outline" onClick={() => onCreate(u.category)}>
                          Set budget
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" asChild>
                          <Link href="/transactions?review=1">Review</Link>
                        </Button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeaderRow
            title="Savings plan"
            description="From your savings settings, applied to this month's incoming."
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link href="/settings#savings">Change</Link>
              </Button>
            }
          />
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Row label="Incoming this month (earned)" value={formatCurrency(snap.income)} />
              <Row
                label={
                  s.expectedMonthlyIncome > 0
                    ? `${formatPercent(s.savingsPercent)} of expected incoming (${formatCurrency(plan.baseIncome)})`
                    : `${formatPercent(s.savingsPercent)} of incoming`
                }
                value={formatCurrency(plan.baseSavings)}
              />
              {s.expectedMonthlyIncome > 0 && (
                <Row
                  label={`${formatPercent(s.additionalIncomeSavingsPercent)} of additional incoming (${formatCurrency(plan.additionalIncome)})`}
                  value={formatCurrency(plan.additionalSavings)}
                />
              )}
              <Row label="Planned savings" value={formatCurrency(plan.plannedSavings)} strong />
              <Row label="Actually moved into goals" value={formatCurrency(snap.surplus.goalContributions)} />
              <Row label="Unused budget that could be saved" value={formatCurrency(t.unused)} />
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              {snap.surplus.goalContributions >= plan.plannedSavings
                ? "Goal savings this month meet the plan."
                : `${formatCurrency(plan.plannedSavings - snap.surplus.goalContributions)} short of the plan so far.`}
            </p>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this budget?"
        description={
          deleting
            ? `The ${categoryLabel(deleting.category)} budget of ${formatCurrency(deleting.amount)} will be removed. Your transactions are not affected.`
            : ""
        }
        confirmLabel="Delete budget"
        destructive
        onConfirm={() => {
          if (!deleting) return;
          const removed = deleting;
          dispatch({ type: "budget/delete", id: removed.id });
          toast({
            title: "Budget deleted",
            description: categoryLabel(removed.category),
            action: { label: "Undo", onClick: () => dispatch({ type: "budget/upsert", budget: removed }) },
          });
          setDeleting(null);
        }}
      />
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={strong ? "font-medium" : "text-muted-foreground"}>{label}</dt>
      <dd className={`money ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}
