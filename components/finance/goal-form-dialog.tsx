"use client";

import * as React from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { MAX_SAFETY_MULTIPLIER, MIN_SAFETY_MULTIPLIER } from "@/lib/domain/goals";
import { useStore } from "@/lib/state/store";
import type { Goal } from "@/lib/types/finance";
import { isIsoDate } from "@/lib/utils/dates";
import { formatCurrency } from "@/lib/utils/format";
import { createId, nowIso } from "@/lib/utils/id";
import { roundMoney } from "@/lib/utils/money";

interface Draft {
  name: string;
  targetAmount: number | null;
  currentAmount: number | null;
  deadline: string;
  safetyMultiplier: number | null;
  plannedMonthlyContribution: number | null;
}
type Errors = Partial<Record<keyof Draft, string>>;

function validate(d: Draft, today: string, editing: boolean): Errors {
  const e: Errors = {};
  if (!d.name.trim()) e.name = "Give the goal a name.";
  else if (d.name.trim().length > 60) e.name = "Keep the name under 60 characters.";
  if (d.targetAmount === null) e.targetAmount = "Enter the amount you need.";
  else if (d.targetAmount <= 0) e.targetAmount = "The target must be more than ₹0.";
  if (d.currentAmount === null) e.currentAmount = "Enter what's saved so far (₹0 is fine).";
  if (!d.deadline || !isIsoDate(d.deadline)) e.deadline = "Choose a valid date.";
  else if (!editing && d.deadline <= today) e.deadline = "The deadline must be in the future.";
  if (d.safetyMultiplier === null) e.safetyMultiplier = "Enter a multiplier.";
  else if (d.safetyMultiplier < MIN_SAFETY_MULTIPLIER || d.safetyMultiplier > MAX_SAFETY_MULTIPLIER)
    e.safetyMultiplier = `Use a value from ${MIN_SAFETY_MULTIPLIER} to ${MAX_SAFETY_MULTIPLIER}.`;
  return e;
}

const ORDER: (keyof Draft)[] = ["name", "targetAmount", "currentAmount", "deadline", "safetyMultiplier"];

export function GoalFormDialog({
  open,
  onOpenChange,
  goal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: Goal | null;
}) {
  const { data, today, dispatch } = useStore();
  const toast = useToast();
  const editing = !!goal;
  const [draft, setDraft] = React.useState<Draft>(() => blank());
  const [errors, setErrors] = React.useState<Errors>({});
  const [submitted, setSubmitted] = React.useState(false);

  function blank(): Draft {
    return {
      name: "",
      targetAmount: null,
      currentAmount: 0,
      deadline: "",
      safetyMultiplier: data.settings.defaultSafetyMultiplier,
      plannedMonthlyContribution: null,
    };
  }

  React.useEffect(() => {
    if (!open) return;
    setDraft(
      goal
        ? {
            name: goal.name,
            targetAmount: goal.targetAmount,
            currentAmount: goal.currentAmount,
            deadline: goal.deadline,
            safetyMultiplier: goal.safetyMultiplier,
            plannedMonthlyContribution: goal.plannedMonthlyContribution || null,
          }
        : blank()
    );
    setErrors({});
    setSubmitted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goal?.id]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      if (submitted) setErrors(validate(next, today, editing));
      return next;
    });
  }

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setSubmitted(true);
    const e = validate(draft, today, editing);
    setErrors(e);
    const first = ORDER.find((k) => e[k]);
    if (first) {
      document.getElementById(`goal-${first}`)?.focus();
      return;
    }
    const saved: Goal = {
      id: goal?.id ?? createId("goal"),
      name: draft.name.trim(),
      targetAmount: roundMoney(draft.targetAmount ?? 0),
      currentAmount: roundMoney(draft.currentAmount ?? 0),
      deadline: draft.deadline,
      safetyMultiplier: draft.safetyMultiplier ?? data.settings.defaultSafetyMultiplier,
      plannedMonthlyContribution: roundMoney(draft.plannedMonthlyContribution ?? 0),
      createdAt: goal?.createdAt ?? nowIso(),
    };
    dispatch({ type: "goal/upsert", goal: saved });
    toast({ tone: "success", title: editing ? "Goal updated" : "Goal created", description: saved.name });
    onOpenChange(false);
  }

  const safety =
    draft.targetAmount && draft.safetyMultiplier ? roundMoney(draft.targetAmount * draft.safetyMultiplier) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit goal" : "New goal"}</DialogTitle>
            <DialogDescription>
              Your target stays exactly what you enter. The safety target is shown alongside it as a cushion.
            </DialogDescription>
          </DialogHeader>
          <Field id="goal-name" label="Goal name" error={errors.name}>
            {(aria) => (
              <Input {...aria} value={draft.name} maxLength={80} onChange={(e) => update("name", e.target.value)} placeholder="e.g. New laptop" />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="goal-targetAmount" label="Target amount" error={errors.targetAmount}>
              {(aria) => (
                <AmountInput {...aria} decimals={0} value={draft.targetAmount} onValueChange={(v) => update("targetAmount", v)} placeholder="0" />
              )}
            </Field>
            <Field
              id="goal-currentAmount"
              label="Saved so far"
              error={errors.currentAmount}
              hint={editing ? "Changing this directly isn't recorded as a contribution." : undefined}
            >
              {(aria) => (
                <AmountInput {...aria} decimals={0} value={draft.currentAmount} onValueChange={(v) => update("currentAmount", v)} placeholder="0" />
              )}
            </Field>
            <Field id="goal-deadline" label="Deadline" error={errors.deadline}>
              {(aria) => (
                <Input {...aria} type="date" value={draft.deadline} min={editing ? undefined : today} onChange={(e) => update("deadline", e.target.value)} />
              )}
            </Field>
            <Field
              id="goal-safetyMultiplier"
              label="Safety multiplier"
              error={errors.safetyMultiplier}
              hint={safety !== null ? `Safety target: ${formatCurrency(safety)}` : `Between ${MIN_SAFETY_MULTIPLIER} and ${MAX_SAFETY_MULTIPLIER}`}
            >
              {(aria) => (
                <AmountInput
                  {...aria}
                  currency={false}
                  suffix="×"
                  decimals={2}
                  max={MAX_SAFETY_MULTIPLIER}
                  value={draft.safetyMultiplier}
                  onValueChange={(v) => update("safetyMultiplier", v)}
                />
              )}
            </Field>
          </div>
          <Field
            id="goal-plannedMonthlyContribution"
            label="Planned monthly saving"
            optional
            hint="Used for projections until you've recorded contributions."
          >
            {(aria) => (
              <AmountInput
                {...aria}
                decimals={0}
                value={draft.plannedMonthlyContribution}
                onValueChange={(v) => update("plannedMonthlyContribution", v)}
                placeholder="0"
              />
            )}
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{editing ? "Save changes" : "Create goal"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
