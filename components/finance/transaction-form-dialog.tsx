"use client";

import * as React from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { TypePicker } from "@/components/finance/type-picker";
import { SimpleSelect } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  CATEGORY_META,
  IMPORTANCE_META,
  IMPORTANCE_ORDER,
  SPENDING_CATEGORIES,
  TRANSACTION_TYPE_META,
  typeUsesSpendingClassification,
} from "@/lib/domain/categories";
import {
  buildTransaction,
  draftFromTransaction,
  fixedDirectionFor,
  validateTransactionDraft,
  type DraftErrors,
  type TransactionDraft,
} from "@/lib/domain/transactions";
import { useStore } from "@/lib/state/store";
import type { SpendingCategoryId, Transaction, TransactionType } from "@/lib/types/finance";
import { createId, nowIso } from "@/lib/utils/id";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing. */
  transaction?: Transaction | null;
  onSaved?: (t: Transaction) => void;
}

function emptyDraft(accountId: string, today: string): TransactionDraft {
  return {
    accountId,
    date: today,
    description: "",
    merchant: "",
    amount: null,
    direction: "out",
    type: "expense",
    category: "unknown",
    importance: "unknown",
    isRecurring: false,
    notes: "",
  };
}

export function TransactionFormDialog({ open, onOpenChange, transaction, onSaved }: Props) {
  const { data, today, dispatch } = useStore();
  const toast = useToast();
  const editing = !!transaction;
  const [draft, setDraft] = React.useState<TransactionDraft>(() => emptyDraft(data.accounts[0]?.id ?? "", today));
  const [errors, setErrors] = React.useState<DraftErrors>({});
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDraft(transaction ? draftFromTransaction(transaction) : emptyDraft(data.accounts[0]?.id ?? "", today));
    setErrors({});
    setSubmitted(false);
    // Reset only when the dialog opens or switches record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transaction?.id]);

  function update<K extends keyof TransactionDraft>(key: K, value: TransactionDraft[K]) {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      if (submitted) setErrors(validateTransactionDraft(next, data));
      return next;
    });
  }

  /** Switching direction resets a type that no longer fits (money in can't be an expense). */
  function changeDirection(direction: "in" | "out") {
    setDraft((prev) => {
      const fixed = fixedDirectionFor(prev.type);
      const type: TransactionType = fixed && fixed !== direction ? (direction === "out" ? "expense" : "unknown") : prev.type;
      const next: TransactionDraft = { ...prev, direction, type };
      if (!typeUsesSpendingClassification(type)) next.category = "unknown";
      if (submitted) setErrors(validateTransactionDraft(next, data));
      return next;
    });
  }

  function changeType(type: TransactionType) {
    setDraft((prev) => {
      const fixed = fixedDirectionFor(type);
      const next: TransactionDraft = { ...prev, type, direction: fixed ?? prev.direction };
      if (typeUsesSpendingClassification(type) && CATEGORY_META[prev.category]?.kind !== "spending") {
        next.category = "unknown";
      }
      if (submitted) setErrors(validateTransactionDraft(next, data));
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const v = validateTransactionDraft(draft, data);
    setErrors(v);
    if (Object.keys(v).length > 0) {
      const first = Object.keys(v)[0];
      document.getElementById(`tx-${first}`)?.focus();
      return;
    }
    const saved = buildTransaction(draft, {
      id: transaction?.id ?? createId("txn"),
      now: nowIso(),
      existing: transaction ?? undefined,
    });
    dispatch({ type: "transaction/upsert", transaction: saved });
    toast({
      tone: "success",
      title: editing ? "Changes saved" : "Transaction added",
      description: saved.needsReview ? "It's in the review queue until the category and importance are set." : undefined,
    });
    onSaved?.(saved);
    onOpenChange(false);
  }

  const fixedDirection = fixedDirectionFor(draft.type);
  const usesClassification = typeUsesSpendingClassification(draft.type);
  const suggested =
    usesClassification && draft.category !== "unknown" ? CATEGORY_META[draft.category].suggestedImportance : "unknown";
  const accountOptions = data.accounts.map((a) => ({ value: a.id, label: a.name }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit transaction" : "Add transaction"}</DialogTitle>
          <DialogDescription>{TRANSACTION_TYPE_META[draft.type].hint}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm font-medium" id="tx-direction-label">
              Direction
            </p>
            <Segmented
              id="tx-direction"
              label="Direction"
              value={draft.direction}
              onChange={changeDirection}
              options={[
                { value: "out", label: "Money out" },
                { value: "in", label: "Money in" },
              ]}
            />
          </div>
          <TypePicker id="tx-type" value={draft.type} onChange={changeType} direction={draft.direction} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="tx-amount" label="Amount" error={errors.amount}>
              {(aria) => (
                <AmountInput {...aria} value={draft.amount} onValueChange={(v) => update("amount", v)} placeholder="0" />
              )}
            </Field>
            <Field id="tx-date" label="Date" error={errors.date}>
              {(aria) => (
                <Input {...aria} type="date" value={draft.date} onChange={(e) => update("date", e.target.value)} />
              )}
            </Field>
          </div>

          <Field id="tx-description" label="Description" error={errors.description}>
            {(aria) => (
              <Input
                {...aria}
                value={draft.description}
                maxLength={120}
                placeholder="e.g. Groceries"
                onChange={(e) => update("description", e.target.value)}
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="tx-merchant" label="Merchant or person" optional error={errors.merchant}>
              {(aria) => (
                <Input
                  {...aria}
                  value={draft.merchant}
                  maxLength={80}
                  placeholder="e.g. BigBasket"
                  onChange={(e) => update("merchant", e.target.value)}
                />
              )}
            </Field>
            <Field id="tx-accountId" label="Account" error={errors.accountId}>
              {(aria) => (
                <SimpleSelect
                  {...aria}
                  value={draft.accountId || undefined}
                  placeholder="Choose account"
                  onValueChange={(v) => update("accountId", v)}
                  options={accountOptions}
                />
              )}
            </Field>
          </div>

          {draft.type === "transfer" && (
            <Field
              id="tx-transferAccountId"
              label={draft.direction === "out" ? "Moved to" : "Moved from"}
              optional
              error={errors.transferAccountId}
            >
              {(aria) => (
                <SimpleSelect
                  {...aria}
                  value={draft.transferAccountId}
                  placeholder="Choose account"
                  onValueChange={(v) => update("transferAccountId", v)}
                  options={accountOptions.filter((a) => a.value !== draft.accountId)}
                />
              )}
            </Field>
          )}

          {usesClassification && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="tx-category"
                label="Category"
                error={errors.category}
                hint={draft.type === "refund" ? "The category the refunded purchase was in." : undefined}
              >
                {(aria) => (
                  <SimpleSelect
                    {...aria}
                    value={draft.category}
                    onValueChange={(v) => update("category", v as SpendingCategoryId)}
                    options={SPENDING_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_META[c].label }))}
                  />
                )}
              </Field>
              <Field
                id="tx-importance"
                label="Importance"
                hint={
                  suggested !== "unknown" && suggested !== draft.importance ? (
                    <button
                      type="button"
                      className="font-medium text-accent hover:underline"
                      onClick={() => update("importance", suggested)}
                    >
                      {CATEGORY_META[draft.category].label} is often {IMPORTANCE_META[suggested].label.toLowerCase()} — use that
                    </button>
                  ) : (
                    IMPORTANCE_META[draft.importance].description
                  )
                }
              >
                {(aria) => (
                  <SimpleSelect
                    {...aria}
                    value={draft.importance}
                    onValueChange={(v) => update("importance", v)}
                    options={IMPORTANCE_ORDER.map((i) => ({ value: i, label: IMPORTANCE_META[i].label }))}
                  />
                )}
              </Field>
            </div>
          )}

          <Field id="tx-notes" label="Notes" optional>
            {(aria) => (
              <Textarea {...aria} value={draft.notes} maxLength={500} onChange={(e) => update("notes", e.target.value)} />
            )}
          </Field>

          <Checkbox
            checked={draft.isRecurring}
            onCheckedChange={(c) => update("isRecurring", c)}
            label="Recurring"
            description="Rent, bills, subscriptions and salary usually repeat every month."
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{editing ? "Save changes" : "Add transaction"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
