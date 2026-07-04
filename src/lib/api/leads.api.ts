import { apiPost } from "./client";

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
