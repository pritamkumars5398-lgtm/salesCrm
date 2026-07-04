import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Campaign } from "@/lib/models/Campaign";

/** GET /api/campaigns/[id] — campaign progress & per-lead errors. */
export async function GET(
  _req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  await connectDB();
  const campaign = await Campaign.findById(id).lean();
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(campaign);
}
