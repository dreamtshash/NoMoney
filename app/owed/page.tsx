"use client";

import * as React from "react";
import { HandCoins, Trash2 } from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import { SettlementBadge } from "@/components/finance/badges";
import { RecordPaymentDialog } from "@/components/finance/record-payment-dialog";
import { Stat } from "@/components/finance/stat";
import { EmptyState } from "@/components/finance/states";
import { TransactionDetailDialog } from "@/components/finance/transaction-detail-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { calculateReceivables, type ReceivableLine } from "@/lib/domain/splits";
import { useStore } from "@/lib/state/store";
import type { SplitPayment } from "@/lib/types/finance";
import { formatCurrency, formatDate } from "@/lib/utils/format";

export default function OwedPage() {
  return (
    <AppShell
      title="Money owed"
      description="Shared bills you paid in full. Only your share counts as spending; the rest is owed to you until it's paid back."
    >
      <OwedBody />
    </AppShell>
  );
}

function OwedBody() {
  const { data, dispatch } = useStore();
  const toast = useToast();
  const summary = React.useMemo(() => calculateReceivables(data.splits, data.transactions), [data.splits, data.transactions]);
  const [view, setView] = React.useState<"open" | "all">("open");
  const [paying, setPaying] = React.useState<ReceivableLine | null>(null);
  const [openTx, setOpenTx] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState<{ line: ReceivableLine; payment: SplitPayment } | null>(null);

  const lines = view === "open" ? summary.lines.filter((l) => l.status !== "settled") : summary.lines;

  if (summary.lines.length === 0) {
    return (
      <EmptyState
        icon={HandCoins}
        title="No shared bills yet"
        description="When you pay for a group, open that expense in Transactions and choose “Split this bill” to record who owes what."
        action={{ label: "Go to transactions", href: "/transactions" }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Outstanding" amount={summary.totalRemaining} detail={`${summary.byPerson.length} ${summary.byPerson.length === 1 ? "person" : "people"} owe you`} />
        <Stat label="Paid back so far" amount={summary.totalPaid} />
        <Stat label="Total shared" amount={summary.totalOwed} detail="Friends' shares of bills you paid" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit">
          <CardHeaderRow title="By person" />
          <CardContent>
            {summary.byPerson.length === 0 ? (
              <p className="text-sm text-muted-foreground">Everyone has settled up.</p>
            ) : (
              <ul className="divide-y divide-border/70">
                {summary.byPerson.map((p) => (
                  <li key={p.name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span>
                      <span className="font-medium">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {p.count} {p.count === 1 ? "bill" : "bills"}
                      </span>
                    </span>
                    <span className="money font-semibold">{formatCurrency(p.remaining)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeaderRow
            title="Shares"
            actions={
              <Segmented
                label="Show"
                value={view}
                onChange={setView}
                options={[
                  { value: "open", label: "Not settled" },
                  { value: "all", label: "All" },
                ]}
              />
            }
          />
          <CardContent>
            {lines.length === 0 ? (
              <EmptyState compact title="Everything is settled" />
            ) : (
              <ul className="space-y-3">
                {lines.map((l) => {
                  const payments =
                    data.splits.find((s) => s.id === l.splitId)?.participants.find((p) => p.id === l.participantId)?.payments ?? [];
                  return (
                    <li key={`${l.splitId}-${l.participantId}`} className="rounded-md border border-border p-3 sm:p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 font-medium">
                            {l.name} <SettlementBadge status={l.status} />
                          </p>
                          <button
                            type="button"
                            onClick={() => setOpenTx(l.transactionId)}
                            className="mt-0.5 text-left text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {l.description}, {formatDate(l.date)}
                          </button>
                        </div>
                        <div className="text-right">
                          <p className="money font-semibold">{formatCurrency(l.remaining)} left</p>
                          <p className="money text-xs text-muted-foreground">
                            {formatCurrency(l.paid)} paid of {formatCurrency(l.share)}
                          </p>
                        </div>
                      </div>
                      {payments.length > 0 && (
                        <ul className="mt-3 space-y-1 border-t border-border pt-2">
                          {payments.map((p) => (
                            <li key={p.id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span>
                                Paid {formatCurrency(p.amount)} on {formatDate(p.date)}
                                {p.transactionId && " (linked to a transaction)"}
                              </span>
                              <Button
                                variant="destructive-ghost"
                                size="icon-sm"
                                aria-label={`Remove payment of ${formatCurrency(p.amount)} from ${l.name}`}
                                onClick={() => setRemoving({ line: l, payment: p })}
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {l.remaining > 0 && (
                        <div className="mt-3 flex justify-end">
                          <Button size="sm" variant="outline" onClick={() => setPaying(l)}>
                            Record payment
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <RecordPaymentDialog line={paying} onOpenChange={(o) => !o && setPaying(null)} />
      <TransactionDetailDialog transactionId={openTx} onClose={() => setOpenTx(null)} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this payment?"
        description={
          removing
            ? `${removing.line.name}'s payment of ${formatCurrency(removing.payment.amount)} will be removed, so they'll owe it again. Any linked transaction stays.`
            : ""
        }
        confirmLabel="Remove payment"
        onConfirm={() => {
          if (!removing) return;
          const { line, payment } = removing;
          dispatch({ type: "split/payment-delete", splitId: line.splitId, participantId: line.participantId, paymentId: payment.id });
          toast({
            title: "Payment removed",
            action: {
              label: "Undo",
              onClick: () => dispatch({ type: "split/payment", splitId: line.splitId, participantId: line.participantId, payment }),
            },
          });
          setRemoving(null);
        }}
      />
    </div>
  );
}
