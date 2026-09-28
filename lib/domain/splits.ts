import type { SettlementStatus, Split, SplitParticipant, Transaction } from "@/lib/types/finance";
import { roundMoney, sumBy } from "@/lib/utils/money";

/**
 * Split & Settle.
 *   cash paid      = |expense amount|
 *   receivable     = Σ participant shares
 *   personal cost  = cash paid − receivable      (see ledger.personalSpendingOf)
 *   remaining(p)   = share − Σ payments
 * Payments from friends are reimbursements, never income.
 */

export function participantPaid(p: SplitParticipant): number {
  return sumBy(p.payments, (x) => x.amount);
}

export function participantRemaining(p: SplitParticipant): number {
  return roundMoney(Math.max(0, p.share - participantPaid(p)));
}

export function participantStatus(p: SplitParticipant): SettlementStatus {
  const paid = participantPaid(p);
  if (paid <= 0) return "pending";
  if (paid >= p.share) return "settled";
  return "partial";
}

export function splitReceivable(split: Split): number {
  return sumBy(split.participants, (p) => p.share);
}

export function splitStatus(split: Split): SettlementStatus {
  const statuses = split.participants.map(participantStatus);
  if (statuses.length === 0 || statuses.every((s) => s === "settled")) return "settled";
  if (statuses.every((s) => s === "pending")) return "pending";
  return "partial";
}

export interface ReceivableLine {
  splitId: string;
  participantId: string;
  name: string;
  transactionId: string;
  description: string;
  date: string;
  share: number;
  paid: number;
  remaining: number;
  status: SettlementStatus;
}

export interface ReceivablesSummary {
  lines: ReceivableLine[];
  totalOwed: number;
  totalPaid: number;
  totalRemaining: number;
  /** Outstanding balance per person (by case-insensitive name). */
  byPerson: { name: string; remaining: number; count: number }[];
}

export function calculateReceivables(splits: readonly Split[], transactions: readonly Transaction[]): ReceivablesSummary {
  const txById = new Map(transactions.map((t) => [t.id, t]));
  const lines: ReceivableLine[] = [];
  for (const split of splits) {
    const tx = txById.get(split.transactionId);
    if (!tx) continue;
    for (const p of split.participants) {
      lines.push({
        splitId: split.id,
        participantId: p.id,
        name: p.name,
        transactionId: tx.id,
        description: tx.description,
        date: tx.date,
        share: p.share,
        paid: participantPaid(p),
        remaining: participantRemaining(p),
        status: participantStatus(p),
      });
    }
  }
  const people = new Map<string, { name: string; remaining: number; count: number }>();
  for (const l of lines) {
    if (l.remaining <= 0) continue;
    const key = l.name.trim().toLowerCase();
    const entry = people.get(key) ?? { name: l.name.trim(), remaining: 0, count: 0 };
    entry.remaining = roundMoney(entry.remaining + l.remaining);
    entry.count += 1;
    people.set(key, entry);
  }
  return {
    lines: lines.sort((a, b) => b.date.localeCompare(a.date)),
    totalOwed: sumBy(lines, (l) => l.share),
    totalPaid: sumBy(lines, (l) => Math.min(l.paid, l.share)),
    totalRemaining: sumBy(lines, (l) => l.remaining),
    byPerson: Array.from(people.values()).sort((a, b) => b.remaining - a.remaining),
  };
}

export interface SplitValidation {
  ok: boolean;
  errors: string[];
}

export function validateSplit(cashPaid: number, participants: { name: string; share: number | null }[]): SplitValidation {
  const errors: string[] = [];
  if (participants.length === 0) errors.push("Add at least one person.");
  participants.forEach((p, i) => {
    if (!p.name.trim()) errors.push(`Person ${i + 1}: enter a name.`);
    if (p.share === null || p.share <= 0) errors.push(`Person ${i + 1}: enter an amount greater than ₹0.`);
  });
  const total = sumBy(participants, (p) => p.share ?? 0);
  if (total >= cashPaid) errors.push("Others' shares must be less than what you paid — your own share has to be above ₹0.");
  return { ok: errors.length === 0, errors };
}
