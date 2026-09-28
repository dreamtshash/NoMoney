/**
 * PDF statement import checks, run in Node against sample statements:
 *   python3 scripts/make-sample-pdfs.py /tmp/pdfs   (needs reportlab)
 *   npx tsx --tsconfig tsconfig.json scripts/verify-pdf.ts /tmp/pdfs
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { buildPdfImportPreview, ImportError } from "@/lib/import/statement-import";
import { extractPdfTextItems, PdfTextError, type PdfjsLike } from "@/lib/import/pdf-text";
import { parsePdfStatement } from "@/lib/import/pdf-statement";

const require = createRequire(import.meta.url);
const realLog = console.log;
console.log = () => undefined; // silence pdf.js's optional-"canvas" warning on load
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfjs = require("pdfjs-dist/legacy/build/pdf.js") as PdfjsLike & { GlobalWorkerOptions: { workerSrc: string } };
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/legacy/build/pdf.worker.js");
console.log = realLog;

const dir = process.argv[2] ?? "/tmp/pdfs";
let failures = 0;
function check(name: string, ok: boolean, detail: unknown = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail !== "" ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
}

async function preview(file: string, password?: string) {
  const data = readFileSync(path.join(dir, file));
  const { items, pageCount } = await extractPdfTextItems(data, pdfjs, { password });
  return buildPdfImportPreview({ items, pageCount, fileName: file, accountId: "acc-bank", existing: [], rules: [] });
}

async function expectError(file: string, test: (e: unknown) => boolean, name: string, password?: string) {
  try {
    await preview(file, password);
    check(name, false, "no error thrown");
  } catch (e) {
    check(name, test(e), e instanceof Error ? e.message.slice(0, 110) : String(e));
  }
}

const summary = (p: Awaited<ReturnType<typeof preview>>) =>
  p.candidates.map((c) => `${c.transaction.date} ${c.transaction.amount} ${c.transaction.description}`);

async function main() {
  // HDFC-style, 2 pages, wrapped narrations, repeated header, withdrawal/deposit columns.
  const h = await preview("hdfc.pdf");
  const amts = h.candidates.map((c) => c.transaction.amount);
  check("hdfc: 10 rows over 2 pages", h.candidates.length === 10, h.candidates.length);
  check("hdfc: signs from columns", JSON.stringify(amts) === JSON.stringify([35000, -412, -2000, -1850.5, 1000, -12000, 899, -640, -10000, 112.4]), amts);
  check(
    "hdfc: mid-word wrap is joined with a space (can't know it was one word)",
    h.candidates[2]!.transaction.description === "ATW-XXXX1234-S1ANBG02-BANGAL ORE",
    h.candidates[2]!.transaction.description
  );
  check(
    "hdfc: wrapped narration joined, ref/value-date excluded",
    h.candidates[1]!.transaction.description === "UPI-SWIGGY-swiggy@icici-ORDER 88213 FOOD DELIVERY",
    h.candidates[1]!.transaction.description
  );
  check("hdfc: no row errors", h.errors.length === 0, h.errors);
  check("hdfc: balance cross-check clean", h.notes.some((n) => n.includes("agree with the running balance")), h.notes);
  check("hdfc: incoming is NOT auto-income", h.candidates.filter((c) => c.transaction.amount > 0).every((c) => c.transaction.type === "unknown"));
  check("hdfc: dates day-first", h.candidates[0]!.transaction.date === "2026-09-01" && h.candidates[9]!.transaction.date === "2026-09-25");

  // Re-import against itself → all duplicates.
  const data = readFileSync(path.join(dir, "hdfc.pdf"));
  const ex = await extractPdfTextItems(data, pdfjs);
  const again = buildPdfImportPreview({ ...ex, fileName: "hdfc.pdf", accountId: "acc-bank", existing: h.candidates.map((c) => c.transaction), rules: [] });
  check("hdfc: re-import → all duplicates", again.newCount === 0 && again.duplicateCount === 10, [again.newCount, again.duplicateCount]);

  // SBI-style: "1 Sep 2026" dates, Debit/Credit/Balance, landscape.
  const s = await preview("sbi.pdf");
  check("sbi: 4 rows with signs", JSON.stringify(s.candidates.map((c) => c.transaction.amount)) === "[30000,-245,-1320,500]", summary(s));

  // No header, Dr/Cr markers.
  const m = await preview("marker.pdf");
  check("marker: Dr/Cr → signs", JSON.stringify(m.candidates.map((c) => c.transaction.amount)) === "[-250,4000,-649]", summary(m));

  // Single Amount column, direction only from running balance (with opening balance).
  const b = await preview("balance.pdf");
  check("balance: direction from balance change", JSON.stringify(b.candidates.map((c) => c.transaction.amount)) === "[-1200,2000]", summary(b));

  // Whole-statement reconciliation.
  const hd = parsePdfStatement((await extractPdfTextItems(readFileSync(path.join(dir, "hdfc.pdf")), pdfjs)).items, 2);
  check("hdfc: reconciles opening + rows = closing", hd.reconciliation.status === "match" && hd.reconciliation.openingSource === "statement" && hd.reconciliation.closingSource === "statement", hd.reconciliation);
  check("hdfc: no ignored lines with dates/amounts", hd.ignoredLines.length === 0, hd.ignoredLines);
  const ia = await preview("int-amount.pdf");
  check("whole-number amount under Withdrawal column accepted; 12-digit ref not read as money", JSON.stringify(ia.candidates.map((c) => c.transaction.amount)) === "[-250,-2000,500]", ia.candidates.map((c) => c.transaction.amount));
  check("ref numbers masked in description (none here) / reconciled", ia.reconciliation?.status === "match", ia.reconciliation);
  const bad = await preview("bad-row.pdf");
  check("unreadable amount → row rejected, not guessed", bad.candidates.length === 2 && bad.errors.length === 1, [bad.candidates.length, bad.errors]);
  check("…and reconciliation flags the ₹2,000 gap", bad.reconciliation?.status === "mismatch" && bad.reconciliation.difference === 2000, bad.reconciliation);
  check("…and the preview says so", bad.notes.some((n) => n.startsWith("Doesn't reconcile")), bad.notes);

  // Masking.
  const masked = h.candidates.find((c) => c.transaction.description.startsWith("ATW"))!.transaction.description;
  check("card number in description masked", masked.startsWith("ATW-XXXX1234"), masked);

  // Password handling.
  await expectError("hdfc-locked.pdf", (e) => e instanceof PdfTextError && e.code === "password_required", "locked: asks for password");
  await expectError("hdfc-locked.pdf", (e) => e instanceof PdfTextError && e.code === "password_incorrect", "locked: wrong password", "nope");
  const unlocked = await preview("hdfc-locked.pdf", "DDMM1990");
  check("locked: right password → 10 rows", unlocked.candidates.length === 10, unlocked.candidates.length);

  // Honest failures.
  await expectError("letter.pdf", (e) => e instanceof ImportError && e.message.startsWith("Could not confidently detect"), "letter: refuses");
  await expectError("scanned.pdf", (e) => e instanceof ImportError && e.message.includes("no selectable text"), "scanned: refuses (no OCR)");
  await expectError("fake.pdf", (e) => e instanceof PdfTextError && e.code === "unreadable", "not-a-pdf: refuses");

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
