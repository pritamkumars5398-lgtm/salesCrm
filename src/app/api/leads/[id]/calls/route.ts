import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Call } from "@/lib/models/Call";
import { authorizeLead } from "@/server/auth/access";

/** Call history for a lead, newest first. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const access = await authorizeLead(req, id);
  if (!access.ok) return access.response;
  const calls = await Call.find({ leadId: access.lead._id, agentId: access.lead.agentId }).sort({ createdAt: -1 }).limit(50).lean();
  return NextResponse.json(calls);
}
