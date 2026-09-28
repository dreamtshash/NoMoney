/**
 * NoMoney domain model.
 *
 * Conventions used everywhere:
 *  - Amounts are stored in rupees as JS numbers, rounded to 2 decimals.
 *  - Transaction.amount is SIGNED from the user's point of view:
 *      negative = money left one of the user's accounts
 *      positive = money arrived in one of the user's accounts
 *  - Dates are ISO calendar dates ("YYYY-MM-DD") with no time zone. Use
 *    lib/utils/dates.ts to work with them; never `new Date("YYYY-MM-DD")`.
 *  - Nothing is ever classified silently. Uncertain data stays "unknown" and
 *    `needsReview: true` until the user (or an explicit rule) decides.
 */

/* ------------------------------------------------------------------ */
/* Transactions                                                        */
/* ------------------------------------------------------------------ */

export type TransactionType =
  | "income" // salary, freelance, interest — counts toward income
  | "expense" // money spent — counts toward spending (net of splits)
  | "transfer" // between the user's own accounts — never income or spending
  | "refund" // money back for an earlier expense — reduces that category's spending
  | "reimbursement" // someone paying the user back — settles a receivable, never income
  | "unknown"; // not yet decided — excluded from totals, always reviewable

export type Importance = "essential" | "flexible" | "discretionary" | "unknown";

/** Where the current classification came from. */
export type ClassificationSource = "user" | "rule" | "import" | "unclassified";

/** Spending categories (WHAT the money was for). */
export type SpendingCategoryId =
  | "housing"
  | "food"
  | "transport"
  | "shopping"
  | "entertainment"
  | "education"
  | "healthcare"
  | "bills"
  | "travel"
  | "subscriptions"
  | "other"
  | "unknown";

/** System categories used for non-spending transaction types. */
export type SystemCategoryId = "income" | "transfer" | "reimbursement";

export type CategoryId = SpendingCategoryId | SystemCategoryId;

export interface Transaction {
  id: string;
  accountId: string;
  date: string; // YYYY-MM-DD
  description: string;
  merchant: string;
  amount: number; // signed, see header
  type: TransactionType;
  category: CategoryId;
  importance: Importance;
  /** 0–1. 1 for user decisions; rules/imports report their own confidence. */
  confidence: number;
  classificationSource: ClassificationSource;
  needsReview: boolean;
  isRecurring: boolean;
  /** Deterministic fingerprint used for duplicate detection on import. */
  transactionHash: string;
  /** Own-account counterpart for transfers. */
  transferAccountId?: string;
  notes?: string;
  /**
   * Statement-import provenance (PDF/CSV imports only — never set for
   * manually entered transactions). `balanceAfter` is the bank's own running
   * balance right after this transaction; NEVER used as the transaction
   * amount. `sourcePage` is the PDF page the row was read from.
   */
  balanceAfter?: number | null;
  sourcePage?: number;
  /** Per-row warnings captured at import time (e.g. a balance reconciliation mismatch). */
  importWarnings?: string[];
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

/* ------------------------------------------------------------------ */
/* Accounts (the user's own accounts — NOT live bank connections)      */
/* ------------------------------------------------------------------ */

export type AccountType = "bank" | "savings" | "credit_card" | "wallet" | "cash";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
}

/* ------------------------------------------------------------------ */
/* Budgets                                                             */
/* ------------------------------------------------------------------ */

export interface Budget {
  id: string;
  category: SpendingCategoryId;
  /** Planned monthly amount. */
  amount: number;
}

/* ------------------------------------------------------------------ */
/* Goals                                                               */
/* ------------------------------------------------------------------ */

export interface Goal {
  id: string;
  name: string;
  /** The user's actual target. Never modified by the safety multiplier. */
  targetAmount: number;
  /** Currently saved toward the goal. */
  currentAmount: number;
  deadline: string; // YYYY-MM-DD
  /** Safety target = targetAmount × safetyMultiplier. Default 1.5. */
  safetyMultiplier: number;
  /** What the user intends to put in each month (used when there is no history). */
  plannedMonthlyContribution: number;
  createdAt: string;
}

