import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { Activity } from "@/lib/models/Activity";
import { Usage } from "@/lib/models/Usage";
import { Conversation } from "@/lib/models/Conversation";
import { makePlivoCall, formatPhoneNumber } from "@/lib/plivo-service";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is okay (defaults to AI call)
  }

  const lead = await Lead.findById(id);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  if (!lead.phone) {
    return NextResponse.json({ error: "Lead has no phone number" }, { status: 400 });
  }

  const isAiCall = body.mode !== "manual";
  let callResult: any = null;

  // Fetch Agent's configured call settings from MongoDB
  const { Setting } = await import("@/lib/models/Setting");
  const agentSettings = await Setting.find({ 
    agentId: lead.agentId, 
    key: { $in: ["callProvider", "plivoAuthId", "plivoAuthToken", "callApiKey", "callerPhone"] } 
  }).lean();
  const sm: Record<string, string> = {};
  agentSettings.forEach((s) => { sm[s.key] = s.value; });

function getPublicAppUrl(req?: Request): string {
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.NGROK_URL) return process.env.NGROK_URL.replace(/\/$/, "");
  if (req) {
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const proto = req.headers.get("x-forwarded-proto") || "https";
    if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
      return `${proto}://${host}`;
    }
  }
  const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (appUrl && !appUrl.includes("localhost") && !appUrl.includes("127.0.0.1")) {
    return appUrl;
  }
  return "https://pleadingly-nonfortifiable-tyron.ngrok-free.dev";
}

  const plivoAuthId = sm.plivoAuthId || process.env.PLIVO_AUTH_ID;
  const plivoAuthToken = sm.plivoAuthToken || process.env.PLIVO_AUTH_TOKEN;
  const plivoFrom = (sm.callerPhone && (sm.callerPhone.startsWith("9180") || sm.callerPhone.startsWith("+9180") || sm.callerPhone === "918065535939"))
    ? sm.callerPhone
    : (process.env.PLIVO_FROM_NUMBER || "918065535939");

  if (isAiCall && plivoAuthId && plivoAuthToken) {
    const appUrl = getPublicAppUrl(req);
    const answerUrl = `${appUrl}/api/calls/plivo-xml?leadId=${lead._id}&agentId=${lead.agentId}`;

    try {
      callResult = await makePlivoCall({
        to: lead.phone,
        answerUrl: answerUrl,
        from: plivoFrom,
        authId: plivoAuthId,
        authToken: plivoAuthToken,
      });

      if (!callResult.success) {
        return NextResponse.json({ error: callResult.message, details: callResult.error }, { status: 502 });
      }
    } catch (err: any) {
      console.error("Plivo Call Dispatch Error:", err);
      return NextResponse.json({ error: `Plivo Call Error: ${err.message}` }, { status: 500 });
    }
  }

  // Create call activity log
  await Activity.create({
    agentId:  lead.agentId,
    leadId:   lead._id,
    leadName: lead.fullName,
    channel:  "call",
    event:    isAiCall ? "AI Voice Call Initiated (Plivo + ElevenLabs)" : "Manual Call Logged",
    detail:   callResult?.requestUuid 
      ? `Plivo call dispatched to ${lead.phone} (UUID: ${callResult.requestUuid})`
      : `Outbound call to ${lead.phone}`,
  });

  // Track in lead history
  lead.history.push({
    field: "call",
    from: "—",
    to: `Call placed to ${formatPhoneNumber(lead.phone)}`,
    by: isAiCall ? "Priya (AI Voice Agent)" : "User",
    at: new Date(),
    note: callResult?.requestUuid ? `Plivo RequestUUID: ${callResult.requestUuid}` : undefined,
  });

  lead.lastContactedAt = new Date();
  lead.outreachAttempts = (lead.outreachAttempts || 0) + 1;
  lead.outreachStatus = "sent";
  if (lead.pipelineStage === "new") {
    lead.pipelineStage = "contacted";
  }
  await lead.save();

  // Create or update Conversation record
  await Conversation.findOneAndUpdate(
    { leadId: lead._id, agentId: lead.agentId, channel: "call" },
    {
      $push: {
        messages: {
          role: "agent",
          content: `Outbound call initiated to ${lead.phone} via Plivo voice gateway.`,
          timestamp: new Date(),
          meta: callResult,
        },
      },
    },
    { upsert: true, new: true }
  );

  // Increment usage count for monthly calls
  const month = currentMonth();
  await Usage.findOneAndUpdate(
    { agentId: lead.agentId, month },
    { $inc: { callsMade: 1 } },
    { upsert: true }
  );

  return NextResponse.json({ success: true, lead, callResult, plivo: !!callResult });
}
