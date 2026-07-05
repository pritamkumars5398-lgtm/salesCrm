import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { retryFailedLeads, processCampaign } from "@/server/services/campaign.service";
import { getAppBaseUrl } from "@/server/services/settings.service";

/** POST /api/campaigns/[id]/retry — requeue the campaign's failed leads. */
export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  await connectDB();

  const campaign = await retryFailedLeads(id);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const baseUrl = getAppBaseUrl(req);
  // Retry is an explicit user action — allowed even while the agent is in Draft.
  void processCampaign(id, { baseUrl, ignoreAgentStatus: true }).catch((err) => {
    console.error(`[retry] campaign ${id} processing error:`, err);
  });

  return NextResponse.json(campaign);
}
