import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Membership } from "@/lib/models/Membership";
import { authorizeOrganization } from "@/server/auth/access";
import { TeamError, assertCanAssign, getMembership, memberAccessPayload } from "@/server/services/team.service";

type Ctx = { params: Promise<{ id: string; userId: string }> };

/** PUT { role, allWorkspaces?, workspaceIds? } — change what a member can do / open. */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    await connectDB();
    const { id, userId } = await params;
    const access = await authorizeOrganization(req, id, { minRole: "admin" });
    if (!access.ok) return access.response;
    const target = await getMembership(id, userId);
    if (!target) return NextResponse.json({ error: "Member not found." }, { status: 404 });
    if (userId === access.user._id) return NextResponse.json({ error: "You can't change your own access." }, { status: 403 });

    const payload = await memberAccessPayload(id, await req.json().catch(() => ({})));
    assertCanAssign(access.role, target.role, payload.role);
    target.set(payload);
    await target.save();
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof TeamError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[Team] update failed:", err);
    return NextResponse.json({ error: "Could not update the member." }, { status: 500 });
  }
}

/** DELETE — remove a member, or leave the organization yourself. Access ends on their next request. */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    await connectDB();
    const { id, userId } = await params;
    const access = await authorizeOrganization(req, id);
    if (!access.ok) return access.response;
    const leaving = userId === access.user._id;
    if (!leaving && access.role === "member") {
      return NextResponse.json({ error: "Only admins can remove members." }, { status: 403 });
    }
    const target = await getMembership(id, userId);
    if (!target) return NextResponse.json({ error: "Member not found." }, { status: 404 });
    if (target.role === "owner") {
      return NextResponse.json({ error: "The owner can't be removed from their own organization." }, { status: 403 });
    }
    if (!leaving && target.role === "admin" && access.role !== "owner" && access.role !== null) {
      return NextResponse.json({ error: "Only the organization owner can remove an admin." }, { status: 403 });
    }
    await Membership.deleteOne({ _id: target._id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof TeamError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[Team] remove failed:", err);
    return NextResponse.json({ error: "Could not remove the member." }, { status: 500 });
  }
}
