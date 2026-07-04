import type { StateCreator } from "zustand";
import type { AppState } from "../useAppStore";

export interface AuthSlice {
  isAuthed: boolean;
  userName: string;
  userEmail: string;
  login: (name: string, email: string) => void;
  logout: () => void;
}

export const createAuthSlice: StateCreator<AppState, [], [], AuthSlice> = (set) => ({
  isAuthed: false,
  userName: "",
  userEmail: "",
  login: (name, email) => {
    localStorage.setItem("sa_user", JSON.stringify({ name, email }));
    document.cookie = "sa_auth=1; path=/; max-age=2592000; SameSite=Lax";
    set({ isAuthed: true, userName: name, userEmail: email });
  },
  logout: () => {
    localStorage.removeItem("sa_user");
    document.cookie = "sa_auth=; path=/; max-age=0";
    set({ isAuthed: false, userName: "", userEmail: "", agents: [], activeAgent: null, leads: [] });
  },
});
