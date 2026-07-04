import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Agent } from "@/lib/models/Agent";
import {
  preflightCheck,
  createCampaign,
  processCampaign,
} from "@/server/services/campaign.service";
import { getAppBaseUrl } from "@/server/services/settings.service";


export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  await connectDB();

  const agent = await Agent.findById(id).lean();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const preflight = await preflightCheck(id);

  if (body.dryRun) {
    return NextResponse.json({ published: false, dryRun: true, ...preflight });
  }

  if (!preflight.ok) {
    return NextResponse.json(
      { published: false, issues: preflight.issues, warnings: preflight.warnings },
      { status: 422 }
    );
  }

  await Agent.findByIdAndUpdate(id, { status: "active" });

  let campaignId: string | undefined;
  let total = 0;

  if (preflight.eligibleLeads > 0) {
    const campaign = await createCampaign(id, "publish");
    if (campaign) {
      campaignId = String(campaign._id);
      total = campaign.total;

      const baseUrl = getAppBaseUrl(req);
      void processCampaign(campaignId, { senderName: agent.name, baseUrl }).catch((err) => {
        console.error(`[publish] campaign ${campaignId} processing error:`, err);
      });
    }
  }

  return NextResponse.json({
    published: true,
    campaignId,
    total,
    warnings: preflight.warnings,
  });
}
