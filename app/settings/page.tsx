"use client";

import * as React from "react";
import { Check, Plus, Trash2 } from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import { CategoryBadge, ImportanceBadge, TypeBadge } from "@/components/finance/badges";
import { AmountInput } from "@/components/ui/amount-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { SimpleSelect } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  categoryLabel,
  IMPORTANCE_META,
  IMPORTANCE_ORDER,
  SPENDING_CATEGORIES,
  systemCategoryFor,
  TRANSACTION_TYPE_META,
  typeUsesSpendingClassification,
} from "@/lib/domain/categories";
import { MAX_SAFETY_MULTIPLIER, MIN_SAFETY_MULTIPLIER } from "@/lib/domain/goals";
import { calculateSavingsPlan } from "@/lib/domain/surplus";
import { useStore } from "@/lib/state/store";
import type { Importance, Settings, SpendingCategoryId, TransactionType, UnusedDailyAction } from "@/lib/types/finance";
import { formatCurrency } from "@/lib/utils/format";
import { createId } from "@/lib/utils/id";

export default function SettingsPage() {
  return (
    <AppShell title="Settings" description="Your profile, how NoMoney calculates savings and daily plans, and your data.">
      <SettingsBody />
    </AppShell>
  );
}

function SettingsBody() {
  return (
    <div className="max-w-3xl space-y-6">
      <ProfileSection />
      <SavingsSection />
      <SurplusSection />
      <DailyPlanSection />
      <RulesSection />
      <DataSection />
    </div>
  );
}

/** Save/cancel bar shared by the editable sections. */
function SectionActions({ dirty, onSave, onCancel, saved }: { dirty: boolean; onSave: () => void; onCancel: () => void; saved: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
      {saved && !dirty && (
        <span className="mr-auto flex items-center gap-1 text-xs text-success" role="status">
          <Check className="h-3.5 w-3.5" aria-hidden="true" /> Saved
        </span>
      )}
      <Button variant="outline" size="sm" onClick={onCancel} disabled={!dirty}>
        Cancel
      </Button>
      <Button size="sm" type="submit" onClick={onSave} disabled={!dirty}>
        Save
      </Button>
    </div>
  );
}

/** Local draft of some settings fields, saved explicitly. */
function useSettingsDraft<K extends keyof Settings>(keys: readonly K[]) {
  const { data, dispatch } = useStore();
  const pick = React.useCallback(
    () => Object.fromEntries(keys.map((k) => [k, data.settings[k]])) as Pick<Settings, K>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.settings]
  );
  const [draft, setDraft] = React.useState(pick);
  const [saved, setSaved] = React.useState(false);
  const storedJson = JSON.stringify(pick());
  // Re-sync only when THESE fields change in the store (not when another section saves).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => setDraft(JSON.parse(storedJson) as Pick<Settings, K>), [storedJson]);
  const dirty = JSON.stringify(draft) !== storedJson;
  return {
    draft,
    set: <F extends K>(key: F, value: Pick<Settings, K>[F]) => {
      setSaved(false);
      setDraft((d) => ({ ...d, [key]: value }));
    },
    dirty,
    saved,
    save: () => {
      dispatch({ type: "settings/update", settings: draft });
      setSaved(true);
    },
    cancel: () => {
      setDraft(pick());
      setSaved(false);
    },
  };
}

function ProfileSection() {
  const d = useSettingsDraft(["displayName"] as const);
  const error = d.draft.displayName.trim().length > 60 ? "Keep it under 60 characters." : undefined;
  return (
    <Card id="profile" className="scroll-mt-20">
      <CardHeaderRow title="Profile" description="Only used to personalise the interface." />
      <CardContent>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!error) d.save();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="displayName" label="Your name" error={error} optional>
              {(aria) => (
                <Input {...aria} value={d.draft.displayName} maxLength={80} onChange={(e) => d.set("displayName", e.target.value)} />
              )}
            </Field>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Currency</p>
              <p className="flex h-9 items-center text-sm text-muted-foreground">Indian rupee (₹). Other currencies aren&apos;t supported yet.</p>
            </div>
          </div>
          <SectionActions dirty={d.dirty} saved={d.saved} onSave={() => undefined} onCancel={d.cancel} />
        </form>
      </CardContent>
    </Card>
  );
}

