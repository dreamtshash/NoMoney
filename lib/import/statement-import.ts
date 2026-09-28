import type { ClassificationRule, ImportRecord, Transaction } from "@/lib/types/finance";
import { computeTransactionHash, findMatchingRule, isClassificationComplete } from "@/lib/domain/classification";
import { systemCategoryFor, typeUsesSpendingClassification } from "@/lib/domain/categories";
import { parseCsv } from "@/lib/import/csv";
import {
  detectColumns,
  findHeaderRow,
  normalizeRow,
  type ColumnMap,
  type ColumnRole,
  type NormalizedRow,
  type RowError,
} from "@/lib/import/normalize";
import { parsePdfStatement, type PdfStatementResult, type Reconciliation } from "@/lib/import/pdf-statement";
import type { PdfTextItem } from "@/lib/import/pdf-text";
import { detectAndParseBankStatement } from "@/lib/import/pdf/registry";
import { maskSensitiveNumbers } from "@/lib/import/mask";
import { createId, nowIso } from "@/lib/utils/id";

/**
 * Statement import pipeline (no UI here):
 *
 *   CSV text ─┐
 *             ├─► normalized rows ─► classify (rules only) ─► duplicate check ─► preview
 *   PDF text ─┘
 *
 * Nothing is written until the user confirms the preview.
 */

export const MAX_STATEMENT_BYTES = 5 * 1024 * 1024;

export type StatementFormat = "csv" | "pdf";

export interface ImportCandidate {
  transaction: Transaction;
  line: number;
  duplicate: "existing" | "in_file" | null;
}

export interface ImportPreview {
  format: StatementFormat;
  fileName: string;
  accountId: string;
  detectedColumns: { role: string; header: string }[];
  /** Rows the source appeared to contain (read + skipped). */
  totalRows: number;
  candidates: ImportCandidate[];
  errors: RowError[];
  /** Plain-language notes about how the file was read. */
  notes: string[];
  /** PDF only: opening + extracted rows vs closing balance. */
  reconciliation?: Reconciliation;
  /** PDF only: which bank-specific parser matched, or null for the generic parser. */
  bank?: string | null;
  /** PDF only: pages read. */
  pageCount?: number;
  /** PDF only: rows whose balance didn't reconcile row-to-row (still included, flagged for review). */
  balanceWarnings?: number;
  /** Counts over non-duplicate candidates. */
  newCount: number;
  duplicateCount: number;
  classifiedCount: number;
  reviewCount: number;
}

export class ImportError extends Error {}

const CSV_ROLE_ORDER: ColumnRole[] = ["date", "description", "merchant", "amount", "debit", "credit", "drcr"];

/**
 * Classification is deterministic:
 *   - a matching merchant rule classifies the row (source "rule")
 *   - otherwise money out → expense with unknown category/importance (review)
 *   - otherwise money in  → type "unknown" (could be income, a refund, a friend
 *     paying back, or a transfer — the user decides; it is NOT assumed income)
 */
