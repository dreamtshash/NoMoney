import { createSeedData } from "@/lib/data/seed";
import { buildCsvImportPreview, ImportError } from "@/lib/import/statement-import";
import { parseStatementDate } from "@/lib/import/normalize";

const data = createSeedData();
const csv = `HDFC BANK LTD
Account No: XXXXXX4821,,,,
Statement From: 01/10/26 To: 31/10/26,,,,

Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
01/10/26,"SALARY ACME CORP PAYROLL",REF1,01/10/26,,"32,000.00","40,000.00"
02/10/26,BESCOM ELECTRICITY,REF2,02/10/26,"1,210.00",,"38,790.00"
03/10/26,AMAZON PAY INDIA,REF3,03/10/26,"899.00",,"37,891.00"
03/10/26,AMAZON PAY INDIA,REF3,03/10/26,"899.00",,"37,891.00"
05/10/26,NEFT CR FROM PRIYA,REF4,05/10/26,,"750.00","38,641.00"
32/10/26,BROKEN ROW,REF5,,"10.00",,
06/10/26,UPI-SWIGGY-ORDER,REF6,06/10/26,"345.50",,"38,295.50"
`;
const p = buildCsvImportPreview({ text: csv, fileName: "hdfc.csv", accountId: "acc-bank", existing: data.transactions, rules: data.rules });
console.log("columns:", p.detectedColumns.map((c) => `${c.role}=${c.header}`).join(", "));
console.log({ total: p.totalRows, new: p.newCount, dup: p.duplicateCount, classified: p.classifiedCount, review: p.reviewCount, errors: p.errors });
for (const c of p.candidates) {
  const t = c.transaction;
  console.log(`  L${c.line} ${t.date} ${t.amount} ${t.type}/${t.category}/${t.importance} review=${t.needsReview} src=${t.classificationSource} dup=${c.duplicate}`);
}
// re-import against the result: everything should be duplicate
const again = buildCsvImportPreview({ text: csv, fileName: "hdfc.csv", accountId: "acc-bank", existing: [...data.transactions, ...p.candidates.filter((c) => !c.duplicate).map((c) => c.transaction)], rules: data.rules });
console.log("re-import new/dup:", again.newCount, again.duplicateCount);
for (const bad of ["", "hello,world\n1,2"]) {
  try { buildCsvImportPreview({ text: bad, fileName: "x.csv", accountId: "acc-bank", existing: [], rules: [] }); console.log("NO ERROR?!"); }
  catch (e) { console.log("error ok:", e instanceof ImportError, (e as Error).message.slice(0, 60)); }
}
console.log(["2026-09-01","01/09/2026","1-9-26","02 Sep 2026","02-Sep-2026","31/02/2026","2026-09-01 10:22:00"].map((d) => `${d}→${parseStatementDate(d)}`).join("  "));
const simple = "date,description,amount\n2026-10-10,Coffee,-250\n2026-10-11,Refund,250";
const s = buildCsvImportPreview({ text: simple, fileName: "s.csv", accountId: "acc-wallet", existing: [], rules: [] });
console.log("signed-amount csv:", s.candidates.map((c) => `${c.transaction.amount}:${c.transaction.type}`));
