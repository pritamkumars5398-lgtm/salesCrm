/**
 * POST /api/crons/[id]/run
 * Manually trigger a cron job immediately (Run Now).
 */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CronJob } from "@/lib/models/CronJob";
import { Lead } from "@/lib/models/Lead";
import { computeNextRun } from "@/lib/utils/cron";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB();
  const { id } = await params;

  const job = await CronJob.findById(id).lean();
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("host") || "localhost:3000";
  const base = `${proto}://${host}`;

  let ok = false;
  let detail: string | undefined;
  const now = new Date();

  try {
    if (job.action === "start_outreach") {
      const newLeads = await Lead.find({ agentId: job.agentId, status: "new" }).select("_id").lean();
      let sent = 0;
      for (const lead of newLeads) {
        try {
          const r = await fetch(`${base}/api/leads/${lead._id}/outreach`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ senderName: "our team" }),
          });
          if (r.ok) sent++;
        } catch { /* individual lead failure is non-fatal */ }
      }
      detail = `Outreach sent to ${sent} of ${newLeads.length} new lead(s)`;
      ok = true;
    } else if (job.action === "pause_agent") {
      await fetch(`${base}/api/agents/${job.agentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "inactive" }),
      });
      detail = "Agent paused";
      ok = true;
    } else if (job.action === "resume_agent") {
      await fetch(`${base}/api/agents/${job.agentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      detail = "Agent resumed";
      ok = true;
    } else {
      detail = `Action '${job.action}' acknowledged (no-op in Run Now)`;
      ok = true;
    }
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
