import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Sequence } from "@/lib/models/Sequence";

export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agentId");
  const filter = agentId ? { agentId } : {};
  // Newest first so a single-sequence UI always loads the latest saved version,
  // even if older duplicate sequences exist from before the upsert fix.
  const sequences = await Sequence.find(filter).sort({ updatedAt: -1 }).lean();
  return NextResponse.json(sequences);
}

export async function POST(req: Request) {
  await connectDB();
  const body = await req.json();
  if (!body.agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }
  const sequence = await Sequence.findOneAndUpdate(
    { agentId: body.agentId },
    body,
    { upsert: true, new: true }
  );
  return NextResponse.json(sequence, { status: 200 });
}
