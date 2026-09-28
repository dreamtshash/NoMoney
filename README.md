# NoMoney

A personal-finance app for students and early earners in India. It shows where money went, what a purchase does to a goal, and how much can be spent today — using deterministic, explainable arithmetic. There is no AI, no chatbot and no bank login.

## Run it

```bash
npm install        # also copies the pdf.js worker into public/ (postinstall)
npm run dev        # http://localhost:3000
npm run build      # production build (also type-checks and lints)
npm run verify     # calculation + CSV import checks
npm run verify:pdf # PDF import checks (generates sample statements; needs Python + reportlab)

# Check how NoMoney reads YOUR statement, locally (nothing leaves your machine):
npm run inspect:statement -- test-statements/my-statement.pdf --rows [--lines] [--password XXXX]
```

Keep real statements in `test-statements/` — it is git-ignored. The inspector reports whether the PDF is text-based or scanned, the detected columns, rows detected/extracted/rejected, and whether opening balance + extracted rows = closing balance. Long digit runs (account/card numbers) are masked in its output and in everything NoMoney imports.

## Architecture

```
UI (app/*, components/*)
  → app state      lib/state      StoreProvider, reducer, actions, hooks
  → domain logic   lib/domain     pure functions, no React, no storage
  → repository     lib/data       NoMoneyRepository interface
  → storage        LocalStorageRepository today; a Supabase repository later
```

- **One copy of the data.** `StoreProvider` loads it once, every change goes through `dispatch(action)` → pure `reducer` → `repository.save()`. Pages never import mock data or touch `localStorage`.
- **One set of totals.** `buildMonthSnapshot()` produces income, expenses, surplus, budgets, receivables and the review count for a month; every page reads it through `useMonthSnapshot()`.
- **Swapping storage.** Implement `NoMoneyRepository` (`load`, `save`, `clear`, optional `subscribe`) and pass it to `<StoreProvider repository={...}>`.

### Folders

| Path | What's there |
| --- | --- |
| `lib/types/finance.ts` | The data model (transactions, budgets, goals, splits, daily plans, rules, settings) |
| `lib/domain/` | `ledger`, `budget`, `surplus`, `goals`, `tradeoff`, `splits`, `daily-plan`, `classification`, `transactions`, `snapshot` |
| `lib/import/` | CSV parser; PDF text extraction (`pdf-text.ts`, pdf.js) and statement parsing (`pdf-statement.ts`, pure); shared preview with rule classification and duplicate detection (`statement-import.ts`) |
| `lib/data/` | Repository interface, localStorage implementation, demo seed data |
| `lib/state/` | Store, reducer, actions, hooks |
| `components/ui/` | Primitives (buttons, dialogs, fields, amount input, toasts…) |
| `components/finance/` | Finance-specific components and dialogs |

## Money rules

- Amounts are signed: negative = money left your account.
- "Incoming" on the dashboard is earned income only. Other money that arrives (reimbursements, refunds, own-account transfers, unclassified) is shown separately and never counted as income.
- Income = `income` transactions only. Refunds reduce spending; reimbursements settle what friends owe; own-account transfers are never income or spending; `unknown` is excluded until reviewed.
- Spending = your share: a ₹3,000 bill split with two friends counts ₹1,000.
- Surplus = income − expenses. Unallocated = surplus − goal contributions.
- Goal safety target = target × multiplier (default 1.5). The actual target is never changed.

## PDF import

Text-based statement PDFs are parsed in the browser with pdf.js; nothing is uploaded.

1. Text items are regrouped into lines and cells by position.
2. A header row (Date / Narration / Withdrawal / Deposit / Balance, in many spellings) sets column positions; repeated page headers are skipped.
3. A transaction row is a dated line with at least one amount; dateless lines just below it continue its narration.
4. Money in/out comes from the column an amount sits under, else a Dr/Cr marker, else the change in running balance — and is cross-checked against the running balance.
5. Rows whose direction can't be determined are listed as skipped, never guessed.
6. The whole statement is reconciled: opening balance + every extracted row must equal the closing balance. A mismatch is shown before import, with the amount it's off by.
7. The preview lets you correct each row's type, category and importance, or exclude it, before importing. Each import is recorded (counts only, no file contents) and shown as "Last import". If no rows can be read, the import is refused with "Could not confidently detect transaction rows in this statement."

Password-protected PDFs prompt for the password (kept in memory only). Scanned/image PDFs are refused (no OCR).
Tested against generated HDFC-style, SBI-style, Dr/Cr-marker and balance-only layouts (`scripts/make-sample-pdfs.py`) — **not yet against real bank PDFs**.

## What's real and what isn't

Real: persistence in this browser; CRUD for transactions, budgets, goals, contributions, splits, payments, daily plans, rules and settings; CSV and text-PDF import with preview and duplicate detection; all calculations.

Authentication: not implemented. There is no Supabase project connected, so sign-in, Google login, password reset, logout and protected routes can't be built and tested honestly yet. Next step: create a Supabase project, add `@supabase/ssr`, a `SupabaseRepository` implementing `NoMoneyRepository` with row-level security keyed on `auth.uid()`, a login page, and middleware protecting the app routes.

Not built: OCR for scanned statements, live bank or Account Aggregator connections, user accounts/sign-in/logout/sync, managing accounts (the four demo accounts are fixed), multi-currency. Data lives in `localStorage`, so it's per browser and lost if site data is cleared (Import data → Export as JSON keeps a copy).
