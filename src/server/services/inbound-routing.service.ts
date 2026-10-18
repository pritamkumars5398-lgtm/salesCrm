import { Types } from "mongoose";
import { Agent } from "@/lib/models/Agent";
import { Setting } from "@/lib/models/Setting";
import { Lead, ILead } from "@/lib/models/Lead";
import { Conversation } from "@/lib/models/Conversation";

/**
 * One WhatsApp/SMS number can serve several business lines of the same
 * organization. An incoming message is routed to the workspace that has the
 * sender as a lead; if several do, to the one with the most recent conversation.
 */

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function valueFilter(value: string, mode: "exact" | "last10") {
  if (mode === "exact") return value;
  const digits = value.replace(/\D/g, "").slice(-10);
  return digits ? new RegExp(`${escapeRegex(digits)}$`) : value;
}

/**
 * Workspaces that may own a message received on `value` (session id / number).
 * With an explicit agentId (webhook URL), that workspace plus its siblings in
 * the same organization configured with the same value.
 */
export async function inboundCandidateWorkspaces(
  explicitAgentId: string | null,
  key: string,
  value: string,
  mode: "exact" | "last10" = "exact",
): Promise<string[]> {
  if (explicitAgentId) {
    if (!Types.ObjectId.isValid(explicitAgentId)) return [];
    const agent = await Agent.findById(explicitAgentId).select("organizationId deletedAt").lean();
    if (!agent || agent.deletedAt) return [];
    if (!agent.organizationId) return [explicitAgentId];
    const own = (await Setting.findOne({ agentId: explicitAgentId, key }).lean())?.value || value;
    if (!own) return [explicitAgentId];
    const siblings = await Agent.find({ organizationId: agent.organizationId, deletedAt: null, _id: { $ne: explicitAgentId } }).select("_id").lean();
    const sharing = siblings.length
      ? await Setting.find({ agentId: { $in: siblings.map((s) => s._id) }, key, value: valueFilter(own, mode) }).select("agentId").lean()
      : [];
    return [explicitAgentId, ...sharing.map((r) => String(r.agentId))];
  }

  if (!value) return [];
  const rows = await Setting.find({ key, value: valueFilter(value, mode) }).select("agentId").lean();
  if (rows.length === 0) return [];
  const live = await Agent.find({ _id: { $in: rows.map((r) => r.agentId) }, deletedAt: null }).select("_id organizationId").lean();
  // A number configured in two different companies is a misconfiguration; never cross organizations.
  const firstOrg = String(live[0]?.organizationId ?? "");
  return live.filter((a) => String(a.organizationId ?? "") === firstOrg).map((a) => String(a._id));
}

export async function findInboundLead(
  agentIds: string[],
  from: string,
  channel: "whatsapp" | "sms",
): Promise<ILead | null> {
  if (agentIds.length === 0) return null;
  const last10 = from.replace(/\D/g, "").slice(-10);
  const or: Record<string, unknown>[] = [];
  if (last10.length === 10) or.push({ phone: new RegExp(`${last10}$`) });
  if (channel === "whatsapp") or.push({ whatsappLid: from });
  if (or.length === 0) return null;

  const leads = await Lead.find({ agentId: { $in: agentIds }, deletedAt: null, $or: or });
  if (leads.length <= 1) return leads[0] ?? null;

  const convos = await Conversation.find({ leadId: { $in: leads.map((l) => l._id) }, channel })
    .sort({ updatedAt: -1 }).select("leadId").limit(1).lean();
  if (convos.length) {
    const hit = leads.find((l) => String(l._id) === String(convos[0].leadId));
    if (hit) return hit;
  }
  return leads.sort((a, b) => (b.lastContactedAt?.getTime() ?? 0) - (a.lastContactedAt?.getTime() ?? 0))[0];
}
