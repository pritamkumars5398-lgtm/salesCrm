/**
 * GET /api/agents/summary?userEmail=xxx
 * Returns status counts (new, in_outreach, total) for every agent owned by the user.
 */
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { Agent } from "@/lib/models/Agent";
import { Lead } from "@/lib/models/Lead";

export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const userEmail = searchParams.get("userEmail");
  if (!userEmail) return NextResponse.json([]);

  const agents = await Agent.find({ userEmail }).select("_id").lean();
  const objectIds = agents.map((a) => new mongoose.Types.ObjectId(String(a._id)));

  const agg = await Lead.aggregate([
    { $match: { agentId: { $in: objectIds } } },
    { $group: {
        _id: { agentId: "$agentId", status: "$status" },
        count: { $sum: 1 },
    }},
  ]);

  const map: Record<string, Record<string, number>> = {};
  for (const row of agg) {
    const id = String(row._id.agentId);
    if (!map[id]) map[id] = {};
    map[id][row._id.status] = row.count;
  }

  const result = objectIds.map((oid) => {
    const id = String(oid);
    const s = map[id] ?? {};
    return {
      agentId:         id,
      newCount:        s["new"]           ?? 0,
      inOutreachCount: s["in_outreach"]   ?? 0,
      repliedCount:    s["replied"]       ?? 0,
      bookedCount:     s["meeting_booked"]?? 0,
      closedCount:     s["closed"]        ?? 0,
      totalCount:      Object.values(s).reduce((a, b) => a + b, 0),
    };
  });

  return NextResponse.json(result);
}
