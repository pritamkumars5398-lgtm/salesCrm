import { apiPost, apiPut } from "./client";
import type { Agent } from "@/store/types";

export interface PublishResult {
  published: boolean;
  /** number of schedules armed on publish */
  schedules?: number;
  issues?: string[];
  warnings?: string[];
}

export const publishAgent = (id: string) => apiPost<PublishResult>(`/api/agents/${id}/publish`);

export const updateAgentStatus = (id: string, status: "active" | "inactive") =>
  apiPut<Agent>(`/api/agents/${id}`, { status });
