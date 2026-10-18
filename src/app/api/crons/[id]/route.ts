import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { CronJob } from "@/lib/models/CronJob";
import { computeNextRun } from "@/lib/utils/cron";
import { authorizeRecord } from "@/server/auth/access";

async function load(req: Request, id: string) {
  const job = Types.ObjectId.isValid(id) ? await CronJob.findById(id).lean() : null;
  return authorizeRecord(req, job, "Not found", { minRole: "admin" });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const access = await load(req, id);
  if (!access.ok) return access.response;
  const body = await req.json().catch(() => ({}));

  const update: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim().slice(0, 120);
  if (typeof body.action === "string") update.action = body.action;
  if (typeof body.enabled === "boolean") {
    update.enabled = body.enabled;
    // An explicit user choice — Publish must not flip it back.
    update.pausedByUnpublish = false;
  }
  const expression = typeof body.cronExpression === "string" ? body.cronExpression : access.record.cronExpression;
  if (typeof body.cronExpression === "string" || body.enabled === true) {
    try {
      update.cronExpression = expression;
      update.nextRunAt = computeNextRun(expression);
    } catch {
      return NextResponse.json({ error: "That schedule (cron expression) is not valid." }, { status: 400 });
    }
  }
  const job = await CronJob.findByIdAndUpdate(id, update, { new: true, runValidators: true }).lean();
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(job);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const access = await load(req, id);
  if (!access.ok) return access.response;
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
