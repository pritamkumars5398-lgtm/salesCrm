import type { StateCreator } from "zustand";
import type { Agent } from "../types";
import type { AppState } from "../useAppStore";

export interface AgentsSlice {
  agents: Agent[];
  activeAgent: Agent | null;
  /** Set once the agent list has been loaded, so the shell bootstraps a single time. */
  agentsLoaded: boolean;
  setAgentsLoaded: (loaded: boolean) => void;
  setAgents: (agents: Agent[]) => void;
  setActiveAgent: (agent: Agent) => void;
  addAgent: (agent: Agent) => void;
  updateAgent: (id: string, patch: Partial<Agent>) => void;
  updateAgentLeadCount: (agentId: string, count: number) => void;
}

export const createAgentsSlice: StateCreator<AppState, [], [], AgentsSlice> = (set) => ({
  agents: [],
  activeAgent: null,
  agentsLoaded: false,
  setAgentsLoaded: (agentsLoaded) => set({ agentsLoaded }),
  setAgents: (agents) => set({ agents, activeAgent: agents[0] ?? null }),
  setActiveAgent: (agent) => set({ activeAgent: agent }),
  addAgent: (agent) => set((s) => ({ agents: [...s.agents, agent] })),
  updateAgent: (id, patch) => set((s) => {
    const agents = s.agents.map((a) => (a._id === id ? { ...a, ...patch } : a));
    const activeAgent = s.activeAgent && s.activeAgent._id === id ? { ...s.activeAgent, ...patch } : s.activeAgent;
    return { agents, activeAgent };
  }),
  updateAgentLeadCount: (agentId, count) => set((s) => {
    const agents = s.agents.map((a) => (a._id === agentId ? { ...a, leadCount: count } : a));
    const activeAgent = s.activeAgent && s.activeAgent._id === agentId
      ? { ...s.activeAgent, leadCount: count }
      : s.activeAgent;
    return { agents, activeAgent };
  }),
});
