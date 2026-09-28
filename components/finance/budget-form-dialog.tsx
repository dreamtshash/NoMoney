"use client";

import * as React from "react";

import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { SimpleSelect } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { categoryLabel, SPENDING_CATEGORIES } from "@/lib/domain/categories";
import { useStore } from "@/lib/state/store";
import type { Budget, SpendingCategoryId } from "@/lib/types/finance";
import { formatCurrency } from "@/lib/utils/format";
import { createId } from "@/lib/utils/id";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget?: Budget | null;
  /** Pre-select a category when creating (e.g. from "unbudgeted spending"). */
  initialCategory?: SpendingCategoryId;
  /** Shown as a hint: what was spent in this category in the active month. */
  actualFor?: (category: SpendingCategoryId) => number;
}

export function BudgetFormDialog({ open, onOpenChange, budget, initialCategory, actualFor }: Props) {
  const { data, dispatch } = useStore();
  const toast = useToast();
  const editing = !!budget;
  const [category, setCategory] = React.useState<SpendingCategoryId | undefined>();
  const [amount, setAmount] = React.useState<number | null>(null);
  const [errors, setErrors] = React.useState<{ category?: string; amount?: string }>({});

  React.useEffect(() => {
    if (!open) return;
    setCategory(budget?.category ?? initialCategory);
    setAmount(budget?.amount ?? null);
    setErrors({});
  }, [open, budget, initialCategory]);

  const taken = new Set(data.budgets.filter((b) => b.id !== budget?.id).map((b) => b.category));
  const options = SPENDING_CATEGORIES.filter((c) => c !== "unknown").map((c) => ({
    value: c,
    label: taken.has(c) ? `${categoryLabel(c)} (already budgeted)` : categoryLabel(c),
    disabled: taken.has(c),
  }));

  function validate() {
    const e: typeof errors = {};
    if (!category) e.category = "Choose a category.";
    else if (taken.has(category)) e.category = "This category already has a budget. Edit that one instead.";
    if (amount === null) e.amount = "Enter a monthly amount.";
    else if (amount <= 0) e.amount = "The budget must be more than ₹0.";
    return e;
  }

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0 || !category || amount === null) {
      document.getElementById(e.category ? "budget-category" : "budget-amount")?.focus();
      return;
    }
    dispatch({ type: "budget/upsert", budget: { id: budget?.id ?? createId("bud"), category, amount } });
    toast({
      tone: "success",
      title: editing ? "Budget updated" : "Budget created",
      description: `${categoryLabel(category)}: ${formatCurrency(amount)} a month`,
    });
    onOpenChange(false);
  }

  const spent = category && actualFor ? actualFor(category) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit budget" : "New budget"}</DialogTitle>
            <DialogDescription>A monthly limit for one spending category.</DialogDescription>
          </DialogHeader>
          <Field id="budget-category" label="Category" error={errors.category}>
            {(aria) => (
              <SimpleSelect
                {...aria}
                value={category}
                onValueChange={(v) => {
                  setCategory(v);
                  if (errors.category) setErrors((p) => ({ ...p, category: undefined }));
                }}
                options={options}
                placeholder="Choose a category"
              />
            )}
          </Field>
          <Field
            id="budget-amount"
            label="Monthly budget"
            error={errors.amount}
            hint={spent !== null ? `Spent in this category this month: ${formatCurrency(spent)}` : undefined}
          >
            {(aria) => (
              <AmountInput
                {...aria}
                value={amount}
                decimals={0}
                onValueChange={(v) => {
                  setAmount(v);
                  if (errors.amount) setErrors((p) => ({ ...p, amount: undefined }));
                }}
                placeholder="0"
              />
            )}
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{editing ? "Save changes" : "Create budget"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
