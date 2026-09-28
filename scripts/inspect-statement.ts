/**
 * Inspect a real bank-statement PDF LOCALLY and report how NoMoney reads it.
 * Nothing is sent anywhere; long digit runs (account/card numbers) are masked in the output.
 *
 *   npm run inspect:statement -- path/to/statement.pdf [--password XXXX] [--rows] [--lines]
 *
 *   --rows   list every extracted transaction (masked) to compare against the PDF
 *   --lines  list raw lines with dates/amounts that were NOT used (possible missed rows)
 *
 * Keep real statements in ./test-statements/ — that folder is git-ignored.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { maskSensitiveNumbers as mask } from "@/lib/import/mask";
import { parsePdfStatement } from "@/lib/import/pdf-statement";
import { extractPdfTextItems, PdfTextError, type PdfjsLike } from "@/lib/import/pdf-text";

const require = createRequire(import.meta.url);
// pdf.js logs a harmless warning about the optional "canvas" package on load; keep the report clean.
const realLog = console.log;
console.log = () => undefined;
const pdfjs = require("pdfjs-dist/legacy/build/pdf.js") as PdfjsLike & { GlobalWorkerOptions: { workerSrc: string } };
console.log = realLog;
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/legacy/build/pdf.worker.js");

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--password");
const pwIndex = args.indexOf("--password");
const password = pwIndex >= 0 ? args[pwIndex + 1] : undefined;
const showRows = args.includes("--rows");
const showLines = args.includes("--lines");

const inr = (n: number | null) =>
  n === null ? "—" : `${n < 0 ? "-" : ""}₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function main() {
  if (!file) {
    console.error("Usage: npm run inspect:statement -- <statement.pdf> [--password XXXX] [--rows] [--lines]");
    process.exit(2);
  }
  const bytes = readFileSync(file);
  console.log(`\nFile: ${path.basename(file)} (${(bytes.length / 1024).toFixed(0)} KB)`);
  if (bytes.subarray(0, 5).toString() !== "%PDF-") {
    console.log("Not a PDF (missing %PDF- signature).");
    process.exit(1);
  }

  let extracted;
  try {
    extracted = await extractPdfTextItems(bytes, pdfjs, { password });
  } catch (e) {
    if (e instanceof PdfTextError) {
      console.log(`Could not open: ${e.message}${e.code === "password_required" ? " Re-run with --password <password>." : ""}`);
      process.exit(1);
    }
    throw e;
  }
  const { items, pageCount } = extracted;
  const perPage = new Map<number, number>();
  for (const it of items) perPage.set(it.page, (perPage.get(it.page) ?? 0) + 1);
  const emptyPages = Array.from({ length: pageCount }, (_, i) => i + 1).filter((p) => !perPage.get(p));

  console.log(`Pages: ${pageCount}   Text items: ${items.length}`);
  console.log(
    items.length === 0
      ? "Document type: SCANNED/IMAGE-ONLY (no text layer). NoMoney can't read this without OCR."
      : emptyPages.length
        ? `Document type: text-based, but pages ${emptyPages.join(", ")} have no text (scanned pages?).`
        : "Document type: text-based (every page has a text layer). OCR not needed."
  );
  if (items.length === 0) process.exit(1);

  const r = parsePdfStatement(items, pageCount);
  console.log(`\nHeader row: ${r.headerFound ? "found" : "NOT found (layout inferred per line)"}`);
  if (r.detectedColumns.length) console.log(`Columns: ${r.detectedColumns.map((c) => `${c.role}="${c.header}"`).join(", ")}`);
  console.log(`Money in/out decided by: ${r.directionMethod}`);

  const detected = r.rows.length + r.errors.length;
  console.log(`\nTransaction rows detected: ${detected}`);
  console.log(`  extracted:  ${r.rows.length}`);
  console.log(`  rejected:   ${r.errors.length}`);
  console.log(`  money in:   ${r.rows.filter((x) => x.amount > 0).length} rows, ${inr(r.rows.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0))}`);
  console.log(`  money out:  ${r.rows.filter((x) => x.amount < 0).length} rows, ${inr(r.rows.filter((x) => x.amount < 0).reduce((s, x) => s + x.amount, 0))}`);
  if (r.rows.length) {
    const dates = r.rows.map((x) => x.date).sort();
    console.log(`  date range: ${dates[0]} to ${dates[dates.length - 1]}`);
  }
  console.log(`Row-by-row balance check: ${r.balanceCheck.checked} checked, ${r.balanceCheck.mismatched} disagreed (direction corrected from balance)`);

  const rec = r.reconciliation;
  console.log(`\nWhole-statement reconciliation: ${rec.status.toUpperCase()}`);
  console.log(`  opening balance: ${inr(rec.opening)} (${rec.openingSource ?? "not found"})`);
  console.log(`  closing balance: ${inr(rec.closing)} (${rec.closingSource ?? "not found"})`);
  console.log(`  expected change: ${inr(rec.expectedNet)}   extracted change: ${inr(rec.extractedNet)}   difference: ${inr(rec.difference)}`);
  if (rec.openingSource === "derived_from_first_row" && rec.closingSource === "last_row_balance") {
    console.log("  note: both ends came from row balances, so this checks the rows between them, not rows before the first/after the last.");
  }

  if (r.errors.length) {
    console.log("\nRejected rows:");
    for (const e of r.errors) console.log(`  #${e.line}: ${mask(e.message)}`);
  }
  if (r.ignoredLines.length) {
    console.log(`\nLines with a date or amount that were not used: ${r.ignoredLines.length}${showLines ? "" : " (use --lines to list)"}`);
    if (showLines) for (const l of r.ignoredLines) console.log(`  p${l.page} [${l.reason}] ${mask(l.text).slice(0, 110)}`);
  }
  if (showRows) {
    console.log("\nExtracted rows (compare against the PDF):");
    for (const x of r.rows) {
      console.log(
        `  #${String(x.line).padStart(3)} ${x.date}  ${(x.amount < 0 ? "DR " : "CR ") + inr(Math.abs(x.amount)).padStart(14)}  ${mask(x.description).slice(0, 70)}`
      );
    }
  }
  console.log("");
  process.exit(rec.status === "mismatch" || r.rows.length === 0 ? 1 : 0);
}

main();
