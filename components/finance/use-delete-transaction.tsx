"use client";

import * as React from "react";

import { useToast } from "@/components/ui/toast";
import { useStore } from "@/lib/state/store";
import type { Transaction } from "@/lib/types/finance";

/** Delete → persist → toast with Undo. Confirmation is the caller's job (ConfirmDialog). */
export function useDeleteTransaction() {
  const { data, dispatch } = useStore();
  const toast = useToast();
  return React.useCallback(
    (t: Transaction) => {
      const split = data.splits.find((s) => s.transactionId === t.id);
      dispatch({ type: "transaction/delete", id: t.id });
      toast({
        title: "Transaction deleted",
        description: t.description,
        action: { label: "Undo", onClick: () => dispatch({ type: "transaction/restore", transaction: t, split }) },
      });
    },
    [data.splits, dispatch, toast]
  );
}
