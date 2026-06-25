import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { Agent } from "@/lib/models/Agent";

export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const agentId       = searchParams.get("agentId");
  const status        = searchParams.get("status");
  const search        = searchParams.get("q");
  const source        = searchParams.get("source");
  const channel       = searchParams.get("channel");
  const missingContact = searchParams.get("missingContact");

  const filter: Record<string, unknown> = {};
  if (agentId) filter.agentId = agentId;
  if (status && status !== "all") filter.status = status;
  if (source && source !== "all") filter.source = source;
  if (channel && channel !== "all") filter.channels = channel;
  if (search) filter.$text = { $search: search };
  if (missingContact === "true") {
    filter.$and = [
      { $or: [{ email: { $in: [null, ""] } }, { email: { $exists: false } }] },
      { $or: [{ phone: { $in: [null, ""] } }, { phone: { $exists: false } }] },
    ];
  }

  const leads = await Lead.find(filter).sort({ createdAt: -1 }).lean();
  return NextResponse.json(leads);
}

export async function POST(req: Request) {
  await connectDB();
  const body = await req.json();
  const lead = await Lead.create(body);
  await Agent.findByIdAndUpdate(body.agentId, { $inc: { leadCount: 1 } });
  return NextResponse.json(lead, { status: 201 });
}
