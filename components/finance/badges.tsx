import {
  CheckCircle2,
  Circle,
  CircleAlert,
  CircleDashed,
  CircleDot,
  CircleHelp,
  Clock,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { categoryLabel, IMPORTANCE_META, TRANSACTION_TYPE_META } from "@/lib/domain/categories";
import type { BudgetStatusKind } from "@/lib/domain/budget";
import type { GoalPace } from "@/lib/domain/goals";
import type { CategoryId, Importance, SettlementStatus, TransactionType } from "@/lib/types/finance";

export function CategoryBadge({ category }: { category: CategoryId }) {
  return <Badge variant={category === "unknown" ? "warning" : "outline"}>{categoryLabel(category)}</Badge>;
}

const importanceStyle: Record<Importance, { variant: "outline" | "accent" | "muted" | "warning"; Icon: typeof Circle }> = {
  essential: { variant: "outline", Icon: CircleDot },
  flexible: { variant: "accent", Icon: CircleDashed },
  discretionary: { variant: "muted", Icon: Circle },
  unknown: { variant: "warning", Icon: CircleHelp },
};

export function ImportanceBadge({ importance }: { importance: Importance }) {
  const { variant, Icon } = importanceStyle[importance];
  return (
    <Badge variant={variant}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {IMPORTANCE_META[importance].label}
    </Badge>
  );
}

export function TypeBadge({ type }: { type: TransactionType }) {
  return <Badge variant={type === "unknown" ? "warning" : "outline"}>{TRANSACTION_TYPE_META[type].label}</Badge>;
}

export function ReviewBadge() {
  return (
    <Badge variant="warning">
      <CircleAlert className="h-3 w-3" aria-hidden="true" />
      Needs review
    </Badge>
  );
}

const budgetStatus: Record<BudgetStatusKind, { label: string; variant: "success" | "warning" | "destructive" }> = {
  under: { label: "Under budget", variant: "success" },
  on_target: { label: "On target", variant: "warning" },
  over: { label: "Over budget", variant: "destructive" },
};

export function BudgetStatusBadge({ status }: { status: BudgetStatusKind }) {
  const s = budgetStatus[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

const settlement: Record<SettlementStatus, { label: string; variant: "warning" | "accent" | "success"; Icon: typeof Clock }> = {
  pending: { label: "Pending", variant: "warning", Icon: Clock },
  partial: { label: "Part paid", variant: "accent", Icon: CircleDashed },
  settled: { label: "Settled", variant: "success", Icon: CheckCircle2 },
};

export function SettlementBadge({ status }: { status: SettlementStatus }) {
  const s = settlement[status];
  return (
    <Badge variant={s.variant}>
      <s.Icon className="h-3 w-3" aria-hidden="true" />
      {s.label}
    </Badge>
  );
}

const pace: Record<GoalPace, { label: string; variant: "success" | "warning" | "destructive" | "muted"; Icon: typeof Clock }> = {
  complete: { label: "Reached", variant: "success", Icon: CheckCircle2 },
  on_track: { label: "On track", variant: "success", Icon: TrendingUp },
  behind: { label: "Behind", variant: "warning", Icon: TrendingDown },
  no_saving: { label: "No saving yet", variant: "muted", Icon: CircleHelp },
  deadline_passed: { label: "Deadline passed", variant: "destructive", Icon: CircleAlert },
};

export function PaceBadge({ value }: { value: GoalPace }) {
  const p = pace[value];
  return (
    <Badge variant={p.variant}>
      <p.Icon className="h-3 w-3" aria-hidden="true" />
      {p.label}
    </Badge>
  );
}
