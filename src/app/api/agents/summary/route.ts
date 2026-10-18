/**
 * GET /api/agents/summary
 * Returns status counts (new, in_outreach, total) for every workspace the signed-in user can open.
 */
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { authorizeUser } from "@/server/auth/access";
import { listWorkspacesForUser } from "@/server/services/workspace.service";

export async function GET(req: Request) {
  await connectDB();
  const auth = await authorizeUser(req);
  if (!auth.ok) return auth.response;

  const { workspaces } = await listWorkspacesForUser(auth.user._id);
  const objectIds = workspaces.map((w) => new mongoose.Types.ObjectId(w._id));

  const agg = await Lead.aggregate([
    { $match: { agentId: { $in: objectIds }, deletedAt: null } },
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
