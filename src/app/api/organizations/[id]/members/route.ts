import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Membership } from "@/lib/models/Membership";
import { Invite } from "@/lib/models/Invite";
import { authorizeOrganization } from "@/server/auth/access";
import { TeamError, assertCanAssign, memberAccessPayload } from "@/server/services/team.service";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST { email, role, allWorkspaces?, workspaceIds? } — add someone to the organization.
 * Existing accounts are added straight away; anyone else gets an invite that is
 * used the moment they sign up (or log in) with that email.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const { id } = await params;
    const access = await authorizeOrganization(req, id, { minRole: "admin" });
    if (!access.ok) return access.response;
    const body = await req.json().catch(() => ({}));

    const email = String(body.email ?? "").toLowerCase().trim();
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    const payload = await memberAccessPayload(id, body);
    assertCanAssign(access.role, null, payload.role);

    const user = await User.findOne({ email }).select("_id").lean();
    if (user) {
      if (await Membership.exists({ organizationId: id, userId: user._id })) {
        return NextResponse.json({ error: "That person is already in this organization." }, { status: 409 });
      }
      await Membership.create({ organizationId: id, userId: user._id, ...payload });
      return NextResponse.json({ added: true }, { status: 201 });
    }

    const pending = await Invite.findOne({ organizationId: id, email, acceptedAt: null });
    if (pending) {
      pending.set(payload);
      await pending.save();
      return NextResponse.json({ invited: true, updated: true });
    }
    await Invite.create({ organizationId: id, email, invitedBy: access.user._id, ...payload });
    return NextResponse.json({ invited: true }, { status: 201 });
  } catch (err) {
    if (err instanceof TeamError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[Team] invite failed:", err);
    return NextResponse.json({ error: "Could not add the member." }, { status: 500 });
  }
}
