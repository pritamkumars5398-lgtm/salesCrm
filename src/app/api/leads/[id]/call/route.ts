import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { Activity } from "@/lib/models/Activity";
import { Usage } from "@/lib/models/Usage";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;

  const lead = await Lead.findById(id);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  if (!lead.phone) {
    return NextResponse.json({ error: "Lead has no phone number" }, { status: 400 });
  }

  // Create call activity log
  await Activity.create({
    agentId:  lead.agentId,
    leadId:   lead._id,
    leadName: lead.fullName,
    channel:  "call",
    event:    "Manual Call Initiated",
    detail:   `User triggered outbound call to ${lead.phone}`,
  });

  // Track in lead history
  lead.history.push({
    field: "call",
    from: "—",
    to: `Call placed to ${lead.phone}`,
    by: "User",
    at: new Date(),
  });

  await lead.save();

  // Increment usage count for monthly calls
  const month = currentMonth();
  await Usage.findOneAndUpdate(
    { agentId: lead.agentId, month },
    { $inc: { callsMade: 1 } },
    { upsert: true }
  );

  return NextResponse.json({ success: true, lead });
}
