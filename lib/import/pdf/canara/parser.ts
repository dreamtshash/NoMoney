import { groupIntoLines } from "@/lib/import/pdf-statement";
import type { PdfTextItem } from "@/lib/import/pdf-text";
import { roundMoney } from "@/lib/utils/money";
import { classifyCanaraRow, extractCounterparty } from "./classify";
import { detectCanaraStatement } from "./detector";
import { buildCanaraRows } from "./rows";
import { reconcileStatement, validateRowBalances } from "./validate";
import type { CanaraParseResult, CanaraRowError, CanaraTransaction } from "./types";

/**
 * The full Canara Bank pipeline:
 *
 *   PDF text items → lines/cells → header + columns → raw rows (joining
 *   wrapped Particulars) → normalized transactions → classification →
 *   balance validation → CanaraParseResult
 *
 * Pure — no pdf.js here — so it can be unit-tested with synthetic
 * PdfTextItem[] fixtures as well as with a real extracted statement.
 */
export function parseCanaraStatement(items: readonly PdfTextItem[], pageCount: number): CanaraParseResult | null {
  const lines = groupIntoLines(items);
  const detection = detectCanaraStatement(lines);
  if (!detection.matched || !detection.columns) return null;

  const built = buildCanaraRows(lines, detection.columns);
  const errors: CanaraRowError[] = [...built.errors];
  const transactions: CanaraTransaction[] = [];

  for (const raw of built.rows) {
    const description = raw.particulars.join(" ").replace(/\s+/g, " ").trim();

    if (raw.deposit !== null && raw.withdrawal !== null) {
      errors.push({ line: raw.index, page: raw.page, message: `${raw.date}: row has both a deposit and a withdrawal amount — can't tell which is the transaction.` });
      continue;
    }
    if (raw.deposit === null && raw.withdrawal === null) {
      errors.push({ line: raw.index, page: raw.page, message: `${raw.date}: no deposit or withdrawal amount found (a balance alone is not a transaction).` });
      continue;
    }
    if (!description) {
      errors.push({ line: raw.index, page: raw.page, message: `${raw.date}: no particulars/description found.` });
      continue;
    }

    const direction: "incoming" | "outgoing" = raw.deposit !== null ? "incoming" : "outgoing";
    const amount = roundMoney(direction === "incoming" ? raw.deposit! : -raw.withdrawal!);
    const suggestion = classifyCanaraRow(direction, description);

    transactions.push({
      line: raw.index,
      date: raw.date,
      description,
      merchant: extractCounterparty(description),
      amount,
      direction,
      balanceAfter: raw.balance,
      sourcePage: raw.page,
      suggestion,
      needsReview: true, // Canara rows are always reviewable until a user rule or the user confirms them.
      warnings: [],
    });
  }

  const balanceCheck = validateRowBalances(transactions);
  const reconciliation = reconcileStatement(transactions, built.openingBalance, built.closingBalance);

  return {
    bank: "Canara Bank",
    pageCount,
    columns: detection.columns,
    rowsDetected: built.rows.length + errors.length,
    transactions,
    errors,
    rejectedRows: errors.length,
    balanceCheck,
    reconciliation,
    headerFound: true,
  };
}
