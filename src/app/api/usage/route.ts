import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Usage } from "@/lib/models/Usage";
import { Setting } from "@/lib/models/Setting";
import { PLANS, type PlanId } from "@/lib/plans";

function currentMonth() {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agentId");
  if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 });

  const month = currentMonth();

  const [usage, planRow] = await Promise.all([
    Usage.findOne({ agentId, month }).lean(),
    Setting.findOne({ agentId, key: "plan" }).lean(),
  ]);

  const planId = (planRow?.value ?? "free") as PlanId;
  const plan = PLANS[planId];

  return NextResponse.json({
    month,
    planId,
    plan: { name: plan.name, priceINR: plan.priceINR, color: plan.color, limits: plan.limits },
    usage: {
      leadsScraped: usage?.leadsScraped ?? 0,
      messagesSent: usage?.messagesSent ?? 0,
      callsMade:    usage?.callsMade    ?? 0,
      emailsSent:   usage?.emailsSent   ?? 0,
    },
  });
}

// POST: increment a usage counter
export async function POST(req: Request) {
  await connectDB();
  const { agentId, field, by = 1 } = (await req.json()) as {
    agentId: string;
    field: "leadsScraped" | "messagesSent" | "callsMade" | "emailsSent";
    by?: number;
  };
  if (!agentId || !field) return NextResponse.json({ error: "agentId and field required" }, { status: 400 });

  const month = currentMonth();
  await Usage.findOneAndUpdate(
    { agentId, month },
    { $inc: { [field]: by } },
    { upsert: true }
  );

  return NextResponse.json({ ok: true });
}

// PATCH: upgrade plan
export async function PATCH(req: Request) {
  await connectDB();
  const { agentId, planId } = (await req.json()) as { agentId: string; planId: PlanId };
  if (!agentId || !planId || !PLANS[planId]) {
    return NextResponse.json({ error: "invalid agentId or planId" }, { status: 400 });
  }

  await Setting.findOneAndUpdate(
    { agentId, key: "plan" },
    { $set: { value: planId } },
    { upsert: true }
  );

  return NextResponse.json({ ok: true, planId });
}