function SavingsSection() {
  const d = useSettingsDraft([
    "savingsPercent",
    "expectedMonthlyIncome",
    "additionalIncomeSavingsPercent",
    "defaultSafetyMultiplier",
  ] as const);
  const [nulls, setNulls] = React.useState<Record<string, boolean>>({});
  const errors = {
    savingsPercent: nulls.savingsPercent ? "Enter a percentage (0 is allowed)." : d.draft.savingsPercent > 100 ? "Use 0–100%." : undefined,
    additionalIncomeSavingsPercent: nulls.additionalIncomeSavingsPercent
      ? "Enter a percentage (0 is allowed)."
      : d.draft.additionalIncomeSavingsPercent > 100
        ? "Use 0–100%."
        : undefined,
    defaultSafetyMultiplier:
      nulls.defaultSafetyMultiplier ||
      d.draft.defaultSafetyMultiplier < MIN_SAFETY_MULTIPLIER ||
      d.draft.defaultSafetyMultiplier > MAX_SAFETY_MULTIPLIER
        ? `Use a value from ${MIN_SAFETY_MULTIPLIER} to ${MAX_SAFETY_MULTIPLIER}.`
        : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);

  function num<K extends "savingsPercent" | "expectedMonthlyIncome" | "additionalIncomeSavingsPercent" | "defaultSafetyMultiplier">(
    key: K,
    v: number | null
  ) {
    setNulls((n) => ({ ...n, [key]: v === null && key !== "expectedMonthlyIncome" }));
    d.set(key, (v ?? 0) as Settings[K]);
  }

  const example = calculateSavingsPlan(Math.max(d.draft.expectedMonthlyIncome, 0) + 5000, d.draft);

  return (
    <Card id="savings" className="scroll-mt-20">
      <CardHeaderRow title="Savings" description="How much of your incoming you aim to save, and the default cushion for new goals. Incoming here means earned income only; reimbursements, refunds and transfers never count." />
      <CardContent>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) d.save();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="savingsPercent" label="Save this share of incoming" error={errors.savingsPercent}>
              {(aria) => (
                <AmountInput {...aria} currency={false} suffix="%" decimals={0} max={100} value={nulls.savingsPercent ? null : d.draft.savingsPercent} onValueChange={(v) => num("savingsPercent", v)} />
              )}
            </Field>
            <Field
              id="expectedMonthlyIncome"
              label="Expected monthly incoming"
              optional
              hint="Leave empty if it varies. Then the percentage applies to all incoming."
            >
              {(aria) => (
                <AmountInput
                  {...aria}
                  decimals={0}
                  value={d.draft.expectedMonthlyIncome || null}
                  onValueChange={(v) => num("expectedMonthlyIncome", v)}
                  placeholder="Not set"
                />
              )}
            </Field>
            <Field
              id="additionalIncomeSavingsPercent"
              label="Save this share of additional incoming"
              error={errors.additionalIncomeSavingsPercent}
              hint={d.draft.expectedMonthlyIncome > 0 ? undefined : "Incoming above the expected amount. Only applies once that is set."}
            >
              {(aria) => (
                <AmountInput
                  {...aria}
                  currency={false}
                  suffix="%"
                  decimals={0}
                  max={100}
                  value={nulls.additionalIncomeSavingsPercent ? null : d.draft.additionalIncomeSavingsPercent}
                  onValueChange={(v) => num("additionalIncomeSavingsPercent", v)}
                />
              )}
            </Field>
            <Field
              id="defaultSafetyMultiplier"
              label="Default safety multiplier for new goals"
              error={errors.defaultSafetyMultiplier}
              hint="Safety target = target × multiplier. Existing goals keep their own."
            >
              {(aria) => (
                <AmountInput
                  {...aria}
                  currency={false}
                  suffix="×"
                  decimals={2}
                  max={MAX_SAFETY_MULTIPLIER}
                  value={nulls.defaultSafetyMultiplier ? null : d.draft.defaultSafetyMultiplier}
                  onValueChange={(v) => num("defaultSafetyMultiplier", v)}
                />
              )}
            </Field>
          </div>
          {!invalid && (
            <p className="rounded-md bg-secondary/60 p-3 text-xs text-muted-foreground">
              Example: with {formatCurrency(example.baseIncome + example.additionalIncome)} incoming, you&apos;d plan to save{" "}
              {formatCurrency(example.plannedSavings)}
              {d.draft.expectedMonthlyIncome > 0
                ? ` (${formatCurrency(example.baseSavings)} from expected incoming + ${formatCurrency(example.additionalSavings)} from the extra).`
                : "."}
            </p>
          )}
          <SectionActions
            dirty={d.dirty || Object.values(nulls).some(Boolean)}
            saved={d.saved}
            onSave={() => undefined}
            onCancel={() => {
              setNulls({});
              d.cancel();
            }}
          />
        </form>
      </CardContent>
    </Card>
  );
}

