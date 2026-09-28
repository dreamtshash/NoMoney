/**
 * Canara Bank importer checks, run in Node against a synthetic sample statement:
 *   python3 scripts/make-sample-pdfs.py .sample-pdfs   (needs reportlab)
 *   npx tsx --tsconfig tsconfig.json scripts/verify-canara.ts .sample-pdfs
 *
 * The sample (scripts/make-sample-pdfs.py → canara()) reproduces the exact
 * Date | Particulars | Deposits | Withdrawals | Balance layout, including:
 * multi-line wrapped Particulars (2 and 3 lines), a page break with a
 * repeated header, blank deposit/withdrawal cells, same-day duplicate
 * transactions, salary/refund/reimbursement/self-transfer/interest keywords,
 * an ambiguous large deposit, a friend's UPI payment (must NOT become
 * income), and one deliberately wrong balance cell to exercise reconciliation.
 *
 * This is a synthetic fixture, not a real Canara Bank PDF — see the note this
 * script prints at the end. Point `npm run inspect:statement` at a real
 * statement (kept in the git-ignored test-statements/ folder) to check it
 * directly; it never has to pass through this script.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { buildPdfImportPreview, finalizeImport } from "@/lib/import/statement-import";
import { extractPdfTextItems, type PdfjsLike } from "@/lib/import/pdf-text";
import { transactionsToCsv, buildDebugExport } from "@/lib/import/export";
import { parseCanaraStatement } from "@/lib/import/pdf/canara";

const require = createRequire(import.meta.url);
const realLog = console.log;
console.log = () => undefined; // silence pdf.js's optional-"canvas" warning on load
const pdfjs = require("pdfjs-dist/legacy/build/pdf.js") as PdfjsLike & { GlobalWorkerOptions: { workerSrc: string } };
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/legacy/build/pdf.worker.js");
console.log = realLog;

const dir = process.argv[2] ?? "/tmp/pdfs";
let failures = 0;
function check(name: string, ok: boolean, detail: unknown = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== "" ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
}

async function main() {
  const bytes = readFileSync(path.join(dir, "canara.pdf"));
  const { items, pageCount } = await extractPdfTextItems(bytes, pdfjs, {});

  // 1. The bank-specific parser directly, before it's wired into the shared pipeline.
  const raw = parseCanaraStatement(items, pageCount);
  check("detected as Canara Bank", !!raw, raw?.bank);
  if (!raw) {
    console.log(`${failures} check(s) failed.`);
    process.exitCode = 1;
    return;
  }
  check("all 5 columns detected", raw.columns.length === 5, raw.columns.map((c) => c.role));
  check("13 transactions, 0 rejected", raw.transactions.length === 13 && raw.rejectedRows === 0, {
    transactions: raw.transactions.length,
    rejected: raw.rejectedRows,
  });
  check("1 row-level balance warning (the deliberately wrong cell)", raw.balanceCheck.mismatched === 1, raw.balanceCheck);
  check("whole-statement reconciliation matches", raw.reconciliation.status === "match", raw.reconciliation);

  const wrapped2 = raw.transactions.find((t) => t.description.includes("SWIGGY"));
  check(
    "2-line wrapped Particulars joined into one transaction",
    wrapped2?.description === "UPI/DR/512345678901/SWIGGY BANGALORE ORDER 88213 FOOD DELIVERY PAYMENT",
    wrapped2?.description
  );
  const wrapped3 = raw.transactions.find((t) => t.description.includes("ABC STORE"));
  check(
    "3-line wrapped Particulars joined into one transaction",
    wrapped3?.description === "UPI/DR/512345677777/ABC STORE BENGALURU REF 123456",
    wrapped3?.description
  );
  const friend = raw.transactions.find((t) => t.description.includes("RAHUL SHARMA/ICICI"));
  check("a friend's UPI payment is NOT auto-classified as income", friend?.suggestion.type === "unknown", friend?.suggestion.type);
  const salary = raw.transactions.find((t) => t.description.startsWith("SALARY"));
  check("salary credit classified as income", salary?.suggestion.type === "income", salary?.suggestion.type);
  const refund = raw.transactions.find((t) => t.description.startsWith("REFUND"));
  check("refund classified as refund (not income)", refund?.suggestion.type === "refund", refund?.suggestion.type);
  const reimb = raw.transactions.find((t) => t.description.includes("REIMBURSEMENT"));
  check("reimbursement classified as reimbursement (not income)", reimb?.suggestion.type === "reimbursement", reimb?.suggestion.type);
  const selfTransfer = raw.transactions.find((t) => t.description.includes("OWN ACCOUNT"));
  check("self-transfer classified as transfer", selfTransfer?.suggestion.type === "transfer", selfTransfer?.suggestion.type);
  const bigAmbiguous = raw.transactions.find((t) => t.description.includes("CONSULTING FEE"));
  check("large ambiguous deposit NOT auto-classified as income", bigAmbiguous?.suggestion.type === "unknown", bigAmbiguous?.suggestion.type);
  const sameDay = raw.transactions.filter((t) => t.date === "2026-09-03");
  check("same-day multiple transactions both kept", sameDay.length === 2, sameDay.length);
  const decimalRow = raw.transactions.find((t) => t.description.includes("INTEREST"));
  check("decimal amount parsed exactly (118.35)", decimalRow?.amount === 118.35, decimalRow?.amount);
  const largeRow = raw.transactions.find((t) => t.description.includes("CONSULTING FEE"));
  check("large amount with double comma-grouping parsed exactly (1,25,000.00)", largeRow?.amount === 125000, largeRow?.amount);
  const mismatchRow = raw.transactions.find((t) => t.warnings.length > 0);
  check("balance-mismatch row is still included, just flagged", !!mismatchRow, mismatchRow?.warnings);

  // 2. Through the shared import pipeline (dedup, classification precedence, ImportRecord).
  const preview1 = buildPdfImportPreview({ items, pageCount, fileName: "canara.pdf", accountId: "acc-canara", existing: [], rules: [] });
  check("pipeline: bank = Canara Bank", preview1.bank === "Canara Bank");
  check("pipeline: 13 candidates", preview1.candidates.length === 13, preview1.candidates.length);
  check("pipeline: 1 in-file duplicate (identical same-day rows)", preview1.duplicateCount === 1, preview1.duplicateCount);
  check(
    "pipeline: every row still needsReview (a suggestion is never a confirmation)",
    preview1.candidates.every((c) => c.transaction.needsReview)
  );
  check(
    "pipeline: balanceAfter and sourcePage carried onto every Transaction",
    preview1.candidates.every((c) => c.transaction.balanceAfter != null && typeof c.transaction.sourcePage === "number")
  );

  const { transactions, record } = finalizeImport(
    preview1,
    { includeDuplicates: true, excluded: new Set(), corrections: {} },
    { id: "imp-canara-1", importedAt: new Date().toISOString() }
  );
  check("finalizeImport: 13 transactions saved", transactions.length === 13, transactions.length);
  check("ImportRecord carries bank + balanceWarnings", record.bank === "Canara Bank" && record.balanceWarnings === 1, record);

  // 3. Duplicate detection across imports: re-importing the same PDF into the same account.
  const preview2 = buildPdfImportPreview({ items, pageCount, fileName: "canara.pdf", accountId: "acc-canara", existing: transactions, rules: [] });
  check("re-import: 0 new transactions", preview2.newCount === 0, preview2.newCount);
  check("re-import: all 13 flagged as already-imported duplicates", preview2.duplicateCount === 13, preview2.duplicateCount);

  // 4. Export.
  const csvLines = transactionsToCsv(transactions).trim().split("\r\n");
  check("CSV: header + 13 data rows", csvLines.length === 14, csvLines.length);
  check(
    "CSV: header matches spec exactly",
    csvLines[0] === "Date,Particulars,Amount,Direction,Type,Category,Importance,Balance,Source Page,Needs Review"
  );
  const salaryLine = csvLines.find((l) => l.includes("SALARY"));
  check("CSV: salary row well-formed", !!salaryLine?.startsWith("2026-09-01,") && !!salaryLine?.includes(",35000,incoming,income,"), salaryLine);

  const debug = buildDebugExport(preview1);
  check("debug JSON: source = Canara Bank, all transactions present", debug.source === "Canara Bank" && debug.transactions.length === 13);
  check("debug JSON: balance-mismatch warning present", debug.transactions.some((t) => t.warnings.length > 0));

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
  console.log(
    "\nNote: this fixture is a synthetic reproduction of the Date/Particulars/Deposits/Withdrawals/Balance layout, " +
      "not a real Canara Bank statement. Run `npm run inspect:statement -- test-statements/<real file>.pdf --rows` " +
      "against the real PDF before relying on this for an actual account."
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