export function buildImportPreviewFromRows(params: {
  format: StatementFormat;
  rows: readonly NormalizedRow[];
  errors: readonly RowError[];
  totalRows: number;
  detectedColumns: { role: string; header: string }[];
  notes?: string[];
  reconciliation?: Reconciliation;
  bank?: string | null;
  balanceWarnings?: number;
  pageCount?: number;
  fileName: string;
  accountId: string;
  existing: readonly Transaction[];
  rules: readonly ClassificationRule[];
}): ImportPreview {
  const existingHashes = new Set(params.existing.map((t) => t.transactionHash));
  const seen = new Set<string>();
  const candidates: ImportCandidate[] = [];
  const now = nowIso();

  for (const raw of params.rows) {
    // Account/card numbers never enter storage in full.
    const result = { ...raw, description: maskSensitiveNumbers(raw.description), merchant: maskSensitiveNumbers(raw.merchant) };
    const hash = computeTransactionHash({
      accountId: params.accountId,
      date: result.date,
      amount: result.amount,
      description: result.description,
    });
    const duplicate = existingHashes.has(hash) ? "existing" : seen.has(hash) ? "in_file" : null;
    seen.add(hash);

    const merchant = result.merchant || result.description;
    const match = findMatchingRule({ merchant, description: result.description }, params.rules);
    const ruleDirectionOk =
      match &&
      (!match.type ||
        (match.type === "expense" && result.amount < 0) ||
        (match.type === "income" && result.amount > 0) ||
        (match.type !== "expense" && match.type !== "income"));

    const base = {
      id: createId("txn"),
      accountId: params.accountId,
      date: result.date,
      description: result.description,
      merchant,
      amount: result.amount,
      isRecurring: false,
      transactionHash: hash,
      balanceAfter: result.balanceAfter ?? undefined,
      sourcePage: result.sourcePage,
      importWarnings: result.warnings?.length ? result.warnings : undefined,
      createdAt: now,
      updatedAt: now,
    };
    let transaction: Transaction;
    if (match && ruleDirectionOk) {
      const type = match.type ?? (result.amount < 0 ? "expense" : "unknown");
      const complete =
        type !== "unknown" &&
        (!typeUsesSpendingClassification(type) || (match.category !== "unknown" && match.importance !== "unknown"));
      transaction = {
        ...base,
        type,
        category: match.category,
        importance: match.importance,
        confidence: match.confidence,
        classificationSource: "rule",
        needsReview: !complete || !!result.warnings?.length,
      };
    } else if (result.suggestion) {
      // A bank-specific parser (e.g. Canara) made a deterministic suggestion.
      // Still always needsReview: only an explicit user rule (above) or the
      // user's own confirmation in the preview can close the review item.
      transaction = {
        ...base,
        type: result.suggestion.type,
        category: result.suggestion.category,
        importance: result.suggestion.importance,
        confidence: result.suggestion.confidence,
        classificationSource: "import",
        needsReview: true,
      };
    } else if (result.amount < 0) {
      transaction = { ...base, type: "expense", category: "unknown", importance: "unknown", confidence: 0, classificationSource: "unclassified", needsReview: true };
    } else {
      transaction = { ...base, type: "unknown", category: "unknown", importance: "unknown", confidence: 0, classificationSource: "unclassified", needsReview: true };
    }
    candidates.push({ transaction, line: result.line, duplicate });
  }

  const fresh = candidates.filter((c) => !c.duplicate);
  return {
    format: params.format,
    fileName: params.fileName,
    accountId: params.accountId,
    detectedColumns: params.detectedColumns,
    totalRows: params.totalRows,
    candidates,
    errors: [...params.errors],
    notes: params.notes ?? [],
    reconciliation: params.reconciliation,
    bank: params.bank ?? null,
    balanceWarnings: params.balanceWarnings ?? 0,
    pageCount: params.pageCount,
    newCount: fresh.length,
    duplicateCount: candidates.length - fresh.length,
    classifiedCount: fresh.filter((c) => !c.transaction.needsReview).length,
    reviewCount: fresh.filter((c) => c.transaction.needsReview).length,
  };
}

/* ------------------------------------------------------------------ */
/* CSV                                                                  */
/* ------------------------------------------------------------------ */

export function buildCsvImportPreview(params: {
  text: string;
  fileName: string;
  accountId: string;
  existing: readonly Transaction[];
  rules: readonly ClassificationRule[];
}): ImportPreview {
  const rows = parseCsv(params.text);
  if (rows.length === 0) throw new ImportError("The file is empty.");
  const headerIndex = findHeaderRow(rows);
  if (headerIndex === -1) {
    throw new ImportError(
      "Couldn't find the column headings. NoMoney needs a date column, a description/narration column, and either an amount column or separate debit and credit columns."
    );
  }
  const header = rows[headerIndex]!;
  const map: ColumnMap = detectColumns(header);
  const dataRows = rows.slice(headerIndex + 1);
  if (dataRows.length === 0) throw new ImportError("The file has headings but no transaction rows.");

  const normalized: NormalizedRow[] = [];
  const errors: RowError[] = [];
  dataRows.forEach((cells, i) => {
    const result = normalizeRow(cells, map, i + 1);
    if ("message" in result) errors.push(result);
    else normalized.push(result);
  });

  if (normalized.length === 0) {
    throw new ImportError(
      `None of the ${dataRows.length} rows could be read. First problem: row ${errors[0]?.line}: ${errors[0]?.message}`
    );
  }

  return buildImportPreviewFromRows({
    ...params,
    format: "csv",
    rows: normalized,
    errors,
    totalRows: dataRows.length,
    detectedColumns: CSV_ROLE_ORDER.filter((r) => map[r] !== undefined).map((role) => ({ role, header: header[map[role]!] ?? "" })),
  });
}

/* ------------------------------------------------------------------ */
/* PDF                                                                  */
/* ------------------------------------------------------------------ */

const PDF_METHOD_NOTE: Record<PdfStatementResult["directionMethod"], string> = {
  columns: "Money in and out were read from the withdrawal/deposit (debit/credit) columns.",
  marker: "Money in and out were read from Dr/Cr markers next to each amount.",
  balance: "Money in and out were worked out from changes in the running balance.",
  mixed: "Money in and out were read from a mix of columns, Dr/Cr markers and running-balance changes.",
  none: "",
};

/**
 * Converts a bank-specific parser's result (currently: Canara Bank — see
 * lib/import/pdf/canara) into the same ImportPreview shape the generic PDF
 * and CSV paths produce, so the rest of the app (preview UI, classification,
 * duplicate detection, dashboards) never needs to know which parser ran.
 */
