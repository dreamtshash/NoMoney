import type { PdfLine } from "@/lib/import/pdf-statement";
import type { CanaraColumn, CanaraColumnRole } from "./types";

/**
 * Recognises a Canara Bank statement and locates its header row.
 *
 * Two independent signals are used, either is enough:
 *   1. The bank's name appears somewhere on the page (masthead / footer).
 *   2. A line contains a header for all five Canara columns:
 *        Date | Particulars | Deposits | Withdrawals | Balance
 *      (a little header wording variation is tolerated, e.g. "Deposit(Cr)",
 *      "Withdrawal Amt", "Debit"/"Credit" used interchangeably by some
 *      branches/export tools).
 *
 * We never hardcode x-coordinates: the header row's own cell positions
 * become the column boundaries for the rest of the statement.
 */

function roleFor(headerText: string): CanaraColumnRole | null {
  const h = headerText.toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
  if (!h) return null;
  // Deliberately strict — only the words Canara Bank actually uses in this
  // format. Generic synonyms used by OTHER banks (Narration, Description,
  // Debit, Credit, Amt.) are intentionally excluded so this parser only ever
  // claims a statement that genuinely has this bank's own column names; a
  // statement that merely has *a* date/description/amount/balance layout
  // should fall through to the generic parser instead.
  if (/^(txn|transaction|value)? ?date$/.test(h) || h === "date") return "date";
  if (/\bparticulars\b/.test(h)) return "particulars";
  if (/\bdeposits?\b/.test(h)) return "deposit";
  if (/\bwithdrawals?\b/.test(h)) return "withdrawal";
  if (/\bbalance\b/.test(h)) return "balance";
  return null;
}

export function isCanaraBankText(fullText: string): boolean {
  return /canara\s*bank/i.test(fullText);
}

/**
 * Tries to read a Canara-style header from a single line. Returns the five
 * columns (in whatever order they appear) when Date, Particulars, at least
 * one of Deposit/Withdrawal, and Balance are all present.
 */
export function readCanaraHeader(line: PdfLine): CanaraColumn[] | null {
  const cols: CanaraColumn[] = [];
  for (const cell of line.cells) {
    const role = roleFor(cell.text);
    if (role && !cols.some((c) => c.role === role)) {
      cols.push({ role, header: cell.text, x0: cell.x0, x1: cell.x1 });
    }
  }
  const roles = new Set(cols.map((c) => c.role));
  const hasMoneyColumns = roles.has("deposit") || roles.has("withdrawal");
  const looksComplete = roles.has("date") && roles.has("particulars") && hasMoneyColumns && roles.has("balance");
  return looksComplete ? cols : null;
}

export interface CanaraDetection {
  matched: boolean;
  columns: CanaraColumn[] | null;
  headerLineIndex: number | null;
  /** Why detection did or didn't match, for the extraction report / debugging. */
  reason: string;
}

/**
 * Detects whether a statement is Canara Bank and, if so, finds its header.
 * `lines` should already be page-order (see groupIntoLines in pdf-statement.ts).
 */
export function detectCanaraStatement(lines: readonly PdfLine[]): CanaraDetection {
  const fullText = lines.map((l) => l.text).join(" ");
  const nameMatch = isCanaraBankText(fullText);

  for (let i = 0; i < lines.length; i++) {
    const cols = readCanaraHeader(lines[i]!);
    if (cols) {
      return { matched: true, columns: cols, headerLineIndex: i, reason: "header row matched" };
    }
  }

  if (nameMatch) {
    // Bank name present but no recognisable 5-column header — still worth trying
    // downstream, but callers should treat this as lower confidence.
    return { matched: true, columns: null, headerLineIndex: null, reason: "bank name matched, header not found" };
  }

  return { matched: false, columns: null, headerLineIndex: null, reason: "no Canara Bank name or header found" };
}
