import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { sendOutreachToLead } from "@/server/services/outreach.service";
import { getAppBaseUrl } from "@/server/services/settings.service";

/**
 * POST /api/leads/[id]/outreach
 * Sends one AI outreach message (email preferred, WhatsApp fallback).
 *
 * Responses:
 *  200 { sent: true,  channel, subject?, body }         — delivered
 *  200 { sent: false, skipped: true, reason }           — nothing attempted (dedup/cooldown)
 *  422 { sent: false, channel?, error, subject?, body? }— generation ok but delivery failed,
 *                                                          or lead/config not usable
 */
export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  await connectDB();

  const body = await req.json().catch(() => ({}));

  const result = await sendOutreachToLead(params.id, {
    senderName: body.senderName,
    force: body.force !== false, // manual API calls bypass the 24h cooldown by default
    baseUrl: getAppBaseUrl(req),
  });

  if (result.sent) {
    return NextResponse.json({
      sent: true,
      channel: result.channel,
      subject: result.subject,
      body: result.body,
      leadId: params.id,
      status: "in_outreach",
    });
  }

  if (result.skipped) {
    return NextResponse.json({ sent: false, skipped: true, reason: result.error });
  }

  const status = result.error === "Lead not found" ? 404 : 422;
  return NextResponse.json(
    {
      sent: false,
      channel: result.channel,
      error: result.error,
      subject: result.subject,
      body: result.body,
    },
    { status }
  );
}
