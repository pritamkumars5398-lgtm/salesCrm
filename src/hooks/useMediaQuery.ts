"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Hydration-safe media query.
 *
 * Reading `window.innerWidth` during render (what Sidebar/Topbar used to do)
 * makes the client's first render disagree with the server's HTML, which is a
 * hydration mismatch. useSyncExternalStore returns the server snapshot for that
 * first render and re-renders with the real value immediately after.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query]
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false // server: assume desktop
  );
}

/** Matches the `md` breakpoint the layout is designed around. */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
