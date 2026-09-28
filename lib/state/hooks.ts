"use client";

import { useMemo } from "react";

import { availableMonths, buildMonthSnapshot, resolveActiveMonth } from "@/lib/domain/snapshot";
import { useStore } from "@/lib/state/store";

/** The month every finance view summarises, plus the list the user can switch between. */
export function useActiveMonth() {
  const { data, today, dispatch } = useStore();
  const month = resolveActiveMonth(data, today);
  const months = useMemo(() => availableMonths(data, today), [data, today]);
  return {
    month,
    months,
    setMonth: (m: string | null) => dispatch({ type: "month/set", month: m }),
  };
}

/** Derived financial summary for the active month. Single source for every page. */
export function useMonthSnapshot() {
  const { data } = useStore();
  const { month } = useActiveMonth();
  return useMemo(() => buildMonthSnapshot(data, month), [data, month]);
}
