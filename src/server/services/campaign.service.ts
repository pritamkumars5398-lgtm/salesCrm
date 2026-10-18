import { Types } from "mongoose";
import { Campaign, ICampaign } from "@/lib/models/Campaign";
import { Lead } from "@/lib/models/Lead";
import { Agent } from "@/lib/models/Agent";
import { Setting } from "@/lib/models/Setting";
import { getEmailConfig } from "@/lib/email-service";
import { getLLMConfig, getVoiceConfig, getWhatsAppConfig } from "./settings.service";
import { sendOutreachToLead, OutreachOptions } from "./outreach.service";
import { getVoiceSetupError } from "./call.service";
import { getPlaybook, hasOffer } from "./playbook.service";
import { groupFilterById } from "./lead-groups.service";
import { getOrganizationLimits, getOrganizationUsage } from "./workspace.service";

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
  channels: { email: boolean; whatsapp: boolean; call: boolean };
}

/**
 * Validate that an agent is actually able to run outreach before publishing.
 * `issues` block publishing; `warnings` don't.
 */
export async function preflightCheck(agentId: string): Promise<PreflightResult> {
  const issues: string[] = [];
  const warnings: string[] = [];

  const [llm, emailCfg, waCfg, voiceError, playbook] = await Promise.all([
    getLLMConfig(agentId),
    getEmailConfig(agentId),
    getWhatsAppConfig(agentId),
    getVoiceSetupError(agentId),
    getPlaybook(agentId),
  ]);
  const callReady = !voiceError;

  if (!llm) issues.push("AI (LLM) API key is not configured — set it in Settings → AI.");
  if (!hasOffer(playbook)) {
    issues.push("Tell the AI what this workspace sells — fill in \"What we offer\" in Settings → AI Sales Playbook. Without it the AI can only pitch something generic.");
  }
  if (!emailCfg && !waCfg && !callReady) {
    issues.push("No outreach channel configured — set up Email (SMTP/API), WhatsApp or Voice Calls in Settings.");
  } else {
    if (!emailCfg) warnings.push("Email is not configured — leads with only an email address cannot be contacted.");
    if (!waCfg) warnings.push("WhatsApp is not configured — leads without an email cannot be contacted.");
    if (!callReady) warnings.push(`Voice calls are not ready — sequence call steps will fail. ${voiceError}`);
  }
  if (!playbook.callGoal) warnings.push("No conversation goal set (Settings → AI Sales Playbook) — the AI will default to offering a short call.");

  warnings.push(...(await limitWarnings(agentId)));
  warnings.push(...(await sharedChannelWarnings(agentId)));

  const eligibleLeads = await countEligibleLeads(agentId);
  if (eligibleLeads === 0) warnings.push("No new leads to contact right now — outreach will start when leads are added.");

  return {
    ok: issues.length === 0,
    issues,
    warnings,
    eligibleLeads,
    channels: { email: !!emailCfg, whatsapp: !!waCfg, call: callReady },
  };
}

async function limitWarnings(agentId: string): Promise<string[]> {
  const agent = await Agent.findById(agentId).select("organizationId").lean();
  if (!agent?.organizationId) return [];
  const orgId = String(agent.organizationId);
  const [{ limits }, usage] = await Promise.all([getOrganizationLimits(orgId), getOrganizationUsage(orgId)]);
  const checks: [number, number, string][] = [
    [usage.emailsSent, limits.emailsPerMonth, "email"],
    [usage.messagesSent, limits.messagesPerMonth, "WhatsApp message"],
    [usage.callsMade, limits.callsPerMonth, "AI call"],
    [usage.smsSent, limits.smsPerMonth, "SMS"],
  ];
  return checks
    .filter(([used, max]) => max !== -1 && used >= max)
    .map(([, max, what]) => `This month's ${what} limit (${max}, shared by all your workspaces) is used up — those sends will be skipped until next month or a plan upgrade.`);
}

/**
 * Two business lines answering on the same number or inbox is a common setup
 * mistake: a callback or reply can't tell which business it was meant for.
 */
