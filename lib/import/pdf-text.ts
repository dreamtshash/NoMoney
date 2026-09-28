/**
 * PDF → positioned text items, using pdf.js. No parsing of statements here —
 * see pdf-statement.ts. Runs entirely in the browser; the file and any
 * password never leave the device.
 */

export interface PdfTextItem {
  page: number;
  /** Left edge, in PDF points. */
  x: number;
  /** Baseline, in PDF points (larger = higher on the page). */
  y: number;
  width: number;
  /** Font size estimate. */
  height: number;
  text: string;
}

export interface PdfTextResult {
  pageCount: number;
  items: PdfTextItem[];
}

export type PdfTextErrorCode = "password_required" | "password_incorrect" | "unreadable";

export class PdfTextError extends Error {
  constructor(
    public code: PdfTextErrorCode,
    message: string
  ) {
    super(message);
    this.name = "PdfTextError";
  }
}

/** Minimal slice of the pdf.js API we use, so the loader can be injected (browser vs Node tests). */
export interface PdfjsLike {
  getDocument(src: { data: Uint8Array; password?: string; isEvalSupported?: boolean }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{
        getTextContent(): Promise<{ items: unknown[] }>;
      }>;
      destroy(): Promise<void>;
    }>;
  };
}

export const MAX_PDF_PAGES = 60;

export async function extractPdfTextItems(
  data: ArrayBuffer | Uint8Array,
  pdfjs: PdfjsLike,
  options: { password?: string } = {}
): Promise<PdfTextResult> {
  // pdf.js takes ownership of (detaches) the buffer, so hand it a copy.
  const bytes = data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array(data.slice(0));
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: bytes, password: options.password, isEvalSupported: false }).promise;
  } catch (e) {
    const err = e as { name?: string; code?: number };
    if (err?.name === "PasswordException") {
      throw err.code === 2
        ? new PdfTextError("password_incorrect", "That password didn't open the PDF.")
        : new PdfTextError("password_required", "This PDF is password-protected.");
    }
    throw new PdfTextError("unreadable", "The PDF couldn't be opened. It may be damaged or not a real PDF.");
  }

  try {
    const items: PdfTextItem[] = [];
    const pages = Math.min(doc.numPages, MAX_PDF_PAGES);
    for (let n = 1; n <= pages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      for (const raw of content.items) {
        const it = raw as { str?: string; transform?: number[]; width?: number; height?: number };
        if (typeof it.str !== "string" || !it.transform) continue;
        const text = it.str.replace(/\s+/g, " ").trim();
        if (!text) continue;
        const [a = 0, b = 0, , d = 0, e = 0, f = 0] = it.transform;
        items.push({
          page: n,
          x: e,
          y: f,
          width: it.width ?? 0,
          height: it.height || Math.hypot(a, b) || Math.abs(d) || 10,
          text,
        });
      }
    }
    return { pageCount: doc.numPages, items };
  } finally {
    await doc.destroy().catch(() => undefined);
  }
}

/** Browser loader: pdf.js from the bundle, worker served from /public (same version). */
let cached: Promise<PdfjsLike> | null = null;
export function loadBrowserPdfjs(): Promise<PdfjsLike> {
  if (!cached) {
    cached = import("pdfjs-dist").then((mod) => {
      const lib = ((mod as unknown as { default?: unknown }).default ?? mod) as PdfjsLike & {
        GlobalWorkerOptions: { workerSrc: string };
      };
      lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
      return lib;
    });
  }
  return cached;
}
