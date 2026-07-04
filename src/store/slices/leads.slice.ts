import type { StateCreator } from "zustand";
import type { Lead } from "../types";
import type { AppState } from "../useAppStore";

export interface LeadsSlice {
  leads: Lead[];
  setLeads: (leads: Lead[]) => void;
  updateLead: (id: string, patch: Partial<Lead>) => void;
  addLead: (lead: Lead) => void;
  addLeads: (leads: Lead[]) => void;
}

export const createLeadsSlice: StateCreator<AppState, [], [], LeadsSlice> = (set) => ({
  leads: [],
  setLeads: (leads) => set({ leads }),
  updateLead: (id, patch) =>
    set((s) => ({ leads: s.leads.map((l) => (l._id === id ? { ...l, ...patch } : l)) })),
  addLead: (lead) => set((s) => {
    const agents = s.agents.map((a) =>
      a._id === lead.agentId ? { ...a, leadCount: a.leadCount + 1 } : a
    );
    const activeAgent = s.activeAgent && s.activeAgent._id === lead.agentId
      ? { ...s.activeAgent, leadCount: s.activeAgent.leadCount + 1 }
      : s.activeAgent;
    return { leads: [lead, ...s.leads], agents, activeAgent };
  }),
  addLeads: (newLeads) => set((s) => {
    if (newLeads.length === 0) return {};
    const agentId = newLeads[0].agentId;
    const agents = s.agents.map((a) =>
      a._id === agentId ? { ...a, leadCount: a.leadCount + newLeads.length } : a
    );
    const activeAgent = s.activeAgent && s.activeAgent._id === agentId
      ? { ...s.activeAgent, leadCount: s.activeAgent.leadCount + newLeads.length }
      : s.activeAgent;
    return { leads: [...newLeads, ...s.leads], agents, activeAgent };
  }),
});
