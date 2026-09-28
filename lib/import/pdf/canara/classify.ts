import type { CanaraSuggestion } from "./types";

/**
 * Deterministic (no AI) first-pass classification for a Canara row.
 *
 * This only ever produces a SUGGESTION: `needsReview` stays true for every
 * row it touches, and an explicit merchant rule (set up by the user, in
 * Settings → Rules) always wins over this heuristic — see
 * statement-import.ts. The goal here is just to not waste the user's time on
 * the completely obvious cases (salary, refunds, interest) while refusing to
 * guess on ambiguous ones (a friend's UPI payment, a generic "TRANSFER").
 */

const SALARY_RE = /\bsalary\b|\bsal\s*(credit|cr)\b|payroll/i;
const INTEREST_RE = /\binterest\b|\bint\.?\s*credit\b|\bint\s*paid\b/i;
const REFUND_RE = /\brefund\b|\breversal\b|\bchargeback\b|\bcashback\b|\bcancell?ed\b.*order/i;
const REIMBURSEMENT_RE = /\breimburse(ment)?\b|\bsettlement\b|\bsettling\b|\bsplit\s*(bill|share|dinner|payment)\b/i;
const SELF_TRANSFER_RE =
  /\bself\s*transfer\b|\bown\s*a\/?c\b|\bown\s*account\b|\bto\s*own\s*a\/?c\b|\blinked\s*account\b|\bsweep\b|\bfd\s*(created|booked)\b|\bfixed\s*deposit\b|\brd\s*(created|instal)/i;

export function classifyIncoming(description: string): CanaraSuggestion {
  const d = description;
  if (SALARY_RE.test(d)) {
    return { type: "income", category: "income", importance: "unknown", confidence: 0.6, reason: "Particulars mention salary/payroll." };
  }
  if (INTEREST_RE.test(d)) {
    return { type: "income", category: "income", importance: "unknown", confidence: 0.55, reason: "Particulars mention interest credit." };
  }
  if (REFUND_RE.test(d)) {
    return { type: "refund", category: "unknown", importance: "unknown", confidence: 0.5, reason: "Particulars mention a refund/reversal/cashback." };
  }
  if (REIMBURSEMENT_RE.test(d)) {
    return { type: "reimbursement", category: "reimbursement", importance: "unknown", confidence: 0.45, reason: "Particulars mention a reimbursement/settlement." };
  }
  if (SELF_TRANSFER_RE.test(d)) {
    return { type: "transfer", category: "transfer", importance: "unknown", confidence: 0.5, reason: "Particulars suggest a transfer between the user's own accounts." };
  }
  // Deliberately NOT classified as income: could be a friend paying back, a
  // transfer from another own account, a refund with unusual wording, etc.
  return { type: "unknown", category: "unknown", importance: "unknown", confidence: 0, reason: "Incoming amount with no reliable signal of what it is." };
}

export function classifyOutgoing(description: string): CanaraSuggestion {
  const d = description;
  if (SELF_TRANSFER_RE.test(d)) {
    return { type: "transfer", category: "transfer", importance: "unknown", confidence: 0.5, reason: "Particulars suggest a transfer to the user's own account." };
  }
  // Almost every debit line on a bank statement is some kind of spend; default
  // to "expense" (matches NoMoney's existing CSV-import convention) rather
  // than "unknown", but still leave category/importance — and therefore
  // needsReview — for the user to fill in. Shared expenses are marked via the
  // Split feature after import, not guessed here.
  return { type: "expense", category: "unknown", importance: "unknown", confidence: 0.3, reason: "Outgoing amount; defaulted to expense pending category/importance." };
}

export function classifyCanaraRow(direction: "incoming" | "outgoing", description: string): CanaraSuggestion {
  return direction === "incoming" ? classifyIncoming(description) : classifyOutgoing(description);
}

// e.g. "UPI/CR/123456789012/RAHUL SHARMA/ICICI/Payment" → "RAHUL SHARMA". Capped
// at 3 words so it doesn't run on and swallow the rest of a joined multi-line
// Particulars value (which no longer has "/" separators between its lines).
const NAME_GROUP = "([A-Za-z][A-Za-z.&']{1,20}(?:[ ][A-Za-z][A-Za-z.&']{1,20}){0,2})";
const UPI_RE = new RegExp(`\\bUPI[\\/-](?:CR|DR)[\\/-]\\d{6,}[\\/-]${NAME_GROUP}(?:[\\/-]|\\s{2,}|$)`, "i");
const NEFT_IMPS_RE = new RegExp(`\\b(?:NEFT|IMPS)[\\/-][A-Z0-9]{4,}[\\/-]${NAME_GROUP}(?:[\\/-]|\\s{2,}|$)`, "i");

/**
 * Pulls a counterparty name out of a UPI/NEFT/IMPS reference when it's
 * confidently there. Returns "" rather than guessing — the original
 * particulars are always preserved separately as the description.
 */
export function extractCounterparty(description: string): string {
  const m = UPI_RE.exec(description) ?? NEFT_IMPS_RE.exec(description);
  return m?.[1]?.trim() ?? "";
}
