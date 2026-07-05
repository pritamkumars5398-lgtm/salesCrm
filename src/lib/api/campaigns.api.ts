import { apiGet, apiPost } from "./client";

export interface CampaignError {
  leadId: string;
  leadName: string;
  reason: string;
}

export interface CampaignDto {
  _id: string;
  agentId: string;
  trigger: "publish" | "cron" | "manual" | "retry";
  status: "pending" | "running" | "completed" | "failed";
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  failures: CampaignError[];
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
}

export const getCampaign = (id: string) => apiGet<CampaignDto>(`/api/campaigns/${id}`);

export const getActiveCampaigns = (agentId: string) =>
  apiGet<CampaignDto[]>(`/api/campaigns?agentId=${agentId}&active=1`);

export const retryCampaign = (id: string) => apiPost<CampaignDto>(`/api/campaigns/${id}/retry`);

export interface ManualRunResult {
  campaign: CampaignDto;
  remainingEligible: number;
  alreadyRunning: boolean;
}

/** Start a manual outreach run for the first `limit` eligible leads (works in Draft). */
export const startManualRun = (agentId: string, limit?: number) =>
  apiPost<ManualRunResult>(`/api/campaigns`, { agentId, limit });
