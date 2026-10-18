import { Types } from "mongoose";
import { Agent } from "@/lib/models/Agent";
import { Membership, MemberRole } from "@/lib/models/Membership";

export class TeamError extends Error {
  status: 400 | 403 | 404 | 409;
  constructor(status: 400 | 403 | 404 | 409, message: string) {
    super(message);
    this.status = status;
  }
}

/** Workspace ids from a request, kept only if they are live workspaces of this organization. */
export async function cleanWorkspaceIds(organizationId: string, raw: unknown): Promise<Types.ObjectId[]> {
  if (!Array.isArray(raw)) return [];
  const ids = raw.map(String).filter((id) => Types.ObjectId.isValid(id));
  if (ids.length === 0) return [];
  const rows = await Agent.find({ _id: { $in: ids }, organizationId, deletedAt: null }).select("_id").lean();
  if (rows.length !== new Set(ids).size) throw new TeamError(400, "One of the selected workspaces isn't part of this organization.");
  return rows.map((r) => r._id);
}

/**
 * Who may set `targetRole` on someone whose current role is `currentRole`.
 * The owner is fixed; only the owner hands out or takes away admin rights.
 */
export function assertCanAssign(actorRole: MemberRole | null, currentRole: MemberRole | null, targetRole: MemberRole) {
  if (targetRole === "owner" || currentRole === "owner") throw new TeamError(403, "The organization owner can't be changed here.");
  const actorIsOwner = actorRole === "owner" || actorRole === null; // null = superadmin
  if ((targetRole === "admin" || currentRole === "admin") && !actorIsOwner) {
    throw new TeamError(403, "Only the organization owner can add or change admins.");
  }
}

export async function memberAccessPayload(organizationId: string, body: Record<string, unknown>) {
  const role: MemberRole = body.role === "admin" ? "admin" : "member";
  const allWorkspaces = role === "admin" ? true : body.allWorkspaces !== false;
  const workspaceIds = allWorkspaces ? [] : await cleanWorkspaceIds(organizationId, body.workspaceIds);
  if (!allWorkspaces && workspaceIds.length === 0) {
    throw new TeamError(400, "Pick at least one workspace this member can open, or give access to all workspaces.");
  }
  return { role, allWorkspaces, workspaceIds };
}

export async function getMembership(organizationId: string, userId: string) {
  if (!Types.ObjectId.isValid(userId)) return null;
  return Membership.findOne({ organizationId, userId });
}
