import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Campaign } from "@/lib/models/Campaign";
import { Agent } from "@/lib/models/Agent";
import {
  createCampaign,
  processCampaign,
  countEligibleLeads,
} from "@/server/services/campaign.service";
import { getAppBaseUrl } from "@/server/services/settings.service";

/**
 * GET /api/campaigns?agentId=...&active=1
 * Lists campaigns for an agent (most recent first). `active=1` returns only
 * pending/running ones — used by the UI to resume progress display on reload.
 */
export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agentId");
  if (!agentId) return NextResponse.json({ error: "agentId is required" }, { status: 400 });

  const filter: Record<string, unknown> = { agentId };
  if (searchParams.get("active") === "1") {
    filter.status = { $in: ["pending", "running"] };
  }

  const campaigns = await Campaign.find(filter).sort({ createdAt: -1 }).limit(10).lean();
  return NextResponse.json(campaigns);
}

/**
 * POST /api/campaigns — manual "Run" from the Leads page.
 * Body: { agentId, limit? } — outreach the first `limit` eligible leads
 * (newest first). Works even while the agent is in Draft.
 */
export async function POST(req: Request) {
  await connectDB();
  const body = await req.json().catch(() => ({}));
  const { agentId, limit } = body as { agentId?: string; limit?: number };
  if (!agentId) return NextResponse.json({ error: "agentId is required" }, { status: 400 });

  const agent = await Agent.findById(agentId).lean();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const eligible = await countEligibleLeads(agentId);
  if (eligible === 0) {
    return NextResponse.json(
      { error: "No leads left to contact — every lead with contact info has already been outreached." },
      { status: 422 }
    );
  }

  const campaign = await createCampaign(agentId, "manual", { limit });
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
