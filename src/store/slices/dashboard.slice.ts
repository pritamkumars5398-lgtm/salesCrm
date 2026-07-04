import type { StateCreator } from "zustand";
import type { Lead, DashboardStats, Activity, Meeting } from "../types";
import type { AppState } from "../useAppStore";

export interface DashboardSlice {
  dashboardStats: DashboardStats | null;
  dashboardRecentLeads: Lead[];
  dashboardRecentActivity: Activity[];
  setDashboard: (data: { stats: DashboardStats; recentLeads: Lead[]; recentActivity: Activity[] }) => void;

  activities: Activity[];
  setActivities: (activities: Activity[]) => void;

  meetings: Meeting[];
  setMeetings: (meetings: Meeting[]) => void;
}

export const createDashboardSlice: StateCreator<AppState, [], [], DashboardSlice> = (set) => ({
  dashboardStats: null,
  dashboardRecentLeads: [],
  dashboardRecentActivity: [],
  setDashboard: ({ stats, recentLeads, recentActivity }) =>
    set({ dashboardStats: stats, dashboardRecentLeads: recentLeads, dashboardRecentActivity: recentActivity }),

  activities: [],
  setActivities: (activities) => set({ activities }),

  meetings: [],
  setMeetings: (meetings) => set({ meetings }),
});
