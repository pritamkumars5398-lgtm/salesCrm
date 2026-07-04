/**
 * App store, composed from slices (zustand slices pattern).
 * Import as before: `useAppStore` — existing call sites are unchanged.
 * Prefer selector subscriptions in components:
 *   const leads = useAppStore((s) => s.leads);
 */
import { create } from "zustand";
import { createAuthSlice, AuthSlice } from "./slices/auth.slice";
import { createAgentsSlice, AgentsSlice } from "./slices/agents.slice";
import { createLeadsSlice, LeadsSlice } from "./slices/leads.slice";
import { createConversationsSlice, ConversationsSlice } from "./slices/conversations.slice";
import { createCronsSlice, CronsSlice } from "./slices/crons.slice";
import { createCampaignSlice, CampaignSlice } from "./slices/campaign.slice";
import { createDashboardSlice, DashboardSlice } from "./slices/dashboard.slice";
import { createUiSlice, UiSlice } from "./slices/ui.slice";

export type AppState =
  AuthSlice &
  AgentsSlice &
  LeadsSlice &
  ConversationsSlice &
  CronsSlice &
  CampaignSlice &
  DashboardSlice &
  UiSlice;

export const useAppStore = create<AppState>()((...args) => ({
  ...createAuthSlice(...args),
  ...createAgentsSlice(...args),
  ...createLeadsSlice(...args),
  ...createConversationsSlice(...args),
  ...createCronsSlice(...args),
  ...createCampaignSlice(...args),
  ...createDashboardSlice(...args),
  ...createUiSlice(...args),
}));
