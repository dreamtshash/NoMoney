"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, History, Info, Lock, RotateCcw } from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import { StatementUploadArea } from "@/components/finance/statement-upload-area";
import { CategoryBadge, ImportanceBadge, ReviewBadge, TypeBadge } from "@/components/finance/badges";
import { Money } from "@/components/finance/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SimpleSelect } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { extractPdfTextItems, loadBrowserPdfjs, PdfTextError } from "@/lib/import/pdf-text";
import { downloadDebugExport, downloadTransactionsCsv } from "@/lib/import/export";
import {
  buildCsvImportPreview,
  buildPdfImportPreview,
  correctedTransaction,
  finalizeImport,
  ImportError,
  isPdfFile,
  type ImportPreview,
  type ImportSelection,
  type RowCorrection,
} from "@/lib/import/statement-import";
import { useStore } from "@/lib/state/store";
import { TypePicker } from "@/components/finance/type-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CATEGORY_META, IMPORTANCE_META, IMPORTANCE_ORDER, SPENDING_CATEGORIES, typeUsesSpendingClassification } from "@/lib/domain/categories";
import type { SpendingCategoryId, Transaction } from "@/lib/types/finance";
import { createId, nowIso } from "@/lib/utils/id";
import { formatCurrency, formatCurrencySigned, formatDate, formatShortDate } from "@/lib/utils/format";


type Stage =
  | { kind: "idle" }
  | { kind: "reading"; fileName: string; format: "csv" | "pdf" }
  | { kind: "error"; fileName: string; message: string }
  | { kind: "password"; file: File; wrong: boolean }
  | { kind: "preview"; preview: ImportPreview }
  | { kind: "done"; count: number; reviewCount: number; fileName: string; transactions: Transaction[] };

const ROLE_LABEL: Record<string, string> = {
  date: "Date",
  description: "Description",
  merchant: "Merchant",
  amount: "Amount",
  debit: "Debit",
  credit: "Credit",
  drcr: "Dr/Cr",
  valueDate: "Value date",
  ref: "Reference",
  balance: "Balance",
};

const PREVIEW_ROWS = 50;

export default function DataPage() {
  return (
    <AppShell
      title="Import data"
      description="Bring in transactions from a bank statement file. Everything stays in this browser."
    >
      <DataBody />
    </AppShell>
  );
}

