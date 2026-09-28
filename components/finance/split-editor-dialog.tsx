"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Money } from "@/components/finance/money";
import { validateSplit } from "@/lib/domain/splits";
import { useStore } from "@/lib/state/store";
import type { Split, Transaction } from "@/lib/types/finance";
import { createId, nowIso } from "@/lib/utils/id";
import { roundMoney } from "@/lib/utils/money";

interface Row {
  id: string;
  name: string;
  share: number | null;
}

export function SplitEditorDialog({
  open,
  onOpenChange,
  transaction,
  split,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction;
  split?: Split;
}) {
  const { dispatch } = useStore();
  const toast = useToast();
  const cashPaid = Math.abs(transaction.amount);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [errors, setErrors] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setErrors([]);
    setRows(
      split
        ? split.participants.map((p) => ({ id: p.id, name: p.name, share: p.share }))
        : [{ id: createId("sp"), name: "", share: null }]
    );
  }, [open, split]);

  const othersTotal = roundMoney(rows.reduce((s, r) => s + (r.share ?? 0), 0));
  const yourShare = roundMoney(cashPaid - othersTotal);

  function splitEvenly() {
    const people = rows.length + 1; // + you
    const each = Math.floor((cashPaid / people) * 100) / 100;
    setRows((prev) => prev.map((r) => ({ ...r, share: each })));
  }

  function save() {
    const v = validateSplit(cashPaid, rows);
    setErrors(v.errors);
    if (!v.ok) return;
    const next: Split = {
      id: split?.id ?? createId("split"),
      transactionId: transaction.id,
      createdAt: split?.createdAt ?? nowIso(),
      participants: rows.map((r) => {
        const existing = split?.participants.find((p) => p.id === r.id);
        return { id: r.id, name: r.name.trim(), share: r.share ?? 0, payments: existing?.payments ?? [] };
      }),
    };
    dispatch({ type: "split/upsert", split: next });
    toast({
      tone: "success",
      title: split ? "Split updated" : "Bill split",
      description: `Your share is now counted as spending; the rest is money owed to you.`,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{split ? "Edit split" : "Split this bill"}</DialogTitle>
          <DialogDescription>
            You paid <Money amount={cashPaid} className="font-medium text-foreground" /> for {transaction.description}. Add
            what each person owes you. Only your share counts as your spending.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="sr-only">People who owe you</legend>
          {rows.map((r, i) => (
            <div key={r.id} className="flex items-start gap-2">
              <div className="flex-1">
                <label htmlFor={`sp-name-${r.id}`} className="sr-only">
                  Person {i + 1} name
                </label>
                <Input
                  id={`sp-name-${r.id}`}
                  placeholder="Name"
                  value={r.name}
                  maxLength={40}
                  onChange={(e) => setRows((p) => p.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))}
                />
              </div>
              <div className="w-32">
                <label htmlFor={`sp-share-${r.id}`} className="sr-only">
                  Person {i + 1} owes
                </label>
                <AmountInput
                  id={`sp-share-${r.id}`}
                  placeholder="Owes"
                  value={r.share}
                  onValueChange={(v) => setRows((p) => p.map((x) => (x.id === r.id ? { ...x, share: v } : x)))}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove person ${i + 1}`}
                disabled={rows.length === 1}
                onClick={() => setRows((p) => p.filter((x) => x.id !== r.id))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRows((p) => [...p, { id: createId("sp"), name: "", share: null }])}
            disabled={rows.length >= 20}
          >
            <Plus className="h-3.5 w-3.5" /> Add person
          </Button>
          <Button variant="ghost" size="sm" onClick={splitEvenly}>
            Split evenly with {rows.length} {rows.length === 1 ? "person" : "people"}
          </Button>
        </div>

        <dl className="grid grid-cols-3 gap-3 rounded-md bg-secondary/60 p-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">You paid</dt>
            <dd className="font-semibold">
              <Money amount={cashPaid} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Others owe</dt>
            <dd className="font-semibold">
              <Money amount={othersTotal} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Your share</dt>
            <dd className="font-semibold">
              <Money amount={yourShare} tone="negative-only" />
            </dd>
          </div>
        </dl>

        {errors.length > 0 && (
          <ul className="space-y-1 text-sm text-destructive" role="alert">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>{split ? "Save split" : "Split bill"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
