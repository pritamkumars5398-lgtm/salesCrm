import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Campaign } from "@/lib/models/Campaign";

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
