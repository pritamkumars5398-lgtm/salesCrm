import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { Meeting } from "@/lib/models/Meeting";
import { Activity } from "@/lib/models/Activity";
import { Setting } from "@/lib/models/Setting";
import { Agent } from "@/lib/models/Agent";
import { Organization } from "@/lib/models/Organization";
import crypto from "crypto";
import { Types } from "mongoose";

/**
 * Calendly Webhook handler
 * 
 * Setup steps for the user:
 * 1. Go to https://calendly.com/integrations/api_webhooks
 * 2. Create a webhook subscription pointing to:
 *    https://your-domain.com/api/webhooks/calendly?agentId=<workspace id>
 *    (one per workspace — bookings are then matched only to that organization's leads;
 *    the URL without agentId only reaches organizations on the platform's own credentials)
 *    (or use ngrok for local testing: https://xxxx.ngrok.io/api/webhooks/calendly)
 * 3. Subscribe to "invitee.created" and "invitee.canceled" events
 * 4. Copy the signing secret and paste it into:
 *    - Your .env: CALENDLY_WEBHOOK_SECRET=...
 *    - Your CRM Settings > Calendly > Webhook Signing Secret
 */

async function verifySignature(req: Request, rawBody: string, workspaceSecret: string | null): Promise<boolean> {
  // The workspace's own signing secret, else the platform's; skip verification if neither is set (dev mode)
  const secret = workspaceSecret || process.env.CALENDLY_WEBHOOK_SECRET;
  if (!secret || secret === "your_calendly_webhook_signing_secret_here") {
    console.warn("[Calendly Webhook] No signing secret set — skipping verification (dev mode)");
    return true;
  }

  const signature = req.headers.get("calendly-webhook-signature") ?? "";
  // Calendly signature format: t=<timestamp>,v1=<hmac>
  const parts = Object.fromEntries(signature.split(",").map((p) => p.split("=")));
  const timestamp = parts["t"];
  const v1 = parts["v1"];

  if (!timestamp || !v1) return false;

  const toSign = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secret).update(toSign).digest("hex");
  const given = Buffer.from(v1);
  const want = Buffer.from(expected);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

/**
 * Workspaces whose leads this webhook may touch: the agentId's organization,
 * or (legacy URL without agentId) only organizations on platform credentials.
 * Never every tenant — the same email can be a lead in two different companies.
 */
