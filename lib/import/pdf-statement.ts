import type { PdfTextItem } from "@/lib/import/pdf-text";
import { parseStatementDate, type NormalizedRow, type RowError } from "@/lib/import/normalize";
import { roundMoney } from "@/lib/utils/money";

/**
 * Bank-statement PDF text → transaction rows. Pure; no pdf.js here.
 *
 * There is no universal bank PDF layout, so this works from structure rather
 * than from a fixed template:
 *
 *  1. Rebuild lines and cells from positioned text.
 *  2. Find a header row (Date / Narration / Withdrawal / Deposit / Balance…)
 *     and remember each column's horizontal position. Headers repeated on
 *     later pages are recognised and skipped.
 *  3. A transaction row is a line that starts with a date and has at least
 *     one money amount. Lines without a date directly under a row are the
 *     rest of a wrapped narration.
 *  4. Money in / out is decided, in order of preference, by:
 *       - the column the amount sits under (Withdrawal/Debit vs Deposit/Credit)
 *       - an explicit Dr/Cr marker
 *       - the change in running balance from the previous row
 *     and cross-checked against the running balance when there is one.
 *  5. Rows where direction can't be decided are reported as errors, never
 *     guessed. If no rows are found at all, the caller gets a clear failure.
 */

export type StatementColumnRole = "date" | "valueDate" | "description" | "ref" | "debit" | "credit" | "amount" | "drcr" | "balance";

export interface Reconciliation {
  status: "match" | "mismatch" | "unavailable";
  opening: number | null;
  openingSource: "statement" | "derived_from_first_row" | null;
  closing: number | null;
  closingSource: "statement" | "last_row_balance" | null;
  /** Σ of extracted amounts (money in positive). */
  extractedNet: number;
  /** closing − opening, when both are known. */
  expectedNet: number | null;
  difference: number | null;
}

export interface PdfCell {
  x0: number;
  x1: number;
  text: string;
}

export interface PdfLine {
  page: number;
  y: number;
  height: number;
  cells: PdfCell[];
  text: string;
}

export interface PdfStatementResult {
  rows: NormalizedRow[];
  errors: RowError[];
  detectedColumns: { role: StatementColumnRole; header: string }[];
  /** How money in/out was decided for most rows. */
  directionMethod: "columns" | "marker" | "balance" | "mixed" | "none";
  /** Rows whose amount was checked against the running balance, and how many disagreed. */
  balanceCheck: { checked: number; mismatched: number };
  /**
   * Whole-statement check: opening balance + every extracted row should equal
   * the closing balance. A mismatch means rows were missed or misread.
   */
  reconciliation: Reconciliation;
  /** Lines with a date or an amount that weren't used as a row, header, balance or continuation — possible missed rows. */
  ignoredLines: { page: number; text: string; reason: string }[];
  pageCount: number;
  headerFound: boolean;
}

/* ------------------------------------------------------------------ */
/* 1. Lines and cells                                                  */
/* ------------------------------------------------------------------ */

