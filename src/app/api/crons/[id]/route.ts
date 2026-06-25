import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CronJob } from "@/lib/models/CronJob";
import { computeNextRun } from "@/lib/utils/cron";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const body = await req.json();
  if (body.cronExpression) {
    body.nextRunAt = computeNextRun(body.cronExpression);
  }
  const job = await CronJob.findByIdAndUpdate(id, body, { new: true }).lean();
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(job);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const resetLeads = searchParams.get("resetLeads") === "true";

  const job = await CronJob.findByIdAndDelete(id).lean();
  let resetCount = 0;

  if (resetLeads && job) {
    const { Lead } = await import("@/lib/models/Lead");
    const result = await Lead.updateMany(
      { agentId: job.agentId, status: "in_outreach" },
      { $set: { status: "new", pipelineStage: "new" } }
    );
    resetCount = result.modifiedCount;
  }

  return NextResponse.json({ success: true, resetCount });
}
