"use client";

import { ToastProvider } from "@/components/ui/toast";
import { StoreProvider } from "@/lib/state/store";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <StoreProvider>{children}</StoreProvider>
    </ToastProvider>
  );
}
