import type {
  CategoryId,
  Importance,
  NoMoneyData,
  Transaction,
  TransactionType,
} from "@/lib/types/finance";
import {
  CATEGORY_META,
  TRANSACTION_TYPE_META,
  systemCategoryFor,
  typeUsesSpendingClassification,
} from "@/lib/domain/categories";
import { computeTransactionHash, isClassificationComplete } from "@/lib/domain/classification";
import { isIsoDate } from "@/lib/utils/dates";
import { MAX_AMOUNT, roundMoney } from "@/lib/utils/money";

/** What a form (or an importer) supplies. `amount` is always a positive magnitude. */
export interface TransactionDraft {
  accountId: string;
  date: string;
  description: string;
  merchant: string;
  amount: number | null;
  direction: "in" | "out";
  type: TransactionType;
  category: CategoryId;
  importance: Importance;
  isRecurring: boolean;
  notes: string;
  transferAccountId?: string;
}

export type DraftErrors = Partial<Record<keyof TransactionDraft, string>>;

export function validateTransactionDraft(draft: TransactionDraft, data: Pick<NoMoneyData, "accounts">): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.description.trim()) errors.description = "Enter a description.";
  else if (draft.description.length > 120) errors.description = "Keep the description under 120 characters.";
  if (draft.merchant.length > 80) errors.merchant = "Keep the merchant under 80 characters.";
  if (!isIsoDate(draft.date)) errors.date = "Enter a valid date.";
  if (draft.amount === null) errors.amount = "Enter an amount.";
  else if (draft.amount <= 0) errors.amount = "Enter an amount greater than ₹0.";
  else if (draft.amount > MAX_AMOUNT) errors.amount = "That amount is too large.";
  if (!data.accounts.some((a) => a.id === draft.accountId)) errors.accountId = "Choose an account.";
  if (draft.type === "transfer" && draft.transferAccountId && draft.transferAccountId === draft.accountId) {
    errors.transferAccountId = "Choose a different account from the one above.";
  }
  if (typeUsesSpendingClassification(draft.type) && CATEGORY_META[draft.category]?.kind !== "spending") {
    errors.category = "Choose a spending category.";
  }
  return errors;
}

/** Direction implied by a type, or null when the user must choose. */
export function fixedDirectionFor(type: TransactionType): "in" | "out" | null {
  const d = TRANSACTION_TYPE_META[type].direction;
  return d === "either" ? null : d;
}

/** Turn a validated draft into a stored transaction (creating or updating). */
export function buildTransaction(
  draft: TransactionDraft,
  meta: { id: string; now: string; existing?: Transaction; source?: Transaction["classificationSource"]; confidence?: number }
): Transaction {
  const direction = fixedDirectionFor(draft.type) ?? draft.direction;
  const magnitude = roundMoney(Math.abs(draft.amount ?? 0));
  const amount = direction === "in" ? magnitude : -magnitude;

  const systemCategory = systemCategoryFor(draft.type);
  const category: CategoryId =
    systemCategory ?? (typeUsesSpendingClassification(draft.type) ? draft.category : "unknown");
  const importance: Importance = typeUsesSpendingClassification(draft.type) ? draft.importance : "unknown";
  const complete = isClassificationComplete({ type: draft.type, category, importance });

  const description = draft.description.trim();
  const merchant = draft.merchant.trim() || description;

  return {
    id: meta.id,
    accountId: draft.accountId,
    date: draft.date,
    description,
    merchant,
    amount,
    type: draft.type,
    category,
    importance,
    confidence: complete ? meta.confidence ?? 1 : 0,
    classificationSource: complete ? meta.source ?? "user" : "unclassified",
    needsReview: !complete,
    isRecurring: draft.isRecurring,
    transactionHash: computeTransactionHash({ accountId: draft.accountId, date: draft.date, amount, description }),
    transferAccountId: draft.type === "transfer" ? draft.transferAccountId || undefined : undefined,
    notes: draft.notes.trim() || undefined,
    createdAt: meta.existing?.createdAt ?? meta.now,
    updatedAt: meta.now,
  };
}

export function draftFromTransaction(t: Transaction): TransactionDraft {
  return {
    accountId: t.accountId,
    date: t.date,
    description: t.description,
    merchant: t.merchant === t.description ? "" : t.merchant,
    amount: Math.abs(t.amount),
    direction: t.amount >= 0 ? "in" : "out",
    type: t.type,
    category: t.category,
    importance: t.importance,
    isRecurring: t.isRecurring,
    notes: t.notes ?? "",
    transferAccountId: t.transferAccountId,
  };
}

/* ------------------------------------------------------------------ */
/* Filtering                                                           */
/* ------------------------------------------------------------------ */

export interface TransactionFilters {
  search: string;
  month: string | "all";
  accountId: string | "all";
  category: CategoryId | "all";
  type: TransactionType | "all";
  importance: Importance | "all";
  needsReviewOnly: boolean;
}

export const EMPTY_FILTERS: Omit<TransactionFilters, "month"> = {
  search: "",
  accountId: "all",
  category: "all",
  type: "all",
  importance: "all",
  needsReviewOnly: false,
};

export function filterTransactions(transactions: readonly Transaction[], f: TransactionFilters): Transaction[] {
  const q = f.search.trim().toLowerCase();
  return transactions.filter((t) => {
    if (q && !`${t.description} ${t.merchant} ${t.notes ?? ""}`.toLowerCase().includes(q)) return false;
    if (f.month !== "all" && !t.date.startsWith(f.month)) return false;
    if (f.accountId !== "all" && t.accountId !== f.accountId) return false;
    if (f.category !== "all" && t.category !== f.category) return false;
    if (f.type !== "all" && t.type !== f.type) return false;
    if (f.importance !== "all" && t.importance !== f.importance) return false;
    if (f.needsReviewOnly && !t.needsReview) return false;
    return true;
  });
}

export function sortTransactions(transactions: readonly Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}