const PLANNABLE = SPENDING_CATEGORIES.filter((c) => c !== "unknown");

function DailyPlanSection() {
  const d = useSettingsDraft(["dailyPlanMode", "dailyPlanFixedAmount", "unusedDailyAction", "dailyPlanCategories"] as const);
  const errors = {
    fixed: d.draft.dailyPlanMode === "fixed" && d.draft.dailyPlanFixedAmount <= 0 ? "Enter a daily amount above ₹0." : undefined,
    categories: d.draft.dailyPlanCategories.length === 0 ? "Choose at least one category." : undefined,
  };
  const invalid = !!errors.fixed || !!errors.categories;

  function toggle(c: SpendingCategoryId, on: boolean) {
    const next = on
      ? PLANNABLE.filter((x) => x === c || d.draft.dailyPlanCategories.includes(x))
      : d.draft.dailyPlanCategories.filter((x) => x !== c);
    d.set("dailyPlanCategories", next);
  }

  return (
    <Card id="daily-plan" className="scroll-mt-20">
      <CardHeaderRow title="Plan a day" description="How the daily spending suggestion is worked out." />
      <CardContent>
        <form
          noValidate
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) d.save();
          }}
        >
          <div className="space-y-2">
            <p className="text-sm font-medium">Daily amount</p>
            <Segmented
              label="Daily amount"
              value={d.draft.dailyPlanMode}
              onChange={(v) => d.set("dailyPlanMode", v)}
              options={[
                { value: "budget", label: "From remaining budget" },
                { value: "fixed", label: "Fixed amount" },
              ]}
            />
            <p className="text-xs text-muted-foreground">
              {d.draft.dailyPlanMode === "budget"
                ? "What's left this month in the categories below, divided by the days remaining."
                : "The same amount every day, adjusted by yesterday's carry-over."}
            </p>
          </div>
          {d.draft.dailyPlanMode === "fixed" && (
            <Field id="dailyPlanFixedAmount" label="Fixed daily amount" error={errors.fixed} className="max-w-xs">
              {(aria) => (
                <AmountInput {...aria} decimals={0} value={d.draft.dailyPlanFixedAmount || null} onValueChange={(v) => d.set("dailyPlanFixedAmount", v ?? 0)} />
              )}
            </Field>
          )}
          <div className="space-y-2">
            <p className="text-sm font-medium">Money left unspent at the end of a day</p>
            <Segmented<UnusedDailyAction>
              label="Money left unspent"
              value={d.draft.unusedDailyAction}
              onChange={(v) => d.set("unusedDailyAction", v)}
              options={[
                { value: "carry_forward", label: "Carry forward" },
                { value: "split", label: "Half and half" },
                { value: "savings", label: "Save it" },
              ]}
            />
            <p className="text-xs text-muted-foreground">
              Overspending is always taken off the next day&apos;s suggestion, whatever you choose here.
            </p>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Categories to plan each day</legend>
            <p className="text-xs text-muted-foreground">Leave out fixed costs like rent and bills so they&apos;re never squeezed.</p>
            <div className="grid gap-2 pt-1 sm:grid-cols-3">
              {PLANNABLE.map((c) => (
                <Checkbox key={c} checked={d.draft.dailyPlanCategories.includes(c)} onCheckedChange={(v) => toggle(c, v)} label={categoryLabel(c)} />
              ))}
            </div>
            {errors.categories && <p className="text-xs text-destructive">{errors.categories}</p>}
          </fieldset>
          <SectionActions dirty={d.dirty} saved={d.saved} onSave={() => undefined} onCancel={d.cancel} />
        </form>
      </CardContent>
    </Card>
  );
}

const RULE_TYPES: TransactionType[] = ["expense", "income", "transfer", "refund", "reimbursement"];

