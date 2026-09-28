import type {
  CategoryId,
  ClassificationRule,
  Importance,
  NoMoneyData,
  Transaction,
  TransactionType,
} from "@/lib/types/finance";
import { computeTransactionHash } from "@/lib/domain/classification";
import { DEFAULT_DAILY_PLAN_CATEGORIES } from "@/lib/domain/daily-plan";

/**
 * Demo dataset. Restored by Settings → "Reset demo data".
 *
 * September 2026 is designed to reproduce the product's worked examples:
 *   income 35,000 · personal expenses 22,800 · surplus 12,200
 *   goal contributions 8,000 · unallocated 4,200
 *   Toit dinner: paid 3,000, own share 1,000, friends owe 2,000 (Arjun paid 1,000 back)
 */

const SEEDED_AT = "2026-09-26T09:00:00.000Z";

type Row = [
  id: string,
  date: string,
  description: string,
  merchant: string,
  amount: number,
  type: TransactionType,
  category: CategoryId,
  importance: Importance,
  account: string,
  extra?: Partial<Transaction>,
];

const rows: Row[] = [
  ["txn-0001", "2026-09-01", "Salary — September", "Acme Corp Payroll", 32000, "income", "income", "unknown", "acc-bank", { isRecurring: true }],
  ["txn-0002", "2026-09-01", "Monthly rent", "Lakeview Residency", -8000, "expense", "housing", "essential", "acc-bank", { isRecurring: true }],
  ["txn-0003", "2026-09-02", "Groceries", "BigBasket", -850, "expense", "food", "essential", "acc-bank"],
  ["txn-0004", "2026-09-02", "Petrol", "Indian Oil", -700, "expense", "transport", "flexible", "acc-card"],
  ["txn-0005", "2026-09-03", "Electricity bill", "BESCOM", -1150, "expense", "bills", "essential", "acc-bank", { isRecurring: true }],
  ["txn-0006", "2026-09-04", "Mobile + broadband", "Airtel", -799, "expense", "bills", "essential", "acc-bank", { isRecurring: true }],
  ["txn-0007", "2026-09-05", "Freelance design project", "Studio Nine", 3000, "income", "income", "unknown", "acc-bank"],
  ["txn-0008", "2026-09-05", "Transfer to goals savings", "Self transfer", -8000, "transfer", "transfer", "unknown", "acc-bank", { transferAccountId: "acc-savings" }],
  ["txn-0009", "2026-09-05", "Transfer from HDFC account", "Self transfer", 8000, "transfer", "transfer", "unknown", "acc-savings", { transferAccountId: "acc-bank" }],
  ["txn-0010", "2026-09-06", "Clothes", "Myntra", -1999, "expense", "shopping", "discretionary", "acc-card"],
  ["txn-0011", "2026-09-07", "Movie tickets", "PVR Cinemas", -560, "expense", "entertainment", "discretionary", "acc-card"],
  ["txn-0012", "2026-09-08", "Groceries", "BigBasket", -720, "expense", "food", "essential", "acc-bank"],
  ["txn-0013", "2026-09-09", "Ride to client office", "Uber", -305, "expense", "transport", "flexible", "acc-wallet"],
  ["txn-0014", "2026-09-10", "Figma course", "Udemy", -499, "expense", "education", "flexible", "acc-card"],
  ["txn-0015", "2026-09-11", "Lunch", "Copper Kitchen", -380, "expense", "food", "flexible", "acc-wallet"],
  ["txn-0016", "2026-09-12", "Medicines", "Apollo Pharmacy", -540, "expense", "healthcare", "essential", "acc-bank"],
  ["txn-0017", "2026-09-14", "Netflix mobile plan", "Netflix", -199, "expense", "subscriptions", "discretionary", "acc-card", { isRecurring: true }],
  ["txn-0018", "2026-09-14", "Spotify Premium", "Spotify", -119, "expense", "subscriptions", "discretionary", "acc-card", { isRecurring: true }],
  ["txn-0019", "2026-09-15", "Groceries", "BigBasket", -640, "expense", "food", "essential", "acc-bank"],
  ["txn-0020", "2026-09-16", "AMAZON PAY INDIA", "Amazon", -2400, "expense", "unknown", "unknown", "acc-card", { needsReview: true }],
  ["txn-0021", "2026-09-17", "Metro card recharge", "Namma Metro", -500, "expense", "transport", "essential", "acc-wallet"],
  ["txn-0022", "2026-09-18", "UPI/9845XXXX12@ybl", "UPI payment", -600, "expense", "unknown", "unknown", "acc-bank", { needsReview: true }],
  ["txn-0023", "2026-09-19", "Team dinner (paid for 3)", "Toit Brewpub", -3000, "expense", "food", "flexible", "acc-card"],
  ["txn-0024", "2026-09-19", "Credit card bill payment", "ICICI Credit Card", -4500, "transfer", "transfer", "unknown", "acc-bank", { transferAccountId: "acc-card" }],
  ["txn-0025", "2026-09-20", "Dessert", "Truffles", -420, "expense", "food", "flexible", "acc-wallet"],
  ["txn-0026", "2026-09-21", "Return — shirt", "Myntra", 650, "refund", "shopping", "discretionary", "acc-card"],
  ["txn-0027", "2026-09-22", "UPI from Arjun — dinner", "Arjun", 1000, "reimbursement", "reimbursement", "unknown", "acc-bank"],
  ["txn-0028", "2026-09-22", "NEFT CR R SHARMA", "R Sharma", 1500, "unknown", "unknown", "unknown", "acc-bank", { needsReview: true }],
  ["txn-0029", "2026-09-23", "Groceries", "BigBasket", -480, "expense", "food", "essential", "acc-bank"],
  ["txn-0030", "2026-09-24", "Cab home", "Ola", -210, "expense", "transport", "flexible", "acc-wallet"],
  ["txn-0031", "2026-09-25", "Coffee", "Blue Tokai", -260, "expense", "food", "flexible", "acc-wallet"],
  ["txn-0032", "2026-09-26", "Chai and snacks", "Chai Point", -120, "expense", "food", "flexible", "acc-wallet"],
];

