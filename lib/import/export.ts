import type { ImportPreview } from "@/lib/import/statement-import";
import type { Transaction } from "@/lib/types/finance";

/**
 * Export helpers for imported statements.
 *
 *  - transactionsToCsv(...)   → the CSV a user downloads (Date, Particulars,
 *    Amount, Direction, Type, Category, Importance, Balance, Source Page,
 *    Needs Review). Amount is always a positive magnitude; Direction carries
 *    the sign, so a spreadsheet never has to interpret a signed number.
 *  - buildDebugExport(...)    → the raw normalized-extraction JSON, meant for
 *    debugging a parser against a new bank format. Never sent anywhere;
 *    written to a local file the user chooses to save.
 *
 * Both work off already-parsed, already-in-memory data — nothing here reads
 * a file or calls any network/AI API.
 */

export type TransactionDirection = "incoming" | "outgoing";

export function transactionDirection(amount: number): TransactionDirection {
  return amount >= 0 ? "incoming" : "outgoing";
}

const CSV_HEADER = [
  "Date",
  "Particulars",
  "Amount",
  "Direction",
  "Type",
  "Category",
  "Importance",
  "Balance",
  "Source Page",
  "Needs Review",
] as const;

function csvField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Builds the CSV a user downloads. Only real, already-extracted transactions — never mock data. */
export function transactionsToCsv(transactions: readonly Transaction[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const t of transactions) {
    lines.push(
      [
        t.date,
        csvField(t.description),
        Math.abs(t.amount),
        transactionDirection(t.amount),
        t.type,
        t.category,
        t.importance,
        t.balanceAfter ?? "",
        t.sourcePage ?? "",
        t.needsReview,
      ]
        .map(csvField)
        .join(",")
    );
  }
  return lines.join("\r\n") + "\r\n";
}

export interface DebugExportTransaction {
  id: string;
  date: string;
  description: string;
  merchant: string;
  amount: number;
  direction: TransactionDirection;
  type: string;
  category: string;
  importance: string;
  confidence: number;
  balanceAfter: number | null;
  sourcePage: number | null;
  needsReview: boolean;
  duplicate: "existing" | "in_file" | null;
  transactionHash: string;
  warnings: string[];
}

export interface DebugExport {
  source: string;
  fileName: string;
  pagesProcessed: number | null;
  rowsDetected: number;
  transactionsDetected: number;
  transactionsImported: number;
  requiresReview: number;
  duplicates: number;
  rejectedRows: number;
  balanceValidationWarnings: number;
  reconciliation: ImportPreview["reconciliation"] | null;
  errors: ImportPreview["errors"];
  transactions: DebugExportTransaction[];
}

/**
 * The developer/debug export: the full normalized extraction result as JSON,
 * for comparing a new bank's PDF against what the parser actually produced.
 */
export function buildDebugExport(preview: ImportPreview): DebugExport {
  return {
    source: preview.bank ?? "Generic PDF/CSV parser",
    fileName: preview.fileName,
    pagesProcessed: preview.pageCount ?? null,
    rowsDetected: preview.totalRows,
    transactionsDetected: preview.candidates.length,
    transactionsImported: preview.newCount,
    requiresReview: preview.reviewCount,
    duplicates: preview.duplicateCount,
    rejectedRows: preview.errors.length,
    balanceValidationWarnings: preview.balanceWarnings ?? 0,
    reconciliation: preview.reconciliation ?? null,
    errors: preview.errors,
    transactions: preview.candidates.map((c) => ({
      id: c.transaction.id,
      date: c.transaction.date,
      description: c.transaction.description,
      merchant: c.transaction.merchant,
      amount: Math.abs(c.transaction.amount),
      direction: transactionDirection(c.transaction.amount),
      type: c.transaction.type,
      category: c.transaction.category,
      importance: c.transaction.importance,
      confidence: c.transaction.confidence,
      balanceAfter: c.transaction.balanceAfter ?? null,
      sourcePage: c.transaction.sourcePage ?? null,
      needsReview: c.transaction.needsReview,
      duplicate: c.duplicate,
      transactionHash: c.transaction.transactionHash,
      warnings: c.transaction.importWarnings ?? [],
    })),
  };
}

function downloadBlob(content: string, mimeType: string, fileName: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** Browser-only: triggers a CSV download of the given transactions. */
export function downloadTransactionsCsv(transactions: readonly Transaction[], fileName: string) {
  downloadBlob(transactionsToCsv(transactions), "text/csv;charset=utf-8", fileName);
}

/** Browser-only: triggers a JSON download of the raw debug extraction. */
export function downloadDebugExport(preview: ImportPreview, fileName: string) {
  downloadBlob(JSON.stringify(buildDebugExport(preview), null, 2), "application/json", fileName);
}
