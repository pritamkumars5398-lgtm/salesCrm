import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Campaign } from "@/lib/models/Campaign";
import { stopCampaign } from "@/server/services/campaign.service";
import { authorizeRecord } from "@/server/auth/access";

/** POST /api/campaigns/[id]/stop — cancel/stop an in-flight outreach campaign. */
export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  await connectDB();
  const existing = Types.ObjectId.isValid(id) ? await Campaign.findById(id).select("agentId").lean() : null;
  const access = await authorizeRecord(req, existing, "Not found");
  if (!access.ok) return access.response;

  const campaign = await stopCampaign(id);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(campaign);
}