function toTransaction([id, date, description, merchant, amount, type, category, importance, accountId, extra]: Row): Transaction {
  const needsReview = extra?.needsReview ?? false;
  return {
    id,
    accountId,
    date,
    description,
    merchant,
    amount,
    type,
    category,
    importance,
    confidence: needsReview ? 0 : 1,
    classificationSource: needsReview ? "unclassified" : "user",
    needsReview,
    isRecurring: false,
    transactionHash: computeTransactionHash({ accountId, date, amount, description }),
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    ...extra,
  };
}

const rules: ClassificationRule[] = [
  { id: "rule-payroll", match: "acme corp payroll", type: "income", category: "income", importance: "unknown", confidence: 0.95 },
  { id: "rule-bescom", match: "bescom", type: "expense", category: "bills", importance: "essential", confidence: 0.95 },
  { id: "rule-airtel", match: "airtel", type: "expense", category: "bills", importance: "essential", confidence: 0.9 },
  { id: "rule-netflix", match: "netflix", type: "expense", category: "subscriptions", importance: "discretionary", confidence: 0.95 },
  { id: "rule-spotify", match: "spotify", type: "expense", category: "subscriptions", importance: "discretionary", confidence: 0.95 },
  { id: "rule-bigbasket", match: "bigbasket", type: "expense", category: "food", importance: "essential", confidence: 0.85 },
  { id: "rule-indianoil", match: "indian oil", type: "expense", category: "transport", importance: "flexible", confidence: 0.9 },
  { id: "rule-metro", match: "namma metro", type: "expense", category: "transport", importance: "essential", confidence: 0.9 },
  { id: "rule-apollo", match: "apollo pharmacy", type: "expense", category: "healthcare", importance: "essential", confidence: 0.85 },
];

