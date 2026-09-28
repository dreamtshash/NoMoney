"use client";

import * as React from "react";

import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { useStore } from "@/lib/state/store";

interface AppShellProps {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Show the month switcher (pages that summarise a month). */
  showMonth?: boolean;
  children: React.ReactNode;
}

export function AppShell({ title, description, actions, showMonth = false, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { status } = useStore();
  const closeMobile = React.useCallback(() => setMobileOpen(false), []);

  React.useEffect(() => {
    document.title = `${title} · NoMoney`;
  }, [title]);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-card px-3 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={closeMobile} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobileMenu={() => setMobileOpen(true)} showMonth={showMonth && status === "ready"} />
        <main id="main" className="flex-1 overflow-y-auto" tabIndex={-1}>
          <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
                {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
              </div>
              {actions && status === "ready" && <div className="flex flex-wrap gap-2">{actions}</div>}
            </div>
            {status === "loading" ? <PageSkeleton /> : children}
          </div>
        </main>
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <span className="sr-only">Loading your data</span>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-secondary" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg bg-secondary" />
    </div>
  );
}
