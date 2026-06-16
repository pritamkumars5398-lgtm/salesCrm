import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { Meeting } from "@/lib/models/Meeting";
import { Activity } from "@/lib/models/Activity";

export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agentId");
  if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);

  const [
    totalLeads,
    inOutreach,
    replied,
    meetingsThisWeek,
    recentLeads,
    recentActivity,
  ] = await Promise.all([
    Lead.countDocuments({ agentId }),
    Lead.countDocuments({ agentId, status: "in_outreach" }),
    Lead.countDocuments({ agentId, status: "replied" }),
    Meeting.countDocuments({ agentId, scheduledAt: { $gte: weekStart } }),
    Lead.find({ agentId }).sort({ createdAt: -1 }).limit(5).lean(),
    Activity.find({ agentId }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  return NextResponse.json({
    stats: { totalLeads, inOutreach, replied, meetingsThisWeek },
    recentLeads,
    recentActivity,
  });
}