export function createSeedData(): NoMoneyData {
  return {
    accounts: [
      { id: "acc-bank", name: "HDFC savings account", type: "bank" },
      { id: "acc-savings", name: "Goals savings account", type: "savings" },
      { id: "acc-card", name: "ICICI credit card", type: "credit_card" },
      { id: "acc-wallet", name: "Paytm wallet", type: "wallet" },
    ],
    transactions: rows.map(toTransaction),
    budgets: [
      { id: "bud-housing", category: "housing", amount: 8000 },
      { id: "bud-food", category: "food", amount: 6000 },
      { id: "bud-transport", category: "transport", amount: 2500 },
      { id: "bud-shopping", category: "shopping", amount: 2000 },
      { id: "bud-entertainment", category: "entertainment", amount: 500 },
      { id: "bud-bills", category: "bills", amount: 2000 },
      { id: "bud-subscriptions", category: "subscriptions", amount: 400 },
      { id: "bud-education", category: "education", amount: 1000 },
      { id: "bud-healthcare", category: "healthcare", amount: 1000 },
    ],
    goals: [
      {
        id: "goal-laptop",
        name: "New laptop",
        targetAmount: 50000,
        currentAmount: 25000,
        deadline: "2027-03-31",
        safetyMultiplier: 1.5,
        plannedMonthlyContribution: 5000,
        createdAt: "2026-05-01T00:00:00.000Z",
      },
      {
        id: "goal-emergency",
        name: "Emergency fund",
        targetAmount: 100000,
        currentAmount: 48000,
        deadline: "2027-12-31",
        safetyMultiplier: 1.5,
        plannedMonthlyContribution: 3000,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    goalContributions: [
      { id: "gc-l-05", goalId: "goal-laptop", date: "2026-05-05", amount: 4000 },
      { id: "gc-l-06", goalId: "goal-laptop", date: "2026-06-05", amount: 5000 },
      { id: "gc-l-07", goalId: "goal-laptop", date: "2026-07-05", amount: 6000 },
      { id: "gc-l-08", goalId: "goal-laptop", date: "2026-08-05", amount: 5000 },
      { id: "gc-l-09", goalId: "goal-laptop", date: "2026-09-05", amount: 5000 },
      { id: "gc-e-open", goalId: "goal-emergency", date: "2026-01-10", amount: 30000, note: "Opening balance" },
      { id: "gc-e-04", goalId: "goal-emergency", date: "2026-04-05", amount: 3000 },
      { id: "gc-e-05", goalId: "goal-emergency", date: "2026-05-05", amount: 3000 },
      { id: "gc-e-06", goalId: "goal-emergency", date: "2026-06-05", amount: 2500 },
      { id: "gc-e-07", goalId: "goal-emergency", date: "2026-07-05", amount: 3500 },
      { id: "gc-e-08", goalId: "goal-emergency", date: "2026-08-05", amount: 3000 },
      { id: "gc-e-09", goalId: "goal-emergency", date: "2026-09-05", amount: 3000 },
    ],
    splits: [
      {
        id: "split-toit",
        transactionId: "txn-0023",
        createdAt: SEEDED_AT,
        participants: [
          {
            id: "sp-arjun",
            name: "Arjun",
            share: 1000,
            payments: [{ id: "pay-arjun-1", date: "2026-09-22", amount: 1000, transactionId: "txn-0027" }],
          },
          { id: "sp-meera", name: "Meera", share: 1000, payments: [] },
        ],
      },
    ],
    dailyPlans: [
      {
        date: "2026-09-26",
        available: 700,
        allocations: [
          { category: "food", amount: 300 },
          { category: "transport", amount: 200 },
          { category: "shopping", amount: 100 },
          { category: "entertainment", amount: 50 },
          { category: "other", amount: 50 },
        ],
        createdAt: SEEDED_AT,
        updatedAt: SEEDED_AT,
      },
    ],
    rules,
    history: [
      { month: "2026-04", income: 34000, spending: 24100 },
      { month: "2026-05", income: 34000, spending: 21700 },
      { month: "2026-06", income: 34500, spending: 23950 },
      { month: "2026-07", income: 35000, spending: 19800 },
      { month: "2026-08", income: 35000, spending: 20400 },
    ],
    settings: {
      displayName: "Aditi Kumar",
      savingsPercent: 20,
      expectedMonthlyIncome: 32000,
      additionalIncomeSavingsPercent: 50,
      defaultSafetyMultiplier: 1.5,
      dailyPlanMode: "budget",
      dailyPlanFixedAmount: 600,
      unusedDailyAction: "carry_forward",
      dailyPlanCategories: [...DEFAULT_DAILY_PLAN_CATEGORIES],
      surplusHandling: { mode: "suggest_goal", goalId: null },
      tradeOff: { goalId: null, funding: "surplus", useSafetyTarget: false },
    },
    imports: [],
    activeMonth: null,
  };
}

/** A clean slate: the user's own accounts and default settings, no financial data. */
export function createEmptyData(): NoMoneyData {
  const seed = createSeedData();
  return {
    ...seed,
    transactions: [],
    budgets: [],
    goals: [],
    goalContributions: [],
    splits: [],
    dailyPlans: [],
    history: [],
    imports: [],
    settings: { ...seed.settings, displayName: "" },
    activeMonth: null,
  };
}
