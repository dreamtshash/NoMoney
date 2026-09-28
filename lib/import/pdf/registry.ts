import type { PdfTextItem } from "@/lib/import/pdf-text";
import { parseCanaraStatement } from "@/lib/import/pdf/canara";
import type { CanaraParseResult } from "@/lib/import/pdf/canara/types";

/**
 * Registry of bank-specific PDF parsers, tried in order before falling back
 * to the generic layout-inference parser (pdf-statement.ts).
 *
 * To add another bank: write lib/import/pdf/<bank>/{detector,rows,classify,
 * validate,parser}.ts following the Canara module as a template, export a
 * `parse<Bank>Statement(items, pageCount): <Bank>ParseResult | null` that
 * returns null when the statement doesn't look like that bank, and add it
 * here. Each parser is self-contained and pure (no pdf.js, no UI).
 */
export type BankPdfParseResult = CanaraParseResult; // widen to a union as more banks are added

export interface BankPdfAdapter {
  bank: string;
  parse(items: readonly PdfTextItem[], pageCount: number): BankPdfParseResult | null;
}

export const BANK_PDF_ADAPTERS: BankPdfAdapter[] = [{ bank: "Canara Bank", parse: parseCanaraStatement }];

/** Tries each known bank adapter in turn; returns the first match. */
export function detectAndParseBankStatement(items: readonly PdfTextItem[], pageCount: number): BankPdfParseResult | null {
  for (const adapter of BANK_PDF_ADAPTERS) {
    const result = adapter.parse(items, pageCount);
    if (result) return result;
  }
  return null;
}
