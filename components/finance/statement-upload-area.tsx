"use client";

import { useRef, useState } from "react";
import { AlertCircle, FileUp, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { detectFormat, MAX_STATEMENT_BYTES, type StatementFormat } from "@/lib/import/statement-import";
import { cn } from "@/lib/utils/cn";

interface StatementUploadAreaProps {
  onFileAccepted: (file: File, format: StatementFormat) => void;
  disabled?: boolean;
}

/**
 * Drop zone for bank statements. Checks extension/type and size only, then
 * hands the File and its detected format to the caller. It never reads or
 * pretends to parse the file itself.
 */
export function StatementUploadArea({ onFileAccepted, disabled }: StatementUploadAreaProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File | undefined, expected?: StatementFormat) {
    if (!file) return;
    const format = detectFormat(file);
    if (!format) {
      setError(`"${file.name}" isn't a CSV or PDF file.`);
      return;
    }
    if (expected && format !== expected) {
      setError(`"${file.name}" is a ${format.toUpperCase()} file, not ${expected.toUpperCase()}. Use the other button.`);
      return;
    }
    if (file.size === 0) {
      setError(`"${file.name}" is empty.`);
      return;
    }
    if (file.size > MAX_STATEMENT_BYTES) {
      setError(`"${file.name}" is larger than ${Math.round(MAX_STATEMENT_BYTES / 1024 / 1024)} MB.`);
      return;
    }
    setError(null);
    onFileAccepted(file, format);
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (disabled) return;
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
          isDragging ? "border-accent bg-accent/5" : "border-border bg-secondary/30",
          disabled && "opacity-60"
        )}
      >
        <UploadCloud className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Drop a bank statement here, or choose a file</p>
          <p className="text-xs text-muted-foreground">CSV or PDF, up to {Math.round(MAX_STATEMENT_BYTES / 1024 / 1024)} MB</p>
        </div>
        {(["csv", "pdf"] as const).map((fmt) => (
          <input
            key={fmt}
            ref={fmt === "csv" ? csvRef : pdfRef}
            type="file"
            accept={fmt === "csv" ? ".csv,text/csv" : ".pdf,application/pdf"}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            disabled={disabled}
            onChange={(e) => {
              handleFile(e.target.files?.[0], fmt);
              e.target.value = "";
            }}
          />
        ))}
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => csvRef.current?.click()} disabled={disabled}>
            <FileUp className="h-3.5 w-3.5" aria-hidden="true" /> Upload CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => pdfRef.current?.click()} disabled={disabled}>
            <FileUp className="h-3.5 w-3.5" aria-hidden="true" /> Upload PDF
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}
    </div>
  );
}
