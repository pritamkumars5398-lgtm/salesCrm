import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { logManualCall, placeAiCall } from "@/server/services/call.service";
import { authorizeLead } from "@/server/auth/access";

/**
 * POST { mode?: "ai_call" | "manual" }
 * - ai_call (default): dial the lead through Plivo and hand the call to the ElevenLabs agent.
 * - manual: log a call the user places from their own phone.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const access = await authorizeLead(req, id);
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => ({}));

  const lead = access.lead;
  if (lead.deletedAt) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (!lead.phone) return NextResponse.json({ error: "Lead has no phone number" }, { status: 400 });

  if (body.mode === "manual") {
    const call = await logManualCall(lead);
    return NextResponse.json({ success: true, mode: "manual", call, lead: await Lead.findById(id).lean() });
  }

  try {
    const result = await placeAiCall({ agentId: String(lead.agentId), lead, req });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true, mode: "ai_call", call: result.call, lead: await Lead.findById(id).lean() });
  } catch (err) {
    console.error("[LeadCall] dispatch error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to place call" }, { status: 500 });
  }
}
