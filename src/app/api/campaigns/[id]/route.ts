import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Campaign } from "@/lib/models/Campaign";
import { authorizeRecord } from "@/server/auth/access";

/** GET /api/campaigns/[id] — campaign progress & per-lead errors. */
export async function GET(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  await connectDB();
  const campaign = Types.ObjectId.isValid(id) ? await Campaign.findById(id).lean() : null;
  const access = await authorizeRecord(req, campaign, "Not found");
  if (!access.ok) return access.response;
  return NextResponse.json(campaign);
}