/** A recorded movement of money into (positive) or out of (negative) a goal. */
export interface GoalContribution {
  id: string;
  goalId: string;
  date: string; // YYYY-MM-DD
  amount: number;
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Split & Settle                                                      */
/* ------------------------------------------------------------------ */

export interface SplitPayment {
  id: string;
  date: string;
  amount: number;
  /** The reimbursement transaction this payment came in on, if any. */
  transactionId?: string;
}

export interface SplitParticipant {
  id: string;
  name: string;
  /** What this person owes the user for their share. */
  share: number;
  payments: SplitPayment[];
}

/**
 * Attached to an expense transaction the user paid in full on behalf of others.
 *   cash paid       = |transaction.amount|
 *   others' shares  = Σ participant.share
 *   personal cost   = cash paid − others' shares
 */
export interface Split {
  id: string;
  transactionId: string;
  participants: SplitParticipant[];
  createdAt: string;
}

export type SettlementStatus = "pending" | "partial" | "settled";

/* ------------------------------------------------------------------ */
/* Plan a Day                                                          */
/* ------------------------------------------------------------------ */

export type UnusedDailyAction = "savings" | "carry_forward" | "split";

export interface DailyPlanAllocation {
  category: SpendingCategoryId;
  amount: number;
}

export interface DailyPlan {
  /** One plan per calendar date. */
  date: string;
  /** Amount the user accepted as available for the day (after carry-over). */
  available: number;
  allocations: DailyPlanAllocation[];
  /** Set once this day's unused money has been moved into a goal, so it can't be saved twice. */
  savedContributionId?: string;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Classification rules (deterministic — no AI)                        */
/* ------------------------------------------------------------------ */

export interface ClassificationRule {
  id: string;
  /** Case-insensitive substring matched against merchant + description. */
  match: string;
  type?: TransactionType;
  category: CategoryId;
  importance: Importance;
  /** Only unambiguous merchants should get a rule. */
  confidence: number;
}

/* ------------------------------------------------------------------ */
/* Monthly history summaries (months before the detailed ledger)       */
/* ------------------------------------------------------------------ */

export interface MonthlySummary {
  month: string; // YYYY-MM
  income: number;
  spending: number;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export interface Settings {
  displayName: string;
  /** Percentage (0–100) of expected income to save each month. */
  savingsPercent: number;
  /** Monthly income the user expects. 0 = not set (savings % applies to all income). */
  expectedMonthlyIncome: number;
  /** Percentage (0–100) of income above expected that should go to savings. */
  additionalIncomeSavingsPercent: number;
  /** Multiplier applied to new goals. */
  defaultSafetyMultiplier: number;
  /** How the daily amount is suggested. */
  dailyPlanMode: "budget" | "fixed";
  /** Used when dailyPlanMode = "fixed". */
  dailyPlanFixedAmount: number;
  /** What happens to money left unspent at the end of a planned day. */
  unusedDailyAction: UnusedDailyAction;
  /** Categories that appear in the daily plan (fixed/essential ones like rent are excluded by default). */
  dailyPlanCategories: SpendingCategoryId[];
  /** What to do with unallocated surplus (surplus left after goal contributions). */
  surplusHandling: {
    mode: "suggest_goal" | "keep";
    /** Goal to suggest; null = first goal. */
    goalId: string | null;
  };
  /** Remembered Trade-offs configuration (the purchase amount itself is not stored). */
  tradeOff: TradeOffPreferences;
}

export interface TradeOffPreferences {
  /** Goal to measure against; null = first goal. */
  goalId: string | null;
  /** Where the purchase money comes from. */
  funding: "surplus" | "goal";
  /** Measure against the safety target instead of the actual target. */
  useSafetyTarget: boolean;
}

/* ------------------------------------------------------------------ */
/* Whole dataset                                                       */
/* ------------------------------------------------------------------ */

export interface NoMoneyData {
  accounts: Account[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  goalContributions: GoalContribution[];
  splits: Split[];
  dailyPlans: DailyPlan[];
  rules: ClassificationRule[];
  history: MonthlySummary[];
  settings: Settings;
  /** History of statement imports (summary only — no file contents). */
  imports: ImportRecord[];
  /** UI preference: which month (YYYY-MM) the finance views summarise. null = latest with data. */
  activeMonth: string | null;
}

export interface ImportRecord {
  id: string;
  fileName: string;
  format: "csv" | "pdf";
  accountId: string;
  importedAt: string; // ISO timestamp
  /** Rows the file appeared to contain (read + rejected). */
  detected: number;
  imported: number;
  duplicatesSkipped: number;
  excludedByUser: number;
  needsReview: number;
  rejected: number;
  /** PDF only: whether opening + rows = closing. */
  reconciliation: "match" | "mismatch" | "unavailable" | null;
  /** PDF only: the bank-specific parser that matched (e.g. "Canara Bank"), or null when the generic layout-inference parser was used. */
  bank?: string | null;
  /** Rows whose balance didn't reconcile against the previous row (still imported, flagged for review). */
  balanceWarnings?: number;
}
