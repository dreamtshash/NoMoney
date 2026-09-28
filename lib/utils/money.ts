/**
 * Money primitives shared by the input component, the importers and the
 * domain functions. Keeping parsing in one place means a malformed value can
 * never reach a calculation as NaN.
 */

/** Largest amount NoMoney accepts anywhere (₹100 crore). Protects layout and float precision. */
export const MAX_AMOUNT = 1_000_000_000;

/** Round to paise and normalise −0 to 0. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const r = Math.round(value * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

/** Treat any non-finite number as 0 so a bad value can't poison a total. */
export function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function sumBy<T>(items: readonly T[], pick: (item: T) => number): number {
  let total = 0;
  for (const item of items) total += safeNumber(pick(item));
  return roundMoney(total);
}

export type ParseAmountResult =
  | { ok: true; value: number }
  | { ok: false; reason: "empty" | "invalid" | "too_large" };

/**
 * Parse user- or file-supplied amount text. Accepts "1,23,456.50", "₹ 6000",
 * "(1,200)" (accounting negative), "-500", "500 CR"/"500 DR". Rejects anything else.
 */
export function parseAmount(raw: string): ParseAmountResult {
  let text = raw.trim();
  if (text === "") return { ok: false, reason: "empty" };

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  const drcr = /\s*(CR|DR)\.?$/i.exec(text);
  if (drcr) {
    if (drcr[1]?.toUpperCase() === "DR") negative = true;
    text = text.slice(0, drcr.index);
  }
  text = text.replace(/₹|INR|Rs\.?/gi, "").replace(/[\s,]/g, "");
  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(text)) return { ok: false, reason: "invalid" };

  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false, reason: "invalid" };
  if (value > MAX_AMOUNT) return { ok: false, reason: "too_large" };
  return { ok: true, value: roundMoney(negative ? -value : value) };
}