async function scopeAgentIds(agentIdParam: string | null): Promise<Types.ObjectId[] | null> {
  if (agentIdParam) {
    if (!Types.ObjectId.isValid(agentIdParam)) return null;
    const agent = await Agent.findById(agentIdParam).select("organizationId deletedAt").lean();
    if (!agent || agent.deletedAt) return null;
    if (!agent.organizationId) return [agent._id];
    return (await Agent.find({ organizationId: agent.organizationId, deletedAt: null }).select("_id").lean()).map((a) => a._id);
  }
  const orgs = await Organization.find({ usesPlatformCredentials: true }).select("_id").lean();
  const agents = await Agent.find({
    deletedAt: null,
    $or: [{ organizationId: { $in: orgs.map((o) => o._id) } }, { organizationId: { $exists: false } }, { organizationId: null }],
  }).select("_id").lean();
  return agents.map((a) => a._id);
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  await connectDB();
  const agentIdParam = new URL(req.url).searchParams.get("agentId");
  const scope = await scopeAgentIds(agentIdParam);
  if (!scope) return NextResponse.json({ error: "Unknown workspace" }, { status: 404 });
  const workspaceSecret = agentIdParam
    ? (await Setting.findOne({ agentId: agentIdParam, key: "calendlyWebhookSecret" }).lean())?.value || null
    : null;

  const isValid = await verifySignature(req, rawBody, workspaceSecret);
  if (!isValid) {
    console.error("[Calendly Webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = payload?.event;
  // Calendly v2 puts the invitee directly in `payload` (with `scheduled_event`);
  // the legacy v1 format nested it under `payload.invitee` / `payload.event`.
  const invitee = payload?.payload?.invitee ?? payload?.payload;
  const eventDetails = payload?.payload?.scheduled_event ?? payload?.payload?.event;

  console.log(`[Calendly Webhook] Event: ${event}`);

  await connectDB();

  if (event === "invitee.created") {
    const email = String(invitee?.email || "").toLowerCase().trim();
    const name = invitee?.name;
    const scheduledAt = eventDetails?.start_time ? new Date(eventDetails.start_time) : new Date();
    const endsAt = eventDetails?.end_time ? new Date(eventDetails.end_time) : null;
    const durationMins = eventDetails?.duration
      ?? (endsAt ? Math.max(1, Math.round((endsAt.getTime() - scheduledAt.getTime()) / 60000)) : 30);

    if (!email) {
      return NextResponse.json({ ok: true, note: "No email in payload, skipping" });
    }

    // Find lead by email (most recently contacted if several agents have this lead)
    const lead = await Lead.findOne({ email, deletedAt: null, agentId: { $in: scope } }).sort({ lastContactedAt: -1 }).lean();
    if (!lead) {
      console.log(`[Calendly Webhook] No lead found for email: ${email}`);
      return NextResponse.json({ ok: true, note: "Lead not found for this email" });
    }

    const agentId = String(lead.agentId);

    // Look up agent's first Calendly setting to get agentId for a multi-agent setup
    // (we use lead.agentId which is already correct)

    // Avoid duplicate meetings for the same lead+time
    const existing = await Meeting.findOne({ leadId: lead._id, scheduledAt });
    if (existing) {
      return NextResponse.json({ ok: true, note: "Meeting already exists" });
    }

    const meeting = await Meeting.create({
      agentId,
      leadId:          lead._id,
      leadName:        lead.fullName || `${lead.firstName} ${lead.lastName}`,
      company:         lead.company || "",
      title:           `Meeting with ${name || lead.fullName}`,
      scheduledAt,
      durationMinutes: durationMins,
      platform:        "Calendly",
      status:          "confirmed",
      calendarProvider:"calendly",
    });

    await Lead.findByIdAndUpdate(lead._id, {
      status:        "meeting_booked",
      pipelineStage: "qualified", // CRM stages have no "meeting_booked" column
    });

    await Activity.create({
      agentId,
      leadId:   lead._id,
      leadName: lead.fullName || name,
      channel:  "system",
      event:    "Meeting Booked via Calendly",
      detail:   `${meeting.title} — ${scheduledAt.toLocaleString()}`,
    }).catch(() => {});

    console.log(`[Calendly Webhook] ✅ Meeting created for ${lead.fullName} at ${scheduledAt}`);
    return NextResponse.json({ ok: true, meetingId: meeting._id });
  }

  if (event === "invitee.canceled") {
    const email = String(invitee?.email || "").toLowerCase().trim();
    if (email) {
      const lead = await Lead.findOne({ email, deletedAt: null, agentId: { $in: scope } }).sort({ lastContactedAt: -1 }).lean();
      if (lead) {
        // Revert status back to replied so they can be re-engaged
        await Lead.findByIdAndUpdate(lead._id, {
          status:        "replied",
          pipelineStage: "replied",
        });

        await Activity.create({
          agentId:  String(lead.agentId),
          leadId:   lead._id,
          leadName: lead.fullName,
          channel:  "system",
          event:    "Meeting Cancelled via Calendly",
          detail:   `Lead ${lead.fullName} cancelled their Calendly booking.`,
        }).catch(() => {});

        // Mark the meeting as cancelled
        await Meeting.findOneAndUpdate(
          { leadId: lead._id, status: "confirmed" },
          { status: "cancelled" },
          { sort: { scheduledAt: -1 } }
        );

        console.log(`[Calendly Webhook] ❌ Meeting cancelled for ${lead.fullName}`);
      }
    }
    return NextResponse.json({ ok: true });
  }

  // Unknown event — just acknowledge
  return NextResponse.json({ ok: true, note: `Unhandled event: ${event}` });
}
