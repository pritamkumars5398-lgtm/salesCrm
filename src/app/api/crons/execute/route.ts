/**
 * POST /api/crons/execute
 * Called by an external scheduler (Vercel Cron, GitHub Actions, cURL) every minute.
 * - Executes all enabled cron jobs whose nextRunAt is due.
 * - Resumes any unfinished outreach campaigns (one slice each, so a single
 *   invocation stays short; large campaigns finish across multiple ticks).
 *
 * Auth: when CRON_SECRET is set, requires `Authorization: Bearer <secret>`
 * or `x-cron-secret: <secret>`.
 */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CronJob } from "@/lib/models/CronJob";
import { computeNextRun } from "@/lib/utils/cron";
import { executeCronJob, resumeUnfinishedCampaigns } from "@/server/services/cron.service";
import { getAppBaseUrl } from "@/server/services/settings.service";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // not configured (dev) — allow
  const auth = req.headers.get("authorization") || "";
  const headerSecret = req.headers.get("x-cron-secret") || "";
  return auth === `Bearer ${secret}` || headerSecret === secret;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const now = new Date();
  const baseUrl = getAppBaseUrl(req);

  const dueCrons = await CronJob.find({
    enabled: true,
    nextRunAt: { $lte: now },
  }).lean();

  const results: { id: string; name: string; action: string; ok: boolean; detail?: string }[] = [];

  for (const job of dueCrons) {
    // Claim the schedule slot BEFORE executing so an overlapping scheduler tick
    // (or a slow run) can't execute the same job twice.
    const claimed = await CronJob.findOneAndUpdate(
      { _id: job._id, nextRunAt: job.nextRunAt },
      {
        lastRunAt: now,
        nextRunAt: computeNextRun(job.cronExpression),
        $inc: { runCount: 1 },
      }
    );
    if (!claimed) continue; // another invocation took it

    let ok = false;
    let detail: string | undefined;
    try {
      ({ ok, detail } = await executeCronJob(job, baseUrl));
    } catch (err) {
      detail = err instanceof Error ? err.message : String(err);
    }

    results.push({ id: String(job._id), name: job.name, action: job.action, ok, detail });
  }

  let resumed: string[] = [];
  try {
    resumed = await resumeUnfinishedCampaigns(baseUrl);
  } catch (err) {
    resumed = [`resume error: ${err instanceof Error ? err.message : String(err)}`];
  }

  return NextResponse.json({ ran: results.length, results, resumedCampaigns: resumed });
}
