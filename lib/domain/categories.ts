import type {
  CategoryId,
  Importance,
  SpendingCategoryId,
  TransactionType,
} from "@/lib/types/finance";

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  /** Only a hint shown in forms — never applied silently. */
  suggestedImportance: Importance;
  kind: "spending" | "system";
}

export const CATEGORY_META: Record<CategoryId, CategoryMeta> = {
  housing: { id: "housing", label: "Housing", suggestedImportance: "essential", kind: "spending" },
  food: { id: "food", label: "Food", suggestedImportance: "essential", kind: "spending" },
  transport: { id: "transport", label: "Transport", suggestedImportance: "flexible", kind: "spending" },
  shopping: { id: "shopping", label: "Shopping", suggestedImportance: "discretionary", kind: "spending" },
  entertainment: { id: "entertainment", label: "Entertainment", suggestedImportance: "discretionary", kind: "spending" },
  education: { id: "education", label: "Education", suggestedImportance: "flexible", kind: "spending" },
  healthcare: { id: "healthcare", label: "Healthcare", suggestedImportance: "essential", kind: "spending" },
  bills: { id: "bills", label: "Bills", suggestedImportance: "essential", kind: "spending" },
  travel: { id: "travel", label: "Travel", suggestedImportance: "discretionary", kind: "spending" },
  subscriptions: { id: "subscriptions", label: "Subscriptions", suggestedImportance: "discretionary", kind: "spending" },
  other: { id: "other", label: "Other", suggestedImportance: "unknown", kind: "spending" },
  unknown: { id: "unknown", label: "Unknown", suggestedImportance: "unknown", kind: "spending" },
  income: { id: "income", label: "Income", suggestedImportance: "unknown", kind: "system" },
  transfer: { id: "transfer", label: "Own-account transfer", suggestedImportance: "unknown", kind: "system" },
  reimbursement: { id: "reimbursement", label: "Paid back", suggestedImportance: "unknown", kind: "system" },
};

/** Categories a user can pick for spending, in display order. */
export const SPENDING_CATEGORIES: SpendingCategoryId[] = [
  "housing",
  "food",
  "transport",
  "shopping",
  "entertainment",
  "education",
  "healthcare",
  "bills",
  "travel",
  "subscriptions",
  "other",
  "unknown",
];

export function categoryLabel(id: CategoryId): string {
  return CATEGORY_META[id]?.label ?? "Unknown";
}

export function isSpendingCategory(id: string): id is SpendingCategoryId {
  return (SPENDING_CATEGORIES as string[]).includes(id);
}

export const IMPORTANCE_ORDER: Importance[] = ["essential", "flexible", "discretionary", "unknown"];

export const IMPORTANCE_META: Record<Importance, { label: string; description: string }> = {
  essential: { label: "Essential", description: "Needed to live and work — rent, groceries, bills, medicine." },
  flexible: { label: "Flexible", description: "Useful, but the amount can be adjusted." },
  discretionary: { label: "Discretionary", description: "Wants — easy to cut back on when needed." },
  unknown: { label: "Unknown", description: "Not decided yet. Needs your review." },
};

export const TRANSACTION_TYPE_META: Record<
  TransactionType,
  { label: string; direction: "in" | "out" | "either"; hint: string }
> = {
  expense: { label: "Expense", direction: "out", hint: "Money you spent. Counts toward spending." },
  income: { label: "Income", direction: "in", hint: "Salary, freelance or interest. Counts toward income." },
  transfer: {
    label: "Own-account transfer",
    direction: "either",
    hint: "Between your own accounts. Never counted as income or spending.",
  },
  refund: { label: "Refund", direction: "in", hint: "Money back for a purchase. Reduces that category's spending." },
  reimbursement: {
    label: "Paid back by someone",
    direction: "in",
    hint: "A friend settling their share. Not income.",
  },
  unknown: { label: "Unknown", direction: "either", hint: "Not sure yet. Excluded from totals until reviewed." },
};

export const TRANSACTION_TYPES: TransactionType[] = [
  "expense",
  "income",
  "transfer",
  "refund",
  "reimbursement",
  "unknown",
];

/** The system category a non-spending type is filed under. */
export function systemCategoryFor(type: TransactionType): CategoryId | null {
  if (type === "income") return "income";
  if (type === "transfer") return "transfer";
  if (type === "reimbursement") return "reimbursement";
  return null;
}

/** Whether a type carries a spending category + importance the user must decide. */
export function typeUsesSpendingClassification(type: TransactionType): boolean {
  return type === "expense" || type === "refund";
}
