import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { Meeting } from "@/lib/models/Meeting";
import { Activity } from "@/lib/models/Activity";
import { authorizeLead } from "@/server/auth/access";

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  await connectDB();

  const access = await authorizeLead(req, params.id);
  if (!access.ok) return access.response;
  const lead = access.lead;

  const body = await req.json().catch(() => ({}));

  // Scheduled time: if client provides one, use it. Otherwise, default to tomorrow at 11 AM.
  let scheduledAt: Date;
  if (body.scheduledAt) {
    scheduledAt = new Date(body.scheduledAt);
    if (isNaN(scheduledAt.getTime())) return NextResponse.json({ error: "Invalid meeting time." }, { status: 400 });
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
    pipelineStage: "qualified", // CRM stages have no "meeting_booked" column
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
