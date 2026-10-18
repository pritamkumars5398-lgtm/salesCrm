import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { checkUsageLimit } from "@/lib/usage-check";
import { sendSms } from "@/server/services/sms.service";
import { authorizeWorkspace } from "@/server/auth/access";

export async function POST(req: Request) {
  try {
    const { agentId: requestedAgentId, to, text } = await req.json();
    await connectDB();
    const access = await authorizeWorkspace(req, requestedAgentId);
    if (!access.ok) return access.response;
    const agentId = access.agentId;
    if (!to || !text) {
      return NextResponse.json({ error: "to and text are required" }, { status: 400 });
    }

    const canSend = await checkUsageLimit(agentId, "smsSent", 1);
    if (!canSend) {
      return NextResponse.json({ error: "Plan limit exceeded for SMS." }, { status: 403 });
    }

    try {
      const result = await sendSms(agentId, to, text);
      return NextResponse.json({ ok: true, provider: result.provider, id: result.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isConfig = /not configured|requires|Unsupported|not a valid/i.test(msg);
      return NextResponse.json({ error: msg }, { status: isConfig ? 400 : 502 });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
