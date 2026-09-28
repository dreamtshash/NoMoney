import type { Goal, NoMoneyData } from "@/lib/types/finance";
import type { Action } from "@/lib/state/actions";
import { roundMoney } from "@/lib/utils/money";

function upsertBy<T>(items: readonly T[], item: T, key: (x: T) => string): T[] {
  const k = key(item);
  const i = items.findIndex((x) => key(x) === k);
  if (i === -1) return [...items, item];
  const next = items.slice();
  next[i] = item;
  return next;
}

function adjustGoal(goals: readonly Goal[], goalId: string, delta: number): Goal[] {
  return goals.map((g) => (g.id === goalId ? { ...g, currentAmount: roundMoney(Math.max(0, g.currentAmount + delta)) } : g));
}

/**
 * Every data mutation in the app goes through here. Pure: (state, action) → state.
 * Cascade rules live here, not in components:
 *  - deleting a transaction deletes its split and unlinks settlement payments that pointed at it
 *  - deleting a goal deletes its contribution history
 *  - adding/removing a contribution moves the goal's saved amount by the same amount
 */
export function reducer(state: NoMoneyData, action: Action): NoMoneyData {
  switch (action.type) {
    case "data/replace":
      return action.data;

    case "transaction/upsert":
      return { ...state, transactions: upsertBy(state.transactions, action.transaction, (t) => t.id) };

    case "transaction/delete": {
      const tx = state.transactions.find((t) => t.id === action.id);
      if (!tx) return state;
      return {
        ...state,
        transactions: state.transactions.filter((t) => t.id !== action.id),
        splits: state.splits
          .filter((s) => s.transactionId !== action.id)
          .map((s) => ({
            ...s,
            participants: s.participants.map((p) => ({
              ...p,
              payments: p.payments.map((pay) =>
                pay.transactionId === action.id ? { ...pay, transactionId: undefined } : pay
              ),
            })),
          })),
      };
    }

    case "transaction/restore":
      return {
        ...state,
        transactions: upsertBy(state.transactions, action.transaction, (t) => t.id),
        splits: action.split ? upsertBy(state.splits, action.split, (s) => s.id) : state.splits,
      };

    case "transactions/import":
      return {
        ...state,
        transactions: [...state.transactions, ...action.transactions],
        imports: action.record ? [action.record, ...(state.imports ?? [])].slice(0, 50) : state.imports ?? [],
      };

    case "budget/upsert":
      return { ...state, budgets: upsertBy(state.budgets, action.budget, (b) => b.id) };

    case "budget/delete":
      return { ...state, budgets: state.budgets.filter((b) => b.id !== action.id) };

    case "goal/upsert":
      return { ...state, goals: upsertBy(state.goals, action.goal, (g) => g.id) };

    case "goal/delete":
      return {
        ...state,
        goals: state.goals.filter((g) => g.id !== action.id),
        goalContributions: state.goalContributions.filter((c) => c.goalId !== action.id),
      };

    case "goal/restore":
      return {
        ...state,
        goals: upsertBy(state.goals, action.goal, (g) => g.id),
        goalContributions: [
          ...state.goalContributions.filter((c) => c.goalId !== action.goal.id),
          ...action.contributions,
        ],
      };

    case "contribution/add":
      return {
        ...state,
        goalContributions: [...state.goalContributions, action.contribution],
        goals: adjustGoal(state.goals, action.contribution.goalId, action.contribution.amount),
      };

    case "contribution/delete": {
      const c = state.goalContributions.find((x) => x.id === action.id);
      if (!c) return state;
      return {
        ...state,
        goalContributions: state.goalContributions.filter((x) => x.id !== action.id),
        goals: adjustGoal(state.goals, c.goalId, -c.amount),
      };
    }

    case "split/upsert":
      return { ...state, splits: upsertBy(state.splits, action.split, (s) => s.id) };

    case "split/delete":
      return { ...state, splits: state.splits.filter((s) => s.id !== action.id) };

    case "split/payment":
      return {
        ...state,
        splits: state.splits.map((s) =>
          s.id !== action.splitId
            ? s
            : {
                ...s,
                participants: s.participants.map((p) =>
                  p.id === action.participantId ? { ...p, payments: [...p.payments, action.payment] } : p
                ),
              }
        ),
      };

    case "split/payment-delete":
      return {
        ...state,
        splits: state.splits.map((s) =>
          s.id !== action.splitId
            ? s
            : {
                ...s,
                participants: s.participants.map((p) =>
                  p.id === action.participantId
                    ? { ...p, payments: p.payments.filter((x) => x.id !== action.paymentId) }
                    : p
                ),
              }
        ),
      };

    case "plan/upsert":
      return { ...state, dailyPlans: upsertBy(state.dailyPlans, action.plan, (p) => p.date) };

    case "plan/delete":
      return { ...state, dailyPlans: state.dailyPlans.filter((p) => p.date !== action.date) };

    case "rule/upsert":
      return { ...state, rules: upsertBy(state.rules, action.rule, (r) => r.id) };

    case "rule/delete":
      return { ...state, rules: state.rules.filter((r) => r.id !== action.id) };

    case "settings/update":
      return { ...state, settings: { ...state.settings, ...action.settings } };

    case "month/set":
      return { ...state, activeMonth: action.month };

    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
