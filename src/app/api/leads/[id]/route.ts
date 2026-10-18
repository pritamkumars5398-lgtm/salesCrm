import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { Activity } from "@/lib/models/Activity";
import { Sequence } from "@/lib/models/Sequence";
import { Agent } from "@/lib/models/Agent";
import { Conversation } from "@/lib/models/Conversation";
import { authorizeLead } from "@/server/auth/access";
import { formatFieldValue } from "@/lib/lead-fields";
import { getFieldDefs, groupsForLead } from "@/server/services/lead-groups.service";
import {
  LEAD_STATUSES, PIPELINE_STAGES, cleanGroupIds, cleanTags, mergeCustomFields,
} from "@/server/services/lead-attributes.service";

/** Plain fields a user may edit. Anything else in the body (agentId, deletedAt, history…) is ignored. */
const EDITABLE = ["firstName", "lastName", "jobTitle", "company", "email", "phone", "website", "location", "source", "agentEnabled", "channels"] as const;
const TRACKED = ["status", "pipelineStage", "firstName", "lastName", "jobTitle", "company", "email", "phone", "agentEnabled"];

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const access = await authorizeLead(req, id);
  if (!access.ok) return access.response;
  if (new URL(req.url).searchParams.get("groups") !== "1") return NextResponse.json(access.lead.toObject());
  // ?groups=1 — also the groups (manual and smart) this lead is in right now.
  const groups = await groupsForLead(access.agentId, access.lead._id);
  return NextResponse.json({
    ...access.lead.toObject(),
    matchedGroups: groups.map((g) => ({ _id: String(g._id), name: g.name, color: g.color, kind: g.kind })),
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const access = await authorizeLead(req, id);
  if (!access.ok) return access.response;
  const lead = access.lead;
  const body = await req.json().catch(() => ({}));

  const updatedBy = access.user.name;
  const changeNote = typeof body.changeNote === "string" ? body.changeNote.slice(0, 500) : "";

  // Auto-sync pipelineStage and status if one is provided but not the other
  const pipelineToStatus = {
    new: "new",
    contacted: "in_outreach",
    replied: "replied",
    qualified: "meeting_booked",
    closed: "closed",
  } as const;

  const statusToPipeline = {
    new: "new",
    in_outreach: "contacted",
    replied: "replied",
    meeting_booked: "qualified",
    closed: "closed",
  } as const;

  if (body.status !== undefined && !LEAD_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }
  if (body.pipelineStage !== undefined && !PIPELINE_STAGES.includes(body.pipelineStage)) {
    return NextResponse.json({ error: "Invalid pipeline stage." }, { status: 400 });
  }
  if (body.pipelineStage && !body.status) {
    body.status = pipelineToStatus[body.pipelineStage as keyof typeof pipelineToStatus];
  } else if (body.status && !body.pipelineStage) {
    body.pipelineStage = statusToPipeline[body.status as keyof typeof statusToPipeline];
  }

  const patch: Record<string, unknown> = {};
  for (const key of EDITABLE) if (body[key] !== undefined) patch[key] = body[key];
  if (body.status !== undefined) patch.status = body.status;
  if (body.pipelineStage !== undefined) patch.pipelineStage = body.pipelineStage;

  if (body.sequenceId !== undefined) {
    if (body.sequenceId && (!Types.ObjectId.isValid(body.sequenceId) || !(await Sequence.exists({ _id: body.sequenceId, agentId: lead.agentId })))) {
      return NextResponse.json({ error: "Sequence not found in this workspace." }, { status: 400 });
    }
    lead.sequenceId = body.sequenceId || undefined;
  }

  for (const key of TRACKED) {
    if (patch[key] !== undefined && String(patch[key]) !== String((lead as unknown as Record<string, unknown>)[key] ?? "")) {
      lead.history.push({
        field: key,
        from: String((lead as unknown as Record<string, unknown>)[key] ?? "—"),
        to: String(patch[key]),
        by: updatedBy,
        at: new Date(),
        note: changeNote || undefined,
      });
    }
  }
  lead.set(patch);

  if (body.customFields !== undefined) {
    const defs = await getFieldDefs(String(lead.agentId));
    const before = (lead.customFields ?? {}) as Record<string, unknown>;
    const merged = mergeCustomFields(defs, before, body.customFields);
    if (!merged.ok) return NextResponse.json({ error: merged.error }, { status: 400 });
    for (const def of defs) {
      const from = formatFieldValue(def, before[def.key]);
      const to = formatFieldValue(def, merged.value[def.key]);
      if (from !== to) lead.history.push({ field: def.label, from: from || "—", to: to || "—", by: updatedBy, at: new Date(), note: changeNote || undefined });
    }
    lead.customFields = merged.value;
    lead.markModified("customFields");
  }
  if (body.tags !== undefined) {
    const tags = cleanTags(body.tags);
    if (!tags.ok) return NextResponse.json({ error: tags.error }, { status: 400 });
    lead.tags = tags.value;
  }
  if (body.groupIds !== undefined) {
    const groups = await cleanGroupIds(String(lead.agentId), body.groupIds);
    if (!groups.ok) return NextResponse.json({ error: groups.error }, { status: 400 });
    lead.groupIds = groups.value;
  }

  try {
    await lead.save();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not save the lead." }, { status: 400 });
  }

  if (patch.status === "in_outreach") {
    await Activity.create({
      agentId:  lead.agentId,
      leadId:   lead._id,
      leadName: lead.fullName,
      channel:  "system",
      event:    "Outreach started",
    });
  }
  return NextResponse.json(lead.toObject());
}

/** Permanently delete one lead and its conversations/activity (bulk delete lives on /api/leads). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const access = await authorizeLead(req, id);
  if (!access.ok) return access.response;
  const lead = access.lead;
  await Lead.deleteOne({ _id: lead._id });
  await Promise.all([
    Conversation.deleteMany({ leadId: lead._id }),
    Activity.deleteMany({ leadId: lead._id }),
    lead.deletedAt ? Promise.resolve() : Agent.updateOne({ _id: lead.agentId }, { $inc: { leadCount: -1 } }),
  ]);
  return NextResponse.json({ success: true });
}
