import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Agent } from "@/lib/models/Agent";
import { Usage } from "@/lib/models/Usage";
import { Setting } from "@/lib/models/Setting";
import { PLANS, type PlanId } from "@/lib/plans";
import { currentMonth } from "@/lib/utils/date";

export async function GET() {
  try {
    await connectDB();

    const [dbUsers, dbAgents, dbUsages, dbSettings] = await Promise.all([
      User.find().lean(),
      Agent.find().lean(),
      Usage.find().lean(),
      Setting.find().lean(),
    ]);

    // Helper maps
    const settingsMap = new Map<string, string>(); // key = `${agentId}:${settingKey}`
    dbSettings.forEach((s) => {
      settingsMap.set(`${s.agentId.toString()}:${s.key}`, s.value);
    });

    const usageMap = new Map<string, any>(); // key = agentId
    dbUsages.forEach((u) => {
      usageMap.set(u.agentId.toString(), u);
    });

    // 1. Compile live database users
    const liveUsers = dbUsers.map((user) => {
      const email = user.email.toLowerCase();
      // Find all agents of this user
      const userAgents = dbAgents.filter((a) => a.userEmail?.toLowerCase() === email);
      
      let leadsScraped = 0;
      let messagesSent = 0;
      let callsMade = 0;
      let emailsSent = 0;
      let activePlan: PlanId = "free";
      let hasCustomLimits = false;
      let voiceEnabled = true;

      userAgents.forEach((agent) => {
        const agentIdStr = agent._id.toString();
        const usage = usageMap.get(agentIdStr);
        if (usage) {
          leadsScraped += usage.leadsScraped ?? 0;
          messagesSent += usage.messagesSent ?? 0;
          callsMade += usage.callsMade ?? 0;
          emailsSent += usage.emailsSent ?? 0;
        }

        const planSetting = settingsMap.get(`${agentIdStr}:plan`);
        if (planSetting) {
          activePlan = planSetting as PlanId;
        }

        if (settingsMap.has(`${agentIdStr}:custom_limits`)) {
          hasCustomLimits = true;
        }

        const voiceSetting = settingsMap.get(`${agentIdStr}:voiceEnabled`);
        if (voiceSetting === "false") {
          voiceEnabled = false;
        }
      });

      // Calculate cost & revenue
      const infraCost = (leadsScraped * 0.8) + (messagesSent * 0.65) + (callsMade * 12.0) + (emailsSent * 0.08);
      const planPrice = PLANS[activePlan]?.priceINR ?? 0;

      return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        agentsCount: userAgents.length,
        agents: userAgents.map(a => ({ id: a._id.toString(), name: a.name })),
        plan: activePlan,
        hasCustomLimits,
        callsSupport: voiceEnabled ? "Supported" : "Disabled",
        usage: { leadsScraped, messagesSent, callsMade, emailsSent },
        tokens: messagesSent * 450,
        costINR: Math.round(infraCost),
        revenueINR: planPrice,
        isLive: true,
      };
    });

    // 2. Premium Mock production users to populate dashboard
    const mockUsers = [
      {
        id: "mock_user_1",
        name: "PixelCraft Studios",
        email: "billing@pixelcraft.io",
        agentsCount: 2,
        agents: [{ id: "mock_agent_1a", name: "PixelCraft Marketing" }, { id: "mock_agent_1b", name: "PixelCraft Support" }],
        plan: "growth" as PlanId,
        hasCustomLimits: false,
        callsSupport: "Supported",
        usage: { leadsScraped: 680, messagesSent: 1250, callsMade: 64, emailsSent: 1850 },
        tokens: 1250 * 450,
        costINR: Math.round((680 * 0.8) + (1250 * 0.65) + (64 * 12.0) + (1850 * 0.08)),
        revenueINR: 2499,
        isLive: false,
      },
      {
        id: "mock_user_2",
        name: "Veloce Automotive Group",
        email: "leads@velocegroup.co.in",
        agentsCount: 4,
        agents: [{ id: "mock_agent_2a", name: "Audi Lead Agent" }, { id: "mock_agent_2b", name: "BMW Follow-up Agent" }],
        plan: "pro" as PlanId,
        hasCustomLimits: true,
        callsSupport: "Supported",
        usage: { leadsScraped: 3450, messagesSent: 4200, callsMade: 320, emailsSent: 7800 },
        tokens: 4200 * 450,
        costINR: Math.round((3450 * 0.8) + (4200 * 0.65) + (320 * 12.0) + (7800 * 0.08)),
        revenueINR: 4999,
        isLive: false,
      },
      {
        id: "mock_user_3",
        name: "Nova Health Diagnostics",
        email: "admin@novahealth.com",
        agentsCount: 1,
        agents: [{ id: "mock_agent_3a", name: "Nova Outreach" }],
        plan: "starter" as PlanId,
        hasCustomLimits: false,
        callsSupport: "Disabled",
        usage: { leadsScraped: 180, messagesSent: 350, callsMade: 0, emailsSent: 600 },
        tokens: 350 * 450,
        costINR: Math.round((180 * 0.8) + (350 * 0.65) + (0 * 12.0) + (600 * 0.08)),
        revenueINR: 999,
        isLive: false,
      },
      {
        id: "mock_user_4",
        name: "Swift Logistics Systems",
        email: "swiftops@swift.com",
        agentsCount: 1,
        agents: [{ id: "mock_agent_4a", name: "Swift Broker Agent" }],
        plan: "growth" as PlanId,
        hasCustomLimits: true,
        callsSupport: "Supported",
        usage: { leadsScraped: 850, messagesSent: 1950, callsMade: 120, emailsSent: 2800 },
        tokens: 1950 * 450,
        costINR: Math.round((850 * 0.8) + (1950 * 0.65) + (120 * 12.0) + (2800 * 0.08)),
        revenueINR: 2499,
        isLive: false,
      }
    ];

    // Combine users list (putting live users first)
    const allUsersList = [...liveUsers, ...mockUsers];

    // Calculate aggregated statistics
    let totalUsers = dbUsers.length + mockUsers.length;
    let totalAgents = dbAgents.length + mockUsers.reduce((sum, u) => sum + u.agentsCount, 0);
    let totalLeads = allUsersList.reduce((sum, u) => sum + u.usage.leadsScraped, 0);
    let totalMessages = allUsersList.reduce((sum, u) => sum + u.usage.messagesSent, 0);
    let totalCalls = allUsersList.reduce((sum, u) => sum + u.usage.callsMade, 0);
    let totalEmails = allUsersList.reduce((sum, u) => sum + u.usage.emailsSent, 0);
    let totalCost = allUsersList.reduce((sum, u) => sum + u.costINR, 0);
    let totalRevenue = allUsersList.reduce((sum, u) => sum + u.revenueINR, 0);
    let totalTokens = totalMessages * 450;

    // Monthly usage trend (last 7 days breakdown for graph)
    const weeklyUsageTrend = [
      { day: "Mon", leads: 420, messages: 840, calls: 45, cost: 950 },
      { day: "Tue", leads: 380, messages: 910, calls: 52, cost: 1100 },
      { day: "Wed", leads: 510, messages: 1120, calls: 68, cost: 1350 },
      { day: "Thu", leads: 480, messages: 1050, calls: 60, cost: 1220 },
      { day: "Fri", leads: 620, messages: 1350, calls: 82, cost: 1640 },
      { day: "Sat", leads: 290, messages: 450, calls: 24, cost: 680 },
      { day: "Sun", leads: 310, messages: 480, calls: 30, cost: 720 },
    ];

    // Merge actual today's stats into Sunday (or current day) if there is database usage
    const dbTotalLeads = dbUsages.reduce((sum, u) => sum + (u.leadsScraped ?? 0), 0);
    const dbTotalMsgs = dbUsages.reduce((sum, u) => sum + (u.messagesSent ?? 0), 0);
    const dbTotalCalls = dbUsages.reduce((sum, u) => sum + (u.callsMade ?? 0), 0);
    if (dbTotalLeads > 0 || dbTotalMsgs > 0 || dbTotalCalls > 0) {
      const todayIndex = new Date().getDay(); // 0 is Sun, 1 is Mon, etc.
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const dayLabel = days[todayIndex];
      const match = weeklyUsageTrend.find(t => t.day === dayLabel);
      if (match) {
        match.leads += dbTotalLeads;
        match.messages += dbTotalMsgs;
        match.calls += dbTotalCalls;
        match.cost += Math.round((dbTotalLeads * 0.8) + (dbTotalMsgs * 0.65) + (dbTotalCalls * 12.0));
      }
    }

    // Revenue vs Infra Costs trend (last 4 months breakdown for graph)
    const monthlyFinancialTrend = [
      { month: "Mar", revenue: totalRevenue - 3500, cost: totalCost - 2200 },
      { month: "Apr", revenue: totalRevenue - 1800, cost: totalCost - 980 },
      { month: "May", revenue: totalRevenue - 800, cost: totalCost - 420 },
      { month: "Jun", revenue: totalRevenue, cost: totalCost },
    ];

    // Plan Distribution counts
    const planCounts = { free: 0, starter: 0, growth: 0, pro: 0 };
    allUsersList.forEach((u) => {
      if (planCounts[u.plan] !== undefined) {
        planCounts[u.plan]++;
      } else {
        planCounts.free++;
      }
    });

    const planDistribution = [
      { name: "Free", value: planCounts.free, color: PLANS.free.color },
      { name: "Starter", value: planCounts.starter, color: PLANS.starter.color },
      { name: "Growth", value: planCounts.growth, color: PLANS.growth.color },
      { name: "Pro", value: planCounts.pro, color: PLANS.pro.color },
    ];

    return NextResponse.json({
      summary: {
        totalUsers,
        totalAgents,
        totalLeads,
        totalMessages,
        totalCalls,
        totalEmails,
        totalTokens,
        totalRevenue,
        totalCost,
        netProfit: totalRevenue - totalCost,
        marginPercent: Math.round(((totalRevenue - totalCost) / (totalRevenue || 1)) * 100),
      },
      users: allUsersList,
      weeklyUsageTrend,
      monthlyFinancialTrend,
      planDistribution,
    });
  } catch (error: any) {
    console.error("[Superadmin API error]", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// POST: update agent's plan or override specific limits
export async function POST(req: Request) {
  try {
    await connectDB();
    const { agentId, planId, customLimits } = await req.json() as {
      agentId: string;
      planId?: PlanId;
      customLimits?: any;
    };

    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    const updates = [];

    // Change plan if provided
    if (planId) {
      if (!PLANS[planId]) {
        return NextResponse.json({ error: "Invalid planId" }, { status: 400 });
      }
      updates.push(
        Setting.findOneAndUpdate(
          { agentId, key: "plan" },
          { $set: { value: planId } },
          { upsert: true }
        )
      );
    }

    // Save custom limits override if provided
    if (customLimits !== undefined) {
      if (customLimits === null || Object.keys(customLimits).length === 0) {
        updates.push(Setting.deleteOne({ agentId, key: "custom_limits" }));
      } else {
        updates.push(
          Setting.findOneAndUpdate(
            { agentId, key: "custom_limits" },
            { $set: { value: JSON.stringify(customLimits) } },
            { upsert: true }
          )
        );
      }
    }

    await Promise.all(updates);

    return NextResponse.json({ ok: true, message: "Agent settings updated successfully" });
  } catch (error: any) {
    console.error("[Superadmin POST error]", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
