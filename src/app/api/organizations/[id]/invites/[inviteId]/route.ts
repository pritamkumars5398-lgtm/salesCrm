import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Invite } from "@/lib/models/Invite";
import { authorizeOrganization } from "@/server/auth/access";

/** DELETE — cancel a pending invite. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; inviteId: string }> }) {
  await connectDB();
  const { id, inviteId } = await params;
  const access = await authorizeOrganization(req, id, { minRole: "admin" });
  if (!access.ok) return access.response;
  if (!Types.ObjectId.isValid(inviteId)) return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  const result = await Invite.deleteOne({ _id: inviteId, organizationId: id, acceptedAt: null });
  if (result.deletedCount === 0) return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
