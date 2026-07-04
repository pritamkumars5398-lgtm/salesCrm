import { Agent } from "@/lib/models/Agent";
import {
  createCampaign,
  processCampaignSlice,
  findResumableCampaigns,
  BATCH_SLICE,
} from "./campaign.service";

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