function DataBody() {
  const { data, dispatch } = useStore();
  const toast = useToast();
  const [accountId, setAccountId] = React.useState<string>(data.accounts[0]?.id ?? "");
  const [stage, setStage] = React.useState<Stage>({ kind: "idle" });
  const [includeDuplicates, setIncludeDuplicates] = React.useState(false);

  async function handleFile(file: File, format: "csv" | "pdf", password?: string) {
    setIncludeDuplicates(false);
    setStage({ kind: "reading", fileName: file.name, format });
    try {
      let preview: ImportPreview;
      if (format === "pdf") {
        if (!(await isPdfFile(file))) {
          throw new ImportError("This file is named .pdf but isn't a PDF.");
        }
        const pdfjs = await loadBrowserPdfjs();
        const { items, pageCount } = await extractPdfTextItems(await file.arrayBuffer(), pdfjs, { password });
        preview = buildPdfImportPreview({
          items,
          pageCount,
          fileName: file.name,
          accountId,
          existing: data.transactions,
          rules: data.rules,
        });
      } else {
        preview = buildCsvImportPreview({
          text: await file.text(),
          fileName: file.name,
          accountId,
          existing: data.transactions,
          rules: data.rules,
        });
      }
      setStage({ kind: "preview", preview });
    } catch (e) {
      if (e instanceof PdfTextError && (e.code === "password_required" || e.code === "password_incorrect")) {
        setStage({ kind: "password", file, wrong: e.code === "password_incorrect" });
        return;
      }
      setStage({
        kind: "error",
        fileName: file.name,
        message:
          e instanceof ImportError || e instanceof PdfTextError
            ? e.message
            : format === "pdf"
              ? "The PDF couldn't be read. Try downloading the statement again, or use the CSV version."
              : "The file couldn't be read. Check that it's a CSV exported from your bank.",
      });
    }
  }

  function confirmImport(preview: ImportPreview, selection: ImportSelection) {
    const { transactions, record } = finalizeImport(preview, selection, { id: createId("imp"), importedAt: nowIso() });
    if (transactions.length === 0) return;
    dispatch({ type: "transactions/import", transactions, record });
    toast({
      tone: "success",
      title: `${transactions.length} ${transactions.length === 1 ? "transaction" : "transactions"} imported`,
      description: preview.fileName,
    });
    setStage({ kind: "done", count: transactions.length, reviewCount: record.needsReview, fileName: preview.fileName, transactions });
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nomoney-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const accountName = data.accounts.find((a) => a.id === accountId)?.name ?? "";

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* While reviewing a preview, it takes the full width so every column is visible. */}
      <div className={`space-y-6 ${stage.kind === "preview" ? "lg:col-span-3" : "lg:col-span-2"}`}>
        <Card>
          <CardHeaderRow title="Import financial statement" description="Files are read in your browser. Nothing is uploaded to a server, and NoMoney never asks for bank logins." />
          <CardContent className="space-y-4">
            <Field id="import-account" label="Which account is this statement for?" hint="Used for duplicate checks and to label the transactions.">
              {(aria) => (
                <SimpleSelect
                  {...aria}
                  value={accountId}
                  onValueChange={setAccountId}
                  disabled={stage.kind === "preview"}
                  options={data.accounts.map((a) => ({ value: a.id, label: a.name }))}
                />
              )}
            </Field>
            {(stage.kind === "idle" || stage.kind === "error" || stage.kind === "done") && (
              <StatementUploadArea onFileAccepted={(f, fmt) => handleFile(f, fmt)} disabled={!accountId} />
            )}
            {stage.kind === "reading" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" aria-hidden="true" />
                {stage.format === "pdf" ? `Extracting text from ${stage.fileName}…` : `Reading ${stage.fileName}…`}
              </p>
            )}
            {stage.kind === "password" && (
              <PasswordPrompt
                fileName={stage.file.name}
                wrong={stage.wrong}
                onSubmit={(pw) => handleFile(stage.file, "pdf", pw)}
                onCancel={() => setStage({ kind: "idle" })}
              />
            )}
            {stage.kind === "error" && (
              <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-destructive">Couldn&apos;t import {stage.fileName}</p>
                <p className="mt-1 text-foreground/80">{stage.message}</p>
                <Button className="mt-2" size="sm" variant="outline" onClick={() => setStage({ kind: "idle" })}>
                  Remove file
                </Button>
              </div>
            )}
            {stage.kind === "done" && (
              <div role="status" className="flex gap-3 rounded-md border border-success/30 bg-success/5 p-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                <div className="space-y-2">
                  <p className="font-medium">
                    Imported {stage.count} transactions from {stage.fileName}.
                  </p>
                  {stage.reviewCount > 0 && (
                    <p className="text-muted-foreground">
                      {stage.reviewCount} need a type, category or importance before they count in your totals.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {stage.reviewCount > 0 && (
                      <Button asChild size="sm">
                        <Link href="/transactions?review=1">Review {stage.reviewCount} now</Link>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadTransactionsCsv(stage.transactions, `${stage.fileName.replace(/\.[^.]+$/, "")}-imported.csv`)}
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export CSV
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setStage({ kind: "idle" })}>
                      Import another file
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {stage.kind === "preview" && (
          <PreviewCard
            key={stage.preview.fileName + stage.preview.candidates.length}
            preview={stage.preview}
            accountName={accountName}
            includeDuplicates={includeDuplicates}
            setIncludeDuplicates={setIncludeDuplicates}
            onCancel={() => setStage({ kind: "idle" })}
            onConfirm={(selection) => confirmImport(stage.preview, selection)}
          />
        )}
      </div>

      <div className={stage.kind === "preview" ? "hidden" : "space-y-6"}>
        <ImportHistory />
        <Card>
          <CardHeaderRow title="What's supported" />
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="flex items-center gap-2 font-medium">
                CSV statements <Badge variant="success">Available</Badge>
              </p>
              <p className="mt-1 text-muted-foreground">
                Needs a date column, a description or narration column, and either one amount column or separate
                withdrawal and deposit columns. Header rows with account details above the table are skipped.
              </p>
            </div>
            <div>
              <p className="flex items-center gap-2 font-medium">
                Canara Bank PDF statements <Badge variant="success">Available</Badge>
              </p>
              <p className="mt-1 text-muted-foreground">
                The Date / Particulars / Deposits / Withdrawals / Balance layout is read directly from its own five
                columns — deposits and withdrawals are never guessed from the description, and the Balance column is
                checked row-by-row and validated against the statement's opening/closing balance.
              </p>
            </div>
            <div>
              <p className="flex items-center gap-2 font-medium">
                Other PDF statements <Badge variant="success">Available</Badge>
              </p>
              <p className="mt-1 text-muted-foreground">
                Text-based PDFs downloaded from net banking, including password-protected ones. Rows are found from the
                table layout and checked against the running balance. Scanned (image) statements can&apos;t be read.
              </p>
            </div>
            <div>
              <p className="flex items-center gap-2 font-medium">
                Live bank connection <Badge variant="muted">Not available</Badge>
              </p>
              <p className="mt-1 text-muted-foreground">
                NoMoney never asks for bank logins. A future version may use India&apos;s Account Aggregator framework.
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeaderRow title="How imports are classified" />
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>A row is only classified automatically when it matches one of your merchant rules.</p>
            <p>
              Everything else is marked for review. Money coming in is not assumed to be income: it could be a refund, a
              friend paying you back or a transfer, so you decide.
            </p>
            <p>Rows already in NoMoney (same account, date, amount and description) are flagged as duplicates.</p>
            <Link className="text-accent underline-offset-4 hover:underline" href="/settings#rules">
              Manage merchant rules
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeaderRow title="Your data" />
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              {data.transactions.length} transactions are saved in this browser only. Clearing site data removes them.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={exportData}>
                <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export as JSON
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href="/settings#data">
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reset options
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PreviewCard({
  preview: p,
  accountName,
  includeDuplicates,
  setIncludeDuplicates,
  onCancel,
  onConfirm,
}: {
  preview: ImportPreview;
  accountName: string;
  includeDuplicates: boolean;
  setIncludeDuplicates: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: (selection: ImportSelection) => void;
}) {
  const [corrections, setCorrections] = React.useState<Record<string, RowCorrection>>({});
  const [excluded, setExcluded] = React.useState<Set<string>>(() => new Set());
  const [editing, setEditing] = React.useState<Transaction | null>(null);
  const [showAll, setShowAll] = React.useState(false);

  const selection: ImportSelection = { corrections, excluded, includeDuplicates };
  const rows = p.candidates.map((c) => ({ ...c, final: correctedTransaction(c.transaction, corrections[c.transaction.id]) }));
  const willImport = rows.filter((r) => (includeDuplicates || !r.duplicate) && !excluded.has(r.transaction.id));
  const reviewAfter = willImport.filter((r) => r.final.needsReview).length;
  const visible = showAll ? rows : rows.slice(0, PREVIEW_ROWS);
  const rec = p.reconciliation;
  const hasBalance = p.candidates.some((c) => c.transaction.balanceAfter != null);

  function toggle(id: string, on: boolean) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (on) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Card>
      <CardHeaderRow
        title={`Preview: ${p.fileName}`}
        description={`${p.bank ? `${p.bank} statement` : p.format.toUpperCase()} into ${accountName}. Nothing is saved until you confirm. Select a row's Edit button to correct it.`}
      />
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <dl className="grid grow grid-cols-2 gap-4 sm:grid-cols-5">
            <Count label="Rows detected" value={p.candidates.length + p.errors.length} />
            <Count label="Extracted" value={p.candidates.length} />
            <Count label="Rejected" value={p.errors.length} tone={p.errors.length > 0 ? "warning" : undefined} />
            <Count label="Duplicates" value={p.duplicateCount} tone={p.duplicateCount > 0 ? "warning" : undefined} />
            <Count label="Need review" value={reviewAfter} detail={`of ${willImport.length} to import`} />
          </dl>
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadTransactionsCsv(willImport.map((r) => r.final), `${p.fileName.replace(/\.[^.]+$/, "")}-import.csv`)}
              disabled={willImport.length === 0}
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadDebugExport(p, `${p.fileName.replace(/\.[^.]+$/, "")}-debug.json`)}
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" /> Raw JSON (debug)
            </Button>
          </div>
        </div>

        {rec && rec.status !== "unavailable" && (
          <div
            role="status"
            className={`flex gap-2 rounded-md border p-3 text-sm ${rec.status === "match" ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"}`}
          >
            {rec.status === "match" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            )}
            <div>
              <p className="font-medium">
                {rec.status === "match" ? "Statement reconciles" : "Statement doesn't reconcile"}
              </p>
              <p className="mt-0.5 text-foreground/80">
                Opening {formatCurrency(rec.opening ?? 0)} + extracted {formatCurrencySigned(rec.extractedNet)} ={" "}
                {formatCurrency((rec.opening ?? 0) + rec.extractedNet)}; statement closing balance {formatCurrency(rec.closing ?? 0)}.
                {rec.status === "mismatch" && ` Off by ${formatCurrency(Math.abs(rec.difference ?? 0))}. Check the rejected rows before importing.`}
              </p>
            </div>
          </div>
        )}

        {p.notes.length > 0 && (
          <ul className="space-y-1 rounded-md bg-secondary/60 p-3 text-xs text-muted-foreground">
            {p.notes.filter((n) => !n.startsWith("Reconciled") && !n.startsWith("Doesn't reconcile")).map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}

        {p.detectedColumns.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
            Columns detected:
            {p.detectedColumns.map((c) => (
              <Badge key={c.role} variant="outline">
                {ROLE_LABEL[c.role] ?? c.role}: {c.header}
              </Badge>
            ))}
          </div>
        )}

        {p.errors.length > 0 && (
          <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
            <p className="font-medium">
              {p.errors.length} {p.errors.length === 1 ? "row was" : "rows were"} rejected and won&apos;t be imported
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {p.errors.slice(0, 8).map((e) => (
                <li key={e.line}>
                  Row {e.line}: {e.message}
                </li>
              ))}
              {p.errors.length > 8 && <li>and {p.errors.length - 8} more</li>}
            </ul>
          </div>
        )}

        <div className="max-h-[28rem] overflow-auto rounded-md border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">
                  <span className="sr-only">Import</span>
                </th>
                <th scope="col" className="px-2 py-2 font-medium">Date</th>
                <th scope="col" className="px-2 py-2 font-medium">Description</th>
                <th scope="col" className="px-2 py-2 font-medium">Dr/Cr</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Amount</th>
                {hasBalance && <th scope="col" className="px-2 py-2 text-right font-medium">Balance</th>}
                <th scope="col" className="px-2 py-2 font-medium">Type</th>
                <th scope="col" className="px-2 py-2 font-medium">Category</th>
                <th scope="col" className="px-2 py-2 font-medium">Importance</th>
                <th scope="col" className="px-2 py-2 font-medium">Status</th>
                <th scope="col" className="px-2 py-2 font-medium">
                  <span className="sr-only">Edit</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const t = r.final;
                const skippedDup = r.duplicate && !includeDuplicates;
                const isIn = !excluded.has(t.id) && !skippedDup;
                const uses = typeUsesSpendingClassification(t.type);
                return (
                  <tr key={t.id} className={`border-b border-border/70 last:border-0 ${isIn ? "" : "opacity-50"}`}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[hsl(var(--primary))]"
                        aria-label={`Import ${t.description} on ${formatShortDate(t.date)}`}
                        checked={isIn}
                        disabled={!!skippedDup}
                        onChange={(e) => toggle(t.id, e.target.checked)}
                      />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">{formatShortDate(t.date)}</td>
                    <td className="max-w-[14rem] truncate px-2 py-2" title={t.description}>
                      {t.description}
                    </td>
                    <td className="px-2 py-2 text-xs font-medium">{t.amount < 0 ? "Debit" : "Credit"}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">
                      <Money amount={Math.abs(t.amount)} className={t.amount > 0 ? "text-success" : ""} />
                    </td>
                    {hasBalance && (
                      <td className="whitespace-nowrap px-2 py-2 text-right text-muted-foreground">
                        {t.balanceAfter != null ? formatCurrency(t.balanceAfter) : "—"}
                        {t.importWarnings?.length ? (
                          <AlertTriangle
                            className="ml-1 inline h-3 w-3 text-warning"
                            aria-hidden="true"
                            title={t.importWarnings.join(" ")}
                          />
                        ) : null}
                      </td>
                    )}
                    <td className="px-2 py-2"><TypeBadge type={t.type} /></td>
                    <td className="px-2 py-2">{uses ? <CategoryBadge category={t.category} /> : <span className="text-xs text-muted-foreground">—</span>}</td>
                    <td className="px-2 py-2">{uses ? <ImportanceBadge importance={t.importance} /> : <span className="text-xs text-muted-foreground">—</span>}</td>
                    <td className="px-2 py-2">
                      {r.duplicate ? (
                        <Badge variant="warning">{r.duplicate === "existing" ? "Already imported" : "Repeated in file"}</Badge>
                      ) : t.needsReview ? (
                        <ReviewBadge />
                      ) : (
                        <Badge variant="success">{corrections[t.id] ? "Corrected" : "Classified"}</Badge>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(t)} aria-label={`Edit ${t.description}`}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length > PREVIEW_ROWS && (
          <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? `Show first ${PREVIEW_ROWS}` : `Show all ${rows.length} rows`}
          </Button>
        )}

        {p.duplicateCount > 0 && (
          <Checkbox
            checked={includeDuplicates}
            onCheckedChange={setIncludeDuplicates}
            label={`Import the ${p.duplicateCount} duplicates too`}
            description="Only if you're sure they're separate transactions (e.g. two identical tea purchases on the same day)."
          />
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          {excluded.size > 0 && (
            <p className="text-xs text-muted-foreground sm:mr-auto">{excluded.size} excluded by you.</p>
          )}
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(selection)} disabled={willImport.length === 0}>
            {willImport.length === 0
              ? "Nothing new to import"
              : `Import ${willImport.length} ${willImport.length === 1 ? "transaction" : "transactions"}`}
          </Button>
        </div>
      </CardContent>

      <RowEditDialog
        transaction={editing}
        onClose={() => setEditing(null)}
        onSave={(c) => {
          if (editing) setCorrections((prev) => ({ ...prev, [editing.id]: c }));
          setEditing(null);
        }}
      />
    </Card>
  );
}

function RowEditDialog({
  transaction: t,
  onClose,
  onSave,
}: {
  transaction: Transaction | null;
  onClose: () => void;
  onSave: (c: RowCorrection) => void;
}) {
  const [type, setType] = React.useState<Transaction["type"]>("unknown");
  const [category, setCategory] = React.useState<Transaction["category"]>("unknown");
  const [importance, setImportance] = React.useState<Transaction["importance"]>("unknown");
  React.useEffect(() => {
    if (!t) return;
    setType(t.type);
    setCategory(t.category);
    setImportance(t.importance);
  }, [t]);
  if (!t) return null;
  const uses = typeUsesSpendingClassification(type);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Correct before import</DialogTitle>
          <DialogDescription>
            {t.description}, {formatShortDate(t.date)}, {formatCurrencySigned(t.amount)}
          </DialogDescription>
        </DialogHeader>
        <TypePicker id="row-type" value={type} onChange={setType} direction={t.amount < 0 ? "out" : "in"} />
        {uses && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="row-category" label="Category">
              {(aria) => (
                <SimpleSelect
                  {...aria}
                  value={CATEGORY_META[category]?.kind === "spending" ? (category as SpendingCategoryId) : "unknown"}
                  onValueChange={(v) => setCategory(v)}
                  options={SPENDING_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_META[c].label }))}
                />
              )}
            </Field>
            <Field id="row-importance" label="Importance">
              {(aria) => (
                <SimpleSelect
                  {...aria}
                  value={importance}
                  onValueChange={setImportance}
                  options={IMPORTANCE_ORDER.map((i) => ({ value: i, label: IMPORTANCE_META[i].label }))}
                />
              )}
            </Field>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Unknown values stay in the review queue after import. Nothing is guessed for you.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave({ type, category, importance })}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Count({ label, value, detail, tone }: { label: string; value: number; detail?: string; tone?: "warning" }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`money text-xl font-semibold ${tone === "warning" ? "text-warning" : ""}`}>{value}</dd>
      {detail && <dd className="text-xs text-muted-foreground">{detail}</dd>}
    </div>
  );
}

