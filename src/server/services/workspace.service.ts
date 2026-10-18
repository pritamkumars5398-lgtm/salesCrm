import { Types } from "mongoose";
import { Agent, IAgent } from "@/lib/models/Agent";
import { Organization } from "@/lib/models/Organization";
import { Membership, MemberRole } from "@/lib/models/Membership";
import { Invite } from "@/lib/models/Invite";
import { Setting } from "@/lib/models/Setting";
import { Usage } from "@/lib/models/Usage";
import { Lead } from "@/lib/models/Lead";
import { Conversation } from "@/lib/models/Conversation";
import { Activity } from "@/lib/models/Activity";
import { Meeting } from "@/lib/models/Meeting";
import { Sequence } from "@/lib/models/Sequence";
import { CronJob } from "@/lib/models/CronJob";
import { Campaign } from "@/lib/models/Campaign";
import { Call } from "@/lib/models/Call";
import { LeadField } from "@/lib/models/LeadField";
import { LeadGroup } from "@/lib/models/LeadGroup";
import { KnowledgeItem } from "@/lib/models/KnowledgeItem";
import { PLANS, PlanId, PlanLimits } from "@/lib/plans";
import { currentMonth } from "@/lib/utils/date";
import { findTemplate } from "@/lib/constants/business-templates";

export interface WorkspaceSummary {
  _id: string;
  name: string;
  status: "active" | "inactive";
  leadCount: number;
  businessTemplate: string;
  organizationId: string;
  organizationName: string;
  role: MemberRole;
}

export interface OrganizationSummary {
  _id: string;
  name: string;
  role: MemberRole;
  plan: PlanId;
}

/** Connection settings that may be copied into a new workspace — never brand/playbook text. */
export const COPYABLE_INTEGRATION_KEYS = [
  "llmProvider", "llmApiKey", "llmModel",
  "waProvider", "waApiKey", "waSessionId", "twilioPhoneNumber", "waVerifyToken", "whatsappEnabled",
  "callProvider", "plivoAuthId", "plivoAuthToken", "callerPhone", "elevenLabsAgentId", "voiceApiKey", "voiceId",
  "callApiKey", "sttProvider", "sttApiKey", "voiceProvider", "callLanguage", "callMaxDuration",
  "callWindowStart", "callWindowEnd", "callConcurrency", "callRecording", "callVoicemailDetection", "voiceEnabled",
  "emailProvider", "emailApiKey", "smtpHost", "smtpPort", "smtpUser", "smtpPass", "smtpFrom",
  "imapHost", "imapPort", "imapUser", "imapPass", "emailEnabled",
  "smsProvider", "smsAccountSid", "smsApiKey", "smsFrom", "smsEnabled",
  "calendlyApiToken", "calendlyWebhookSecret", "calendlyEnabled",
  "apifyToken",
];

export class WorkspaceError extends Error {
  status: 400 | 403 | 404 | 409;
  constructor(status: 400 | 403 | 404 | 409, message: string) {
    super(message);
    this.status = status;
  }
}

const ROLE_RANK: Record<MemberRole, number> = { member: 1, admin: 2, owner: 3 };

function covers(m: { role: MemberRole; allWorkspaces: boolean; workspaceIds: Types.ObjectId[] }, agentId: string) {
  return m.role !== "member" || m.allWorkspaces || m.workspaceIds.some((id) => String(id) === agentId);
}

async function legacyPlanFor(agentIds: Types.ObjectId[]): Promise<{ plan: PlanId; customLimits: string }> {
  const rows = await Setting.find({ agentId: { $in: agentIds }, key: { $in: ["plan", "custom_limits"] } }).lean();
  const order: PlanId[] = ["free", "starter", "growth", "pro"];
  let plan: PlanId = "free";
  let customLimits = "";
  for (const r of rows) {
    if (r.key === "plan" && order.indexOf(r.value as PlanId) > order.indexOf(plan)) plan = r.value as PlanId;
    if (r.key === "custom_limits" && r.value && !customLimits) customLimits = r.value;
  }
  return { plan, customLimits };
}

/**
 * Run at every login/signup. Accepts pending invites, gives the user their own
 * organization if they have none, and moves workspaces created before
 * organizations existed (Agent.userEmail = this user) into it.
 */
