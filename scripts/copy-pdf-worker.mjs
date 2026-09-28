// Copies the pdf.js worker into /public so its version always matches the installed pdfjs-dist.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const src = require.resolve("pdfjs-dist/build/pdf.worker.min.js");
mkdirSync("public", { recursive: true });
copyFileSync(src, "public/pdf.worker.min.js");
console.log("Copied pdf.js worker to public/pdf.worker.min.js");
