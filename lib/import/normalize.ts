import { isIsoDate } from "@/lib/utils/dates";
import { parseAmount } from "@/lib/utils/money";
import type { CategoryId, Importance, TransactionType } from "@/lib/types/finance";

export type ColumnRole = "date" | "description" | "merchant" | "amount" | "debit" | "credit" | "drcr";

const ALIASES: Record<ColumnRole, string[]> = {
  date: ["date", "txn date", "transaction date", "tran date", "value date", "posting date", "value dt"],
  description: ["description", "narration", "particulars", "remarks", "details", "transaction details", "transaction remarks"],
  merchant: ["merchant", "payee", "beneficiary", "counterparty"],
  amount: ["amount", "transaction amount", "amount (inr)", "amt", "amount(inr)"],
  debit: ["debit", "withdrawal", "withdrawal amt", "withdrawal amt.", "withdrawals", "debit amount", "dr amount", "debit (inr)"],
  credit: ["credit", "deposit", "deposit amt", "deposit amt.", "deposits", "credit amount", "cr amount", "credit (inr)"],
  drcr: ["dr/cr", "cr/dr", "type", "dr / cr", "debit/credit", "transaction type"],
};

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[_\s]+/g, " ").replace(/\s*\.\s*$/, ".").trim();
}

export type ColumnMap = Partial<Record<ColumnRole, number>>;

export function detectColumns(header: string[]): ColumnMap {
  const map: ColumnMap = {};
  header.forEach((raw, i) => {
    const h = normHeader(raw);
    for (const role of Object.keys(ALIASES) as ColumnRole[]) {
      if (map[role] === undefined && ALIASES[role].includes(h)) {
        map[role] = i;
        return;
      }
    }
  });
  return map;
}

export function hasUsableColumns(map: ColumnMap): boolean {
  return (
    map.date !== undefined &&
    map.description !== undefined &&
    (map.amount !== undefined || map.debit !== undefined || map.credit !== undefined)
  );
}

/** Find the header row — bank exports often start with account details. */
export function findHeaderRow(rows: string[][], maxScan = 30): number {
  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    if (hasUsableColumns(detectColumns(rows[i] ?? []))) return i;
  }
  return -1;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function iso(y: number, m: number, d: number): string | null {
  const full = y < 100 ? 2000 + y : y;
  const s = `${full}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isIsoDate(s) ? s : null;
}

/**
 * Accepts YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, DD/MM/YY,
 * DD-MMM-YYYY and "DD MMM YYYY". Numeric dates are read DAY-FIRST (Indian
 * statements); a time component is ignored.
 */
export function parseStatementDate(raw: string): string | null {
  const text = raw.trim().split(/[ T](?=\d{1,2}:\d{2})/)[0]?.trim() ?? "";
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(text);
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})[-/ ]([A-Za-z]{3,4})[-/ ,]+(\d{2}|\d{4})$/.exec(text);
  if (m) {
    const month = MONTHS[m[2]!.toLowerCase()];
    return month ? iso(Number(m[3]), month, Number(m[1])) : null;
  }
  return null;
}

/** A bank-specific parser's first-pass classification. Never overrides an explicit user rule; always leaves needsReview = true. */
export interface ImportSuggestion {
  type: TransactionType;
  category: CategoryId;
  importance: Importance;
  /** 0–1, never 1 — a suggestion is not a confirmed classification. */
  confidence: number;
  reason: string;
}

export interface NormalizedRow {
  line: number;
  date: string;
  description: string;
  merchant: string;
  /** Signed: negative = money out. */
  amount: number;
  /** Running account balance immediately after this transaction, when the source provides one (e.g. bank-statement Balance column). */
  balanceAfter?: number | null;
  /** PDF page this row was read from. */
  sourcePage?: number;
  /** Set by bank-specific parsers (e.g. Canara) that can suggest a type/category deterministically. */
  suggestion?: ImportSuggestion;
  /** Per-row warnings (e.g. balance reconciliation mismatches) to surface in the preview even though the row is still imported. */
  warnings?: string[];
}

export interface RowError {
  line: number;
  message: string;
}

export function normalizeRow(cells: string[], map: ColumnMap, line: number): NormalizedRow | RowError {
  const cell = (role: ColumnRole) => (map[role] === undefined ? "" : cells[map[role]!] ?? "");

  const date = parseStatementDate(cell("date"));
  if (!date) return { line, message: `Unrecognised date "${cell("date")}".` };

  const description = cell("description").replace(/\s+/g, " ").trim();
  if (!description) return { line, message: "Missing description." };

  let amount: number | null = null;
  if (map.debit !== undefined || map.credit !== undefined) {
    const debit = cell("debit") ? parseAmount(cell("debit")) : null;
    const credit = cell("credit") ? parseAmount(cell("credit")) : null;
    if (debit && !debit.ok) return { line, message: `Unreadable debit "${cell("debit")}".` };
    if (credit && !credit.ok) return { line, message: `Unreadable credit "${cell("credit")}".` };
    const d = debit?.ok ? Math.abs(debit.value) : 0;
    const c = credit?.ok ? Math.abs(credit.value) : 0;
    if (d > 0 && c > 0) return { line, message: "Row has both a debit and a credit." };
    amount = c > 0 ? c : d > 0 ? -d : null;
  }
  if (amount === null && map.amount !== undefined) {
    const parsed = parseAmount(cell("amount"));
    if (!parsed.ok) return { line, message: `Unreadable amount "${cell("amount")}".` };
    amount = parsed.value;
    const flag = cell("drcr").toLowerCase();
    if (flag.startsWith("dr") || flag === "debit" || flag === "d") amount = -Math.abs(amount);
    else if (flag.startsWith("cr") || flag === "credit" || flag === "c") amount = Math.abs(amount);
  }
  if (amount === null || amount === 0) return { line, message: "No amount on this row." };

  return { line, date, description, merchant: cell("merchant").trim(), amount };
}