function buildBankImportPreview(
  bank: import("@/lib/import/pdf/registry").BankPdfParseResult,
  params: {
    fileName: string;
    accountId: string;
    existing: readonly Transaction[];
    rules: readonly ClassificationRule[];
  }
): ImportPreview {
  if (bank.transactions.length === 0) {
    const detail = bank.errors.length
      ? ` ${bank.errors.length} possible rows were found, but none could be read reliably (first: ${bank.errors[0]!.message})`
      : " A header row was found, but no dated transaction rows under it.";
    throw new ImportError(`Recognised this as a ${bank.bank} statement, but could not confidently extract any transactions.${detail}`);
  }

  const rows: NormalizedRow[] = bank.transactions.map((t) => ({
    line: t.line,
    date: t.date,
    description: t.description,
    merchant: t.merchant,
    amount: t.amount,
    balanceAfter: t.balanceAfter,
    sourcePage: t.sourcePage,
    suggestion: t.suggestion,
    warnings: t.warnings,
  }));
  const errors: RowError[] = bank.errors.map((e) => ({ line: e.line, message: `p${e.page}: ${e.message}` }));

  const notes: string[] = [];
  notes.push(`Recognised as a ${bank.bank} statement (Date / Particulars / Deposits / Withdrawals / Balance).`);
  notes.push(`Read ${bank.pageCount} ${bank.pageCount === 1 ? "page" : "pages"}, ${bank.rowsDetected} candidate rows detected.`);
  notes.push("Deposits and Withdrawals were read directly from their own columns — direction was never guessed from the description.");
  if (bank.balanceCheck.checked > 0) {
    notes.push(
      bank.balanceCheck.mismatched === 0
        ? `All ${bank.balanceCheck.checked} row-to-row balance checks agree.`
        : `${bank.balanceCheck.mismatched} of ${bank.balanceCheck.checked} rows don't reconcile with the running balance from the row before them. They're still included, flagged for review.`
    );
  }
  const rec = bank.reconciliation;
  if (rec.status === "match") {
    notes.push(`Reconciled: opening balance + the ${bank.transactions.length} extracted transactions = closing balance.`);
  } else if (rec.status === "mismatch") {
    notes.push(
      `Doesn't fully reconcile: extracted transactions differ from the statement's opening/closing balances by ${Math.abs(rec.difference ?? 0).toLocaleString("en-IN")}. ${bank.errors.length ? `${bank.errors.length} row(s) were rejected — check them below.` : "Check the rows near any balance-mismatch warning."}`
    );
  } else {
    notes.push("Opening/closing balance for the whole statement wasn't found, so it can't be fully reconciled — row-to-row checks above still apply.");
  }
  if (bank.rejectedRows > 0) notes.push(`${bank.rejectedRows} row(s) were rejected (not imported) — see below.`);

  return buildImportPreviewFromRows({
    format: "pdf",
    rows,
    errors,
    totalRows: bank.rowsDetected,
    detectedColumns: bank.columns.map((c) => ({ role: c.role, header: c.header })),
    notes,
    reconciliation: rec as unknown as Reconciliation,
    bank: bank.bank,
    balanceWarnings: bank.balanceCheck.mismatched,
    pageCount: bank.pageCount,
    fileName: params.fileName,
    accountId: params.accountId,
    existing: params.existing,
    rules: params.rules,
  });
}

/**
 * PDF text (already extracted) → preview. Refuses rather than guesses:
 * if no rows can be read confidently, it throws an ImportError.
 */
