import type { StateCreator } from "zustand";
import type { AppState } from "../useAppStore";
import { authLogout } from "@/lib/auth";

export interface AuthSlice {
  isAuthed: boolean;
  userName: string;
  userEmail: string;
  /** from the server (/api/auth/me) — never derived from the email on the client */
  isSuperadmin: boolean;
  login: (name: string, email: string) => void;
  setIsSuperadmin: (value: boolean) => void;
  logout: () => void;
}

export const createAuthSlice: StateCreator<AppState, [], [], AuthSlice> = (set) => ({
  isAuthed: false,
  userName: "",
  userEmail: "",
  isSuperadmin: false,
  // The session itself is an HttpOnly cookie set by the login/signup API;
  // this only caches who is signed in for display.
  login: (name, email) => {
    localStorage.setItem("sa_user", JSON.stringify({ name, email }));
    set({
      isAuthed: true,
      userName: name,
      userEmail: email,
      agentsLoaded: false,
      agents: [],
      organizations: [],
      activeAgent: null,
    });
  },
  setIsSuperadmin: (isSuperadmin) => set({ isSuperadmin }),
  logout: () => {
    void authLogout();
    set({
      isAuthed: false,
      userName: "",
      userEmail: "",
      isSuperadmin: false,
      agents: [],
      organizations: [],
      activeAgent: null,
      agentsLoaded: false,
      leads: [],
      dashboardStats: null,
      dashboardRecentLeads: [],
      dashboardRecentActivity: [],
    });
  },
});
