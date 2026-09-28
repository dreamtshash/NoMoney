/**
 * Masks long digit runs (account, card and reference numbers) so they are
 * never stored or shown in full: "50100123451234" → "XXXX1234".
 * Runs of 9+ digits are masked; shorter numbers (amounts, dates, short refs) are left alone.
 * Digits already partly masked by the bank ("512967XXXXXX1234") are normalised the same way.
 */
export function maskSensitiveNumbers(text: string): string {
  return text
    .replace(/\b\d{4,}X{2,}[\dX]*\d{4}\b/gi, (m) => `XXXX${m.slice(-4)}`)
    .replace(/\d{9,}/g, (m) => `XXXX${m.slice(-4)}`);
}
