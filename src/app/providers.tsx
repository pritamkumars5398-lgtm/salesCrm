"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAppStore } from "@/store/useAppStore";

export default function Providers({ children }: { children: React.ReactNode }) {

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {

            staleTime: 60_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  // The pre-paint script already set <html data-theme>; sync the store to it so the
  // toggle shows the right selection.
  const initTheme = useAppStore((s) => s.initTheme);
  useEffect(() => { initTheme(); }, [initTheme]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