export function buildPdfImportPreview(params: {
  items: readonly PdfTextItem[];
  pageCount: number;
  fileName: string;
  accountId: string;
  existing: readonly Transaction[];
  rules: readonly ClassificationRule[];
}): ImportPreview {
  if (params.items.length === 0) {
    throw new ImportError(
      "This PDF has no selectable text. It's probably a scanned image; NoMoney can't read those (no OCR). Download the statement as CSV or as a text-based PDF from net banking instead."
    );
  }

  // Bank-specific parsers (Canara Bank, and any added later) are tried first:
  // they read the statement's own five columns deterministically instead of
  // inferring layout, and are strictly more reliable when they match.
  const bank = detectAndParseBankStatement(params.items, params.pageCount);
  if (bank) return buildBankImportPreview(bank, params);

  const parsed = parsePdfStatement(params.items, params.pageCount);
  if (parsed.rows.length === 0) {
    const detail =
      parsed.errors.length > 0
        ? ` ${parsed.errors.length} possible rows were found, but for none of them could the amount and direction be read reliably (first: ${parsed.errors[0]!.message})`
        : parsed.headerFound
          ? " A table heading was found, but no dated rows with amounts under it."
          : " No table heading (Date, Narration/Description, Debit/Credit or Amount) and no dated rows with amounts were found.";
    throw new ImportError(`Could not confidently detect transaction rows in this statement.${detail}`);
  }

  const notes: string[] = [];
  notes.push(`Read ${parsed.pageCount} ${parsed.pageCount === 1 ? "page" : "pages"}.`);
  if (PDF_METHOD_NOTE[parsed.directionMethod]) notes.push(PDF_METHOD_NOTE[parsed.directionMethod]);
  if (parsed.balanceCheck.checked > 0) {
    notes.push(
      parsed.balanceCheck.mismatched === 0
        ? `All ${parsed.balanceCheck.checked} rows that could be checked agree with the running balance.`
        : `${parsed.balanceCheck.mismatched} of ${parsed.balanceCheck.checked} rows didn't match the running balance at first; their direction was taken from the balance. Check them in the preview.`
    );
  } else {
    notes.push("There was no running balance to cross-check amounts against. Check the preview carefully.");
  }
  if (!parsed.headerFound) notes.push("No column heading was recognised, so the layout was inferred from each line.");
  const rec = parsed.reconciliation;
  if (rec.status === "match") {
    notes.push(
      `Reconciled: opening balance + the ${parsed.rows.length} extracted transactions = closing balance, so no rows were missed or misread.`
    );
  } else if (rec.status === "mismatch") {
    notes.push(
      `Doesn't reconcile: the extracted transactions add up to a different change than the statement's opening and closing balances show (off by ${Math.abs(rec.difference ?? 0).toLocaleString("en-IN")}). Some rows may be missing or misread${parsed.errors.length ? ` — ${parsed.errors.length} ${parsed.errors.length === 1 ? "row was" : "rows were"} skipped` : ""}.`
    );
  } else {
    notes.push("The statement's opening/closing balances couldn't be found, so the whole statement can't be reconciled.");
  }

  return buildImportPreviewFromRows({
    ...params,
    format: "pdf",
    rows: parsed.rows,
    errors: parsed.errors,
    totalRows: parsed.rows.length + parsed.errors.length,
    detectedColumns: parsed.detectedColumns,
    notes,
    reconciliation: parsed.reconciliation,
  });
}

export function detectFormat(file: { name: string; type: string }): StatementFormat | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type === "text/csv") return "csv";
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  return null;
}

/** Confirms a file really is a PDF by its signature. */
export async function isPdfFile(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...Array.from(head)) === "%PDF-";
}

/* ------------------------------------------------------------------ */
/* Review → import                                                      */
/* ------------------------------------------------------------------ */

export interface RowCorrection {
  type: Transaction["type"];
  category: Transaction["category"];
  importance: Transaction["importance"];
}

export interface ImportSelection {
  /** Row corrections made in the preview, keyed by candidate transaction id. */
  corrections: Readonly<Record<string, RowCorrection>>;
  /** Candidate ids the user chose not to import. */
  excluded: ReadonlySet<string>;
  includeDuplicates: boolean;
}

/** A candidate as it will be imported, with any correction applied. */
export function correctedTransaction(t: Transaction, correction: RowCorrection | undefined): Transaction {
  if (!correction) return t;
  const usesSpending = typeUsesSpendingClassification(correction.type);
  const category = usesSpending ? correction.category : (systemCategoryFor(correction.type) ?? "unknown");
  const importance = usesSpending ? correction.importance : "unknown";
  const next = { ...t, type: correction.type, category, importance };
  const complete = isClassificationComplete(next);
  return {
    ...next,
    classificationSource: complete ? "user" : "unclassified",
    confidence: complete ? 1 : 0,
    needsReview: !complete,
  };
}

/** Final list of transactions to import, plus the summary stored in import history. */
export function finalizeImport(
  preview: ImportPreview,
  selection: ImportSelection,
  meta: { id: string; importedAt: string }
): { transactions: Transaction[]; record: ImportRecord } {
  const eligible = preview.candidates.filter((c) => selection.includeDuplicates || !c.duplicate);
  const chosen = eligible.filter((c) => !selection.excluded.has(c.transaction.id));
  const transactions = chosen.map((c) => correctedTransaction(c.transaction, selection.corrections[c.transaction.id]));
  return {
    transactions,
    record: {
      id: meta.id,
      fileName: preview.fileName,
      format: preview.format,
      accountId: preview.accountId,
      importedAt: meta.importedAt,
      detected: preview.candidates.length + preview.errors.length,
      imported: transactions.length,
      duplicatesSkipped: selection.includeDuplicates ? 0 : preview.duplicateCount,
      excludedByUser: eligible.length - chosen.length,
      needsReview: transactions.filter((t) => t.needsReview).length,
      rejected: preview.errors.length,
      reconciliation: preview.reconciliation?.status ?? null,
      bank: preview.bank ?? null,
      balanceWarnings: preview.balanceWarnings ?? 0,
    },
  };
}