function PasswordPrompt({
  fileName,
  wrong,
  onSubmit,
  onCancel,
}: {
  fileName: string;
  wrong: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}) {
  const [pw, setPw] = React.useState("");
  const [err, setErr] = React.useState<string | undefined>();
  return (
    <form
      noValidate
      className="space-y-3 rounded-md border border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pw) return setErr("Enter the statement password.");
        onSubmit(pw);
      }}
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        <Lock className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> {fileName} is password-protected
      </p>
      <Field
        id="pdf-password"
        label="Statement password"
        error={err ?? (wrong ? "That password didn't open the PDF." : undefined)}
        hint="Banks often use a mix of your name and date of birth. It's only used in this browser and isn't saved."
      >
        {(aria) => (
          <Input
            {...aria}
            type="password"
            autoComplete="off"
            autoFocus
            value={pw}
            onChange={(e) => {
              setPw(e.target.value);
              setErr(undefined);
            }}
          />
        )}
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" type="submit">
          Open PDF
        </Button>
      </div>
    </form>
  );
}

function ImportHistory() {
  const { data } = useStore();
  const imports = data.imports ?? [];
  const last = imports[0];
  const accountName = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? "Unknown account";
  return (
    <Card>
      <CardHeaderRow title="Last import" />
      <CardContent className="space-y-3 text-sm">
        {!last ? (
          <p className="text-muted-foreground">No statements imported yet.</p>
        ) : (
          <>
            <div>
              <p className="truncate font-medium" title={last.fileName}>
                {last.fileName}
              </p>
              <p className="text-xs text-muted-foreground">
                {last.bank ?? last.format.toUpperCase()} into {accountName(last.accountId)},{" "}
                {new Date(last.importedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {[
                ["Rows detected", last.detected],
                ["Imported", last.imported],
                ["Duplicates skipped", last.duplicatesSkipped],
                ["Excluded by you", last.excludedByUser],
                ["Needs review", last.needsReview],
                ["Rejected (errors)", last.rejected],
                ...(last.balanceWarnings ? [["Balance warnings", last.balanceWarnings] as [string, number]] : []),
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="money font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            {last.reconciliation && last.reconciliation !== "unavailable" && (
              <p className={`text-xs ${last.reconciliation === "match" ? "text-success" : "text-destructive"}`}>
                {last.reconciliation === "match" ? "Balances reconciled." : "Balances did not reconcile."}
              </p>
            )}
            {imports.length > 1 && (
              <details className="text-xs">
                <summary className="flex cursor-pointer items-center gap-1 text-muted-foreground">
                  <History className="h-3.5 w-3.5" aria-hidden="true" /> {imports.length - 1} earlier{" "}
                  {imports.length - 1 === 1 ? "import" : "imports"}
                </summary>
                <ul className="mt-2 space-y-1">
                  {imports.slice(1, 10).map((r) => (
                    <li key={r.id} className="flex justify-between gap-2">
                      <span className="truncate">{r.fileName}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {r.imported} on {formatDate(r.importedAt.slice(0, 10))}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
