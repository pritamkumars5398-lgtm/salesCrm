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
  const location      = searchParams.get("location");

  const filter: Record<string, unknown> = {};
  if (agentId) filter.agentId = agentId;
  if (status && status !== "all") filter.status = status;
  if (source && source !== "all") filter.source = source;
  if (channel && channel !== "all") filter.channels = channel;
  if (location && location !== "all") filter.location = location;
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

  if (Array.isArray(body)) {
    if (body.length === 0) {
      return NextResponse.json([], { status: 201 });
    }
    const leadsToInsert = body.map((l: any) => {
      const firstName = l.firstName?.trim() || "Unknown";
      const lastName = l.lastName?.trim() || "";
      return {
        ...l,
        firstName,
        lastName,
        fullName: l.fullName || `${firstName} ${lastName}`.trim(),
        pipelineStage: l.pipelineStage || "new",
        status: l.status || "new",
        channels: l.channels || [],
      };
    });
    const leads = await Lead.insertMany(leadsToInsert);
    const agentId = body[0]?.agentId;
    if (agentId) {
      await Agent.findByIdAndUpdate(agentId, { $inc: { leadCount: leads.length } });
    }
    return NextResponse.json(leads, { status: 201 });
  } else {
    const lead = await Lead.create(body);
    await Agent.findByIdAndUpdate(body.agentId, { $inc: { leadCount: 1 } });
    return NextResponse.json(lead, { status: 201 });
  }
}

// DELETE /api/leads?agentId=xxx — removes leads missing email OR phone
export async function DELETE(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agentId");
  if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 });

  const result = await Lead.deleteMany({
    agentId,
    $and: [
      { $or: [{ email: { $in: [null, ""] } }, { email: { $exists: false } }] },
      { $or: [{ phone: { $in: [null, ""] } }, { phone: { $exists: false } }] },
    ],
  });

  await Agent.findByIdAndUpdate(agentId, { $inc: { leadCount: -result.deletedCount } });
  return NextResponse.json({ deleted: result.deletedCount });
}