export async function ensureOrganizationForUser(user: { _id: string; name: string; email: string }): Promise<void> {
  const userId = new Types.ObjectId(user._id);

  const invites = await Invite.find({ email: user.email, acceptedAt: null }).lean();
  for (const invite of invites) {
    const org = await Organization.findById(invite.organizationId).lean();
    if (!org) continue;
    const liveIds = (await Agent.find({ _id: { $in: invite.workspaceIds }, organizationId: org._id, deletedAt: null })
      .select("_id").lean()).map((a) => a._id);
    // An existing membership wins — an invite must never downgrade someone (e.g. the owner).
    await Membership.updateOne(
      { organizationId: org._id, userId },
      { $setOnInsert: { role: invite.role, allWorkspaces: invite.allWorkspaces, workspaceIds: liveIds } },
      { upsert: true },
    );
    await Invite.updateOne({ _id: invite._id }, { $set: { acceptedAt: new Date() } });
  }

  const legacyAgents = await Agent.find({
    userEmail: user.email,
    $or: [{ organizationId: { $exists: false } }, { organizationId: null }],
  }).select("_id").lean();

  const hasMembership = await Membership.exists({ userId });
  let owned = await Membership.findOne({ userId, role: "owner" }).lean();
  if (!owned && (legacyAgents.length > 0 || !hasMembership)) {
    const legacy = legacyAgents.length ? await legacyPlanFor(legacyAgents.map((a) => a._id)) : { plan: "free" as PlanId, customLimits: "" };
    const firstName = user.name.trim().split(/\s+/)[0] || "My";
    const org = await Organization.findOneAndUpdate(
      { ownerUserId: userId },
      { $setOnInsert: { name: `${firstName}'s organization`, plan: legacy.plan, customLimits: legacy.customLimits } },
      { upsert: true, new: true },
    );
    await Membership.updateOne(
      { organizationId: org._id, userId },
      { $set: { role: "owner", allWorkspaces: true } },
      { upsert: true },
    );
    owned = await Membership.findOne({ userId, role: "owner" }).lean();
  }

  if (owned && legacyAgents.length > 0) {
    await Agent.updateMany(
      { _id: { $in: legacyAgents.map((a) => a._id) } },
      { $set: { organizationId: owned.organizationId } },
    );
    // These workspaces ran on the platform's .env credentials before; keep them working.
    await Organization.updateOne({ _id: owned.organizationId }, { $set: { usesPlatformCredentials: true } });
  }
}

export async function listWorkspacesForUser(userId: string): Promise<{
  organizations: OrganizationSummary[];
  workspaces: WorkspaceSummary[];
}> {
  const memberships = await Membership.find({ userId }).lean();
  if (memberships.length === 0) return { organizations: [], workspaces: [] };
  const orgIds = memberships.map((m) => m.organizationId);
  const [orgs, agents] = await Promise.all([
    Organization.find({ _id: { $in: orgIds } }).lean(),
    Agent.find({ organizationId: { $in: orgIds }, deletedAt: null }).sort({ createdAt: 1 }).lean(),
  ]);
  const orgById = new Map(orgs.map((o) => [String(o._id), o]));
  const memberByOrg = new Map(memberships.map((m) => [String(m.organizationId), m]));

  const organizations = memberships
    .filter((m) => orgById.has(String(m.organizationId)))
    // The user's own organization first, then the ones they were invited to.
    .sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role])
    .map((m) => {
      const org = orgById.get(String(m.organizationId))!;
      const expired = !!org.planExpiresAt && org.planExpiresAt.getTime() <= Date.now();
      return { _id: String(org._id), name: org.name, role: m.role, plan: expired ? "free" : org.plan };
    });

  const workspaces: WorkspaceSummary[] = [];
  for (const a of agents) {
    const orgId = String(a.organizationId);
    const m = memberByOrg.get(orgId);
    if (!m || !covers(m, String(a._id))) continue;
    workspaces.push({
      _id: String(a._id),
      name: a.name,
      status: a.status,
      leadCount: a.leadCount,
      businessTemplate: a.businessTemplate || "",
      organizationId: orgId,
      organizationName: orgById.get(orgId)?.name || "",
      role: m.role,
    });
  }
  const orgOrder = new Map(organizations.map((o, i) => [o._id, i]));
  workspaces.sort((a, b) => (orgOrder.get(a.organizationId) ?? 0) - (orgOrder.get(b.organizationId) ?? 0));
  return { organizations, workspaces };
}

// ── Plan & usage (organization level) ───────────────────────────────────────

export interface OrganizationPlan {
  /** the plan in force right now (Free once a prepaid period has run out) */
  planId: PlanId;
  limits: PlanLimits;
  /** the plan last bought or assigned, even if it has expired */
  purchasedPlan: PlanId;
  expiresAt: Date | null;
  expired: boolean;
}

