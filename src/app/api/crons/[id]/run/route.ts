/**
 * POST /api/crons/[id]/run
 * Manually trigger a cron job immediately (Run Now).
 */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CronJob } from "@/lib/models/CronJob";
import { computeNextRun } from "@/lib/utils/cron";
import { executeCronJob } from "@/server/services/cron.service";
import { getAppBaseUrl } from "@/server/services/settings.service";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB();
  const { id } = await params;

  const job = await CronJob.findById(id).lean();
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let ok = false;
  let detail: string | undefined;
  const now = new Date();

  try {
    ({ ok, detail } = await executeCronJob(job, getAppBaseUrl(req)));
  } catch (err) {
    detail = err instanceof Error ? err.message : String(err);
  }

  const nextRunAt = computeNextRun(job.cronExpression);
  const updated = await CronJob.findByIdAndUpdate(
    id,
    { lastRunAt: now, nextRunAt, $inc: { runCount: 1 } },
    { new: true }
  ).lean();

  return NextResponse.json({ ok, detail, job: updated });
}
