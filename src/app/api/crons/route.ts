import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CronJob } from "@/lib/models/CronJob";
import { computeNextRun } from "@/lib/utils/cron";

export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agentId");
  const filter = agentId ? { agentId } : {};
  const jobs = await CronJob.find(filter).sort({ createdAt: -1 }).lean();
  return NextResponse.json(jobs);
}

export async function POST(req: Request) {
  await connectDB();
  const body = await req.json();
  const nextRunAt = computeNextRun(body.cronExpression);
  const job = await CronJob.create({ ...body, nextRunAt });
  return NextResponse.json(job, { status: 201 });
}
