import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { Meeting } from "@/lib/models/Meeting";
import { Activity } from "@/lib/models/Activity";
import { authorizeWorkspace } from "@/server/auth/access";

export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const access = await authorizeWorkspace(req, searchParams.get("agentId"));
  if (!access.ok) return access.response;
  const agentId = access.agentId;

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
    Lead.countDocuments({ agentId, deletedAt: null }),
    Lead.countDocuments({ agentId, status: "in_outreach", deletedAt: null }),
    Lead.countDocuments({ agentId, status: "replied", deletedAt: null }),
    Meeting.countDocuments({ agentId, scheduledAt: { $gte: weekStart } }),
    Lead.find({ agentId, deletedAt: null }).sort({ createdAt: -1 }).limit(5).lean(),
    Activity.find({ agentId }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  return NextResponse.json({
    stats: { totalLeads, inOutreach, replied, meetingsThisWeek },
    recentLeads,
    recentActivity,
  });
}
