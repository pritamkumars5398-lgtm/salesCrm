import { Agent } from "@/lib/models/Agent";
import { CronJob } from "@/lib/models/CronJob";
import { computeNextRun } from "@/lib/utils/cron";
import {
  createCampaign,
  processCampaignSlice,
  findResumableCampaigns,
  BATCH_SLICE,
} from "./campaign.service";
import { runFullSync } from "./apify.service";

export interface CronRunResult {
  ok: boolean;
  detail: string;
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

  if (agent && agent.status === "inactive" && job.action !== "resume_agent") {
    return { ok: true, detail: "Agent is inactive (unpublished). Skipping cron execution." };
  }

  if (job.action === "start_outreach") {
    const campaign = await createCampaign(agentId, "cron");
    if (!campaign) return { ok: true, detail: "No eligible leads to contact." };

    const { remaining, campaign: fresh } = await processCampaignSlice(String(campaign._id), {
      baseUrl,
      maxLeads: BATCH_SLICE,
    });
    const sent = fresh?.sent ?? 0;
    const failed = fresh?.failed ?? 0;
    return {
      ok: true,
      detail: `Campaign ${campaign._id}: ${sent} sent, ${failed} failed, ${remaining} remaining${remaining > 0 ? " (continues next run)" : ""}`,
    };
  }

  if (job.action === "sync_apify") {
    // Scheduled "scrape → outreach": run all enabled scrapers, import the
    // results, then hand the fresh leads to the campaign pipeline.
    const { imported, notes } = await runFullSync(agentId);
    let outreachNote = "";
    if (imported > 0) {
      const campaign = await createCampaign(agentId, "cron");
      if (campaign) {
        const { remaining, campaign: fresh } = await processCampaignSlice(String(campaign._id), {
          baseUrl,
          maxLeads: BATCH_SLICE,
        });
        outreachNote = ` Outreach started: ${fresh?.sent ?? 0} sent, ${remaining} queued.`;
      }
    }
    return {
      ok: true,
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
    await Agent.findByIdAndUpdate(agentId, { status: "active" });
    return { ok: true, detail: "Agent resumed" };
  }

  return { ok: true, detail: `Action '${job.action}' acknowledged` };
}

/**
 * Re-enable all of an agent's schedules with fresh nextRunAt values.
 * Called when the agent is published — unpublishing disables schedules, and
 * without this they would silently stay off forever (looks like "schedules
 * don't persist" to the user).
 */
export async function armSchedules(agentId: string): Promise<number> {
  const jobs = await CronJob.find({ agentId }).lean();
  await Promise.all(
    jobs.map((j) =>
      CronJob.findByIdAndUpdate(j._id, {
        enabled: true,
        nextRunAt: computeNextRun(j.cronExpression),
      })
    )
  );
  return jobs.length;
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