export async function getOrganizationLimits(organizationId: string): Promise<OrganizationPlan> {
  const org = await Organization.findById(organizationId).lean();
  const purchasedPlan: PlanId = org?.plan && PLANS[org.plan] ? org.plan : "free";
  const expiresAt = org?.planExpiresAt ?? null;
  const expired = !!expiresAt && expiresAt.getTime() <= Date.now();
  const planId: PlanId = expired ? "free" : purchasedPlan;
  let limits: PlanLimits = { ...PLANS[planId].limits };
  // Superadmin overrides apply to the plan in force, not to an expired one.
  if (org?.customLimits && !expired) {
    try {
      limits = { ...limits, ...JSON.parse(org.customLimits) };
    } catch (err) {
      console.error("[Workspace] invalid customLimits on organization", organizationId, err);
    }
  }
  return { planId, limits, purchasedPlan, expiresAt, expired };
}

export type UsageField = "leadsScraped" | "messagesSent" | "callsMade" | "emailsSent" | "smsSent";

/** Usage summed over every workspace of the organization, including deleted ones. */
export async function getOrganizationUsage(organizationId: string, month = currentMonth()): Promise<Record<UsageField, number>> {
  const agentIds = (await Agent.find({ organizationId }).select("_id").lean()).map((a) => a._id);
  const [row] = await Usage.aggregate<Record<UsageField, number>>([
    { $match: { agentId: { $in: agentIds }, month } },
    {
      $group: {
        _id: null,
        leadsScraped: { $sum: "$leadsScraped" },
        messagesSent: { $sum: "$messagesSent" },
        callsMade: { $sum: "$callsMade" },
        emailsSent: { $sum: "$emailsSent" },
        smsSent: { $sum: "$smsSent" },
      },
    },
  ]);
  return {
    leadsScraped: row?.leadsScraped ?? 0,
    messagesSent: row?.messagesSent ?? 0,
    callsMade: row?.callsMade ?? 0,
    emailsSent: row?.emailsSent ?? 0,
    smsSent: row?.smsSent ?? 0,
  };
}

// ── Workspace lifecycle ─────────────────────────────────────────────────────

const NAME_MAX = 60;

export function validateWorkspaceName(raw: unknown): string {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!name) throw new WorkspaceError(400, "Give the workspace a name (e.g. the business line it sells).");
  if (name.length > NAME_MAX) throw new WorkspaceError(400, `Workspace names can be at most ${NAME_MAX} characters.`);
  return name;
}

async function assertNameFree(organizationId: string, name: string, exceptId?: string) {
  const clash = await Agent.findOne({
    organizationId,
    deletedAt: null,
    name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  }).select("_id").lean();
  if (clash) throw new WorkspaceError(409, `A workspace called "${name}" already exists in this organization.`);
}

export async function renameWorkspace(agent: IAgent, rawName: unknown): Promise<string> {
  const name = validateWorkspaceName(rawName);
  if (agent.organizationId) await assertNameFree(String(agent.organizationId), name, String(agent._id));
  await Agent.updateOne({ _id: agent._id }, { $set: { name } });
  await Setting.updateOne({ agentId: agent._id, key: "agentName" }, { $set: { value: name } }, { upsert: true });
  return name;
}

