"use client";

import * as React from "react";

import type { NoMoneyData } from "@/lib/types/finance";
import type { NoMoneyRepository } from "@/lib/data/repository";
import { LocalStorageRepository } from "@/lib/data/local-repository";
import { createEmptyData, createSeedData } from "@/lib/data/seed";
import type { Action } from "@/lib/state/actions";
import { reducer } from "@/lib/state/reducer";
import { useToast } from "@/components/ui/toast";
import { todayIso } from "@/lib/utils/dates";

/**
 * Application state. One copy of the data for the whole app:
 *
 *   UI → dispatch(action) → reducer (pure) → new state → repository.save()
 *
 * Pages never import mock data or touch storage directly.
 */

type Status = "loading" | "ready";

interface StoreValue {
  status: Status;
  data: NoMoneyData;
  today: string;
  dispatch: (action: Action) => void;
  resetToDemo: () => Promise<void>;
  clearAllData: () => Promise<void>;
}

const StoreContext = React.createContext<StoreValue | null>(null);

type Internal = { status: Status; data: NoMoneyData; origin: "local" | "external" | "hydrate" };
type InternalAction =
  | { kind: "hydrate"; data: NoMoneyData }
  | { kind: "external"; data: NoMoneyData }
  | { kind: "local"; action: Action };

function internalReducer(state: Internal, a: InternalAction): Internal {
  switch (a.kind) {
    case "hydrate":
      return { status: "ready", data: a.data, origin: "hydrate" };
    case "external":
      return { ...state, data: a.data, origin: "external" };
    case "local": {
      const next = reducer(state.data, a.action);
      return next === state.data ? state : { ...state, data: next, origin: "local" };
    }
  }
}

export function StoreProvider({
  children,
  repository,
}: {
  children: React.ReactNode;
  repository?: NoMoneyRepository;
}) {
  const repo = React.useMemo(() => repository ?? new LocalStorageRepository(), [repository]);
  const toast = useToast();
  const [state, send] = React.useReducer(internalReducer, {
    status: "loading",
    data: createSeedData(),
    origin: "hydrate",
  });
  const [today, setToday] = React.useState(todayIso);

  // Hydrate once from the repository.
  React.useEffect(() => {
    let cancelled = false;
    repo.load().then((result) => {
      if (cancelled) return;
      send({ kind: "hydrate", data: result.data });
      if (result.warning) toast({ tone: "error", title: "Couldn't load saved data", description: result.warning });
    });
    return () => {
      cancelled = true;
    };
  }, [repo, toast]);

  // Keep other tabs in sync.
  React.useEffect(() => repo.subscribe?.((data) => send({ kind: "external", data })), [repo]);

  // Persist every local change.
  React.useEffect(() => {
    if (state.status !== "ready" || state.origin !== "local") return;
    repo.save(state.data).catch((e: unknown) => {
      toast({
        tone: "error",
        title: "Change not saved",
        description: e instanceof Error ? e.message : "Couldn't save to browser storage.",
      });
    });
  }, [state, repo, toast]);

  // Roll "today" over at midnight so Plan a Day stays correct in a long-open tab.
  React.useEffect(() => {
    const id = window.setInterval(() => setToday(todayIso()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const dispatch = React.useCallback((action: Action) => send({ kind: "local", action }), []);

  const resetToDemo = React.useCallback(async () => {
    await repo.clear();
    send({ kind: "local", action: { type: "data/replace", data: createSeedData() } });
  }, [repo]);

  // Keeps the user's own settings and merchant rules; removes all financial records.
  const dataRef = React.useRef(state.data);
  dataRef.current = state.data;
  const clearAllData = React.useCallback(async () => {
    await repo.clear();
    const current = dataRef.current;
    send({
      kind: "local",
      action: { type: "data/replace", data: { ...createEmptyData(), settings: current.settings, rules: current.rules } },
    });
  }, [repo]);

  const value = React.useMemo<StoreValue>(
    () => ({ status: state.status, data: state.data, today, dispatch, resetToDemo, clearAllData }),
    [state.status, state.data, today, dispatch, resetToDemo, clearAllData]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = React.useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
