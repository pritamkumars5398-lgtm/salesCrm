import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Campaign } from "@/lib/models/Campaign";
import {
  createCampaign,
  processCampaign,
  countEligibleLeads,
} from "@/server/services/campaign.service";
import { getAppBaseUrl } from "@/server/services/settings.service";
import { LeadGroup } from "@/lib/models/LeadGroup";
import { authorizeWorkspace } from "@/server/auth/access";

/**
 * GET /api/campaigns?agentId=...&active=1
 * Lists campaigns for an agent (most recent first). `active=1` returns only
 * pending/running ones — used by the UI to resume progress display on reload.
 */
export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agentId");
  const access = await authorizeWorkspace(req, agentId);
  if (!access.ok) return access.response;

  const filter: Record<string, unknown> = { agentId: access.agentId };
  if (searchParams.get("active") === "1") {
    filter.status = { $in: ["pending", "running"] };
  }

  const campaigns = await Campaign.find(filter).sort({ createdAt: -1 }).limit(10).lean();
  return NextResponse.json(campaigns);
}

/**
 * POST /api/campaigns — manual "Run" from the Leads page.
 * Body: { agentId, limit?, groupId? } — outreach the first `limit` eligible
 * leads (newest first), optionally only those in one group. Works even while
 * the agent is in Draft.
 */
export async function POST(req: Request) {
  await connectDB();
  const body = await req.json().catch(() => ({}));
  const { agentId, groupId } = body as { agentId?: string; groupId?: string };
  const limit = Number.isInteger(body.limit) && body.limit > 0 ? Math.min(body.limit, 5000) : undefined;
  const access = await authorizeWorkspace(req, agentId);
  if (!access.ok) return access.response;
  const agent = access.agent;

  if (groupId) {
    if (!(await LeadGroup.exists({ _id: groupId, agentId: access.agentId }))) {
      return NextResponse.json({ error: "That group doesn't exist in this workspace." }, { status: 404 });
    }
  }

  const eligible = await countEligibleLeads(access.agentId, groupId);
  if (eligible === 0) {
    return NextResponse.json(
      { error: groupId
        ? "No leads in this group are ready to contact — they have no contact info, AI is off for them, or they were already outreached."
        : "No leads left to contact — every lead with contact info has already been outreached." },
      { status: 422 }
    );
  }

  const campaign = await createCampaign(access.agentId, "manual", { limit, groupId });
  if (!campaign) {
    return NextResponse.json({ error: "Could not start a run — no eligible leads." }, { status: 422 });
  }

  // If an existing active campaign was returned instead of a new one, tell the UI.
  const alreadyRunning = campaign.trigger !== "manual" || campaign.sent + campaign.failed + campaign.skipped > 0;

  const baseUrl = getAppBaseUrl(req);
  void processCampaign(String(campaign._id), {
    senderName: agent.name,
    baseUrl,
    ignoreAgentStatus: true,
  }).catch((err) => console.error(`[manual-run] campaign ${campaign._id} error:`, err));

  return NextResponse.json({
    campaign,
    remainingEligible: Math.max(0, eligible - campaign.total),
    alreadyRunning,
  }, { status: 201 });
}
