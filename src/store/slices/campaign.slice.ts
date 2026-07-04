import type { StateCreator } from "zustand";
import type { CampaignDto } from "@/lib/api/campaigns.api";
import type { AppState } from "../useAppStore";

export interface CampaignSlice {
  /** Campaign currently shown in the progress/results UI (publish or retry run). */
  activeCampaign: CampaignDto | null;
  /** Whether the results panel is expanded. */
  campaignPanelOpen: boolean;
  setActiveCampaign: (campaign: CampaignDto | null) => void;
  setCampaignPanelOpen: (open: boolean) => void;
}

export const createCampaignSlice: StateCreator<AppState, [], [], CampaignSlice> = (set) => ({
  activeCampaign: null,
  campaignPanelOpen: false,
  setActiveCampaign: (activeCampaign) => set({ activeCampaign }),
  setCampaignPanelOpen: (campaignPanelOpen) => set({ campaignPanelOpen }),
});
