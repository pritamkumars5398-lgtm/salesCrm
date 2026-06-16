import { create } from "zustand";
import type {
  Page, Agent, Lead, Conversation, Channel,
  DrawerState, DashboardStats, Activity, Meeting, CronJob,
} from "./types";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error";
}

interface AppState {
  // Auth
  isAuthed: boolean;
  userName: string;
  userEmail: string;
  login: (name: string, email: string) => void;
  logout: () => void;

  // Navigation
  currentPage: Page;
  setPage: (page: Page) => void;

  // Agents
  agents: Agent[];
  activeAgent: Agent | null;
  setAgents: (agents: Agent[]) => void;
  setActiveAgent: (agent: Agent) => void;
  addAgent: (agent: Agent) => void;

  // Leads
  leads: Lead[];
  setLeads: (leads: Lead[]) => void;
  updateLead: (id: string, patch: Partial<Lead>) => void;
  addLead: (lead: Lead) => void;

  // Conversations
  conversations: Record<string, Conversation[]>; // keyed by leadId
  setConversations: (leadId: string, convos: Conversation[]) => void;
  appendMessage: (leadId: string, channel: Channel, message: Conversation["messages"][0]) => void;

  // Drawer
  drawer: DrawerState;
  openDrawer: (lead: Lead, channel: Channel) => void;
  closeDrawer: () => void;
  setDrawerChannel: (channel: Channel) => void;

  // Dashboard
  dashboardStats: DashboardStats | null;
  dashboardRecentLeads: Lead[];
  dashboardRecentActivity: Activity[];
  setDashboard: (data: { stats: DashboardStats; recentLeads: Lead[]; recentActivity: Activity[] }) => void;

  // Activity
  activities: Activity[];
  setActivities: (activities: Activity[]) => void;

  // Meetings
  meetings: Meeting[];
  setMeetings: (meetings: Meeting[]) => void;

  // Crons
  cronJobs: CronJob[];
  setCronJobs: (jobs: CronJob[]) => void;
  addCronJob: (job: CronJob) => void;
  updateCronJob: (id: string, patch: Partial<CronJob>) => void;
  removeCronJob: (id: string) => void;

  // Toasts
  toasts: Toast[];
  showToast: (message: string, type?: "success" | "error") => void;
  dismissToast: (id: string) => void;

  // Loading
  loading: Record<string, boolean>;
  setLoading: (key: string, val: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  isAuthed: false,
  userName: "",
  userEmail: "",
  login: (name, email) => {
    localStorage.setItem("sa_user", JSON.stringify({ name, email }));
    set({ isAuthed: true, userName: name, userEmail: email });
  },
  logout: () => {
    localStorage.removeItem("sa_user");
    set({ isAuthed: false, userName: "", userEmail: "" });
  },

  currentPage: "dashboard",
  setPage: (page) => set({ currentPage: page }),

  agents: [],
  activeAgent: null,
  setAgents: (agents) => set({ agents, activeAgent: agents[0] ?? null }),
  setActiveAgent: (agent) => set({ activeAgent: agent }),
  addAgent: (agent) => set((s) => ({ agents: [...s.agents, agent] })),

  leads: [],
  setLeads: (leads) => set({ leads }),
  updateLead: (id, patch) =>
    set((s) => ({ leads: s.leads.map((l) => (l._id === id ? { ...l, ...patch } : l)) })),
  addLead: (lead) => set((s) => ({ leads: [lead, ...s.leads] })),

  conversations: {},
  setConversations: (leadId, convos) =>
    set((s) => ({ conversations: { ...s.conversations, [leadId]: convos } })),
  appendMessage: (leadId, channel, message) =>
    set((s) => {
      const existing = s.conversations[leadId] ?? [];
      const idx = existing.findIndex((c) => c.channel === channel);
      if (idx === -1) return s;
      const updated = [...existing];
      updated[idx] = { ...updated[idx], messages: [...updated[idx].messages, message] };
      return { conversations: { ...s.conversations, [leadId]: updated } };
    }),

  drawer: { open: false, lead: null, channel: "whatsapp" },
  openDrawer: (lead, channel) => set({ drawer: { open: true, lead, channel } }),
  closeDrawer: () => set((s) => ({ drawer: { ...s.drawer, open: false, lead: null } })),
  setDrawerChannel: (channel) => set((s) => ({ drawer: { ...s.drawer, channel } })),

  dashboardStats: null,
  dashboardRecentLeads: [],
  dashboardRecentActivity: [],
  setDashboard: ({ stats, recentLeads, recentActivity }) =>
    set({ dashboardStats: stats, dashboardRecentLeads: recentLeads, dashboardRecentActivity: recentActivity }),

  activities: [],
  setActivities: (activities) => set({ activities }),

  meetings: [],
  setMeetings: (meetings) => set({ meetings }),

  cronJobs: [],
  setCronJobs: (cronJobs) => set({ cronJobs }),
  addCronJob: (job) => set((s) => ({ cronJobs: [job, ...s.cronJobs] })),
  updateCronJob: (id, patch) =>
    set((s) => ({ cronJobs: s.cronJobs.map((j) => (j._id === id ? { ...j, ...patch } : j)) })),
  removeCronJob: (id) =>
    set((s) => ({ cronJobs: s.cronJobs.filter((j) => j._id !== id) })),

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
}));
