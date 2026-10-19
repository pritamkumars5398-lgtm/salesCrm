/**
 * POST /api/crons/[id]/run
 * Manually trigger a cron job immediately (Run Now).
 */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CronJob } from "@/lib/models/CronJob";
import { computeNextRun } from "@/lib/utils/cron";
import { runCronJob } from "@/server/services/cron.service";
import { getAppBaseUrl } from "@/server/services/settings.service";
import { authorizeRecord } from "@/server/auth/access";
import { Types } from "mongoose";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB();
  const { id } = await params;

  const found = Types.ObjectId.isValid(id) ? await CronJob.findById(id).lean() : null;
  const access = await authorizeRecord(req, found, "Not found", { minRole: "admin" });
  if (!access.ok) return access.response;
  const job = access.record;

  let ok = false;
  let detail: string | undefined;
  const now = new Date();

  try {
    ({ ok, detail } = await runCronJob(job, getAppBaseUrl(req), "manual"));
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
