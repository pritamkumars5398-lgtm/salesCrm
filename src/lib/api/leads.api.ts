import { apiPost, apiDelete, apiFetch } from "./client";

export interface OutreachResponse {
  sent: boolean;
  skipped?: boolean;
  reason?: string;
  channel?: "email" | "whatsapp" | null;
  subject?: string;
  body?: string;
  error?: string;
}

export const startLeadOutreach = (leadId: string, senderName?: string) =>
  apiPost<OutreachResponse>(`/api/leads/${leadId}/outreach`, { senderName });

/** Move one or more leads to Trash (soft-delete — recoverable). */
export const deleteLeads = (agentId: string, ids: string[]) =>
  apiDelete<{ deleted: number }>(`/api/leads?agentId=${agentId}&ids=${ids.join(",")}`);

/** Permanently delete leads (from Trash) — also removes conversations/activities. */
export const permanentlyDeleteLeads = (agentId: string, ids: string[]) =>
  apiDelete<{ deleted: number }>(`/api/leads?agentId=${agentId}&ids=${ids.join(",")}&permanent=1`);

/** Restore leads from Trash back to the active list. */
export const restoreLeads = (agentId: string, ids: string[]) =>
  apiFetch<{ restored: number }>(`/api/leads`, {
    method: "PATCH",
    body: JSON.stringify({ agentId, ids }),
  });

/** Run an async task over items with at most `concurrency` in flight. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await task(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}
