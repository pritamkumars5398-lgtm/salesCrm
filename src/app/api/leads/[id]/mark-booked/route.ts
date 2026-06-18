import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { Meeting } from "@/lib/models/Meeting";
import { Activity } from "@/lib/models/Activity";

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  await connectDB();

  const lead = await Lead.findById(params.id).lean();
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));

  // Scheduled time: if client provides one, use it. Otherwise, default to tomorrow at 11 AM.
  let scheduledAt: Date;
  if (body.scheduledAt) {
    scheduledAt = new Date(body.scheduledAt);
  } else {
    scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 1);
    scheduledAt.setHours(11, 0, 0, 0);
  }

  const agentId = String(lead.agentId);

  // Create a Meeting record
  const meeting = await Meeting.create({
    agentId,
    leadId: params.id,
    leadName: lead.fullName || `${lead.firstName} ${lead.lastName}`,
    company: lead.company || "",
    title: body.title || `Meeting with ${lead.fullName || lead.firstName}`,
    scheduledAt,
    durationMinutes: body.durationMinutes || 30,
    platform: body.platform || "Google Meet",
    status: "confirmed",
    calendarProvider: "calendly",
  });

  // Update lead status to meeting_booked
  await Lead.findByIdAndUpdate(params.id, {
    status: "meeting_booked",
    pipelineStage: "meeting_booked",
  });

  // Log activity
  try {
    await Activity.create({
      agentId,
      leadId: params.id,
      leadName: lead.fullName || `${lead.firstName} ${lead.lastName}`,
      channel: "system",
      event: "Meeting Booked",
      detail: `${meeting.title} — ${scheduledAt.toLocaleString()}`,
    });
  } catch {
    // non-critical
  }

  return NextResponse.json({ ok: true, meeting }, { status: 201 });
}