function RulesSection() {
  const { data, dispatch } = useStore();
  const toast = useToast();
  const [adding, setAdding] = React.useState(false);
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const [match, setMatch] = React.useState("");
  const [type, setType] = React.useState<TransactionType>("expense");
  const [category, setCategory] = React.useState<SpendingCategoryId | undefined>();
  const [importance, setImportance] = React.useState<Importance | undefined>();
  const [errors, setErrors] = React.useState<{ match?: string; category?: string; importance?: string }>({});
  const uses = typeUsesSpendingClassification(type);

  function reset() {
    setMatch("");
    setType("expense");
    setCategory(undefined);
    setImportance(undefined);
    setErrors({});
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const m = match.trim().toLowerCase();
    const errs: typeof errors = {};
    if (m.length < 3) errs.match = "Use at least 3 characters so the rule doesn't match everything.";
    else if (data.rules.some((r) => r.match.toLowerCase() === m)) errs.match = "A rule for this text already exists.";
    if (uses && !category) errs.category = "Choose a category.";
    if (uses && !importance) errs.importance = "Choose an importance.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    dispatch({
      type: "rule/upsert",
      rule: {
        id: createId("rule"),
        match: m,
        type,
        category: uses ? category! : systemCategoryFor(type) ?? "unknown",
        importance: uses ? importance! : "unknown",
        confidence: 1,
      },
    });
    toast({ tone: "success", title: "Rule added", description: `Imports containing “${m}” will be classified automatically.` });
    reset();
    setAdding(false);
  }

  const ruleToDelete = data.rules.find((r) => r.id === deleting);

  return (
    <Card id="rules" className="scroll-mt-20">
      <CardHeaderRow
        title="Merchant rules"
        description="When an imported row's merchant or description contains this text, it's classified this way. Rules never guess."
        actions={
          !adding && (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add rule
            </Button>
          )
        }
      />
      <CardContent className="space-y-4">
        {adding && (
          <form noValidate onSubmit={submit} className="space-y-4 rounded-md border border-border p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="rule-match" label="Text to match" error={errors.match} hint="Not case-sensitive, e.g. “zepto”">
                {(aria) => <Input {...aria} value={match} maxLength={60} onChange={(e) => setMatch(e.target.value)} />}
              </Field>
              <Field id="rule-type" label="Type">
                {(aria) => (
                  <SimpleSelect
                    {...aria}
                    value={type}
                    onValueChange={setType}
                    options={RULE_TYPES.map((t) => ({ value: t, label: TRANSACTION_TYPE_META[t].label }))}
                  />
                )}
              </Field>
              {uses && (
                <>
                  <Field id="rule-category" label="Category" error={errors.category}>
                    {(aria) => (
                      <SimpleSelect
                        {...aria}
                        value={category}
                        onValueChange={setCategory}
                        placeholder="Choose"
                        options={PLANNABLE.map((c) => ({ value: c, label: categoryLabel(c) }))}
                      />
                    )}
                  </Field>
                  <Field id="rule-importance" label="Importance" error={errors.importance}>
                    {(aria) => (
                      <SimpleSelect
                        {...aria}
                        value={importance}
                        onValueChange={setImportance}
                        placeholder="Choose"
                        options={IMPORTANCE_ORDER.filter((i) => i !== "unknown").map((i) => ({ value: i, label: IMPORTANCE_META[i].label }))}
                      />
                    )}
                  </Field>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Avoid rules for marketplaces or payment apps (Amazon, UPI, Paytm) — the same merchant can mean very different things.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  reset();
                  setAdding(false);
                }}
              >
                Cancel
              </Button>
              <Button size="sm" type="submit">
                Add rule
              </Button>
            </div>
          </form>
        )}
        {data.rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rules yet. Everything you import will go to the review queue.</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {[...data.rules]
              .sort((a, b) => a.match.localeCompare(b.match))
              .map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="font-mono text-sm">{r.match}</span>
                  <span className="flex flex-wrap items-center gap-1">
                    {r.type && !typeUsesSpendingClassification(r.type) ? (
                      <TypeBadge type={r.type} />
                    ) : (
                      <>
                        <CategoryBadge category={r.category} />
                        <ImportanceBadge importance={r.importance} />
                      </>
                    )}
                    <Button size="icon-sm" variant="destructive-ghost" aria-label={`Delete rule ${r.match}`} onClick={() => setDeleting(r.id)}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </span>
                </li>
              ))}
          </ul>
        )}
      </CardContent>
      <ConfirmDialog
        open={!!ruleToDelete}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this rule?"
        description={`Future imports containing “${ruleToDelete?.match ?? ""}” will go to the review queue instead. Existing transactions keep their classification.`}
        confirmLabel="Delete rule"
        onConfirm={() => {
          if (!ruleToDelete) return;
          const r = ruleToDelete;
          dispatch({ type: "rule/delete", id: r.id });
          toast({ title: "Rule deleted", action: { label: "Undo", onClick: () => dispatch({ type: "rule/upsert", rule: r }) } });
          setDeleting(null);
        }}
      />
    </Card>
  );
}

