"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

import { NAV_GROUPS } from "@/components/shell/nav";
import { useStore } from "@/lib/state/store";
import { cn } from "@/lib/utils/cn";

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary" aria-hidden="true">
        {/* A rupee-less coin: money that's accounted for */}
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
          <circle cx="10" cy="10" r="6.5" stroke="white" strokeWidth="1.8" />
          <path d="M6 14 14 6" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
      <span className="text-[15px] font-semibold tracking-tight">NoMoney</span>
    </div>
  );
}

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data } = useStore();
  const reviewCount = data.transactions.filter((t) => t.needsReview).length;

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-1.5 text-xs font-medium text-muted-foreground">{group.label}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground/75 hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="flex-1">{item.label}</span>
                    {item.href === "/transactions" && reviewCount > 0 && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 text-xs font-semibold tabular-nums",
                          active ? "bg-primary-foreground/20" : "bg-warning/15 text-warning"
                        )}
                        aria-label={`${reviewCount} to review`}
                      >
                        {reviewCount}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Footer() {
  return (
    <div className="border-t border-border px-6 py-3 text-xs leading-relaxed text-muted-foreground">
      Your data is saved in this browser only. No bank connections.
    </div>
  );
}

export function Sidebar({ mobileOpen, onCloseMobile }: { mobileOpen: boolean; onCloseMobile: () => void }) {
  // Close the drawer on Escape.
  React.useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseMobile();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen, onCloseMobile]);

  return (
    <>
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-14 items-center border-b border-border px-6">
          <Logo />
        </div>
        <NavContent />
        <Footer />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-foreground/40" onClick={onCloseMobile} aria-hidden="true" />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-border bg-card shadow-xl animate-in slide-in-from-left">
            <div className="flex h-14 items-center justify-between border-b border-border px-6">
              <Logo />
              <button
                type="button"
                onClick={onCloseMobile}
                className="-mr-2 rounded-md p-2 text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Close navigation"
                autoFocus
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <NavContent onNavigate={onCloseMobile} />
            <Footer />
          </aside>
        </div>
      )}
    </>
  );
}
