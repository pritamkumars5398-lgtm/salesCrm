import { Types } from "mongoose";
import { Campaign, ICampaign } from "@/lib/models/Campaign";
import { Lead } from "@/lib/models/Lead";
import { getEmailConfig } from "@/lib/email-service";
import { getLLMConfig, getWhatsAppConfig } from "./settings.service";
import { sendOutreachToLead, OutreachOptions } from "./outreach.service";

/** How many leads are sent in parallel inside one batch. */
const CONCURRENCY = 3;
/** Max leads one processing slice handles (keeps cron invocations within time limits). */
export const BATCH_SLICE = 10;
/** A running campaign with no progress for this long is considered stalled and resumable. */
const STALL_MS = 5 * 60 * 1000;

export interface PreflightResult {
  ok: boolean;
  issues: string[];
  warnings: string[];
  eligibleLeads: number;
  channels: { email: boolean; whatsapp: boolean };
}

/**
 * Validate that an agent is actually able to run outreach before publishing.
 * `issues` block publishing; `warnings` don't.
 */
export async function preflightCheck(agentId: string): Promise<PreflightResult> {
  const issues: string[] = [];
  const warnings: string[] = [];

  const [llm, emailCfg, waCfg] = await Promise.all([
    getLLMConfig(agentId),
    getEmailConfig(agentId),
    getWhatsAppConfig(agentId),
  ]);

  if (!llm) issues.push("AI (LLM) API key is not configured — set it in Settings → AI.");
  if (!emailCfg && !waCfg) {
    issues.push("No outreach channel configured — set up Email (SMTP/API) or WhatsApp in Settings.");
  } else {
    if (!emailCfg) warnings.push("Email is not configured — leads with only an email address cannot be contacted.");
    if (!waCfg) warnings.push("WhatsApp is not configured — leads without an email cannot be contacted.");
  }

  const eligibleLeads = await countEligibleLeads(agentId);
  if (eligibleLeads === 0) warnings.push("No new leads to contact right now — outreach will start when leads are added.");

  return {
    ok: issues.length === 0,
    issues,
    warnings,
    eligibleLeads,
    channels: { email: !!emailCfg, whatsapp: !!waCfg },
  };
}

function eligibleLeadFilter(agentId: string) {
  return {
    agentId,
    status: "new",
    agentEnabled: { $ne: false },
    outreachStatus: { $nin: ["sending"] },
    $or: [
      { email: { $exists: true, $nin: ["", null] } },
      { phone: { $exists: true, $nin: ["", null] } },
      { whatsappLid: { $exists: true, $nin: ["", null] } },
    ],
  };
}

export async function countEligibleLeads(agentId: string): Promise<number> {
  return Lead.countDocuments(eligibleLeadFilter(agentId));
}

/**
 * Create a campaign covering the given leads (default: all eligible "new" leads)
 * and mark them outreachStatus="pending".
 */
export async function createCampaign(
  agentId: string,
  trigger: ICampaign["trigger"],
  leadIds?: string[]
): Promise<ICampaign | null> {
  // One active campaign per agent — don't stack duplicates.
  const active = await Campaign.findOne({ agentId, status: { $in: ["pending", "running"] } });
  if (active) return active;

  const ids = leadIds
    ? leadIds.map((id) => new Types.ObjectId(id))
    : (await Lead.find(eligibleLeadFilter(agentId)).select("_id").lean()).map((l) => l._id);

  if (ids.length === 0) return null;

  await Lead.updateMany(
    { _id: { $in: ids }, outreachStatus: { $ne: "sending" } },
    { outreachStatus: "pending", lastOutreachError: null }
  );

  return Campaign.create({
    agentId,
    trigger,
    status: "pending",
    total: ids.length,
    leadIds: ids,
    lastProgressAt: new Date(),
  });
}

async function runPool<T>(items: T[], worker: (item: T) => Promise<void>, concurrency = CONCURRENCY) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item === undefined) break;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

