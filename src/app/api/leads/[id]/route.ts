import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { Activity } from "@/lib/models/Activity";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const lead = await Lead.findById(id).lean();
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(lead);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const body = await req.json();

  const lead = await Lead.findById(id);
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const fieldsToTrack = ["status", "pipelineStage", "firstName", "lastName", "jobTitle", "company", "email", "phone", "agentEnabled"];
  const updatedBy = body.updatedBy || "User";
  const changeNote = body.changeNote || "";

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

  if (body.pipelineStage && !body.status) {
    body.status = pipelineToStatus[body.pipelineStage as keyof typeof pipelineToStatus];
  } else if (body.status && !body.pipelineStage) {
    body.pipelineStage = statusToPipeline[body.status as keyof typeof statusToPipeline];
  }

  for (const key of fieldsToTrack) {
    if (body[key] !== undefined && String(body[key]) !== String((lead as any)[key] ?? "")) {
      lead.history.push({
        field: key,
        from: String((lead as any)[key] ?? "—"),
        to: String(body[key]),
        by: updatedBy,
        at: new Date(),
        note: changeNote || undefined,
      });
      (lead as any)[key] = body[key];
    }
  }

  // Copy other properties
  Object.keys(body).forEach((key) => {
    if (!fieldsToTrack.includes(key) && key !== "history" && key !== "notes" && key !== "updatedBy") {
      (lead as any)[key] = body[key];
    }
  });

  await lead.save();

  if (body.status === "in_outreach") {
    await Activity.create({
      agentId:  lead.agentId,
      leadId:   lead._id,
      leadName: lead.fullName,
      channel:  "system",
      event:    "Outreach started",
    });
  }
  return NextResponse.json(lead);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  await Lead.findByIdAndDelete(id);
  return NextResponse.json({ success: true });
}
