"use client";

import * as React from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils/format";
import { Money } from "@/components/finance/money";
import type { ReceivableLine } from "@/lib/domain/splits";
import { useStore } from "@/lib/state/store";
import { isIsoDate } from "@/lib/utils/dates";
import { createId } from "@/lib/utils/id";

/**
 * Record money a person paid back. This only updates the receivable — to keep
 * cash accurate, the incoming transfer itself should be added (or imported)
 * as a transaction of type "Paid back by someone".
 */
export function RecordPaymentDialog({
  line,
  onOpenChange,
}: {
  line: ReceivableLine | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { today, dispatch } = useStore();
  const toast = useToast();
  const [amount, setAmount] = React.useState<number | null>(null);
  const [date, setDate] = React.useState(today);
  const [error, setError] = React.useState<{ amount?: string; date?: string }>({});

  React.useEffect(() => {
    if (!line) return;
    setAmount(line.remaining);
    setDate(today);
    setError({});
  }, [line, today]);

  if (!line) return null;

  function save() {
    if (!line) return;
    const e: typeof error = {};
    if (amount === null || amount <= 0) e.amount = "Enter an amount greater than ₹0.";
    else if (amount > line.remaining) e.amount = `${line.name} only owes ${formatCurrency(line.remaining)} on this bill.`;
    if (!isIsoDate(date)) e.date = "Enter a valid date.";
    setError(e);
    if (Object.keys(e).length) return;
    dispatch({
      type: "split/payment",
      splitId: line.splitId,
      participantId: line.participantId,
      payment: { id: createId("pay"), date, amount: amount! },
    });
    toast({ tone: "success", title: `Payment from ${line.name} recorded` });
    onOpenChange(false);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment from {line.name}</DialogTitle>
          <DialogDescription>
            For {line.description}. Still owed: <Money amount={line.remaining} className="font-medium text-foreground" />
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="pay-amount" label="Amount paid" error={error.amount}>
            {(aria) => <AmountInput {...aria} value={amount} onValueChange={setAmount} />}
          </Field>
          <Field id="pay-date" label="Date" error={error.date}>
            {(aria) => <Input {...aria} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          If the money arrived in your account, also add that transaction as &ldquo;Paid back by someone&rdquo; so it isn&apos;t
          mistaken for income. You can link it to this bill from its details.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>Record payment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