async function sharedChannelWarnings(agentId: string): Promise<string[]> {
  const agent = await Agent.findById(agentId).select("organizationId").lean();
  if (!agent?.organizationId) return [];
  const siblings = await Agent.find({ organizationId: agent.organizationId, deletedAt: null, _id: { $ne: agentId } })
    .select("_id name").lean();
  if (siblings.length === 0) return [];

  const keys = ["waSessionId", "imapUser", "smsFrom"] as const;
  const rows = await Setting.find({ agentId: { $in: [agentId, ...siblings.map((a) => a._id)] }, key: { $in: [...keys] } }).lean();
  const valueOf = (id: unknown, key: string) =>
    (rows.find((r) => String(r.agentId) === String(id) && r.key === key)?.value || "").trim().toLowerCase();

  const label: Record<string, string> = {
    waSessionId: "WhatsApp number",
    imapUser: "email inbox",
    smsFrom: "SMS number",
    callerPhone: "calling number",
  };
  const shared = new Map<string, string[]>();
  for (const key of keys) {
    const mine = valueOf(agentId, key);
    if (!mine) continue;
    for (const s of siblings) if (valueOf(s._id, key) === mine) shared.set(key, [...(shared.get(key) ?? []), s.name]);
  }
  // Effective caller numbers include the platform default, so compare resolved configs.
  const myCaller = (await getVoiceConfig(agentId)).callerPhone.replace(/\D/g, "");
  if (myCaller) {
    for (const s of siblings) {
      const theirs = (await getVoiceConfig(String(s._id))).callerPhone.replace(/\D/g, "");
      if (theirs && theirs === myCaller) shared.set("callerPhone", [...(shared.get("callerPhone") ?? []), s.name]);
    }
  }

  return [...shared.entries()].map(([key, names]) =>
    `The ${label[key]} is also used by ${names.join(", ")}. Replies are matched to the workspace that has that lead, but if the same person is a lead in both, it goes to the one that contacted them last — use a separate ${label[key]} per business if you can.`);
}

function eligibleLeadFilter(agentId: string) {
  return {
    agentId,
    status: "new",
    deletedAt: null,
    agentEnabled: { $ne: false },
    outreachStatus: { $nin: ["sending"] },
    $or: [
      { email: { $exists: true, $nin: ["", null] } },
      { phone: { $exists: true, $nin: ["", null] } },
      { whatsappLid: { $exists: true, $nin: ["", null] } },
    ],
  };
}

/** Eligible leads, optionally limited to one group. Null when the group isn't in this workspace. */
async function eligibleFilterFor(agentId: string, groupId?: string | null): Promise<Record<string, unknown> | null> {
  const base = eligibleLeadFilter(agentId);
  if (!groupId) return base;
  const group = await groupFilterById(agentId, groupId);
  return group ? { $and: [base, group] } : null;
}

export async function countEligibleLeads(agentId: string, groupId?: string | null): Promise<number> {
  const filter = await eligibleFilterFor(agentId, groupId);
  return filter ? Lead.countDocuments(filter) : 0;
}

/**
 * Create a campaign covering the given leads (default: all eligible "new" leads,
 * optionally capped to the first `limit`) and mark them outreachStatus="pending".
 */
export async function createCampaign(
  agentId: string,
  trigger: ICampaign["trigger"],
  opts: { leadIds?: string[]; limit?: number; groupId?: string | null } = {}
): Promise<ICampaign | null> {
  // One active campaign per agent — don't stack duplicates.
  const active = await Campaign.findOne({ agentId, status: { $in: ["pending", "running"] } });
  if (active) return active;

  let ids: Types.ObjectId[];
  if (opts.leadIds) {
    // Never trust ids from a request: only this workspace's own, live leads.
    const valid = opts.leadIds.filter((id) => Types.ObjectId.isValid(id));
    ids = (await Lead.find({ _id: { $in: valid }, agentId, deletedAt: null }).select("_id").lean()).map((l) => l._id);
  } else {
    const filter = await eligibleFilterFor(agentId, opts.groupId);
    if (!filter) return null;
    let q = Lead.find(filter).select("_id").sort({ createdAt: -1 });
    if (opts.limit && opts.limit > 0) q = q.limit(opts.limit);
    ids = (await q.lean()).map((l) => l._id);
  }

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

  // Manual/retry runs were explicitly requested by the user, so they work even
  // while the agent is in Draft; scheduled runs respect the agent status.
  const ignoreAgentStatus =
    opts.ignoreAgentStatus ?? (campaign.trigger === "manual" || campaign.trigger === "retry");

  await runPool(pending, async (lead) => {
    const result = await sendOutreachToLead(String(lead._id), {
      senderName: opts.senderName,
      baseUrl: opts.baseUrl,
      ignoreAgentStatus,
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
