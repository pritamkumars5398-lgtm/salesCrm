import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Meeting } from "@/lib/models/Meeting";
import { Lead } from "@/lib/models/Lead";
import { authorizeWorkspace } from "@/server/auth/access";

export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const access = await authorizeWorkspace(req, searchParams.get("agentId"));
  if (!access.ok) return access.response;
  const meetings = await Meeting.find({ agentId: access.agentId }).sort({ scheduledAt: 1 }).lean();
  return NextResponse.json(meetings);
}

export async function POST(req: Request) {
  await connectDB();
  const body = await req.json().catch(() => ({}));
  const access = await authorizeWorkspace(req, body.agentId);
  if (!access.ok) return access.response;
  if (body.leadId && (!Types.ObjectId.isValid(body.leadId) || !(await Lead.exists({ _id: body.leadId, agentId: access.agentId })))) {
    return NextResponse.json({ error: "Lead not found in this workspace." }, { status: 404 });
  }
  const { _id, ...fields } = body;
  void _id;
  const meeting = await Meeting.create({ ...fields, agentId: access.agentId });
  return NextResponse.json(meeting, { status: 201 });
}
