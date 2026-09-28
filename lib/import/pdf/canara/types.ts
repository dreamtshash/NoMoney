import type { PdfCell, PdfLine } from "@/lib/import/pdf-statement";
import type { CategoryId, Importance, TransactionType } from "@/lib/types/finance";

/**
 * Shared types for the Canara Bank importer (and the pattern any future
 * bank-specific importer under lib/import/pdf/<bank>/ should follow).
 */

export type CanaraColumnRole = "date" | "particulars" | "deposit" | "withdrawal" | "balance";

/** A detected header column: its role and the x-range it occupies on the page. */
export interface CanaraColumn {
  role: CanaraColumnRole;
  header: string;
  x0: number;
  x1: number;
}

/** One physical transaction row, after multi-line Particulars have been joined. */
export interface CanaraRawRow {
  /** 1-based sequence of the row as encountered (for error messages, not the final id). */
  index: number;
  page: number;
  date: string; // parsed, normalized to YYYY-MM-DD
  dateRaw: string;
  particulars: string[]; // one entry per physical line, joined later
  deposit: number | null;
  withdrawal: number | null;
  balance: number | null;
}

export type CanaraSuggestion = {
  type: TransactionType;
  category: CategoryId;
  importance: Importance;
  /** 0–1. Never 1 — only a user or an explicit rule can be fully confident. */
  confidence: number;
  /** Why this suggestion was made, shown to the user / kept for debugging. */
  reason: string;
};

/** A fully parsed Canara transaction row, ready to be handed to the shared import pipeline. */
export interface CanaraTransaction {
  line: number;
  date: string;
  description: string;
  /** Best-effort counterparty name pulled out of a UPI/NEFT/IMPS reference, when confidently found. Never invented. */
  merchant: string;
  /** Signed: negative = withdrawal (money out), positive = deposit (money in). */
  amount: number;
  direction: "incoming" | "outgoing";
  balanceAfter: number | null;
  sourcePage: number;
  suggestion: CanaraSuggestion;
  needsReview: boolean;
  /** Balance-reconciliation or other warnings attached to this specific row. */
  warnings: string[];
}

export interface CanaraRowError {
  line: number;
  page: number;
  message: string;
}

export interface CanaraBalanceCheck {
  checked: number;
  mismatched: number;
}

export interface CanaraReconciliation {
  status: "match" | "mismatch" | "unavailable";
  opening: number | null;
  openingSource: "statement" | "derived_from_first_row" | null;
  closing: number | null;
  closingSource: "statement" | "last_row_balance" | null;
  expectedNet: number | null;
  extractedNet: number;
  difference: number | null;
}

export interface CanaraParseResult {
  bank: "Canara Bank";
  pageCount: number;
  columns: CanaraColumn[];
  /** Every line inspected, in order, whether it became a row, a header, a footer, or was skipped. */
  rowsDetected: number;
  transactions: CanaraTransaction[];
  errors: CanaraRowError[];
  rejectedRows: number;
  balanceCheck: CanaraBalanceCheck;
  reconciliation: CanaraReconciliation;
  headerFound: boolean;
}

export type { PdfCell, PdfLine };
