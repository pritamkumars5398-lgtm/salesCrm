import type { StateCreator } from "zustand";
import type { Page, Lead, Channel, DrawerState } from "../types";
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
});
