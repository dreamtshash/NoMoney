import type {
  CategoryId,
  ClassificationRule,
  Importance,
  Transaction,
  TransactionType,
} from "@/lib/types/finance";
import { typeUsesSpendingClassification } from "@/lib/domain/categories";

/**
 * Deterministic classification. No AI, no guessing:
 *  - A rule only fires on an explicit substring match the user (or the demo
 *    seed) wrote down, and should only exist for unambiguous merchants.
 *    "Amazon" or "UPI" must never get a rule — the same merchant can be
 *    groceries, a gift or electronics.
 *  - Anything no rule matches stays unknown and goes to the review queue.
 */

export interface RuleMatch {
  rule: ClassificationRule;
  type?: TransactionType;
  category: CategoryId;
  importance: Importance;
  confidence: number;
}

export function findMatchingRule(
  text: { merchant: string; description: string },
  rules: readonly ClassificationRule[]
): RuleMatch | null {
  const haystack = `${text.merchant} ${text.description}`.toLowerCase();
  // Longest (most specific) match wins, so "swiggy instamart" beats "swiggy".
  const hit = [...rules]
    .filter((r) => r.match.trim() && haystack.includes(r.match.trim().toLowerCase()))
    .sort((a, b) => b.match.length - a.match.length)[0];
  if (!hit) return null;
  return { rule: hit, type: hit.type, category: hit.category, importance: hit.importance, confidence: hit.confidence };
}

/** Whether a transaction has everything it needs to leave the review queue. */
export function isClassificationComplete(t: Pick<Transaction, "type" | "category" | "importance">): boolean {
  if (t.type === "unknown") return false;
  if (typeUsesSpendingClassification(t.type)) return t.category !== "unknown" && t.importance !== "unknown";
  return true;
}

export function reviewReasons(t: Transaction): string[] {
  const reasons: string[] = [];
  if (t.type === "unknown") reasons.push("Type not known — is this income, a refund, someone paying you back, or a transfer?");
  if (typeUsesSpendingClassification(t.type) && t.category === "unknown") reasons.push("No category");
  if (typeUsesSpendingClassification(t.type) && t.importance === "unknown") reasons.push("Importance not set");
  if (reasons.length === 0 && t.needsReview) reasons.push("Marked for review");
  return reasons;
}

export function reviewQueue(transactions: readonly Transaction[]): Transaction[] {
  return transactions.filter((t) => t.needsReview).sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * FNV-1a fingerprint of the fields a bank statement reliably repeats.
 * Two rows with the same account, date, amount and normalised description are
 * treated as the same transaction on import.
 */
export function computeTransactionHash(t: {
  accountId: string;
  date: string;
  amount: number;
  description: string;
}): string {
  const normalised = t.description.toLowerCase().replace(/\s+/g, " ").trim();
  const input = `${t.accountId}|${t.date}|${t.amount.toFixed(2)}|${normalised}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
