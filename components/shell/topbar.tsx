"use client";

import Link from "next/link";
import { CircleAlert, Menu } from "lucide-react";

import { SimpleSelect } from "@/components/ui/select";
import { useActiveMonth } from "@/lib/state/hooks";
import { useStore } from "@/lib/state/store";
import { formatMonth, initials } from "@/lib/utils/format";

export function Topbar({ onOpenMobileMenu, showMonth }: { onOpenMobileMenu: () => void; showMonth: boolean }) {
  const { data } = useStore();
  const { month, months, setMonth } = useActiveMonth();
  const reviewCount = data.transactions.filter((t) => t.needsReview).length;
  const name = data.settings.displayName.trim();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/85 sm:gap-3 sm:px-6">
      <button
        type="button"
        onClick={onOpenMobileMenu}
        className="-ml-1.5 rounded-md p-2 text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {showMonth && (
        <div className="w-44 sm:w-48">
          <SimpleSelect
            aria-label="Month shown"
            value={month}
            onValueChange={(m) => setMonth(m)}
            options={months.map((m) => ({ value: m, label: formatMonth(m) }))}
          />
        </div>
      )}

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        {reviewCount > 0 && (
          <Link
            href="/transactions?review=1"
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-warning hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CircleAlert className="h-4 w-4" aria-hidden="true" />
            <span>
              {reviewCount}
              <span className="hidden sm:inline"> to review</span>
              <span className="sr-only sm:hidden"> transactions to review</span>
            </span>
          </Link>
        )}
        <Link
          href="/settings"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={name ? `Settings for ${name}` : "Settings"}
          title={name || "Settings"}
        >
          {name ? initials(name) : "?"}
        </Link>
      </div>
    </header>
  );
}