export async function createWorkspace(opts: {
  organizationId: string;
  name: unknown;
  templateId?: string;
  creatorEmail: string;
  copyIntegrationsFrom?: string | null;
  /** extra settings, e.g. what the onboarding wizard collected */
  settings?: Record<string, string>;
}): Promise<IAgent> {
  const name = validateWorkspaceName(opts.name);
  await assertNameFree(opts.organizationId, name);

  const { limits } = await getOrganizationLimits(opts.organizationId);
  const existing = await Agent.countDocuments({ organizationId: opts.organizationId, deletedAt: null });
  if (limits.workspaces !== -1 && existing >= limits.workspaces) {
    throw new WorkspaceError(403, `Your plan allows ${limits.workspaces} workspace${limits.workspaces === 1 ? "" : "s"}. Upgrade the plan to add another business.`);
  }

  let copySource: string | null = null;
  if (opts.copyIntegrationsFrom) {
    const source = await Agent.findOne({ _id: opts.copyIntegrationsFrom, organizationId: opts.organizationId, deletedAt: null }).select("_id").lean();
    if (!source) throw new WorkspaceError(400, "The workspace to copy connections from was not found in this organization.");
    copySource = String(source._id);
  }

  const template = findTemplate(opts.templateId);
  const agent = await Agent.create({
    name,
    organizationId: opts.organizationId,
    businessTemplate: template.id,
    userEmail: opts.creatorEmail,
    status: "inactive",
  });

  try {
    const values: Record<string, string> = {
      agentName: name,
      brandName: name,
      whatsappEnabled: "true",
      emailEnabled: "true",
      smsEnabled: "true",
      voiceEnabled: "true",
      followUpDays: "3",
      targetCompanySize: "Any",
      // Default lead source: Google Maps via Apify (the token is still the user's own).
      activeScraperType: "google-maps",
      "google-mapsEnabled": "true",
      gmMaxResults: "25",
      gmActorId: "nwua9Gu5YrADL7ZDj",
      apifyScraper: "Google Maps businesses",
      apifyActorId: "nwua9Gu5YrADL7ZDj",
      ...template.playbook,
      pipelineLabels: JSON.stringify(template.pipelineLabels),
    };
    if (copySource) {
      const rows = await Setting.find({ agentId: copySource, key: { $in: COPYABLE_INTEGRATION_KEYS } }).lean();
      rows.forEach((r) => { if (r.value !== undefined && r.value !== null) values[r.key] = r.value; });
    }
    for (const [k, v] of Object.entries(opts.settings ?? {})) {
      if (typeof v === "string" && v.trim() !== "") values[k] = v;
    }
    await Setting.bulkWrite(Object.entries(values).map(([key, value]) => ({
      updateOne: { filter: { agentId: agent._id, key }, update: { $set: { value } }, upsert: true },
    })));

    if (template.fields.length) {
      await LeadField.insertMany(template.fields.map((f, i) => ({
        agentId: agent._id, key: f.key, label: f.label, type: f.type,
        options: f.options ?? [], aiFill: !!f.aiFill, description: f.description ?? "", order: i,
      })));
    }
    if (template.groups.length) {
      await LeadGroup.insertMany(template.groups.map((g) => ({
        agentId: agent._id, name: g.name, color: g.color, kind: "smart", match: g.match,
        rules: g.rules, playbook: g.playbook ?? "",
      })));
    }
  } catch (err) {
    // Don't leave a half-built workspace behind.
    await Promise.all([
      Agent.deleteOne({ _id: agent._id }),
      Setting.deleteMany({ agentId: agent._id }),
      LeadField.deleteMany({ agentId: agent._id }),
      LeadGroup.deleteMany({ agentId: agent._id }),
    ]);
    throw err;
  }
  return agent;
}

/**
 * Delete a workspace and everything in it. The Agent document stays as a
 * tombstone (deletedAt) so this month's usage is still billed to the organization.
 */
export async function deleteWorkspace(agent: IAgent): Promise<void> {
  const agentId = agent._id;
  if (agent.organizationId) {
    const remaining = await Agent.countDocuments({ organizationId: agent.organizationId, deletedAt: null, _id: { $ne: agentId } });
    if (remaining === 0) throw new WorkspaceError(409, "This is the organization's only workspace — create another one before deleting it.");
  }
  if (await Call.exists({ agentId, active: true })) {
    throw new WorkspaceError(409, "A call is live in this workspace. End it (or wait for it to finish) before deleting.");
  }

  // Stop automation first so nothing new starts while the data is being removed.
  await Agent.updateOne({ _id: agentId }, { $set: { deletedAt: new Date(), status: "inactive" } });
  await CronJob.deleteMany({ agentId });
  await Campaign.updateMany({ agentId, status: { $in: ["pending", "running"] } }, { $set: { status: "failed", finishedAt: new Date() } });

  await Promise.all([
    Lead.deleteMany({ agentId }),
    Conversation.deleteMany({ agentId }),
    Activity.deleteMany({ agentId }),
    Meeting.deleteMany({ agentId }),
    Sequence.deleteMany({ agentId }),
    Campaign.deleteMany({ agentId }),
    Call.deleteMany({ agentId }),
    Setting.deleteMany({ agentId }),
    LeadField.deleteMany({ agentId }),
    LeadGroup.deleteMany({ agentId }),
    KnowledgeItem.deleteMany({ agentId }),
    Membership.updateMany({ workspaceIds: agentId }, { $pull: { workspaceIds: agentId } }),
    Invite.updateMany({ workspaceIds: agentId }, { $pull: { workspaceIds: agentId } }),
  ]);
}
