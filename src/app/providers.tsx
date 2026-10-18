"use client";

import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAppStore } from "@/store/useAppStore";

export default function Providers({ children }: { children: React.ReactNode }) {

  // The pre-paint script already set <html data-theme>; sync the store to it so the
  // toggle shows the right selection.
  const initTheme = useAppStore((s) => s.initTheme);
  useEffect(() => { initTheme(); }, [initTheme]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
