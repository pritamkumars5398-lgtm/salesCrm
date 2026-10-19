import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { CronJob } from "@/lib/models/CronJob";
import { CronRun } from "@/lib/models/CronRun";
import { Campaign } from "@/lib/models/Campaign";
import { authorizeRecord } from "@/server/auth/access";

/** GET — this schedule's recent runs, with the progress of any outreach they started. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const job = Types.ObjectId.isValid(id) ? await CronJob.findById(id).select("agentId").lean() : null;
  const access = await authorizeRecord(req, job, "Not found");
  if (!access.ok) return access.response;

  const runs = await CronRun.find({ jobId: id }).sort({ startedAt: -1 }).limit(15).lean();
  const campaigns = await Campaign.find({ _id: { $in: runs.map((r) => r.campaignId).filter(Boolean) } })
    .select("status total sent failed skipped").lean();
  const byId = new Map(campaigns.map((c) => [String(c._id), c]));
  return NextResponse.json(runs.map((r) => {
    const c = r.campaignId ? byId.get(String(r.campaignId)) : null;
    return {
      _id: String(r._id), trigger: r.trigger, status: r.status, detail: r.detail,
      startedAt: r.startedAt, finishedAt: r.finishedAt,
      campaign: c ? { _id: String(c._id), status: c.status, total: c.total, sent: c.sent, failed: c.failed, skipped: c.skipped } : null,
    };
  }));
}