/**
 * Process up to `maxLeads` pending leads of a campaign. Returns how many remain.
 * Safe to call concurrently / repeatedly: per-lead claims in the outreach service
 * prevent double sends, and counters are updated atomically.
 */
export async function processCampaignSlice(
  campaignId: string,
  opts: OutreachOptions & { maxLeads?: number } = {}
): Promise<{ remaining: number; campaign: ICampaign | null }> {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign || campaign.status === "completed" || campaign.status === "failed") {
    return { remaining: 0, campaign };
  }

  if (campaign.status === "pending") {
    await Campaign.findByIdAndUpdate(campaignId, { status: "running", startedAt: campaign.startedAt ?? new Date() });
  }

  const pending = await Lead.find({
    _id: { $in: campaign.leadIds },
    outreachStatus: "pending",
  })
    .select("_id fullName firstName lastName")
    .limit(opts.maxLeads ?? BATCH_SLICE)
    .lean();

  await runPool(pending, async (lead) => {
    const result = await sendOutreachToLead(String(lead._id), {
      senderName: opts.senderName,
      baseUrl: opts.baseUrl,
    });

    const inc: Record<string, number> = {};
    const update: Record<string, unknown> = { lastProgressAt: new Date() };
    if (result.sent) inc.sent = 1;
    else if (result.skipped) inc.skipped = 1;
    else {
      inc.failed = 1;
      update.$push = {
        failures: {
          leadId: lead._id,
          leadName: lead.fullName || `${lead.firstName} ${lead.lastName}`,
          reason: result.error ?? "Unknown error",
        },
      };
    }
    await Campaign.findByIdAndUpdate(campaignId, { $inc: inc, ...update });
  });

  const remaining = await Lead.countDocuments({
    _id: { $in: campaign.leadIds },
    outreachStatus: "pending",
  });

  if (remaining === 0) {
    const fresh = await Campaign.findById(campaignId).lean();
    const allFailed = fresh && fresh.total > 0 && fresh.sent === 0 && fresh.failed > 0;
    await Campaign.findByIdAndUpdate(campaignId, {
      status: allFailed ? "failed" : "completed",
      finishedAt: new Date(),
    });
  }

  return { remaining, campaign: await Campaign.findById(campaignId) };
}

/**
 * Drive a campaign to completion in-process (used right after publish, where the
 * server process stays alive). Cron execution also picks up unfinished campaigns,
 * so a killed process only pauses the campaign, never loses it.
 */
export async function processCampaign(campaignId: string, opts: OutreachOptions = {}): Promise<void> {
  // total/BATCH_SLICE iterations would suffice; the extra headroom covers retries.
  for (let i = 0; i < 1000; i++) {
    const { remaining } = await processCampaignSlice(campaignId, opts);
    if (remaining === 0) return;
  }
}

/** Reset a finished campaign's failed leads to pending and reopen it. */
export async function retryFailedLeads(campaignId: string): Promise<ICampaign | null> {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) return null;

  const failedLeadIds = await Lead.find({
    _id: { $in: campaign.leadIds },
    outreachStatus: "failed",
  }).select("_id").lean();

  if (failedLeadIds.length === 0) return campaign;

  await Lead.updateMany(
    { _id: { $in: failedLeadIds.map((l) => l._id) } },
    { outreachStatus: "pending" }
  );

  return Campaign.findByIdAndUpdate(
    campaignId,
    {
      status: "running",
      finishedAt: null,
      lastProgressAt: new Date(),
      $inc: { failed: -failedLeadIds.length },
      $pull: { failures: { leadId: { $in: failedLeadIds.map((l) => l._id) } } },
    },
    { new: true }
  );
}

/** Campaigns that should be picked up by the scheduler (pending or stalled-running). */
export async function findResumableCampaigns(): Promise<ICampaign[]> {
  const stalledBefore = new Date(Date.now() - STALL_MS);
  return Campaign.find({
    $or: [
      { status: "pending" },
      { status: "running", lastProgressAt: { $lt: stalledBefore } },
    ],
  });
}
