import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { Agent } from "@/lib/models/Agent";
import { Conversation } from "@/lib/models/Conversation";
import { Activity } from "@/lib/models/Activity";

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
  const addedDate     = searchParams.get("addedDate");       // YYYY-MM-DD (sync batch day)
  const outreach      = searchParams.get("outreachStatus");  // none|pending|sending|sent|failed

  const trashed = searchParams.get("trashed") === "1";

  const filter: Record<string, unknown> = {};
  if (agentId) filter.agentId = agentId;
  // Trash view shows only soft-deleted leads; every other view hides them.
  filter.deletedAt = trashed ? { $ne: null } : null;
  if (status && status !== "all") filter.status = status;
  if (source && source !== "all") filter.source = source;
  if (channel && channel !== "all") filter.channels = channel;
  if (location && location !== "all") filter.location = location;
  if (addedDate && addedDate !== "all") {
    const dayStart = new Date(`${addedDate}T00:00:00`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    if (!isNaN(dayStart.getTime())) filter.createdAt = { $gte: dayStart, $lt: dayEnd };
  }
  if (outreach && outreach !== "all") {
    filter.outreachStatus = outreach === "none"
      ? { $in: ["none", null] }
      : outreach;
  }
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

/**
 * DELETE /api/leads?agentId=xxx
 *   - with ?ids=a,b,c → move those leads to Trash (soft-delete, scoped to agent)
 *   - without ids     → soft-delete leads missing email OR phone (cleanup)
 *   - add ?permanent=1 → hard-delete instead (used from the Trash view); this
 *     also removes each lead's conversations and activities.
 * Soft-deleting decrements the agent's lead count; restore adds it back.
 */
export async function DELETE(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agentId");
  if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 });

  const idsParam = searchParams.get("ids");
  const permanent = searchParams.get("permanent") === "1";

  const match: Record<string, unknown> = { agentId };
  if (idsParam) {
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return NextResponse.json({ deleted: 0 });
    match._id = { $in: ids };
  } else {
    match.$and = [
      { $or: [{ email: { $in: [null, ""] } }, { email: { $exists: false } }] },
      { $or: [{ phone: { $in: [null, ""] } }, { phone: { $exists: false } }] },
    ];
  }

  const targets = await Lead.find(match, "_id deletedAt").lean();
  const leadIds = targets.map((l) => l._id);
  if (leadIds.length === 0) return NextResponse.json({ deleted: 0 });

  if (permanent) {
    const result = await Lead.deleteMany({ _id: { $in: leadIds } });
    await Promise.all([
      Conversation.deleteMany({ leadId: { $in: leadIds } }),
      Activity.deleteMany({ leadId: { $in: leadIds } }),
    ]);
    // Only leads that were still active (not already trashed) count against leadCount.
    const wasActive = targets.filter((l) => !l.deletedAt).length;
    if (wasActive > 0) await Agent.findByIdAndUpdate(agentId, { $inc: { leadCount: -wasActive } });
    return NextResponse.json({ deleted: result.deletedCount, permanent: true });
  }

  // Soft delete: only those not already in Trash.
  const activeIds = targets.filter((l) => !l.deletedAt).map((l) => l._id);
  if (activeIds.length === 0) return NextResponse.json({ deleted: 0 });
  await Lead.updateMany({ _id: { $in: activeIds } }, { deletedAt: new Date() });
  await Agent.findByIdAndUpdate(agentId, { $inc: { leadCount: -activeIds.length } });
  return NextResponse.json({ deleted: activeIds.length });
}

/**
 * PATCH /api/leads — restore soft-deleted leads from Trash.
 * Body: { agentId, ids: string[] }
 */
export async function PATCH(req: Request) {
  await connectDB();
  const { agentId, ids } = await req.json().catch(() => ({}));
  if (!agentId || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "agentId and ids[] are required" }, { status: 400 });
  }

  // Only restore leads currently in Trash so the count delta stays correct.
  const targets = await Lead.find({ agentId, _id: { $in: ids }, deletedAt: { $ne: null } }, "_id").lean();
  const restoreIds = targets.map((l) => l._id);
  if (restoreIds.length === 0) return NextResponse.json({ restored: 0 });

  await Lead.updateMany({ _id: { $in: restoreIds } }, { deletedAt: null });
  await Agent.findByIdAndUpdate(agentId, { $inc: { leadCount: restoreIds.length } });
  return NextResponse.json({ restored: restoreIds.length });
}
