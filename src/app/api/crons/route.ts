import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CronJob } from "@/lib/models/CronJob";
import { computeNextRun } from "@/lib/utils/cron";
import { authorizeWorkspace } from "@/server/auth/access";

const ACTIONS = ["start_outreach", "sync_apify", "send_report", "pause_agent", "resume_agent"];

export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const access = await authorizeWorkspace(req, searchParams.get("agentId"));
  if (!access.ok) return access.response;
  const jobs = await CronJob.find({ agentId: access.agentId }).sort({ createdAt: -1 }).lean();
  return NextResponse.json(jobs);
}

export async function POST(req: Request) {
  await connectDB();
  const body = await req.json().catch(() => ({}));
  const access = await authorizeWorkspace(req, body.agentId, { minRole: "admin" });
  if (!access.ok) return access.response;
  if (!body.name || !body.cronExpression || !ACTIONS.includes(body.action)) {
    return NextResponse.json({ error: "name, cronExpression and a valid action are required" }, { status: 400 });
  }
  let nextRunAt: Date;
  try {
    nextRunAt = computeNextRun(body.cronExpression);
  } catch {
    return NextResponse.json({ error: "That schedule (cron expression) is not valid." }, { status: 400 });
  }
  const job = await CronJob.create({
    agentId: access.agentId,
    name: String(body.name).slice(0, 120),
    cronExpression: body.cronExpression,
    action: body.action,
    enabled: body.enabled !== false,
    nextRunAt,
  });
  return NextResponse.json(job, { status: 201 });
}
