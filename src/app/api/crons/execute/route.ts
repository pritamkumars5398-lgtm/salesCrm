/**
 * POST /api/crons/execute
 * Called by an external scheduler (e.g. Vercel Cron, cURL, GitHub Actions) every minute.
 * Finds all enabled cron jobs whose nextRunAt is ≤ now and executes them.
 */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CronJob } from "@/lib/models/CronJob";
import { Lead } from "@/lib/models/Lead";
import { computeNextRun } from "@/lib/utils/cron";

export async function POST(req: Request) {
  await connectDB();

  const now = new Date();
  const dueCrons = await CronJob.find({
    enabled: true,
    nextRunAt: { $lte: now },
  }).lean();

  const results: { id: string; name: string; action: string; ok: boolean; detail?: string }[] = [];

  for (const job of dueCrons) {
    let ok = false;
    let detail: string | undefined;

    try {
      const proto = req.headers.get("x-forwarded-proto") || "http";
      const host = req.headers.get("host") || "localhost:3000";
      const base = `${proto}://${host}`;

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
        detail = `Sent outreach to ${sent}/${newLeads.length} leads`;
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
        detail = `Action '${job.action}' acknowledged`;
        ok = true;
      }
    } catch (err) {
      detail = err instanceof Error ? err.message : String(err);
    }

    const nextRunAt = computeNextRun(job.cronExpression);
    await CronJob.findByIdAndUpdate(job._id, {
      lastRunAt: now,
      nextRunAt,
      $inc: { runCount: 1 },
    });

    results.push({ id: String(job._id), name: job.name, action: job.action, ok, detail });
  }

  return NextResponse.json({ ran: results.length, results });
}
