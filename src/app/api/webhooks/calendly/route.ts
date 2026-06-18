import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { Meeting } from "@/lib/models/Meeting";
import { Activity } from "@/lib/models/Activity";
import { Setting } from "@/lib/models/Setting";
import crypto from "crypto";

/**
 * Calendly Webhook handler
 * 
 * Setup steps for the user:
 * 1. Go to https://calendly.com/integrations/api_webhooks
 * 2. Create a webhook subscription pointing to:
 *    https://your-domain.com/api/webhooks/calendly
 *    (or use ngrok for local testing: https://xxxx.ngrok.io/api/webhooks/calendly)
 * 3. Subscribe to "invitee.created" and "invitee.canceled" events
 * 4. Copy the signing secret and paste it into:
 *    - Your .env: CALENDLY_WEBHOOK_SECRET=...
 *    - Your CRM Settings > Calendly > Webhook Signing Secret
 */

async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  // Try env first, then skip verification if not set (dev mode)
  const secret = process.env.CALENDLY_WEBHOOK_SECRET;
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
  return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}

export async function POST(req: Request) {
  const rawBody = await req.text();

  const isValid = await verifySignature(req, rawBody);
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
  const invitee = payload?.payload?.invitee;
  const eventDetails = payload?.payload?.event;

  console.log(`[Calendly Webhook] Event: ${event}`);

  await connectDB();

  if (event === "invitee.created") {
    const email = invitee?.email;
    const name = invitee?.name;
    const scheduledAt = eventDetails?.start_time ? new Date(eventDetails.start_time) : new Date();
    const durationMins = eventDetails?.duration ?? 30;

    if (!email) {
      return NextResponse.json({ ok: true, note: "No email in payload, skipping" });
    }

    // Find lead by email
    const lead = await Lead.findOne({ email }).lean();
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
      pipelineStage: "meeting_booked",
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
    const email = invitee?.email;
    if (email) {
      const lead = await Lead.findOne({ email }).lean();
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
