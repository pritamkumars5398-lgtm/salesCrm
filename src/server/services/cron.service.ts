import { Agent } from "@/lib/models/Agent";
import { CronJob } from "@/lib/models/CronJob";
import { CronRun } from "@/lib/models/CronRun";
import { computeNextRun } from "@/lib/utils/cron";
import {
  createCampaign,
  processCampaignSlice,
  findResumableCampaigns,
  preflightCheck,
  BATCH_SLICE,
} from "./campaign.service";
import { runFullSync } from "./apify.service";

export interface CronRunResult {
  ok: boolean;
  detail: string;
  /** outreach campaign started by this run, so the UI can show its leads */
  campaignId?: string;
}

/** Minimal shape needed to execute a job (works for hydrated and lean docs). */
export interface CronJobLike {
  agentId: unknown;
  action: string;
}

/**
 * Execute one cron job's action. Called both by the scheduler endpoint and the
 * manual "Run now" button. Outreach goes through the campaign pipeline so runs
 * are resumable and can never double-send.
 */
export async function executeCronJob(job: CronJobLike, baseUrl: string): Promise<CronRunResult> {
  const agentId = String(job.agentId);
  const agent = await Agent.findById(agentId).lean();

  if (!agent || agent.deletedAt) {
    return { ok: false, detail: "Workspace no longer exists. Skipping." };
  }
  if (agent.status === "inactive" && job.action !== "resume_agent") {
    return { ok: true, detail: "Agent is inactive (unpublished). Skipping cron execution." };
  }

  if (job.action === "start_outreach") {
    const campaign = await createCampaign(agentId, "cron");
    if (!campaign) return { ok: true, detail: "No eligible leads to contact — every lead with contact info was already contacted, or AI is off for them." };

    const { remaining, campaign: fresh } = await processCampaignSlice(String(campaign._id), {
      baseUrl,
      maxLeads: BATCH_SLICE,
    });
    const sent = fresh?.sent ?? 0;
    const failed = fresh?.failed ?? 0;
    return {
      ok: true,
      campaignId: String(campaign._id),
      detail: `${campaign.total} lead${campaign.total === 1 ? "" : "s"} picked: ${sent} contacted, ${failed} failed${remaining > 0 ? `, ${remaining} still queued (continues automatically)` : ""}.`,
    };
  }

  if (job.action === "sync_apify") {
    // Scheduled "scrape → outreach": run all enabled scrapers, import the
    // results, then hand the fresh leads to the campaign pipeline.
    const { imported, notes } = await runFullSync(agentId);
    let outreachNote = "";
    let campaignId: string | undefined;
    if (imported > 0) {
      const campaign = await createCampaign(agentId, "cron");
      if (campaign) {
        campaignId = String(campaign._id);
        const { remaining, campaign: fresh } = await processCampaignSlice(String(campaign._id), {
          baseUrl,
          maxLeads: BATCH_SLICE,
        });
        outreachNote = ` Outreach started: ${fresh?.sent ?? 0} sent, ${remaining} queued.`;
      }
    }
    return {
      ok: true,
      campaignId,
      detail: `Imported ${imported} new lead${imported !== 1 ? "s" : ""}.${outreachNote}${notes.length ? ` Notes: ${notes.join("; ")}` : ""}`,
    };
  }

  if (job.action === "pause_agent") {
    // Only flip the status — outreach crons already no-op while the agent is
    // inactive, and disabling them here would also kill the resume_agent cron.
    await Agent.findByIdAndUpdate(agentId, { status: "inactive" });
    return { ok: true, detail: "Agent paused" };
  }

  if (job.action === "resume_agent") {
    // Resuming goes live just like Publish, so it must pass the same checks —
    // settings may have broken while the agent was paused.
    const preflight = await preflightCheck(agentId);
    if (!preflight.ok) {
      return { ok: false, detail: `Not resumed — fix first: ${preflight.issues.join(" ")}` };
    }
    await Agent.findByIdAndUpdate(agentId, { status: "active" });
    return { ok: true, detail: "Agent resumed" };
  }

  return { ok: true, detail: `Action '${job.action}' acknowledged` };
}

/**
 * Turn back on the schedules that Unpublish paused, and give every enabled
 * schedule a fresh nextRunAt (a stale one would fire immediately).
 * Schedules the user switched off themselves stay off. Schedules disabled
 * before `pausedByUnpublish` existed were turned off by the old Unpublish,
 * which re-enabled everything on Publish — so those come back too.
 * Returns how many schedules are armed.
 */
export async function armSchedules(agentId: string): Promise<number> {
  await CronJob.updateMany(
    { agentId, enabled: false, $or: [{ pausedByUnpublish: true }, { pausedByUnpublish: { $exists: false } }] },
    { $set: { enabled: true } },
  );
  await CronJob.updateMany({ agentId }, { $set: { pausedByUnpublish: false } });
  const jobs = await CronJob.find({ agentId, enabled: true }).lean();
  await Promise.all(
    jobs.map((j) => CronJob.findByIdAndUpdate(j._id, { nextRunAt: computeNextRun(j.cronExpression) }))
  );
  return jobs.length;
}

/** Take a workspace out of live mode; its enabled schedules are paused (not forgotten). */
export async function unpublishAgent(agentId: string): Promise<void> {
  await Agent.findByIdAndUpdate(agentId, { status: "inactive" });
  await CronJob.updateMany({ agentId, enabled: true }, { $set: { enabled: false, pausedByUnpublish: true } });
}

/**
 * Continue campaigns that are pending or lost their worker (stalled).
 * One slice per campaign per tick keeps each invocation short.
 */
export async function resumeUnfinishedCampaigns(baseUrl: string): Promise<string[]> {
  const campaigns = await findResumableCampaigns();
  const notes: string[] = [];
  for (const c of campaigns) {
    const { remaining } = await processCampaignSlice(String(c._id), { baseUrl, maxLeads: BATCH_SLICE });
    notes.push(`Campaign ${c._id}: resumed, ${remaining} remaining`);
  }
  return notes;
}

/** Execute a schedule and keep a record of the run (shown when the schedule is opened). */
export async function runCronJob(
  job: CronJobLike & { _id: unknown },
  baseUrl: string,
  trigger: "schedule" | "manual",
): Promise<CronRunResult> {
  const run = await CronRun.create({ jobId: job._id, agentId: job.agentId, trigger, status: "running", startedAt: new Date() });
  let result: CronRunResult;
  try {
    result = await executeCronJob(job, baseUrl);
  } catch (err) {
    result = { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
  await CronRun.updateOne({ _id: run._id }, {
    $set: {
      status: result.ok ? "done" : "failed",
      detail: result.detail.slice(0, 1000),
      campaignId: result.campaignId ?? null,
      finishedAt: new Date(),
    },
  });
  return result;
}
