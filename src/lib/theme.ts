export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "sa_theme";

/**
 * Writes the choice to <html data-theme>. "system" removes the attribute so the
 * `prefers-color-scheme` rules in globals.css take over.
 */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

export function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

/**
 * Runs before first paint (inlined in <head>) so a dark-mode user never sees a
 * white flash while React hydrates. Kept dependency-free and tiny on purpose.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem("${THEME_STORAGE_KEY}");
    if (t === "light" || t === "dark") {
      document.documentElement.setAttribute("data-theme", t);
    }
  } catch (e) {}
})();
`;