function DataSection() {
  const { resetToDemo, clearAllData, data } = useStore();
  const toast = useToast();
  const [confirm, setConfirm] = React.useState<"reset" | "clear" | null>(null);
  return (
    <Card id="data" className="scroll-mt-20">
      <CardHeaderRow
        title="Data"
        description="Everything is stored in this browser (localStorage) and never leaves your device. There are no user accounts yet, so there's nothing to sign out of; sign-in comes with the planned database."
      />
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-4">
          <div>
            <p className="text-sm font-medium">Reset demo data</p>
            <p className="text-xs text-muted-foreground">Replace everything with the sample data for Aditi.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setConfirm("reset")}>
            Reset demo data
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 p-4">
          <div>
            <p className="text-sm font-medium">Start empty</p>
            <p className="text-xs text-muted-foreground">Delete all transactions, budgets, goals, splits and plans. Your accounts, settings and merchant rules stay.</p>
          </div>
          <Button variant="destructive" size="sm" onClick={() => setConfirm("clear")}>
            Delete all data
          </Button>
        </div>
      </CardContent>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "reset" ? "Reset to demo data?" : "Delete all your data?"}
        description={
          confirm === "reset"
            ? `Your ${data.transactions.length} transactions, budgets, goals and plans will be replaced with the demo data. This can't be undone.`
            : `Your ${data.transactions.length} transactions, ${data.budgets.length} budgets and ${data.goals.length} goals will be deleted. This can't be undone. Export them from Import data first if you want a copy.`
        }
        confirmLabel={confirm === "reset" ? "Reset demo data" : "Delete everything"}
        onConfirm={async () => {
          if (confirm === "reset") {
            await resetToDemo();
            toast({ tone: "success", title: "Demo data restored" });
          } else {
            await clearAllData();
            toast({ tone: "success", title: "All data deleted" });
          }
          setConfirm(null);
        }}
      />
    </Card>
  );
}

function SurplusSection() {
  const { data } = useStore();
  const d = useSettingsDraft(["surplusHandling"] as const);
  const h = d.draft.surplusHandling;
  return (
    <Card id="surplus" className="scroll-mt-20">
      <CardHeaderRow
        title="Surplus"
        description="Surplus is incoming minus spending. What's left after goal contributions is unallocated."
      />
      <CardContent>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            d.save();
          }}
        >
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Unallocated surplus</p>
            <Segmented
              label="Unallocated surplus"
              value={h.mode}
              onChange={(mode) => d.set("surplusHandling", { ...h, mode })}
              options={[
                { value: "suggest_goal", label: "Suggest moving it to a goal" },
                { value: "keep", label: "Keep it as a buffer" },
              ]}
            />
            <p className="text-xs text-muted-foreground">
              {h.mode === "suggest_goal"
                ? "The Overview offers a one-click contribution. Nothing is moved until you confirm."
                : "No suggestion is shown. Trade-offs still use unallocated surplus first."}
            </p>
          </div>
          {h.mode === "suggest_goal" && (
            <Field id="surplus-goal" label="Goal to suggest" className="max-w-sm">
              {(aria) =>
                data.goals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No goals yet.</p>
                ) : (
                  <SimpleSelect
                    {...aria}
                    value={h.goalId && data.goals.some((g) => g.id === h.goalId) ? h.goalId : data.goals[0]!.id}
                    onValueChange={(goalId) => d.set("surplusHandling", { ...h, goalId })}
                    options={data.goals.map((g) => ({ value: g.id, label: g.name }))}
                  />
                )
              }
            </Field>
          )}
          <SectionActions dirty={d.dirty} saved={d.saved} onSave={() => undefined} onCancel={d.cancel} />
        </form>
      </CardContent>
    </Card>
  );
}
