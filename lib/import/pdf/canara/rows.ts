import type { PdfCell, PdfLine } from "@/lib/import/pdf-statement";
import { parseStatementDate } from "@/lib/import/normalize";
import { parseAmount } from "@/lib/utils/money";
import type { CanaraColumn, CanaraRawRow, CanaraRowError } from "./types";

/**
 * Turns the statement's lines into raw transaction rows using the column
 * positions read from the header. This is the part of the pipeline
 * responsible for requirement "COLUMN RECONSTRUCTION" and
 * "MULTI-LINE PARTICULARS": everything here works from x/y position, never
 * from `text.split("\n")`.
 */

// Lines that are never transaction data, wherever they appear in the table.
const NON_TRANSACTION_RE =
  /(statement (of|summary)|account (no|number|statement)|customer (id|name)|ifsc|micr|branch|page \d+ ?(of ?\d+)?|generated on|this is a (computer|system) generated|end of statement|carried forward|brought forward|b\/?f\.? balance|total(?!.*\d{2}\/\d{2})|statement period|^canara bank)/i;

const OPENING_RE = /opening balance/i;
const CLOSING_RE = /closing balance/i;

/** Which Canara column an x-position falls under. Uses the midpoint between neighbouring columns as the boundary, so cells don't need to line up exactly with the header. */
function columnBoundaries(columns: readonly CanaraColumn[]): { role: CanaraColumn["role"]; from: number; to: number }[] {
  const sorted = [...columns].sort((a, b) => a.x0 - b.x0);
  return sorted.map((c, i) => {
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    const from = prev ? (prev.x1 + c.x0) / 2 : -Infinity;
    const to = next ? (c.x1 + next.x0) / 2 : Infinity;
    return { role: c.role, from, to };
  });
}

function columnOf(cell: PdfCell, boundaries: ReturnType<typeof columnBoundaries>): CanaraColumn["role"] | null {
  const centre = (cell.x0 + cell.x1) / 2;
  for (const b of boundaries) if (centre >= b.from && centre < b.to) return b.role;
  return null;
}

function parseMoney(text: string): number | null {
  const t = text.trim();
  if (!t || t === "-" || t === "–" || t === "—") return null;
  const parsed = parseAmount(t);
  return parsed.ok ? Math.abs(parsed.value) : null;
}

export interface BuildRowsResult {
  rows: CanaraRawRow[];
  errors: CanaraRowError[];
  openingBalance: number | null;
  closingBalance: number | null;
  /** Lines that had money-shaped text but weren't used — possible missed rows, surfaced in the extraction report. */
  ignoredLines: { page: number; text: string }[];
}

export function buildCanaraRows(lines: readonly PdfLine[], columns: readonly CanaraColumn[]): BuildRowsResult {
  const boundaries = columnBoundaries(columns);
  const rows: CanaraRawRow[] = [];
  const errors: CanaraRowError[] = [];
  const ignoredLines: BuildRowsResult["ignoredLines"] = [];
  let openingBalance: number | null = null;
  let closingBalance: number | null = null;
  let current: CanaraRawRow | null = null;

  for (const line of lines) {
    // Repeated header on later pages: reset the current row and move on.
    const looksLikeHeader =
      line.cells.some((c) => /particulars/i.test(c.text)) &&
      line.cells.some((c) => /deposit/i.test(c.text)) &&
      line.cells.some((c) => /withdrawal/i.test(c.text));
    if (looksLikeHeader) {
      current = null;
      continue;
    }

    if (OPENING_RE.test(line.text)) {
      const money = line.cells.map((c) => parseMoney(c.text)).filter((v): v is number => v !== null);
      if (money.length && openingBalance === null) openingBalance = money[money.length - 1]!;
      current = null;
      continue;
    }
    if (CLOSING_RE.test(line.text)) {
      const money = line.cells.map((c) => parseMoney(c.text)).filter((v): v is number => v !== null);
      if (money.length) closingBalance = money[money.length - 1]!;
      current = null;
      continue;
    }
    if (NON_TRANSACTION_RE.test(line.text)) {
      current = null;
      continue;
    }

    // Read the Date column ONLY for the row date — never from particulars.
    const dateCell = line.cells.find((c) => columnOf(c, boundaries) === "date");
    const date = dateCell ? parseStatementDate(dateCell.text) : null;

    if (dateCell && dateCell.text.trim() && !date) {
      // Something sits in the Date column but doesn't parse as a date. If the
      // rest of the line looks like a transaction (has an amount), this is a
      // row we can't confidently read — reported, never guessed. Otherwise
      // it's more likely a stray label and is just ignored.
      const hasMoney =
        firstAmountIn(line.cells, boundaries, "deposit") !== null ||
        firstAmountIn(line.cells, boundaries, "withdrawal") !== null ||
        firstAmountIn(line.cells, boundaries, "balance") !== null;
      if (hasMoney) {
        errors.push({ line: rows.length + errors.length + 1, page: line.page, message: `Unrecognised date "${dateCell.text.trim()}".` });
      } else {
        ignoredLines.push({ page: line.page, text: line.text });
      }
      current = null;
      continue;
    }

    if (date) {
      // A new date starts a new transaction row; finish the one in progress first.
      const deposit = firstAmountIn(line.cells, boundaries, "deposit");
      const withdrawal = firstAmountIn(line.cells, boundaries, "withdrawal");
      const balance = firstAmountIn(line.cells, boundaries, "balance");
      const particularsText = line.cells
        .filter((c) => columnOf(c, boundaries) === "particulars")
        .map((c) => c.text.trim())
        .filter(Boolean);

      current = {
        index: rows.length + errors.length + 1,
        page: line.page,
        date,
        dateRaw: dateCell!.text.trim(),
        particulars: particularsText,
        deposit,
        withdrawal,
        balance,
      };
      rows.push(current);
      continue;
    }

    // No date on this line: either a wrapped Particulars continuation of the
    // current row, or noise. Continuation lines must stay on the same page —
    // a single table row is never split across a page break.
    const hasMoney =
      firstAmountIn(line.cells, boundaries, "deposit") !== null ||
      firstAmountIn(line.cells, boundaries, "withdrawal") !== null ||
      firstAmountIn(line.cells, boundaries, "balance") !== null;

    if (current && line.page === current.page && !hasMoney) {
      const extra = line.cells
        .filter((c) => {
          const role = columnOf(c, boundaries);
          return role === "particulars" || role === null;
        })
        .map((c) => c.text.trim())
        .filter(Boolean);
      if (extra.length) {
        current.particulars.push(...extra);
        continue;
      }
    }

    if (hasMoney || /\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(line.text)) {
      ignoredLines.push({ page: line.page, text: line.text });
    }
    current = null;
  }

  return { rows, errors, openingBalance, closingBalance, ignoredLines };
}

function firstAmountIn(cells: readonly PdfCell[], boundaries: ReturnType<typeof columnBoundaries>, role: CanaraColumn["role"]): number | null {
  for (const c of cells) {
    if (columnOf(c, boundaries) === role) {
      const v = parseMoney(c.text);
      if (v !== null) return v;
    }
  }
  return null;
}
