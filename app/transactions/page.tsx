"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, X } from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import { EmptyState } from "@/components/finance/states";
import { TransactionDetailDialog } from "@/components/finance/transaction-detail-dialog";
import { TransactionFormDialog } from "@/components/finance/transaction-form-dialog";
import { TransactionList } from "@/components/finance/transaction-list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import {
  CATEGORY_META,
  IMPORTANCE_META,
  IMPORTANCE_ORDER,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_META,
} from "@/lib/domain/categories";
import { indexSplits } from "@/lib/domain/ledger";
import { availableMonths, resolveActiveMonth } from "@/lib/domain/snapshot";
import {
  EMPTY_FILTERS,
  filterTransactions,
  sortTransactions,
  type TransactionFilters,
} from "@/lib/domain/transactions";
import { useStore } from "@/lib/state/store";
import type { CategoryId } from "@/lib/types/finance";
import { formatMonth } from "@/lib/utils/format";

export default function TransactionsPage() {
  const [adding, setAdding] = React.useState(false);
  return (
    <AppShell
      title="Transactions"
      description="Every transaction, with its type, category and importance. Select one to review, edit, split or delete it."
      actions={
        <Button onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add transaction
        </Button>
      }
    >
      <React.Suspense fallback={null}>
        <TransactionsBody />
      </React.Suspense>
      <TransactionFormDialog open={adding} onOpenChange={setAdding} />
    </AppShell>
  );
}

function TransactionsBody() {
  const { data, today } = useStore();
  const params = useSearchParams();
  const router = useRouter();
  const reviewParam = params.get("review") === "1";

  const [filters, setFilters] = React.useState<TransactionFilters>(() => {
    const cat = params.get("category");
    const m = params.get("month");
    return {
      ...EMPTY_FILTERS,
      category: cat && cat in CATEGORY_META ? (cat as CategoryId) : "all",
      month: reviewParam ? "all" : m && /^\d{4}-\d{2}$/.test(m) ? m : resolveActiveMonth(data, today),
      needsReviewOnly: reviewParam,
    };
  });
  const [openId, setOpenId] = React.useState<string | null>(null);

  // Arriving via "Review now" (even while already on this page) switches to the review queue.
  React.useEffect(() => {
    if (reviewParam) setFilters((f) => ({ ...f, needsReviewOnly: true, month: "all" }));
  }, [reviewParam]);

  function set<K extends keyof TransactionFilters>(key: K, value: TransactionFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
    if (key === "needsReviewOnly" && !value && reviewParam) router.replace("/transactions");
  }

  const splitIndex = React.useMemo(() => indexSplits(data.splits), [data.splits]);
  const months = React.useMemo(() => availableMonths(data, today), [data, today]);
  const results = React.useMemo(
    () => sortTransactions(filterTransactions(data.transactions, filters)),
    [data.transactions, filters]
  );
  const reviewTotal = data.transactions.filter((t) => t.needsReview).length;

  const categoryOptions = (Object.keys(CATEGORY_META) as CategoryId[]).map((c) => ({
    value: c as CategoryId | "all",
    label: CATEGORY_META[c].label,
  }));

  const activeFilterCount =
    Number(filters.search.trim() !== "") +
    Number(filters.accountId !== "all") +
    Number(filters.category !== "all") +
    Number(filters.type !== "all") +
    Number(filters.importance !== "all") +
    Number(filters.needsReviewOnly);

  function clearFilters() {
    setFilters((f) => ({ ...EMPTY_FILTERS, month: f.month }));
    if (reviewParam) router.replace("/transactions");
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label="Search transactions"
              placeholder="Search description, merchant or notes"
              value={filters.search}
              onChange={(e) => set("search", e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="w-full lg:w-48">
            <SimpleSelect
              aria-label="Month"
              value={filters.month}
              onValueChange={(v) => set("month", v)}
              options={[{ value: "all", label: "All months" }, ...months.map((m) => ({ value: m, label: formatMonth(m) }))]}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SimpleSelect
            aria-label="Account"
            value={filters.accountId}
            onValueChange={(v) => set("accountId", v)}
            options={[{ value: "all", label: "All accounts" }, ...data.accounts.map((a) => ({ value: a.id, label: a.name }))]}
          />
          <SimpleSelect
            aria-label="Type"
            value={filters.type}
            onValueChange={(v) => set("type", v)}
            options={[
              { value: "all" as const, label: "All types" },
              ...TRANSACTION_TYPES.map((t) => ({ value: t, label: TRANSACTION_TYPE_META[t].label })),
            ]}
          />
          <SimpleSelect
            aria-label="Category"
            value={filters.category}
            onValueChange={(v) => set("category", v)}
            options={[{ value: "all", label: "All categories" }, ...categoryOptions]}
          />
          <SimpleSelect
            aria-label="Importance"
            value={filters.importance}
            onValueChange={(v) => set("importance", v)}
            options={[
              { value: "all" as const, label: "Any importance" },
              ...IMPORTANCE_ORDER.map((i) => ({ value: i, label: IMPORTANCE_META[i].label })),
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Checkbox
            checked={filters.needsReviewOnly}
            onCheckedChange={(v) => set("needsReviewOnly", v)}
            label={`Only transactions that need review (${reviewTotal})`}
          />
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear filters
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {results.length} {results.length === 1 ? "transaction" : "transactions"}
            {filters.month !== "all" && ` in ${formatMonth(filters.month)}`}
          </p>
        </div>
        <TransactionList
          transactions={results}
          splitIndex={splitIndex}
          onOpen={(t) => setOpenId(t.id)}
          empty={
            <div className="p-4 sm:p-5">
              {data.transactions.length === 0 ? (
                <EmptyState
                  title="No transactions yet"
                  description="Import a CSV statement or add a transaction by hand."
                  action={{ label: "Import a statement", href: "/data" }}
                />
              ) : filters.needsReviewOnly && reviewTotal === 0 ? (
                <EmptyState title="Review queue is empty" description="Every transaction has a type, category and importance." />
              ) : (
                <EmptyState
                  title="No matching transactions"
                  description="Try a different search, month or filter."
                  action={{ label: "Clear filters", onClick: clearFilters }}
                />
              )}
            </div>
          }
        />
      </Card>

      <TransactionDetailDialog transactionId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