export function groupIntoLines(items: readonly PdfTextItem[]): PdfLine[] {
  const byPage = new Map<number, PdfTextItem[]>();
  for (const it of items) byPage.set(it.page, [...(byPage.get(it.page) ?? []), it]);

  const lines: PdfLine[] = [];
  for (const page of Array.from(byPage.keys()).sort((a, b) => a - b)) {
    const sorted = [...byPage.get(page)!].sort((a, b) => b.y - a.y || a.x - b.x);
    const groups: PdfTextItem[][] = [];
    for (const it of sorted) {
      const g = groups[groups.length - 1];
      const ref = g?.[0];
      // Same line if baselines are within ~40% of the font size.
      if (g && ref && Math.abs(ref.y - it.y) <= Math.max(2, Math.min(ref.height, it.height) * 0.4)) g.push(it);
      else groups.push([it]);
    }
    for (const g of groups) {
      const parts = [...g].sort((a, b) => a.x - b.x);
      const cells: PdfCell[] = [];
      for (const p of parts) {
        const last = cells[cells.length - 1];
        const gap = last ? p.x - last.x1 : Infinity;
        const width = p.width > 0 ? p.width : p.text.length * p.height * 0.5;
        // A gap wider than ~a character or two starts a new cell (column). Overlapping
        // items are separate cells too: crowded headings often overrun each other.
        if (last && gap >= -1 && gap <= p.height * 0.9) {
          last.text += gap > p.height * 0.12 ? ` ${p.text}` : p.text;
          last.x1 = Math.max(last.x1, p.x + width);
        } else {
          cells.push({ x0: p.x, x1: p.x + width, text: p.text });
        }
      }
      lines.push({
        page,
        y: g[0]!.y,
        height: Math.max(...g.map((i) => i.height)),
        cells,
        text: cells.map((c) => c.text).join(" "),
      });
    }
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/* 2. Header                                                           */
/* ------------------------------------------------------------------ */

function headerRole(raw: string): StatementColumnRole | null {
  const h = raw.toLowerCase().replace(/[^a-z/ ]+/g, " ").replace(/\s+/g, " ").trim();
  if (!h) return null;
  if (/^(value|val) ?(date|dt)$/.test(h)) return "valueDate";
  if (/^(txn|tran|transaction|posting|post|book)? ?(date|dt)$/.test(h)) return "date";
  if (/(narration|description|particulars|details|remarks)/.test(h)) return "description";
  if (/(chq|cheque|ref|reference|utr)/.test(h)) return "ref";
  if (/balance/.test(h)) return "balance";
  if (/(withdrawal|debit|^dr$|paid out|money out)/.test(h) && !/credit/.test(h)) return "debit";
  if (/(deposit|credit|^cr$|paid in|money in)/.test(h) && !/debit/.test(h)) return "credit";
  if (/^(dr ?\/ ?cr|cr ?\/ ?dr|type)$/.test(h)) return "drcr";
  if (/amount|^amt/.test(h)) return "amount";
  return null;
}

interface HeaderColumn {
  role: StatementColumnRole;
  header: string;
  x0: number;
  x1: number;
}

function readHeader(line: PdfLine): HeaderColumn[] | null {
  const cols: HeaderColumn[] = [];
  for (const c of line.cells) {
    const role = headerRole(c.text);
    if (role && !cols.some((k) => k.role === role)) cols.push({ role, header: c.text, x0: c.x0, x1: c.x1 });
  }
  const roles = new Set(cols.map((c) => c.role));
  const hasMoney = roles.has("debit") || roles.has("credit") || roles.has("amount");
  return roles.has("date") && roles.has("description") && hasMoney ? cols : null;
}

/* ------------------------------------------------------------------ */
/* 3–4. Rows                                                           */
/* ------------------------------------------------------------------ */

// Amounts need paise or Indian/Western digit grouping, so reference numbers aren't read as money.
const AMOUNT_RE = /^(?:₹|rs\.?|inr)?\s*\(?-?(?:\d{1,3}(?:,\d{2,3})+|\d+)\.\d{2}\)?(?:\s*(cr|dr)\.?)?$/i;
const GROUPED_INT_RE = /^(?:₹|rs\.?|inr)?\s*\(?-?\d{1,3}(?:,\d{2,3})+\)?(?:\s*(cr|dr)\.?)?$/i;
const MARKER_RE = /^(cr|dr)\.?$/i;

function parseMoneyCell(text: string): { value: number; marker: "cr" | "dr" | null } | null {
  const t = text.trim();
  const m = AMOUNT_RE.exec(t) ?? GROUPED_INT_RE.exec(t);
  if (!m) return null;
  const marker = (m[1]?.toLowerCase() as "cr" | "dr" | undefined) ?? null;
  const negative = /\(|-/.test(t);
  const value = Number(t.replace(/(?:₹|rs\.?|inr|cr\.?|dr\.?|[(),\s])/gi, "").replace(/-/g, ""));
  if (!Number.isFinite(value)) return null;
  return { value: negative ? -value : value, marker };
}

/**
 * A plain whole number ("2000") is only accepted as money when it sits right
 * under a debit/credit/amount/balance heading — otherwise it could be a
 * reference number.
 */
function alignedInteger(cell: PdfCell, header: HeaderColumn[] | null): ReturnType<typeof parseMoneyCell> {
  if (!header || !/^\d{1,9}$/.test(cell.text.trim())) return null;
  const aligned = header.some(
    (c) =>
      (c.role === "debit" || c.role === "credit" || c.role === "amount" || c.role === "balance") &&
      Math.abs(c.x1 - cell.x1) <= 6
  );
  return aligned ? { value: Number(cell.text.trim()), marker: null } : null;
}

/** Leading date on a line: whole first cell, or the first 1–3 words of it. */
function leadingDate(line: PdfLine): { date: string; consumed: string } | null {
  const first = line.cells[0]?.text ?? "";
  const whole = parseStatementDate(first);
  if (whole) return { date: whole, consumed: first };
  const words = first.split(" ");
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    const cand = words.slice(0, n).join(" ");
    const d = parseStatementDate(cand);
    if (d) return { date: d, consumed: cand };
  }
  return null;
}

const STOP_RE = /(opening balance|closing balance|statement summary|total|page \d+|generated on|this is a computer|end of statement|carried forward|brought forward)/i;

interface RawRow {
  index: number;
  page: number;
  y: number;
  height: number;
  date: string;
  description: string[];
  amounts: { cell: PdfCell; value: number; marker: "cr" | "dr" | null }[];
}

function nearestColumn(cell: PdfCell, cols: HeaderColumn[], roles: StatementColumnRole[]): HeaderColumn | null {
  const candidates = cols.filter((c) => roles.includes(c.role));
  if (candidates.length === 0) return null;
  // Numbers are usually right-aligned under their heading: compare right edges and centres.
  let best: HeaderColumn | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const dist = Math.min(Math.abs(c.x1 - cell.x1), Math.abs((c.x0 + c.x1) / 2 - (cell.x0 + cell.x1) / 2));
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

export function parsePdfStatement(items: readonly PdfTextItem[], pageCount: number): PdfStatementResult {
  const lines = groupIntoLines(items);

  let header: HeaderColumn[] | null = null;
  let headerText = "";
  let openingBalance: number | null = null;
  let closingBalance: number | null = null;
  const ignoredLines: PdfStatementResult["ignoredLines"] = [];
  const raw: RawRow[] = [];
  let current: RawRow | null = null;

  for (const line of lines) {
    const h = readHeader(line);
    if (h) {
      // First header defines the columns; later identical headers (page repeats) are skipped.
      if (!header) {
        header = h;
        headerText = line.text;
      }
      current = null;
      continue;
    }

    if (/closing balance/i.test(line.text) && !leadingDate(line)) {
      const money = line.cells.map((c) => parseMoneyCell(c.text)).filter(Boolean);
      const last = money[money.length - 1];
      if (last) closingBalance = last.marker === "dr" ? -last.value : last.value;
      current = null;
      continue;
    }

    if (/opening balance/i.test(line.text)) {
      const money = line.cells.map((c) => parseMoneyCell(c.text)).filter(Boolean);
      const last = money[money.length - 1];
      if (last && openingBalance === null) openingBalance = last.marker === "dr" ? -last.value : last.value;
      current = null;
      continue;
    }

    const lead = leadingDate(line);
    const amounts = line.cells
      .map((cell) => ({ cell, parsed: parseMoneyCell(cell.text) ?? alignedInteger(cell, header) }))
      .filter((a): a is { cell: PdfCell; parsed: NonNullable<ReturnType<typeof parseMoneyCell>> } => a.parsed !== null)
      .map((a) => ({ cell: a.cell, value: a.parsed.value, marker: a.parsed.marker }));

    if (lead && amounts.length > 0 && !STOP_RE.test(line.text)) {
      // Standalone Dr/Cr cells attach to the nearest amount to their left.
      for (const c of line.cells) {
        const mk = MARKER_RE.exec(c.text.trim());
        if (!mk) continue;
        const left = [...amounts].reverse().find((a) => a.cell.x1 <= c.x0 + 1);
        if (left && !left.marker) left.marker = mk[1]!.toLowerCase() as "cr" | "dr";
      }
      const description = line.cells
        .filter((c) => !amounts.some((a) => a.cell === c) && !MARKER_RE.test(c.text.trim()))
        .filter((c) => {
          if (!header) return true;
          const col = columnOf(c, header);
          return col === null || col.role === "description";
        })
        .map((c, i) => (i === 0 && c === line.cells[0] ? c.text.slice(lead.consumed.length) : c.text))
        .map((t) => t.trim())
        .filter((t) => t && !parseStatementDate(t));
      current = { index: raw.length + 1, page: line.page, y: line.y, height: line.height, date: lead.date, description, amounts };
      raw.push(current);
      continue;
    }

    // Wrapped narration: dateless, amount-less text just below the previous row.
    if (
      current &&
      !lead &&
      amounts.length === 0 &&
      line.page === current.page &&
      current.y - line.y <= current.height * 3.2 &&
      !STOP_RE.test(line.text)
    ) {
      const extra = line.cells
        .filter((c) => !header || columnOf(c, header)?.role === "description" || columnOf(c, header) === null)
        .map((c) => c.text.trim())
        .filter(Boolean);
      if (extra.length) {
        current.description.push(...extra);
        current.y = line.y;
        continue;
      }
    }
    if (lead || amounts.length > 0) {
      ignoredLines.push({
        page: line.page,
        text: line.text,
        reason: lead && amounts.length === 0
          ? "has a date but no amount"
          : !lead && amounts.length > 0
            ? "has an amount but no leading date"
            : STOP_RE.test(line.text)
              ? "looks like a summary/footer line"
              : "not recognised",
      });
    }
    current = null;
  }

  return { ...resolveRows(raw, header, headerText, openingBalance, closingBalance, pageCount), ignoredLines };
}

/** Which header column a text cell falls under, by horizontal overlap/nearest start. */
function columnOf(cell: PdfCell, cols: HeaderColumn[]): HeaderColumn | null {
  const sorted = [...cols].sort((a, b) => a.x0 - b.x0);
  let found: HeaderColumn | null = null;
  for (const c of sorted) if (c.x0 <= cell.x0 + 2) found = c;
  return found ?? sorted[0] ?? null;
}

function resolveRows(
  raw: RawRow[],
  header: HeaderColumn[] | null,
  headerText: string,
  openingBalance: number | null,
  closingBalance: number | null,
  pageCount: number
): Omit<PdfStatementResult, "ignoredLines"> {
  let firstRowBalance: { balance: number; amount: number } | null = null;
  let lastRowBalance: number | null = null;
  const rows: NormalizedRow[] = [];
  const errors: RowError[] = [];
  const methods = { columns: 0, marker: 0, balance: 0 };
  const balanceCheck = { checked: 0, mismatched: 0 };
  const hasDirectionCols = !!header?.some((c) => c.role === "debit" || c.role === "credit");

  let prevBalance: number | null = openingBalance;

  for (const r of raw) {
    let amount: number | null = null;
    let balance: number | null = null;
    let method: keyof typeof methods | null = null;

    // Assign amounts to columns.
    let txAmounts = r.amounts;
    if (header) {
      const tagged = r.amounts.map((a) => ({ ...a, col: nearestColumn(a.cell, header!, ["debit", "credit", "amount", "balance"]) }));
      const bal = tagged.find((t) => t.col?.role === "balance");
      if (bal) balance = bal.marker === "dr" ? -Math.abs(bal.value) : bal.value;
      txAmounts = tagged.filter((t) => t !== bal);
      if (hasDirectionCols) {
        const debit = tagged.find((t) => t.col?.role === "debit" && t.value !== 0);
        const credit = tagged.find((t) => t.col?.role === "credit" && t.value !== 0);
        if (debit && credit) {
          errors.push({ line: r.index, message: `${fmtDate(r.date)}: has both a withdrawal and a deposit.` });
          if (balance !== null) prevBalance = balance;
          continue;
        }
        if (debit) (amount = -Math.abs(debit.value)), (method = "columns");
        else if (credit) (amount = Math.abs(credit.value)), (method = "columns");
      }
    } else if (r.amounts.length >= 2) {
      // No header: the last number on a row is conventionally the running balance.
      const last = r.amounts[r.amounts.length - 1]!;
      balance = last.marker === "dr" ? -Math.abs(last.value) : last.value;
      txAmounts = r.amounts.slice(0, -1);
    }

    const main = txAmounts.find((a) => a.value !== 0);
    if (amount === null && main) {
      if (main.marker) {
        amount = main.marker === "dr" ? -Math.abs(main.value) : Math.abs(main.value);
        method = "marker";
      } else if (main.value < 0) {
        amount = main.value;
        method = "marker";
      } else if (balance !== null && prevBalance !== null) {
        const diff = roundMoney(balance - prevBalance);
        if (Math.abs(Math.abs(diff) - main.value) < 0.01) {
          amount = diff;
          method = "balance";
        }
      }
    }

    // Cross-check with the running balance whenever we can.
    if (amount !== null && balance !== null && prevBalance !== null) {
      balanceCheck.checked++;
      if (Math.abs(roundMoney(prevBalance + amount) - balance) >= 0.01) {
        balanceCheck.mismatched++;
        // The balance is the stronger evidence when the size matches but the sign doesn't.
        const diff = roundMoney(balance - prevBalance);
        if (Math.abs(Math.abs(diff) - Math.abs(amount)) < 0.01) {
          amount = diff;
          method = "balance";
        }
      }
    }
    if (balance !== null) prevBalance = balance;
    if (balance !== null) {
      lastRowBalance = balance;
      if (!firstRowBalance && amount !== null && raw[0] === r) firstRowBalance = { balance, amount };
    }

    const description = r.description.join(" ").replace(/\s+/g, " ").trim();
    if (amount === null || amount === 0) {
      errors.push({
        line: r.index,
        message: main
          ? `${fmtDate(r.date)}: couldn't tell whether ${main.value.toLocaleString("en-IN")} was money in or out.`
          : `${fmtDate(r.date)}: no transaction amount found.`,
      });
      continue;
    }
    if (!description) {
      errors.push({ line: r.index, message: `${fmtDate(r.date)}: no description found.` });
      continue;
    }
    if (method) methods[method]++;
    rows.push({ line: r.index, date: r.date, description, merchant: "", amount: roundMoney(amount) });
  }

  const used = (Object.entries(methods) as [keyof typeof methods, number][]).filter(([, n]) => n > 0);
  const directionMethod: PdfStatementResult["directionMethod"] =
    used.length === 0 ? "none" : used.length === 1 ? used[0]![0] : "mixed";

  const extractedNet = roundMoney(rows.reduce((sum, r) => sum + r.amount, 0));
  const opening =
    openingBalance ?? (firstRowBalance ? roundMoney(firstRowBalance.balance - firstRowBalance.amount) : null);
  const closing = closingBalance ?? lastRowBalance;
  const expectedNet = opening !== null && closing !== null ? roundMoney(closing - opening) : null;
  const difference = expectedNet !== null ? roundMoney(extractedNet - expectedNet) : null;
  const reconciliation: Reconciliation = {
    status: difference === null ? "unavailable" : Math.abs(difference) < 0.01 ? "match" : "mismatch",
    opening,
    openingSource: openingBalance !== null ? "statement" : opening !== null ? "derived_from_first_row" : null,
    closing,
    closingSource: closingBalance !== null ? "statement" : closing !== null ? "last_row_balance" : null,
    extractedNet,
    expectedNet,
    difference,
  };

  return {
    reconciliation,
    rows,
    errors,
    detectedColumns: (header ?? []).map((c) => ({ role: c.role, header: c.header })),
    directionMethod,
    balanceCheck,
    pageCount,
    headerFound: !!header,
  };
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
