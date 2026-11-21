import { Types } from "mongoose";
import { Organization } from "@/lib/models/Organization";
import { Agent } from "@/lib/models/Agent";
import { User } from "@/lib/models/User";
import { Membership } from "@/lib/models/Membership";
import { Payment } from "@/lib/models/Payment";
import { Setting } from "@/lib/models/Setting";
import { Usage } from "@/lib/models/Usage";
import { PLANS, type PlanId, type PlanLimits } from "@/lib/plans";
import { currentMonth } from "@/lib/utils/date";
import { emptyCredits, FEATURE_LABEL, TOPUP_FIELDS, type TopUpField, type TopUpCredits } from "@/lib/topups";
import { getOrganizationLimits, getOrganizationUsage } from "./workspace.service";
import { clearPlatformCredentialCache } from "./platform-credentials";

/**
 * Data for the superadmin panel: every client organization, its subscription,
 * usage, setup and permissions. Real data only.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const EXPIRING_DAYS = 5;

export type ClientStatus = "active" | "expiring" | "expired" | "free";

/** Feature switches map onto the plan limits: a limit of 0 = switched off for this client. */
export const FEATURE_LIMIT: Record<TopUpField, keyof PlanLimits> = {
  callsMade: "callsPerMonth",
  messagesSent: "messagesPerMonth",
  smsSent: "smsPerMonth",
  emailsSent: "emailsPerMonth",
  leadsScraped: "leadsPerMonth",
  assistantTokens: "assistantTokensPerMonth",
};

/** Which channels a workspace has keys for (no network calls — just what's saved). */
const CHANNEL_KEYS: Record<string, string[]> = {
  ai: ["llmApiKey"],
  calls: ["plivoAuthToken", "callApiKey"],
  voice: ["voiceApiKey", "geminiApiKey"],
  whatsapp: ["waApiKey"],
  email: ["smtpPass", "emailApiKey"],
  sms: ["smsApiKey"],
  leads: ["apifyToken", "openaiApiKey", "anthropicApiKey"],
};
export const CHANNEL_NAMES = Object.keys(CHANNEL_KEYS);

