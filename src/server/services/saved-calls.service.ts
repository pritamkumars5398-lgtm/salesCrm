import { Setting } from "@/lib/models/Setting";

/**
 * Calls the team bookmarked ("saved") in a workspace — good examples to listen to
 * again, or ones to follow up. Kept as a small list in the workspace's settings
 * (no schema change); newest first, capped so it stays small.
 */
const KEY = "savedCalls";
const MAX_SAVED = 300;

export interface SavedCall {
  callId: string;
  leadId: string;
  at: string;
}

export async function getSavedCalls(agentId: string): Promise<SavedCall[]> {
  const row = await Setting.findOne({ agentId, key: KEY }).lean();
  try {
    const list = JSON.parse(row?.value || "[]");
    return Array.isArray(list) ? list.filter((s) => s?.callId && s?.leadId) : [];
  } catch {
    return [];
  }
}

export async function setCallSaved(agentId: string, callId: string, leadId: string, saved: boolean): Promise<SavedCall[]> {
  const current = (await getSavedCalls(agentId)).filter((s) => s.callId !== callId);
  const next = saved ? [{ callId, leadId, at: new Date().toISOString() }, ...current].slice(0, MAX_SAVED) : current;
  await Setting.updateOne({ agentId, key: KEY }, { $set: { value: JSON.stringify(next) } }, { upsert: true });
  return next;
}
