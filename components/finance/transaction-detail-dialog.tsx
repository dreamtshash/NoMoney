"use client";

import * as React from "react";
import { Pencil, Split as SplitIcon, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { SimpleSelect } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { CategoryBadge, ImportanceBadge, ReviewBadge, SettlementBadge, TypeBadge } from "@/components/finance/badges";
import { Money } from "@/components/finance/money";
import { RecordPaymentDialog } from "@/components/finance/record-payment-dialog";
import { SplitEditorDialog } from "@/components/finance/split-editor-dialog";
import { TypePicker } from "@/components/finance/type-picker";
import { TransactionFormDialog } from "@/components/finance/transaction-form-dialog";
import { useDeleteTransaction } from "@/components/finance/use-delete-transaction";
import {
  CATEGORY_META,
  IMPORTANCE_META,
  IMPORTANCE_ORDER,
  SPENDING_CATEGORIES,
  TRANSACTION_TYPE_META,
  systemCategoryFor,
  typeUsesSpendingClassification,
} from "@/lib/domain/categories";
import { isClassificationComplete, reviewReasons } from "@/lib/domain/classification";
import { calculateReceivables, participantStatus, splitReceivable, type ReceivableLine } from "@/lib/domain/splits";
import { useStore } from "@/lib/state/store";
import type { CategoryId, Importance, Transaction, TransactionType } from "@/lib/types/finance";
import { formatDate } from "@/lib/utils/format";
import { createId, nowIso } from "@/lib/utils/id";
import { roundMoney } from "@/lib/utils/money";

interface Props {
  transactionId: string | null;
  onClose: () => void;
}

export function TransactionDetailDialog({ transactionId, onClose }: Props) {
  const { data } = useStore();
  const transaction = data.transactions.find((t) => t.id === transactionId) ?? null;
  // Keep the last transaction around while the close animation runs / after delete.
  const open = !!transaction;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">{transaction && <Details transaction={transaction} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function Details({ transaction: t, onClose }: { transaction: Transaction; onClose: () => void }) {
  const { data, dispatch, today } = useStore();
  const toast = useToast();
  const deleteTransaction = useDeleteTransaction();

  const [type, setType] = React.useState<TransactionType>(t.type);
  const [category, setCategory] = React.useState<CategoryId>(t.category);
  const [importance, setImportance] = React.useState<Importance>(t.importance);
  const [saveRule, setSaveRule] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [splitOpen, setSplitOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [confirmRemoveSplit, setConfirmRemoveSplit] = React.useState(false);
  const [payLine, setPayLine] = React.useState<ReceivableLine | null>(null);
  const [linkTarget, setLinkTarget] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    setType(t.type);
    setCategory(t.category);
    setImportance(t.importance);
    setSaveRule(false);
  }, [t.id, t.type, t.category, t.importance]);

  const account = data.accounts.find((a) => a.id === t.accountId);
  const split = data.splits.find((s) => s.transactionId === t.id);
  const usesClassification = typeUsesSpendingClassification(type);
  const effectiveCategory: CategoryId = systemCategoryFor(type) ?? (usesClassification ? category : "unknown");
  const effectiveImportance: Importance = usesClassification ? importance : "unknown";
  const complete = isClassificationComplete({ type, category: effectiveCategory, importance: effectiveImportance });
  const changed = type !== t.type || effectiveCategory !== t.category || effectiveImportance !== t.importance;
  const fixedDirection = TRANSACTION_TYPE_META[type].direction;
  const directionConflict =
    (fixedDirection === "in" && t.amount < 0) || (fixedDirection === "out" && t.amount > 0);

  const linkedPayment = data.splits
    .flatMap((s) => s.participants.flatMap((p) => p.payments.map((pay) => ({ s, p, pay }))))
    .find((x) => x.pay.transactionId === t.id);
  const openReceivables = calculateReceivables(data.splits, data.transactions).lines.filter((l) => l.remaining > 0);

  function saveClassification(markReviewed: boolean) {
    if (directionConflict) return;
    const next: Transaction = {
      ...t,
      type,
      category: effectiveCategory,
      importance: effectiveImportance,
      classificationSource: complete ? "user" : "unclassified",
      confidence: complete ? 1 : 0,
      needsReview: markReviewed ? !complete : complete ? t.needsReview && !changed ? t.needsReview : false : true,
      updatedAt: nowIso(),
    };
    if (markReviewed) next.needsReview = false;
    dispatch({ type: "transaction/upsert", transaction: next });

    if (saveRule && complete && t.merchant.trim()) {
      dispatch({
        type: "rule/upsert",
        rule: {
          id: createId("rule"),
          match: t.merchant.trim().toLowerCase(),
          type,
          category: effectiveCategory,
          importance: effectiveImportance,
          confidence: 0.9,
        },
      });
    }
    toast({
      tone: "success",
      title: markReviewed ? "Marked as reviewed" : "Classification saved",
      description: saveRule && complete ? `Future imports from ${t.merchant} will be classified the same way.` : undefined,
    });
  }

  function linkReimbursement() {
    const line = openReceivables.find((l) => `${l.splitId}:${l.participantId}` === linkTarget);
    if (!line) return;
    const amount = roundMoney(Math.min(Math.abs(t.amount), line.remaining));
    dispatch({
      type: "split/payment",
      splitId: line.splitId,
      participantId: line.participantId,
      payment: { id: createId("pay"), date: t.date, amount, transactionId: t.id },
    });
    toast({ tone: "success", title: `Linked to ${line.name}'s share of ${line.description}` });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t.description}</DialogTitle>
        <DialogDescription>
          {t.merchant !== t.description ? `${t.merchant}, ` : ""}
          {formatDate(t.date)} · {account?.name ?? "Unknown account"}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-secondary/60 px-4 py-3">
        <Money amount={t.amount} signed tone="auto" className="text-2xl font-semibold tracking-tight" />
        <div className="flex flex-wrap gap-1.5">
          {split ? <Badge variant="outline">Shared expense</Badge> : <TypeBadge type={t.type} />}
          {typeUsesSpendingClassification(t.type) && <CategoryBadge category={t.category} />}
          {typeUsesSpendingClassification(t.type) && <ImportanceBadge importance={t.importance} />}
          {t.needsReview && <ReviewBadge />}
        </div>
      </div>

      {t.needsReview && (
        <ul className="list-disc space-y-0.5 rounded-md border border-warning/30 bg-warning/5 py-2 pl-8 pr-3 text-sm text-warning">
          {reviewReasons(t).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      <section aria-labelledby="classify-heading" className="space-y-3">
        <h3 id="classify-heading" className="text-sm font-semibold">
          Classification
        </h3>
        <TypePicker id="d-type" value={type} onChange={setType} direction={t.amount < 0 ? "out" : "in"} />
        {directionConflict && (
          <p className="text-xs text-destructive">
            This is money {t.amount < 0 ? "out" : "in"}; that type is money {fixedDirection}.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {usesClassification && (
            <>
              <Field id="d-category" label="Category">
                {(aria) => (
                  <SimpleSelect
                    {...aria}
                    value={CATEGORY_META[category]?.kind === "spending" ? category : "unknown"}
                    onValueChange={(v) => setCategory(v)}
                    options={SPENDING_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_META[c].label }))}
                  />
                )}
              </Field>
              <Field id="d-importance" label="Importance">
                {(aria) => (
                  <SimpleSelect
                    {...aria}
                    value={importance}
                    onValueChange={setImportance}
                    options={IMPORTANCE_ORDER.map((i) => ({ value: i, label: IMPORTANCE_META[i].label }))}
                  />
                )}
              </Field>
            </>
          )}
        </div>
        {complete && t.merchant.trim() && changed && (
          <Checkbox
            checked={saveRule}
            onCheckedChange={setSaveRule}
            label={`Always classify “${t.merchant}” like this when importing`}
            description="Only for merchants that always mean the same thing. Amazon or UPI payments can be anything."
          />
        )}
        <div className="flex flex-wrap gap-2">
          {t.needsReview ? (
            <Button size="sm" onClick={() => saveClassification(true)} disabled={!complete || directionConflict}>
              Save and mark reviewed
            </Button>
          ) : (
            <Button size="sm" onClick={() => saveClassification(false)} disabled={!changed || directionConflict}>
              Save classification
            </Button>
          )}
          {!complete && t.needsReview && (
            <p className="self-center text-xs text-muted-foreground">Choose a type{usesClassification ? ", category and importance" : ""} first.</p>
          )}
          {!t.needsReview && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                dispatch({ type: "transaction/upsert", transaction: { ...t, needsReview: true, updatedAt: nowIso() } });
                toast({ title: "Sent back to review" });
              }}
            >
              Send back to review
            </Button>
          )}
        </div>
      </section>

      {t.type === "expense" && (
        <section aria-labelledby="split-heading" className="space-y-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="split-heading" className="text-sm font-semibold">
              Split &amp; settle
            </h3>
            {split ? (
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setSplitOpen(true)}>
                  Edit split
                </Button>
                <Button size="sm" variant="destructive-ghost" onClick={() => setConfirmRemoveSplit(true)}>
                  Remove split
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setSplitOpen(true)}>
                <SplitIcon className="h-3.5 w-3.5" /> Split this bill
              </Button>
            )}
          </div>
          {split ? (
            <>
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Cash paid</dt>
                  <dd className="font-medium">
                    <Money amount={Math.abs(t.amount)} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Your spending</dt>
                  <dd className="font-medium">
                    <Money amount={roundMoney(Math.abs(t.amount) - splitReceivable(split))} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Owed to you</dt>
                  <dd className="font-medium">
                    <Money amount={splitReceivable(split)} />
                  </dd>
                </div>
              </dl>
              <ul className="divide-y divide-border rounded-md border border-border">
                {split.participants.map((p) => {
                  const line = calculateReceivables([split], data.transactions).lines.find((l) => l.participantId === p.id);
                  return (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="font-medium">{p.name}</span>
                      <span className="flex items-center gap-2">
                        <Money amount={p.share} />
                        <SettlementBadge status={participantStatus(p)} />
                        {line && line.remaining > 0 && (
                          <Button size="sm" variant="ghost" onClick={() => setPayLine(line)}>
                            Record payment
                          </Button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Paid for others too? Split it so only your share counts as spending and the rest is tracked as money owed.
            </p>
          )}
        </section>
      )}

      {t.type === "reimbursement" && (
        <section aria-labelledby="reimb-heading" className="space-y-2 border-t border-border pt-4">
          <h3 id="reimb-heading" className="text-sm font-semibold">
            Money owed
          </h3>
          {linkedPayment ? (
            <p className="text-sm text-muted-foreground">
              Settles {linkedPayment.p.name}&apos;s share of{" "}
              {data.transactions.find((x) => x.id === linkedPayment.s.transactionId)?.description ?? "a split bill"}.
            </p>
          ) : openReceivables.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody owes you anything right now, so there&apos;s nothing to link.</p>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Field id="d-link" label="Who paid you back?" className="flex-1">
                {(aria) => (
                  <SimpleSelect
                    {...aria}
                    value={linkTarget}
                    placeholder="Choose a person and bill"
                    onValueChange={setLinkTarget}
                    options={openReceivables.map((l) => ({
                      value: `${l.splitId}:${l.participantId}`,
                      label: `${l.name} — ${l.description} (owes ${l.remaining.toLocaleString("en-IN")})`,
                    }))}
                  />
                )}
              </Field>
              <Button variant="outline" onClick={linkReimbursement} disabled={!linkTarget}>
                Link payment
              </Button>
            </div>
          )}
        </section>
      )}

      {t.notes && (
        <p className="border-t border-border pt-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Notes: </span>
          {t.notes}
        </p>
      )}

      <DialogFooter className="border-t border-border pt-4 sm:justify-between">
        <Button variant="destructive-ghost" onClick={() => setConfirmDelete(true)}>
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Edit details
          </Button>
        </div>
      </DialogFooter>

      <TransactionFormDialog open={editOpen} onOpenChange={setEditOpen} transaction={t} />
      <SplitEditorDialog open={splitOpen} onOpenChange={setSplitOpen} transaction={t} split={split} />
      <RecordPaymentDialog line={payLine} onOpenChange={(o) => !o && setPayLine(null)} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this transaction?"
        description={
          <>
            <p>
              {t.description} (<Money amount={t.amount} signed />) will be removed from every total, budget and chart.
            </p>
            {split && <p className="mt-2">Its split and the money owed on it will be removed too.</p>}
          </>
        }
        confirmLabel="Delete transaction"
        onConfirm={() => {
          onClose();
          deleteTransaction(t);
        }}
      />
      <ConfirmDialog
        open={confirmRemoveSplit}
        onOpenChange={setConfirmRemoveSplit}
        title="Remove this split?"
        description="The full amount will count as your spending again, and any payments recorded against it will be removed."
        confirmLabel="Remove split"
        onConfirm={() => {
          if (split) dispatch({ type: "split/delete", id: split.id });
          toast({ title: "Split removed" });
        }}
      />
    </>
  );
  // `today` kept for future date-sensitive actions.
  void today;
}
