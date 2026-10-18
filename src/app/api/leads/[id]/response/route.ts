import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { Activity } from "@/lib/models/Activity";
import { Conversation } from "@/lib/models/Conversation";
import { Setting } from "@/lib/models/Setting";
import { getEmailConfig, sendEmail } from "@/lib/email-service";
import { eventEmitter } from "@/lib/events";
import { resolveGroqModel, groqModelParams } from "@/lib/llm";

async function handleInterested(lead: any, agentId: string) {
  const calendlySetting = await Setting.findOne({ agentId, key: "calendlyLink" }).lean();
  const calendlyLink = calendlySetting?.value || "https://calendly.com/your-calendar-link";

  const cfg = await getEmailConfig(agentId);
  const senderName = cfg?.fromName || "Our Team";

  const prompt = `You are a sales expert following up with a lead who just clicked "I'm interested" in your previous email.
Lead Name: ${lead.fullName}
Sender Name: ${senderName}
Calendly Link: ${calendlyLink}

Write a very short (2-3 sentences max) email thanking them for their interest and asking them to pick a time on your calendar to chat. 
Return ONLY valid JSON:
{"subject": "...", "body": "..."}`;

  const llmKeys = ["llmProvider", "llmApiKey"];
  const llmRows = await Setting.find({ agentId, key: { $in: llmKeys } }).lean();
  const llmMap: Record<string, string> = {};
  llmRows.forEach((r) => { llmMap[r.key] = r.value; });

  const apiKey = llmMap.llmApiKey || process.env.GROQ_API_KEY || "";
  const model = resolveGroqModel(process.env.GROQ_MODEL);

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        ...groqModelParams(model),
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        max_tokens: 256,
        response_format: { type: "json_object" },
      }),
    });
    const json = await res.json();
    let raw = json.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw);
    parsed.body = parsed.body.replace(/\\n/g, "\n");

    if (lead.email && cfg) {
      await sendEmail(cfg, lead.email, parsed.subject, parsed.body);
    }

    // Log it
    await Activity.create({
      agentId, leadId: lead._id, leadName: lead.fullName, channel: "email",
      event: "AI Follow-up Sent (Calendly)", detail: `Subject: ${parsed.subject}\n\n${parsed.body}`.slice(0, 2000),
    });

    let convo = await Conversation.findOne({ leadId: lead._id, channel: "email" });
    if (convo) {
      convo.messages.push({ role: "agent", content: `Subject: ${parsed.subject}\n\n${parsed.body}`, timestamp: new Date() });
      await convo.save();
      eventEmitter.emit("message", { leadId: lead._id.toString() });
    }
  } catch (err) {
    console.error("AI Follow up failed", err);
  }
}

const page = (inner: string) => new NextResponse(`
      <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
      <body style="font-family:sans-serif; text-align:center; padding: 50px 16px; color:#333;">${inner}</body></html>
    `, { headers: { "Content-Type": "text/html" } });

/**
 * Email links only show a confirmation page: mail security scanners and link
 * previewers fetch every URL in a message, so a GET must never change state.
 */
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  if (action !== "interested" && action !== "not_interested") {
    return new NextResponse("Invalid action", { status: 400 });
  }
  const { id } = await props.params;
  const label = action === "interested" ? "Yes, I'm interested" : "Not right now";
  const color = action === "interested" ? "#df2a2a" : "#475569";
  return page(`
        <h2>${action === "interested" ? "Great — one click to confirm" : "Confirm your choice"}</h2>
        <form method="POST" action="/api/leads/${encodeURIComponent(id)}/response?action=${action}">
          <button type="submit" style="margin-top:16px; padding:12px 22px; border:0; border-radius:6px; background:${color}; color:#fff; font-size:15px; cursor:pointer;">${label}</button>
        </form>`);
}

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  await connectDB();
  const lead = await Lead.findById(params.id);
  if (!lead || lead.deletedAt) return new NextResponse("Lead not found", { status: 404 });

  const agentId = String(lead.agentId);

  // Repeat clicks (double submit, revisiting the page) must not re-send the AI email.
  const emailConvo = await Conversation.findOne({ leadId: lead._id, channel: "email" }).lean();
  const lastLeadMsg = [...(emailConvo?.messages ?? [])].reverse().find((m) => m.role === "lead");
  if (lastLeadMsg?.meta?.responseAction === action) {
    return page(action === "interested"
      ? "<h2>Thanks!</h2><p>We already have your response — check your inbox for the scheduling email.</p>"
      : "<h2>Thank you for your time.</h2><p>We've updated our records and won't reach out again.</p>");
  }

  if (action === "not_interested") {
    lead.status = "closed";
    lead.pipelineStage = "closed";
    await lead.save();

    await Activity.create({
      agentId, leadId: lead._id, leadName: lead.fullName, channel: "email",
      event: "Lead clicked 'Not Interested'", detail: "Lead opted out via email button."
    });

    // Record the client's unsubscribe reply in the email conversation
    let convo = await Conversation.findOne({ leadId: lead._id, channel: "email" });
    if (!convo) {
      convo = await Conversation.create({
        leadId: lead._id,
        agentId,
        channel: "email",
        messages: [],
      });
    }
    convo.messages.push({
      role: "lead",
      content: "No, I'm not interested in this. Please unsubscribe me.",
      timestamp: new Date(),
      meta: { responseAction: "not_interested" },
    });
    await convo.save();
    eventEmitter.emit("message", { leadId: lead._id.toString() });

    return new NextResponse(`
      <html><body style="font-family:sans-serif; text-align:center; padding: 50px; color:#333;">
        <h2>Thank you for your time.</h2>
        <p>We've updated our records and won't reach out again.</p>
      </body></html>
    `, { headers: { "Content-Type": "text/html" } });
  }

  if (action === "interested") {
    if (lead.status !== "meeting_booked") {
      lead.status = "replied";
      lead.pipelineStage = "replied";
      await lead.save();
    }

    await Activity.create({
      agentId, leadId: lead._id, leadName: lead.fullName, channel: "email",
      event: "Lead clicked 'Interested'", detail: "Lead clicked the interested button in the email."
    });

    // Record the client's interest reply in the email conversation
    let convo = await Conversation.findOne({ leadId: lead._id, channel: "email" });
    if (!convo) {
      convo = await Conversation.create({
        leadId: lead._id,
        agentId,
        channel: "email",
        messages: [],
      });
    }
    convo.messages.push({
      role: "lead",
      content: "I'm interested! Please send me the details and calendar link.",
      timestamp: new Date(),
      meta: { responseAction: "interested" },
    });
    await convo.save();
    eventEmitter.emit("message", { leadId: lead._id.toString() });

    // Fire the AI scheduling email asynchronously so we can return the webpage immediately
    handleInterested(lead, agentId);

    return new NextResponse(`
      <html><body style="font-family:sans-serif; text-align:center; padding: 50px; color:#333;">
        <h2>Awesome!</h2>
        <p>We've just sent you a follow-up email to schedule a quick chat.</p>
        <p>Please check your inbox!</p>
      </body></html>
    `, { headers: { "Content-Type": "text/html" } });
  }

  return new NextResponse("Invalid action", { status: 400 });
}
