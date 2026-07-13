import type { StateCreator } from "zustand";
import type { Page, Lead, Channel, DrawerState } from "../types";
import { applyTheme, readStoredTheme, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";
import type { AppState } from "../useAppStore";

export interface Toast {
  id: string;
  message: string;
  type: "success" | "error";
}

export interface UiSlice {
  currentPage: Page;
  setPage: (page: Page) => void;

  drawer: DrawerState;
  openDrawer: (lead: Lead, channel: Channel) => void;
  closeDrawer: () => void;
  setDrawerChannel: (channel: Channel) => void;

  toasts: Toast[];
  showToast: (message: string, type?: "success" | "error") => void;
  dismissToast: (id: string) => void;

  loading: Record<string, boolean>;
  setLoading: (key: string, val: boolean) => void;

  sidebarOpenMobile: boolean;
  setSidebarOpenMobile: (open: boolean) => void;

  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;

  /** Shared: the modal is rendered by the shell layout but opened from Topbar and Leads. */
  addLeadOpen: boolean;
  setAddLeadOpen: (open: boolean) => void;

  /** "system" follows the OS; light/dark are an explicit, persisted override. */
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Adopt whatever the pre-paint script already put on <html>. */
  initTheme: () => void;
}

export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set, get) => ({
  currentPage: "dashboard",
  setPage: (page) => set({ currentPage: page }),

  drawer: { open: false, lead: null, channel: "whatsapp" },
  openDrawer: (lead, channel) => set({ drawer: { open: true, lead, channel } }),
  closeDrawer: () => set((s) => ({ drawer: { ...s.drawer, open: false, lead: null } })),
  setDrawerChannel: (channel) => set((s) => ({ drawer: { ...s.drawer, channel } })),

  toasts: [],
  showToast: (message, type = "success") => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => get().dismissToast(id), 2500);
  },
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  loading: {},
  setLoading: (key, val) =>
    set((s) => ({ loading: { ...s.loading, [key]: val } })),

  sidebarOpenMobile: false,
  setSidebarOpenMobile: (open) => set({ sidebarOpenMobile: open }),

  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  addLeadOpen: false,
  setAddLeadOpen: (addLeadOpen) => set({ addLeadOpen }),

  theme: "system",
  setTheme: (theme) => {
    applyTheme(theme);
    try {
      if (theme === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // private mode / storage disabled — the theme still applies for this session
    }
    set({ theme });
  },
  initTheme: () => set({ theme: readStoredTheme() }),
});
