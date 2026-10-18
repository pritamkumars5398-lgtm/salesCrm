import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Organization } from "@/lib/models/Organization";
import { Membership } from "@/lib/models/Membership";
import { Invite } from "@/lib/models/Invite";
import { User } from "@/lib/models/User";
import { Agent } from "@/lib/models/Agent";
import { PLANS } from "@/lib/plans";
import { authorizeOrganization } from "@/server/auth/access";
import { getOrganizationLimits, getOrganizationUsage } from "@/server/services/workspace.service";

/** GET — organization, plan & usage across workspaces, members and pending invites. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const access = await authorizeOrganization(req, id);
  if (!access.ok) return access.response;

  const [org, memberships, invites, workspaces, limits, usage] = await Promise.all([
    Organization.findById(id).lean(),
    Membership.find({ organizationId: id }).lean(),
    Invite.find({ organizationId: id, acceptedAt: null }).sort({ createdAt: -1 }).lean(),
    Agent.find({ organizationId: id, deletedAt: null }).select("_id name status").sort({ createdAt: 1 }).lean(),
    getOrganizationLimits(id),
    getOrganizationUsage(id),
  ]);
  if (!org) return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  const users = await User.find({ _id: { $in: memberships.map((m) => m.userId) } }).select("name email").lean();
  const userById = new Map(users.map((u) => [String(u._id), u]));
  const canManage = access.role === "owner" || access.role === "admin" || access.role === null;

  return NextResponse.json({
    _id: String(org._id),
    name: org.name,
    myRole: access.role ?? "owner",
    plan: { id: limits.planId, name: PLANS[limits.planId].name, limits: limits.limits },
    usage,
    workspaces: workspaces.map((w) => ({ _id: String(w._id), name: w.name, status: w.status })),
    members: memberships.map((m) => {
      const u = userById.get(String(m.userId));
      return {
        userId: String(m.userId),
        name: u?.name ?? "Unknown user",
        email: u?.email ?? "",
        role: m.role,
        allWorkspaces: m.allWorkspaces,
        workspaceIds: m.workspaceIds.map(String),
        isMe: String(m.userId) === access.user._id,
      };
    }).sort((a, b) => ["owner", "admin", "member"].indexOf(a.role) - ["owner", "admin", "member"].indexOf(b.role)),
    // Only admins see who has been invited.
    invites: canManage ? invites.map((i) => ({
      _id: String(i._id), email: i.email, role: i.role, allWorkspaces: i.allWorkspaces,
      workspaceIds: i.workspaceIds.map(String), createdAt: i.createdAt,
    })) : [],
  });
}

/** PUT { name } — rename the organization (admins). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const access = await authorizeOrganization(req, id, { minRole: "admin" });
  if (!access.ok) return access.response;
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!name) return NextResponse.json({ error: "Give the organization a name." }, { status: 400 });
  await Organization.updateOne({ _id: id }, { $set: { name } });
  return NextResponse.json({ ok: true, name });
}