function statusOf(plan: { purchasedPlan: PlanId; expiresAt: Date | null; expired: boolean }): ClientStatus {
  if (plan.purchasedPlan === "free") return "free";
  if (plan.expired) return "expired";
  if (plan.expiresAt && plan.expiresAt.getTime() - Date.now() < EXPIRING_DAYS * DAY_MS) return "expiring";
  return "active";
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

async function setupByWorkspace(agentIds: Types.ObjectId[]) {
  const keys = Object.values(CHANNEL_KEYS).flat();
  const rows = await Setting.find({ agentId: { $in: agentIds }, key: { $in: keys }, value: { $nin: ["", null] } }).select("agentId key").lean();
  const have = new Map<string, Set<string>>();
  rows.forEach((r) => {
    const id = String(r.agentId);
    if (!have.has(id)) have.set(id, new Set());
    have.get(id)!.add(r.key);
  });
  return (agentId: string) => {
    const set = have.get(agentId) ?? new Set<string>();
    return Object.fromEntries(CHANNEL_NAMES.map((c) => [c, CHANNEL_KEYS[c].some((k) => set.has(k))])) as Record<string, boolean>;
  };
}

export async function listClients() {
  const [orgs, agents, members] = await Promise.all([
    Organization.find().sort({ createdAt: -1 }).lean(),
    Agent.find({ deletedAt: null, organizationId: { $ne: null } }).select("name organizationId status leadCount updatedAt").lean(),
    Membership.aggregate<{ _id: Types.ObjectId; n: number }>([{ $group: { _id: "$organizationId", n: { $sum: 1 } } }]),
  ]);
  const owners = await User.find({ _id: { $in: orgs.map((o) => o.ownerUserId) } }).select("name email").lean();
  const ownerById = new Map(owners.map((u) => [String(u._id), u]));
  const memberCount = new Map(members.map((m) => [String(m._id), m.n]));
  const setup = await setupByWorkspace(agents.map((a) => a._id));

  return Promise.all(orgs.map(async (org) => {
    const orgId = String(org._id);
    const [plan, usage] = await Promise.all([getOrganizationLimits(orgId), getOrganizationUsage(orgId)]);
    const ws = agents.filter((a) => String(a.organizationId) === orgId);
    const channelsReady = CHANNEL_NAMES.filter((c) => ws.some((w) => setup(String(w._id))[c]));
    const owner = ownerById.get(String(org.ownerUserId));
    return {
      id: orgId,
      name: org.name,
      owner: { name: owner?.name ?? "", email: owner?.email ?? "" },
      createdAt: org.createdAt,
      plan: plan.planId,
      purchasedPlan: plan.purchasedPlan,
      expiresAt: plan.expiresAt,
      status: statusOf(plan),
      limits: plan.limits,
      usage,
      credits: { ...emptyCredits(), ...(org.topUpCredits ?? {}) } as TopUpCredits,
      workspaces: ws.map((w) => ({ id: String(w._id), name: w.name, live: w.status === "active", leads: w.leadCount ?? 0 })),
      members: memberCount.get(orgId) ?? 0,
      channelsReady,
      usesPlatformCredentials: !!org.usesPlatformCredentials,
      lastActive: ws.reduce<Date | null>((m, w) => (!m || (w.updatedAt && w.updatedAt > m) ? w.updatedAt ?? m : m), null),
    };
  }));
}

export async function platformOverview() {
  const clients = await listClients();
  const monthStart = startOfMonth();
  const [paidThisMonth, paidAll] = await Promise.all([
    Payment.find({ status: "paid", updatedAt: { $gte: monthStart } }).select("amount kind").lean(),
    Payment.aggregate<{ total: number }>([{ $match: { status: "paid" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
  ]);
  const usage = Object.fromEntries(TOPUP_FIELDS.map((f) => [f, clients.reduce((s, c) => s + (c.usage[f] ?? 0), 0)])) as Record<TopUpField, number>;
  const count = (s: ClientStatus) => clients.filter((c) => c.status === s).length;
  return {
    month: currentMonth(),
    clients: { total: clients.length, active: count("active"), expiring: count("expiring"), expired: count("expired"), free: count("free") },
    revenue: {
      thisMonth: paidThisMonth.reduce((s, p) => s + p.amount, 0) / 100,
      thisMonthPlans: paidThisMonth.filter((p) => p.kind !== "topup").reduce((s, p) => s + p.amount, 0) / 100,
      thisMonthTopUps: paidThisMonth.filter((p) => p.kind === "topup").reduce((s, p) => s + p.amount, 0) / 100,
      allTime: (paidAll[0]?.total ?? 0) / 100,
    },
    usage,
    workspaces: clients.reduce((s, c) => s + c.workspaces.length, 0),
    /** clients that need a look: expiring/expired, near a limit, or nothing set up */
    attention: clients
      .map((c) => {
        const reasons: string[] = [];
        if (c.status === "expiring") reasons.push("Plan ends soon");
        if (c.status === "expired") reasons.push("Plan expired");
        for (const f of TOPUP_FIELDS) {
          const lim = c.limits[FEATURE_LIMIT[f]];
          if (lim > 0 && c.usage[f] >= lim * 0.8 && !c.credits[f]) reasons.push(`${FEATURE_LABEL[f].name} ${c.usage[f].toLocaleString("en-IN")}/${lim.toLocaleString("en-IN")}`);
        }
        if (c.workspaces.length && c.channelsReady.length === 0) reasons.push("Nothing set up yet");
        return { id: c.id, name: c.name, email: c.owner.email, reasons };
      })
      .filter((a) => a.reasons.length)
      .slice(0, 12),
    recentClients: clients.slice(0, 6).map((c) => ({ id: c.id, name: c.name, email: c.owner.email, createdAt: c.createdAt, plan: c.purchasedPlan, status: c.status })),
  };
}

export async function getClient(orgId: string) {
  if (!Types.ObjectId.isValid(orgId)) return null;
  const org = await Organization.findById(orgId).lean();
  if (!org) return null;
  const all = await listClients();
  const base = all.find((c) => c.id === orgId)!;
  const agentIds = (await Agent.find({ organizationId: orgId }).select("_id").lean()).map((a) => a._id);
  const [memberships, payments, history] = await Promise.all([
    Membership.find({ organizationId: orgId }).lean(),
    Payment.find({ organizationId: orgId, status: { $ne: "created" } }).sort({ createdAt: -1 }).limit(50).lean(),
    Usage.aggregate<{ _id: string } & Record<TopUpField, number>>([
      { $match: { agentId: { $in: agentIds } } },
      { $group: { _id: "$month", ...Object.fromEntries(TOPUP_FIELDS.map((f) => [f, { $sum: `$${f}` }])) } },
      { $sort: { _id: -1 } },
      { $limit: 6 },
    ]),
  ]);
  const users = await User.find({ _id: { $in: memberships.map((m) => m.userId) } }).select("name email").lean();
  const userById = new Map(users.map((u) => [String(u._id), u]));
  const setup = await setupByWorkspace(agentIds);
  let customLimits: Partial<PlanLimits> = {};
  try { customLimits = org.customLimits ? JSON.parse(org.customLimits) : {}; } catch { /* ignore */ }

  return {
    ...base,
    customLimits,
    planLimits: PLANS[base.plan].limits,
    team: memberships.map((m) => ({
      name: userById.get(String(m.userId))?.name ?? "",
      email: userById.get(String(m.userId))?.email ?? "",
      role: m.role,
      allWorkspaces: m.allWorkspaces,
    })),
    workspaces: base.workspaces.map((w) => ({ ...w, setup: setup(w.id) })),
    payments: payments.map((p) => ({
      id: String(p._id), kind: p.kind ?? "plan", planId: p.planId, topUpField: p.topUpField, topUpUnits: p.topUpUnits,
      amount: p.amount / 100, status: p.status, createdAt: p.createdAt, periodEnd: p.periodEnd,
    })),
    history: history.map((h) => ({ month: h._id, ...Object.fromEntries(TOPUP_FIELDS.map((f) => [f, h[f] ?? 0])) })),
  };
}

export interface ClientUpdate {
  plan?: PlanId;
  /** ISO date, or null for no expiry */
  planExpiresAt?: string | null;
  /** per-feature monthly limit override: number (-1 unlimited, 0 off) or null to use the plan's */
  limits?: Partial<Record<keyof PlanLimits, number | null>>;
  usesPlatformCredentials?: boolean;
  /** free credits to add (or remove with a negative number) */
  grantCredits?: Partial<Record<TopUpField, number>>;
  name?: string;
}

export async function updateClient(orgId: string, u: ClientUpdate) {
  const org = await Organization.findById(orgId);
  if (!org) throw new Error("Client not found.");
  if (u.name !== undefined) {
    const n = String(u.name).replace(/\s+/g, " ").trim().slice(0, 80);
    if (n) org.name = n;
  }
  if (u.plan !== undefined) {
    if (!PLANS[u.plan]) throw new Error("Unknown plan.");
    org.plan = u.plan;
  }
  if (u.planExpiresAt !== undefined) {
    const d = u.planExpiresAt ? new Date(u.planExpiresAt) : null;
    if (d && Number.isNaN(d.getTime())) throw new Error("Invalid expiry date.");
    org.planExpiresAt = d;
  }
  if (u.limits) {
    let custom: Record<string, number> = {};
    try { custom = org.customLimits ? JSON.parse(org.customLimits) : {}; } catch { custom = {}; }
    for (const [k, v] of Object.entries(u.limits)) {
      if (v === null || v === undefined) delete custom[k];
      else if (Number.isInteger(v) && v >= -1 && v <= 10_000_000) custom[k] = v;
      else throw new Error(`Invalid limit for ${k}.`);
    }
    org.customLimits = Object.keys(custom).length ? JSON.stringify(custom) : "";
  }
  if (u.usesPlatformCredentials !== undefined) {
    org.usesPlatformCredentials = !!u.usesPlatformCredentials;
    clearPlatformCredentialCache();
  }
  await org.save();
  if (u.grantCredits) {
    const inc: Record<string, number> = {};
    for (const [f, n] of Object.entries(u.grantCredits)) {
      if (!TOPUP_FIELDS.includes(f as TopUpField) || !Number.isInteger(n) || n === 0 || Math.abs(n!) > 1_000_000) continue;
      inc[`topUpCredits.${f}`] = n!;
    }
    if (Object.keys(inc).length) {
      await Organization.updateOne({ _id: orgId }, { $inc: inc });
      // never below zero
      await Organization.updateOne({ _id: orgId }, [{ $set: Object.fromEntries(TOPUP_FIELDS.map((f) => [`topUpCredits.${f}`, { $max: [0, { $ifNull: [`$topUpCredits.${f}`, 0] }] }])) }]);
    }
  }
  return getClient(orgId);
}

export async function listPayments() {
  const payments = await Payment.find({ status: { $ne: "created" } }).sort({ createdAt: -1 }).limit(300).lean();
  const orgs = await Organization.find({ _id: { $in: payments.map((p) => p.organizationId) } }).select("name").lean();
  const orgName = new Map(orgs.map((o) => [String(o._id), o.name]));
  return payments.map((p) => ({
    id: String(p._id), clientId: String(p.organizationId), client: orgName.get(String(p.organizationId)) ?? "—",
    kind: p.kind ?? "plan", planId: p.planId, topUpField: p.topUpField, topUpUnits: p.topUpUnits,
    amount: p.amount / 100, status: p.status, createdAt: p.createdAt, periodEnd: p.periodEnd,
    fake: String(p.razorpayOrderId).startsWith("fake_"), failureReason: p.failureReason,
  }));
}
