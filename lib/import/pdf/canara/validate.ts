import { roundMoney } from "@/lib/utils/money";
import type { CanaraBalanceCheck, CanaraReconciliation, CanaraTransaction } from "./types";

const EPSILON = 0.01;

/**
 * Row-by-row balance validation: previousBalance + deposit − withdrawal ≈
 * balanceAfter. A mismatch never discards the row — it only flags it for
 * review, since it usually means a neighbouring row was misread rather than
 * that this one is wrong.
 */
export function validateRowBalances(rows: readonly CanaraTransaction[]): CanaraBalanceCheck {
  let checked = 0;
  let mismatched = 0;
  let prevBalance: number | null = null;

  for (const row of rows) {
    if (prevBalance !== null && row.balanceAfter !== null) {
      checked++;
      const expected = roundMoney(prevBalance + row.amount);
      if (Math.abs(expected - row.balanceAfter) >= EPSILON) {
        mismatched++;
        row.warnings.push(
          `Balance doesn't reconcile: expected ${expected.toLocaleString("en-IN")} after this transaction, statement shows ${row.balanceAfter.toLocaleString("en-IN")}.`
        );
        row.needsReview = true;
      }
    }
    if (row.balanceAfter !== null) prevBalance = row.balanceAfter;
  }
  return { checked, mismatched };
}

/**
 * Whole-statement reconciliation: opening balance + Σ(deposits) − Σ(withdrawals)
 * should equal the closing balance. This is the strongest signal that no rows
 * were missed or misread across the entire PDF.
 */
export function reconcileStatement(
  rows: readonly CanaraTransaction[],
  openingBalance: number | null,
  closingBalance: number | null
): CanaraReconciliation {
  const extractedNet = roundMoney(rows.reduce((sum, r) => sum + r.amount, 0));
  const firstWithBalance = rows.find((r) => r.balanceAfter !== null);
  const lastWithBalance = [...rows].reverse().find((r) => r.balanceAfter !== null);

  const opening = openingBalance ?? (firstWithBalance ? roundMoney(firstWithBalance.balanceAfter! - firstWithBalance.amount) : null);
  const closing = closingBalance ?? lastWithBalance?.balanceAfter ?? null;
  const expectedNet = opening !== null && closing !== null ? roundMoney(closing - opening) : null;
  const difference = expectedNet !== null ? roundMoney(extractedNet - expectedNet) : null;

  return {
    status: difference === null ? "unavailable" : Math.abs(difference) < EPSILON ? "match" : "mismatch",
    opening,
    openingSource: openingBalance !== null ? "statement" : opening !== null ? "derived_from_first_row" : null,
    closing,
    closingSource: closingBalance !== null ? "statement" : closing !== null ? "last_row_balance" : null,
    expectedNet,
    extractedNet,
    difference,
  };
}
