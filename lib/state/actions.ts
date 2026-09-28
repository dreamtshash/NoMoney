import type {
  Budget,
  ClassificationRule,
  DailyPlan,
  Goal,
  GoalContribution,
  ImportRecord,
  NoMoneyData,
  Settings,
  Split,
  SplitPayment,
  Transaction,
} from "@/lib/types/finance";

export type Action =
  | { type: "data/replace"; data: NoMoneyData }
  | { type: "transaction/upsert"; transaction: Transaction }
  | { type: "transaction/delete"; id: string }
  | { type: "transaction/restore"; transaction: Transaction; split?: Split }
  | { type: "transactions/import"; transactions: Transaction[]; record?: ImportRecord }
  | { type: "budget/upsert"; budget: Budget }
  | { type: "budget/delete"; id: string }
  | { type: "goal/upsert"; goal: Goal }
  | { type: "goal/delete"; id: string }
  | { type: "goal/restore"; goal: Goal; contributions: GoalContribution[] }
  | { type: "contribution/add"; contribution: GoalContribution }
  | { type: "contribution/delete"; id: string }
  | { type: "split/upsert"; split: Split }
  | { type: "split/delete"; id: string }
  | { type: "split/payment"; splitId: string; participantId: string; payment: SplitPayment }
  | { type: "split/payment-delete"; splitId: string; participantId: string; paymentId: string }
  | { type: "plan/upsert"; plan: DailyPlan }
  | { type: "plan/delete"; date: string }
  | { type: "rule/upsert"; rule: ClassificationRule }
  | { type: "rule/delete"; id: string }
  | { type: "settings/update"; settings: Partial<Settings> }
  | { type: "month/set"; month: string | null };
