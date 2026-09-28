import {
  ArrowLeftRight,
  CalendarCheck,
  Database,
  HandCoins,
  LayoutDashboard,
  PieChart,
  Scale,
  Settings,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Track",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
      { href: "/spending", label: "Spending", icon: PieChart },
      { href: "/owed", label: "Money owed", icon: HandCoins },
    ],
  },
  {
    label: "Plan",
    items: [
      { href: "/budget", label: "Budget", icon: Wallet },
      { href: "/goals", label: "Goals", icon: Target },
      { href: "/plan-a-day", label: "Plan a day", icon: CalendarCheck },
      { href: "/tradeoffs", label: "Trade-offs", icon: Scale },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/data", label: "Import data", icon: Database },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];
