import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Sequence } from "@/lib/models/Sequence";
import { authorizeWorkspace } from "@/server/auth/access";

export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const access = await authorizeWorkspace(req, searchParams.get("agentId"));
  if (!access.ok) return access.response;
  // Newest first so a single-sequence UI always loads the latest saved version,
  // even if older duplicate sequences exist from before the upsert fix.
  const sequences = await Sequence.find({ agentId: access.agentId }).sort({ updatedAt: -1 }).lean();
  return NextResponse.json(sequences);
}

export async function POST(req: Request) {
  await connectDB();
  const body = await req.json().catch(() => ({}));
  const access = await authorizeWorkspace(req, body.agentId, { minRole: "admin" });
  if (!access.ok) return access.response;
  const { _id, agentId, ...fields } = body;
  void _id; void agentId;
  // Same "active" sequence the UI and outreach use: the most recently updated one.
  const sequence = await Sequence.findOneAndUpdate(
    { agentId: access.agentId },
    { ...fields, agentId: access.agentId },
    { upsert: true, new: true, sort: { updatedAt: -1 } }
  );
  return NextResponse.json(sequence, { status: 200 });
}
