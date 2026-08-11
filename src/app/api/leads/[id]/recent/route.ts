import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agentId");
  const recentAccessedAt = new Date();

  const filter: Record<string, unknown> = { _id: id, deletedAt: null };
  if (agentId) filter.agentId = agentId;

  const lead = await Lead.findOneAndUpdate(
    filter,
    { $set: { recentAccessedAt } },
    { new: true, timestamps: false }
  ).lean();

  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(lead);
}
