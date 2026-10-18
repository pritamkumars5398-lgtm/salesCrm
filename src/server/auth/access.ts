import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Agent, IAgent } from "@/lib/models/Agent";
import { Lead, ILead } from "@/lib/models/Lead";
import { Membership, MemberRole } from "@/lib/models/Membership";
import { SESSION_COOKIE, readCookie, verifySession } from "@/lib/session";

export interface SessionUser {
  _id: string;
  name: string;
  email: string;
  isSuperadmin: boolean;
}

export interface WorkspaceAccess {
  user: SessionUser;
  agent: IAgent;
  agentId: string;
  organizationId: string;
  /** null only for superadmins acting on an organization they don't belong to */
  role: MemberRole | null;
  canManage: boolean;
}

type Denied = { ok: false; response: NextResponse };

const ROLE_RANK: Record<MemberRole, number> = { member: 1, admin: 2, owner: 3 };

export function isSuperadminEmail(email: string): boolean {
  const list = (process.env.SUPERADMIN_EMAILS || "admin@salesagent.ai")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

export function deny(status: 400 | 401 | 403 | 404, error: string): Denied {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const session = await verifySession(readCookie(req.headers.get("cookie"), SESSION_COOKIE));
  if (!session || !Types.ObjectId.isValid(session.uid)) return null;
  await connectDB();
  const user = await User.findById(session.uid).select("name email sessionVersion").lean();
  if (!user || (user.sessionVersion ?? 0) !== session.sv) return null;
  return { _id: String(user._id), name: user.name, email: user.email, isSuperadmin: isSuperadminEmail(user.email) };
}

export async function authorizeUser(req: Request): Promise<{ ok: true; user: SessionUser } | Denied> {
  const user = await getSessionUser(req);
  if (!user) return deny(401, "Your session has expired. Please log in again.");
  return { ok: true, user };
}

export async function authorizeSuperadmin(req: Request): Promise<{ ok: true; user: SessionUser } | Denied> {
  const auth = await authorizeUser(req);
  if (!auth.ok) return auth;
  if (!auth.user.isSuperadmin) return deny(403, "Superadmin access required.");
  return auth;
}

function membershipCovers(m: { allWorkspaces: boolean; workspaceIds: Types.ObjectId[]; role: MemberRole }, agentId: string) {
  return m.role !== "member" || m.allWorkspaces || m.workspaceIds.some((id) => String(id) === agentId);
}

/**
 * The caller must be signed in, belong to the workspace's organization and have
 * access to this workspace. `minRole: "admin"` is for settings, publishing and
 * anything that changes the workspace itself.
 */
export async function authorizeWorkspace(
  req: Request,
  agentId: string | null | undefined,
  opts: { minRole?: MemberRole } = {},
): Promise<({ ok: true } & WorkspaceAccess) | Denied> {
  if (!agentId || !Types.ObjectId.isValid(agentId)) return deny(400, "A valid agentId is required.");
  const auth = await authorizeUser(req);
  if (!auth.ok) return auth;

  const agent = await Agent.findById(agentId);
  if (!agent || agent.deletedAt) return deny(404, "Workspace not found.");
  if (!agent.organizationId) {
    // Pre-organization workspace that hasn't been migrated yet — only its creator may touch it.
    if (auth.user.isSuperadmin || agent.userEmail === auth.user.email) {
      return { ok: true, user: auth.user, agent, agentId, organizationId: "", role: "owner", canManage: true };
    }
    return deny(404, "Workspace not found.");
  }

  const organizationId = String(agent.organizationId);
  const membership = await Membership.findOne({ organizationId, userId: auth.user._id }).lean();

  if (!membership || !membershipCovers(membership, agentId)) {
    if (auth.user.isSuperadmin) {
      return { ok: true, user: auth.user, agent, agentId, organizationId, role: null, canManage: true };
    }
    // 404, not 403: don't reveal that another company's workspace exists.
    return deny(404, "Workspace not found.");
  }

  const minRole = opts.minRole ?? "member";
  if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    return deny(403, minRole === "owner" ? "Only the organization owner can do this." : "Only admins can do this.");
  }
  return {
    ok: true, user: auth.user, agent, agentId, organizationId,
    role: membership.role, canManage: ROLE_RANK[membership.role] >= ROLE_RANK.admin,
  };
}

export async function authorizeLead(
  req: Request,
  leadId: string | null | undefined,
  opts: { minRole?: MemberRole } = {},
): Promise<({ ok: true; lead: ILead } & WorkspaceAccess) | Denied> {
  if (!leadId || !Types.ObjectId.isValid(leadId)) return deny(400, "A valid lead id is required.");
  await connectDB();
  const lead = await Lead.findById(leadId);
  if (!lead) return deny(404, "Lead not found.");
  const access = await authorizeWorkspace(req, String(lead.agentId), opts);
  if (!access.ok) return access.response.status === 404 ? deny(404, "Lead not found.") : access;
  return { ...access, lead };
}

/** For records that carry an agentId (calls, campaigns, crons, sequences…). */
export async function authorizeRecord<T extends { agentId: unknown }>(
  req: Request,
  record: T | null,
  notFound: string,
  opts: { minRole?: MemberRole } = {},
): Promise<({ ok: true; record: T } & WorkspaceAccess) | Denied> {
  if (!record) return deny(404, notFound);
  const access = await authorizeWorkspace(req, String(record.agentId), opts);
  if (!access.ok) return access.response.status === 404 ? deny(404, notFound) : access;
  return { ...access, record };
}

/** The caller's membership in an organization, with a minimum role. */
export async function authorizeOrganization(
  req: Request,
  organizationId: string | null | undefined,
  opts: { minRole?: MemberRole } = {},
): Promise<({ ok: true; user: SessionUser; role: MemberRole | null; organizationId: string }) | Denied> {
  if (!organizationId || !Types.ObjectId.isValid(organizationId)) return deny(400, "A valid organizationId is required.");
  const auth = await authorizeUser(req);
  if (!auth.ok) return auth;
  const membership = await Membership.findOne({ organizationId, userId: auth.user._id }).lean();
  if (!membership) {
    if (auth.user.isSuperadmin) return { ok: true, user: auth.user, role: null, organizationId };
    return deny(404, "Organization not found.");
  }
  const minRole = opts.minRole ?? "member";
  if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    return deny(403, minRole === "owner" ? "Only the organization owner can do this." : "Only admins can do this.");
  }
  return { ok: true, user: auth.user, role: membership.role, organizationId };
}
