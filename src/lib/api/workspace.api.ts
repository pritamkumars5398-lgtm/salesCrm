import { apiDelete, apiFetch, apiGet, apiPost, apiPut } from "./client";
import type { GroupRule, LeadFieldDef, LeadFieldType } from "@/lib/lead-fields";
import type { MemberRole } from "@/store/types";

// ── Lead fields ──────────────────────────────────────────────────────────────

export const listLeadFields = (agentId: string) => apiGet<LeadFieldDef[]>(`/api/lead-fields?agentId=${agentId}`);

export const createLeadField = (agentId: string, input: { label: string; type: LeadFieldType; options?: string[]; aiFill?: boolean; description?: string }) =>
  apiPost<LeadFieldDef>("/api/lead-fields", { agentId, ...input });

export const updateLeadField = (id: string, patch: Partial<Pick<LeadFieldDef, "label" | "options" | "aiFill" | "description" | "order">>) =>
  apiPut<LeadFieldDef>(`/api/lead-fields/${id}`, patch);

export const deleteLeadField = (id: string) => apiDelete<{ success: boolean; affectedGroups: string[] }>(`/api/lead-fields/${id}`);

// ── Groups ───────────────────────────────────────────────────────────────────

export interface LeadGroup {
  _id: string;
  name: string;
  color: string;
  kind: "manual" | "smart";
  match: "all" | "any";
  rules: GroupRule[];
  playbook: string;
  memberCount: number;
  problems: string[];
}

export type LeadGroupInput = Pick<LeadGroup, "name" | "color" | "kind" | "match" | "rules" | "playbook">;

export const listLeadGroups = (agentId: string) => apiGet<LeadGroup[]>(`/api/lead-groups?agentId=${agentId}`);
export const createLeadGroup = (agentId: string, input: LeadGroupInput) => apiPost<LeadGroup>("/api/lead-groups", { agentId, ...input });
export const updateLeadGroup = (id: string, input: Partial<LeadGroupInput>) => apiPut<LeadGroup>(`/api/lead-groups/${id}`, input);
export const deleteLeadGroup = (id: string) => apiDelete<{ success: boolean }>(`/api/lead-groups/${id}`);

export const bulkUpdateLeads = (
  agentId: string,
  ids: string[],
  change: { addTags?: string[]; removeTags?: string[]; addGroupIds?: string[]; removeGroupIds?: string[] },
) => apiPost<{ ok: boolean; modified: number }>("/api/leads/bulk", { agentId, ids, ...change });

// ── Knowledge base ───────────────────────────────────────────────────────────

export interface KnowledgeDoc {
  _id: string;
  title: string;
  content: string;
  source: "text" | "file";
  updatedAt: string;
}

export const listKnowledge = (agentId: string) => apiGet<KnowledgeDoc[]>(`/api/knowledge?agentId=${agentId}`);
export const createKnowledge = (agentId: string, title: string, content: string) =>
  apiPost<KnowledgeDoc>("/api/knowledge", { agentId, title, content });
export const updateKnowledge = (id: string, patch: { title?: string; content?: string }) => apiPut<KnowledgeDoc>(`/api/knowledge/${id}`, patch);
export const deleteKnowledge = (id: string) => apiDelete<{ success: boolean }>(`/api/knowledge/${id}`);

export async function uploadKnowledgeFile(agentId: string, file: File): Promise<KnowledgeDoc> {
  const form = new FormData();
  form.append("agentId", agentId);
  form.append("file", file);
  // multipart: let the browser set the Content-Type boundary
  const res = await fetch("/api/knowledge", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data as KnowledgeDoc;
}

// ── Organization / team ──────────────────────────────────────────────────────

export interface OrganizationDetail {
  _id: string;
  name: string;
  myRole: MemberRole;
  plan: { id: string; name: string; limits: Record<string, number> };
  usage: Record<string, number>;
  workspaces: { _id: string; name: string; status: "active" | "inactive" }[];
  members: {
    userId: string; name: string; email: string; role: MemberRole;
    allWorkspaces: boolean; workspaceIds: string[]; isMe: boolean;
  }[];
  invites: { _id: string; email: string; role: MemberRole; allWorkspaces: boolean; workspaceIds: string[]; createdAt: string }[];
}

export interface MemberAccess {
  role: "admin" | "member";
  allWorkspaces: boolean;
  workspaceIds: string[];
}

export const getOrganization = (id: string) => apiGet<OrganizationDetail>(`/api/organizations/${id}`);
export const renameOrganization = (id: string, name: string) => apiPut<{ ok: boolean }>(`/api/organizations/${id}`, { name });
export const addMember = (orgId: string, email: string, access: MemberAccess) =>
  apiPost<{ added?: boolean; invited?: boolean }>(`/api/organizations/${orgId}/members`, { email, ...access });
export const updateMember = (orgId: string, userId: string, access: MemberAccess) =>
  apiPut<{ ok: boolean }>(`/api/organizations/${orgId}/members/${userId}`, access);
export const removeMember = (orgId: string, userId: string) =>
  apiDelete<{ ok: boolean }>(`/api/organizations/${orgId}/members/${userId}`);
export const cancelInvite = (orgId: string, inviteId: string) =>
  apiDelete<{ ok: boolean }>(`/api/organizations/${orgId}/invites/${inviteId}`);

// ── Workspace ────────────────────────────────────────────────────────────────

export const renameWorkspace = (id: string, name: string) => apiPut<{ name: string }>(`/api/agents/${id}`, { name });
export const deleteWorkspace = (id: string, confirmName: string) =>
  apiFetch<{ success: boolean }>(`/api/agents/${id}?confirm=${encodeURIComponent(confirmName)}`, { method: "DELETE" });
