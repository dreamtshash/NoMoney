"use client";

import * as React from "react";
import { Repeat, Users } from "lucide-react";

import { CategoryBadge, ImportanceBadge, ReviewBadge, TypeBadge } from "@/components/finance/badges";
import { Money } from "@/components/finance/money";
import { EmptyState } from "@/components/finance/states";
import { typeUsesSpendingClassification } from "@/lib/domain/categories";
import type { SplitIndex } from "@/lib/domain/ledger";
import { useStore } from "@/lib/state/store";
import type { Transaction } from "@/lib/types/finance";
import { cn } from "@/lib/utils/cn";
import { formatShortDate } from "@/lib/utils/format";

interface TransactionListProps {
  transactions: readonly Transaction[];
  splitIndex?: SplitIndex;
  onOpen: (transaction: Transaction) => void;
  /** Hide the account column (e.g. compact dashboard view). */
  compact?: boolean;
  empty?: React.ReactNode;
}

/**
 * Responsive transaction list.
 *  - ≥ md: a real <table> with column headers.
 *  - < md: stacked rows.
 * Each row's description is a real <button>, so the list is keyboard-operable;
 * clicking anywhere on the row does the same thing.
 */
export function TransactionList({ transactions, splitIndex, onOpen, compact = false, empty }: TransactionListProps) {
  const { data } = useStore();
  const accountName = React.useMemo(() => new Map(data.accounts.map((a) => [a.id, a.name])), [data.accounts]);

  if (transactions.length === 0) {
    return <>{empty ?? <EmptyState title="No transactions" description="Nothing matches this view." compact />}</>;
  }

  return (
    <>
      {/* Desktop / tablet table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th scope="col" className="w-20 py-2 pl-4 pr-2 font-medium sm:pl-5">Date</th>
              <th scope="col" className="py-2 pr-3 font-medium">Description</th>
              {!compact && <th scope="col" className="py-2 pr-3 font-medium">Account</th>}
              <th scope="col" className="py-2 pr-3 font-medium">Classification</th>
              <th scope="col" className="py-2 pl-2 pr-4 text-right font-medium sm:pr-5">Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr
                key={t.id}
                onClick={() => onOpen(t)}
                className={cn(
                  "cursor-pointer border-b border-border/70 last:border-0 hover:bg-secondary/60",
                  t.needsReview && "bg-warning/[0.04]"
                )}
              >
                <td className="whitespace-nowrap py-2.5 pl-4 pr-2 align-top text-muted-foreground sm:pl-5">
                  {formatShortDate(t.date)}
                </td>
                <td className="max-w-[18rem] py-2.5 pr-3 align-top">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(t);
                    }}
                    className="block max-w-full truncate rounded-sm text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t.description}
                  </button>
                  <RowMeta t={t} splitIndex={splitIndex} />
                </td>
                {!compact && (
                  <td className="whitespace-nowrap py-2.5 pr-3 align-top text-muted-foreground">
                    {accountName.get(t.accountId) ?? "Unknown account"}
                  </td>
                )}
                <td className="py-2.5 pr-3 align-top">
                  <Classification t={t} />
                </td>
                <td className="whitespace-nowrap py-2.5 pl-2 pr-4 text-right align-top sm:pr-5">
                  <Money amount={t.amount} signed tone={t.amount > 0 ? "auto" : "none"} className="font-medium" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile list */}
      <ul className="divide-y divide-border/70 md:hidden">
        {transactions.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onOpen(t)}
              className={cn(
                "flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                t.needsReview && "bg-warning/[0.04]"
              )}
            >
              <span className="min-w-0 space-y-1">
                <span className="block truncate text-sm font-medium">{t.description}</span>
                <span className="block text-xs text-muted-foreground">
                  {formatShortDate(t.date)}
                  {!compact && `, ${accountName.get(t.accountId) ?? "Unknown account"}`}
                </span>
                <span className="flex flex-wrap gap-1 pt-0.5">
                  <Classification t={t} />
                </span>
              </span>
              <Money amount={t.amount} signed tone={t.amount > 0 ? "auto" : "none"} className="shrink-0 text-sm font-medium" />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function RowMeta({ t, splitIndex }: { t: Transaction; splitIndex?: SplitIndex }) {
  const split = splitIndex?.get(t.id);
  if (!t.isRecurring && !split && t.merchant === t.description) return null;
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {t.merchant && t.merchant !== t.description && <span className="truncate">{t.merchant}</span>}
      {t.isRecurring && (
        <span className="inline-flex items-center gap-1">
          <Repeat className="h-3 w-3" aria-hidden="true" />
          Recurring
        </span>
      )}
      {split && (
        <span className="inline-flex items-center gap-1">
          <Users className="h-3 w-3" aria-hidden="true" />
          Split with {split.participants.length}
        </span>
      )}
    </span>
  );
}

function Classification({ t }: { t: Transaction }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {t.needsReview && <ReviewBadge />}
      {typeUsesSpendingClassification(t.type) ? (
        <>
          {t.type === "refund" && <TypeBadge type="refund" />}
          <CategoryBadge category={t.category} />
          <ImportanceBadge importance={t.importance} />
        </>
      ) : (
        <TypeBadge type={t.type} />
      )}
    </span>
  );
}
