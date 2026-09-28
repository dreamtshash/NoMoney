"use client";

import * as React from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { useStore } from "@/lib/state/store";
import type { Goal } from "@/lib/types/finance";
import { isIsoDate } from "@/lib/utils/dates";
import { formatCurrency } from "@/lib/utils/format";
import { createId } from "@/lib/utils/id";

/** Record money moved into (or taken out of) a goal. Updates the goal's saved amount and its history. */
export function ContributionDialog({
  goal,
  onOpenChange,
  initialAmount,
  initialNote,
}: {
  goal: Goal | null;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill (e.g. moving unallocated surplus). */
  initialAmount?: number;
  initialNote?: string;
}) {
  const { today, dispatch } = useStore();
  const toast = useToast();
  const [direction, setDirection] = React.useState<"add" | "withdraw">("add");
  const [amount, setAmount] = React.useState<number | null>(null);
  const [date, setDate] = React.useState(today);
  const [note, setNote] = React.useState("");
  const [errors, setErrors] = React.useState<{ amount?: string; date?: string }>({});

  React.useEffect(() => {
    if (!goal) return;
    setDirection("add");
    setAmount(initialAmount ?? null);
    setDate(today);
    setNote(initialNote ?? "");
    setErrors({});
  }, [goal, today, initialAmount, initialNote]);

  if (!goal) return null;

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!goal) return;
    const e: typeof errors = {};
    if (amount === null || amount <= 0) e.amount = "Enter an amount above ₹0.";
    else if (direction === "withdraw" && amount > goal.currentAmount)
      e.amount = `You can withdraw at most ${formatCurrency(goal.currentAmount)}.`;
    if (!isIsoDate(date)) e.date = "Choose a valid date.";
    else if (date > today) e.date = "Contributions can't be in the future.";
    setErrors(e);
    if (e.amount || e.date || amount === null) {
      document.getElementById(e.amount ? "contrib-amount" : "contrib-date")?.focus();
      return;
    }
    const signed = direction === "add" ? amount : -amount;
    dispatch({
      type: "contribution/add",
      contribution: { id: createId("con"), goalId: goal.id, date, amount: signed, note: note.trim() || undefined },
    });
    toast({
      tone: "success",
      title: direction === "add" ? "Contribution recorded" : "Withdrawal recorded",
      description: `${formatCurrency(amount)} ${direction === "add" ? "to" : "from"} ${goal.name}`,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={!!goal} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Update savings for {goal.name}</DialogTitle>
            <DialogDescription>
              Currently saved: {formatCurrency(goal.currentAmount)}. Recorded contributions drive the projection.
            </DialogDescription>
          </DialogHeader>
          <Segmented
            label="Direction"
            value={direction}
            onChange={setDirection}
            options={[
              { value: "add", label: "Add money" },
              { value: "withdraw", label: "Withdraw", disabled: goal.currentAmount <= 0 },
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="contrib-amount" label="Amount" error={errors.amount}>
              {(aria) => <AmountInput {...aria} decimals={0} value={amount} onValueChange={setAmount} placeholder="0" />}
            </Field>
            <Field id="contrib-date" label="Date" error={errors.date}>
              {(aria) => <Input {...aria} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />}
            </Field>
          </div>
          <Field id="contrib-note" label="Note" optional>
            {(aria) => <Input {...aria} value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Record</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
