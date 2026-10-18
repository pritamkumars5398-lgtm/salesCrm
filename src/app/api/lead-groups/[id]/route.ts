import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { LeadGroup, ILeadGroup } from "@/lib/models/LeadGroup";
import { Lead } from "@/lib/models/Lead";
import { Campaign } from "@/lib/models/Campaign";
import { authorizeRecord } from "@/server/auth/access";
import { getFieldDefs } from "@/server/services/lead-groups.service";
import { cleanGroupInput } from "@/server/services/group-input";

async function load(req: Request, id: string) {
  const group = Types.ObjectId.isValid(id) ? await LeadGroup.findById(id).lean<ILeadGroup>() : null;
  return authorizeRecord(req, group, "Group not found", { minRole: "admin" });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const access = await load(req, id);
  if (!access.ok) return access.response;
  const body = await req.json().catch(() => ({}));
  const input = cleanGroupInput(body, await getFieldDefs(access.agentId), access.record);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
  try {
    const group = await LeadGroup.findByIdAndUpdate(id, { $set: input.value }, { new: true }).lean();
    return NextResponse.json(group);
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 11000) {
      return NextResponse.json({ error: `A group called "${input.value.name}" already exists.` }, { status: 409 });
    }
    throw err;
  }
}

/** DELETE — the leads stay; they're only taken out of this group. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const access = await load(req, id);
  if (!access.ok) return access.response;
  // A running campaign already has its lead list fixed, so deleting the group can't change who it contacts.
  const running = await Campaign.exists({ agentId: access.agentId, status: { $in: ["pending", "running"] } });
  await LeadGroup.deleteOne({ _id: id });
  await Lead.updateMany({ agentId: access.agentId, groupIds: new Types.ObjectId(id) }, { $pull: { groupIds: new Types.ObjectId(id) } });
  return NextResponse.json({ success: true, campaignRunning: !!running });
}
