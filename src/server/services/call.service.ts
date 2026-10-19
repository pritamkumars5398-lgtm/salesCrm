import crypto from "crypto";
import { Types } from "mongoose";
import { Call, ICall, CallStatus, ACTIVE_CALL_STATUSES } from "@/lib/models/Call";
import { Lead, ILead } from "@/lib/models/Lead";
import { Activity } from "@/lib/models/Activity";
import { Agent } from "@/lib/models/Agent";
import { Conversation } from "@/lib/models/Conversation";
import { Usage } from "@/lib/models/Usage";
import { eventEmitter } from "@/lib/events";
import { checkUsageLimit } from "@/lib/usage-check";
import { currentMonth } from "@/lib/utils/date";
import { makePlivoCall, normalizeDialableNumber, hangupPlivoCall, cancelPlivoRequest } from "@/lib/plivo-service";
import { getVoiceConfig, VoiceConfig, getSettingsMap, getWhatsAppConfig } from "./settings.service";
import { sendWhatsAppMessage } from "./whatsapp.service";
import { analyzeCallTranscript, generateCallFollowUpWhatsApp } from "./ai.service";
import { buildCallInstructions } from "./call-prompt";
import { applyAiFieldValues } from "./playbook.service";
import { getLeadHistory } from "./lead-history.service";

/** Providers whose lead calls run through Plivo + the ElevenLabs bridge. */
const PLIVO_PROVIDERS = ["Plivo", "ElevenLabs Conversational AI"];
const RING_TIMEOUT_SEC = 45;
/** Calling-hours are evaluated in this zone (the product dials Indian numbers by default). */
const CALL_TIMEZONE = process.env.CALL_TIMEZONE || "Asia/Kolkata";

export interface PlaceCallResult {
  ok: boolean;
  status: number;
  error?: string;
  call?: ICall;
}

/**
 * Public base URL Plivo can reach for answer/hangup callbacks and the media
 * WebSocket. Returns null when only a localhost address is known.
 */
export function getPublicAppUrl(req?: Request): string | null {
  const isLocal = (u: string) => /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(u);
  const explicit = process.env.PUBLIC_APP_URL || process.env.NGROK_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (req) {
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const proto = req.headers.get("x-forwarded-proto") || "https";
    if (host && !isLocal(host)) return `${proto}://${host}`;
  }
  const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (appUrl && !isLocal(appUrl)) return appUrl;
  return null;
}

/** True when the custom server (server.js) with the /ws/plivo bridge is serving this app. */
export function isBridgeRunning(): boolean {
  return process.env.TELEPHONY_BRIDGE_ACTIVE === "1";
}

function emitLeadUpdate(leadId?: Types.ObjectId | string | null) {
  if (leadId) eventEmitter.emit("message", { leadId: String(leadId) });
}

function hourIn(timeZone: string): number {
  const h = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).format(new Date());
  return parseInt(h, 10) % 24;
}

function outsideCallWindow(cfg: VoiceConfig): string | null {
  const { windowStartHour: start, windowEndHour: end } = cfg;
  if (start === null || end === null || start === end) return null;
  const h = hourIn(CALL_TIMEZONE);
  const allowed = start < end ? h >= start && h < end : h >= start || h < end;
  return allowed ? null : `Outside calling hours (${start}:00–${end}:00 ${CALL_TIMEZONE}). Change them in Settings → Voice Calls.`;
}

/** Release calls whose callbacks never arrived so they stop blocking new calls. */
async function expireStaleCalls(filter: Record<string, unknown>, maxDurationMin: number) {
  const cutoff = new Date(Date.now() - (maxDurationMin + 10) * 60 * 1000);
  await Call.updateMany(
    { ...filter, active: true, createdAt: { $lt: cutoff }, status: { $in: ACTIVE_CALL_STATUSES } },
    { $set: { status: "failed", active: false, error: "No status received from the telephony provider." } }
  );
  await Call.updateMany({ ...filter, active: true, createdAt: { $lt: cutoff } }, { $set: { active: false } });
}

function voiceConfigError(cfg: VoiceConfig): string | null {
  if (!PLIVO_PROVIDERS.includes(cfg.callProvider)) {
    return `AI calls run on Plivo + ElevenLabs. Switch Call Provider to "Plivo" in Settings → Voice Calls (current: ${cfg.callProvider}).`;
  }
  if (!cfg.plivoAuthId || !cfg.plivoAuthToken) return "Plivo Auth ID / Auth Token are not configured (Settings → Voice Calls).";
  if (!cfg.elevenLabsAgentId || !cfg.elevenLabsApiKey) {
    return "ElevenLabs Agent ID / API key are not configured (Settings → Voice Calls) — the call would connect to silence.";
  }
  return null;
}

/**
 * Dispatch an AI voice call (Plivo dials, the bridge connects the answered call
 * to the ElevenLabs agent). Used for lead calls and Settings test calls.
 */
export async function placeAiCall(opts: {
  agentId: string;
  lead?: ILead | null;
  toNumber?: string;
  isTest?: boolean;
  req?: Request;
  /** outreach counts the attempt itself (markSent) — avoid counting it twice */
  countAttempt?: boolean;
}): Promise<PlaceCallResult> {
  const { agentId, lead, isTest = false, countAttempt = true } = opts;
  const cfg = await getVoiceConfig(agentId);

  const configError = voiceConfigError(cfg);
  if (configError) return { ok: false, status: 400, error: configError };

  const to = normalizeDialableNumber(opts.toNumber ?? lead?.phone);
  if (!to) return { ok: false, status: 400, error: `"${opts.toNumber ?? lead?.phone ?? ""}" is not a valid phone number. Use the full number with country code.` };

  // cfg.callerPhone already includes the platform number when this workspace may use it.
  const from = normalizeDialableNumber(cfg.callerPhone);
  if (!from) return { ok: false, status: 400, error: "Caller Phone Number (your Plivo number) is missing or invalid (Settings → Voice Calls)." };
  if (from === to) return { ok: false, status: 400, error: "The number being called is the same as your caller number." };

  const baseUrl = getPublicAppUrl(opts.req);
  if (!baseUrl) {
    return { ok: false, status: 400, error: "No public URL for Plivo callbacks. Set PUBLIC_APP_URL (e.g. your ngrok https URL) in .env." };
  }
  if (!isBridgeRunning()) {
    return { ok: false, status: 503, error: "The telephony bridge isn't running. Start the app with `npm run dev:ngrok` / `npm run dev:bridge` (or `npm run start:bridge` in production), not `next dev`." };
  }

  if (!isTest) {
    const windowError = outsideCallWindow(cfg);
    if (windowError) return { ok: false, status: 400, error: windowError };
    if (!(await checkUsageLimit(agentId, "callsMade", 1))) {
      return { ok: false, status: 403, error: "Monthly AI call limit reached for your plan." };
    }
  }

  if (lead) await expireStaleCalls({ leadId: lead._id }, cfg.maxDurationMin);
  await expireStaleCalls({ agentId, to }, cfg.maxDurationMin);
  // Duplicate leads often share a number — never ring the same phone twice at once.
  if (await Call.exists({ agentId, to, active: true })) {
    return { ok: false, status: 409, error: `+${to} is already on a call (possibly a duplicate lead with the same number).` };
  }

  // If building the instructions fails the bridge falls back to its own generic prompt.
  const instructions = await buildCallInstructions(agentId, cfg, lead, to).catch((err) => {
    console.error("[Call] could not build call instructions:", err);
    return null;
  });

  const token = crypto.randomBytes(24).toString("hex");
  let call: ICall;
  try {
    call = await Call.create({
      aiPrompt: instructions?.prompt,
      aiFirstMessage: instructions?.firstMessage,
      agentId,
      leadId: lead?._id ?? null,
      mode: "ai",
      isTest,
      provider: "plivo",
      to,
      from,
      status: "queued",
      active: true,
      token,
    });
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 11000) {
      return { ok: false, status: 409, error: "A call to this lead is already in progress." };
    }
    throw err;
  }

  const q = `callId=${call._id}&token=${token}`;
  const result = await makePlivoCall({
    to,
    from,
    authId: cfg.plivoAuthId,
    authToken: cfg.plivoAuthToken,
    answerUrl: `${baseUrl}/api/calls/plivo-xml?${q}`,
    hangupUrl: `${baseUrl}/api/calls/plivo-status?${q}&event=hangup`,
    ringUrl: `${baseUrl}/api/calls/plivo-status?${q}&event=ring`,
    timeLimitSec: (isTest ? Math.min(cfg.maxDurationMin, 2) : cfg.maxDurationMin) * 60,
    ringTimeoutSec: RING_TIMEOUT_SEC,
    hangupOnMachine: cfg.hangupOnVoicemail,
  }).catch((err: unknown) => ({
    success: false as const,
    message: err instanceof Error ? err.message : String(err),
    requestUuid: undefined,
  }));

  if (!result.success) {
    await Call.updateOne({ _id: call._id }, { $set: { status: "failed", active: false, error: result.message, finalizedAt: new Date() } });
    if (lead) {
      await Activity.create({
        agentId, leadId: lead._id, leadName: lead.fullName || "Lead", channel: "call",
        event: "AI Call Failed", detail: `Plivo rejected the call to ${to}: ${result.message}`,
      });
      emitLeadUpdate(lead._id);
    }
    return { ok: false, status: 502, error: `Plivo: ${result.message}` };
  }

  await Call.updateOne({ _id: call._id }, { $set: { requestUuid: result.requestUuid } });

  if (lead) {
    const set: Record<string, unknown> = { lastContactedAt: new Date(), outreachStatus: "sent" };
    if (lead.status === "new") set.status = "in_outreach";
    if (lead.pipelineStage === "new") set.pipelineStage = "contacted";
    await Lead.updateOne({ _id: lead._id }, {
      $set: set,
      ...(countAttempt ? { $inc: { outreachAttempts: 1 } } : {}),
      $push: { history: { field: "call", from: "—", to: `AI call placed to +${to}`, by: "AI Voice Agent", at: new Date() } },
    });
    await Activity.create({
      agentId, leadId: lead._id, leadName: lead.fullName || "Lead", channel: "call",
      event: "AI Call Started", detail: `Dialing +${to} from +${from}`,
    });
    await Usage.findOneAndUpdate({ agentId, month: currentMonth() }, { $inc: { callsMade: 1 } }, { upsert: true });
    emitLeadUpdate(lead._id);
  }

  return { ok: true, status: 200, call: (await Call.findById(call._id))! };
}

/** Why this agent can't place AI calls right now, or null when it can (publish preflight). */
export async function getVoiceSetupError(agentId: string): Promise<string | null> {
  return voiceConfigError(await getVoiceConfig(agentId));
}

const SLOT_POLL_MS = 5000;

/**
 * Block until fewer than the agent's "Max Simultaneous Calls" are live, so a
 * campaign dials leads one batch at a time instead of all at once.
 * Returns an error message if no slot frees up in time.
 */
export async function waitForCallSlot(agentId: string): Promise<string | null> {
  const cfg = await getVoiceConfig(agentId);
  const deadline = Date.now() + (cfg.maxDurationMin + 3) * 60 * 1000;
  for (;;) {
    await expireStaleCalls({ agentId }, cfg.maxDurationMin);
    const live = await Call.countDocuments({ agentId, active: true, isTest: { $ne: true } });
    if (live < cfg.maxConcurrentCalls) return null;
    if (Date.now() > deadline) return `Call queue timed out — ${live} call(s) still live.`;
    await new Promise((r) => setTimeout(r, SLOT_POLL_MS));
  }
}

/**
 * The user pressed "End call": hang up a connected call, or cancel one that's
 * still ringing. Plivo's hangup callback then closes the call out as usual.
 */
export async function endCallByUser(callId: string): Promise<{ ok: boolean; status: number; error?: string }> {
  const call = await Call.findById(callId);
  if (!call) return { ok: false, status: 404, error: "Call not found" };
  if (!call.active) return { ok: true, status: 200 }; // already over
  const cfg = await getVoiceConfig(String(call.agentId));
  if (!cfg.plivoAuthId || !cfg.plivoAuthToken) return { ok: false, status: 400, error: "Plivo credentials are not configured." };

  await Call.updateOne({ _id: call._id }, { $set: { endedByUser: true } });
  const ok = call.callUuid
    ? await hangupPlivoCall(cfg.plivoAuthId, cfg.plivoAuthToken, call.callUuid)
    : call.requestUuid
      ? await cancelPlivoRequest(cfg.plivoAuthId, cfg.plivoAuthToken, call.requestUuid)
      : false;
  if (!ok) return { ok: false, status: 502, error: "Plivo didn't accept the hangup — try again." };

  // Never dispatched to Plivo (no UUIDs) or already gone there: close it locally.
  if (!call.callUuid && !call.requestUuid) {
    await Call.updateOne({ _id: call._id, active: true }, { $set: { status: "canceled", active: false, endedAt: new Date() } });
    await finalizeCall(String(call._id));
  }
  emitLeadUpdate(call.leadId);
  return { ok: true, status: 200 };
}

const withScheme = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

/**
 * Send the lead our details on WhatsApp because of a call — requested mid-call
 * by the voice agent's send_whatsapp_details tool, or after the call when the
 * transcript shows they asked for it. Sends at most once per call.
 */
export async function sendCallWhatsAppDetails(
  callId: string,
  topic: string,
  source: "during_call" | "after_call",
): Promise<{ ok: boolean; alreadySent?: boolean; error?: string }> {
  const call = await Call.findById(callId);
  if (!call) return { ok: false, error: "Call not found" };
  if (call.whatsappSentAt) return { ok: true, alreadySent: true };
  if (!call.leadId) return { ok: false, error: "Test calls don't send WhatsApp messages." };
  const lead = await Lead.findById(call.leadId);
  if (!lead) return { ok: false, error: "Lead not found" };
  const agentId = String(call.agentId);

  const fail = async (error: string) => {
    await Call.updateOne({ _id: call._id }, { $set: { whatsappError: error.slice(0, 300) } });
    emitLeadUpdate(lead._id);
    return { ok: false, error };
  };

  const target = lead.phone || lead.whatsappLid;
  if (!target) return fail("Lead has no WhatsApp number.");
  const s = await getSettingsMap(agentId, ["whatsappEnabled", "businessWebsite", "calendlyLink", "docLink", "businessPhone", "callLanguage", "agentName"]);
  if (s.whatsappEnabled === "false") return fail("WhatsApp is turned off in Settings → WhatsApp.");
  const waCfg = await getWhatsAppConfig(agentId);
  if (!waCfg) return fail("WhatsApp isn't configured (Settings → WhatsApp).");
  if (!(await checkUsageLimit(agentId, "messagesSent", 1))) return fail("Monthly WhatsApp message limit reached for your plan.");

  // Claim the send so the in-call tool and the after-call check can't both send.
  const claimed = await Call.findOneAndUpdate(
    { _id: call._id, $or: [{ whatsappSentAt: null }, { whatsappSentAt: { $exists: false } }] },
    { $set: { whatsappSentAt: new Date() }, $unset: { whatsappError: "" } },
  );
  if (!claimed) return { ok: true, alreadySent: true };

  const agent = await Agent.findById(agentId).select("name").lean();
  const senderName = s.agentName || agent?.name || "our team";
  const leadName = lead.fullName || lead.company || "there";
  let body: string;
  try {
    const history = await getLeadHistory(lead._id, { maxChars: 1500 }).catch(() => null);
    body = await generateCallFollowUpWhatsApp(agentId, {
      leadName, company: lead.company, topic, language: s.callLanguage || "English", senderName,
      history: history?.hasHistory ? history.timeline : undefined,
    });
  } catch {
    body = `Hi ${leadName}, thank you for your time on the call today. As discussed, here are our details — happy to help you take your business online.`;
  }
  // Links/contacts are added verbatim, never written by the AI.
  const details = [
    s.businessWebsite && `🌐 Website: ${withScheme(s.businessWebsite)}`,
    s.calendlyLink && `📅 Book a free call: ${s.calendlyLink}`,
    s.docLink && withScheme(s.docLink) !== withScheme(s.businessWebsite || "") && `📄 Details: ${withScheme(s.docLink)}`,
    s.businessPhone && `📞 Call us: ${s.businessPhone}`,
  ].filter(Boolean);
  const message = `${body}${details.length ? `\n\n${details.join("\n")}` : ""}\n\n– ${senderName}`;

  try {
    await sendWhatsAppMessage(waCfg, target, message);
  } catch (err) {
    await Call.updateOne({ _id: call._id }, { $set: { whatsappSentAt: null } });
    const raw = err instanceof Error ? err.message : String(err);
    const outsideWindow = /131047|re-?engagement|24 ?hour|outside the allowed window/i.test(raw);
    return fail(outsideWindow
      ? "Meta only allows free-form WhatsApp messages within 24h of the lead messaging you — an approved template is needed for this lead."
      : `WhatsApp send failed: ${raw.slice(0, 200)}`);
  }

  await Usage.findOneAndUpdate({ agentId, month: currentMonth() }, { $inc: { messagesSent: 1 } }, { upsert: true });
  await Conversation.findOneAndUpdate(
    { leadId: lead._id, channel: "whatsapp" },
    {
      $setOnInsert: { agentId: call.agentId },
      $push: { messages: { role: "agent", content: message, timestamp: new Date(), meta: { type: "call_follow_up", callId: String(call._id) } } },
    },
    { upsert: true }
  );
  await Activity.create({
    agentId, leadId: lead._id, leadName: lead.fullName || "Lead", channel: "whatsapp",
    event: source === "during_call" ? "WhatsApp details sent during call" : "WhatsApp details sent after call",
    detail: message.slice(0, 2000),
  });
  emitLeadUpdate(lead._id);
  return { ok: true };
}

/** Record a call the user is placing from their own phone (tel: link). */
export async function logManualCall(lead: ILead): Promise<ICall> {
  const to = normalizeDialableNumber(lead.phone) ?? lead.phone;
  const call = await Call.create({
    agentId: lead.agentId,
    leadId: lead._id,
    mode: "manual",
    provider: "manual",
    to,
    status: "logged",
    active: false,
    token: crypto.randomBytes(8).toString("hex"),
    finalizedAt: new Date(),
  });
  const set: Record<string, unknown> = { lastContactedAt: new Date() };
  if (lead.status === "new") set.status = "in_outreach";
  if (lead.pipelineStage === "new") set.pipelineStage = "contacted";
  await Lead.updateOne({ _id: lead._id }, {
    $set: set,
    $inc: { outreachAttempts: 1 },
    $push: { history: { field: "call", from: "—", to: `Manual call to ${lead.phone}`, by: "User", at: new Date() } },
  });
  await Activity.create({
    agentId: lead.agentId, leadId: lead._id, leadName: lead.fullName || "Lead", channel: "call",
    event: "Manual Call Logged", detail: `Outbound call to ${lead.phone}`,
  });
  emitLeadUpdate(lead._id);
  return call;
}

/** Load a call only if the callback carries its secret token. */
export async function verifyCallToken(callId: string | null, token: string | null): Promise<ICall | null> {
  if (!callId || !token || !Types.ObjectId.isValid(callId)) return null;
  const call = await Call.findById(callId).select("+token");
  if (!call?.token) return null;
  const a = Buffer.from(call.token);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? call : null;
}

/** Plivo answered the call: mark it live. Returns false if the call already ended. */
export async function markCallAnswered(call: ICall, callUuid?: string | null): Promise<boolean> {
  const updated = await Call.findOneAndUpdate(
    { _id: call._id, status: { $in: ACTIVE_CALL_STATUSES } },
    { $set: { status: "in_progress", ...(callUuid ? { callUuid } : {}) }, $min: { answeredAt: new Date() } },
    { new: true }
  );
  emitLeadUpdate(call.leadId);
  return !!updated;
}

export async function markCallRinging(call: ICall) {
  await Call.updateOne({ _id: call._id, status: "queued" }, { $set: { status: "ringing" } });
  emitLeadUpdate(call.leadId);
}

export async function recordCallError(call: ICall, error: string) {
  await Call.updateOne({ _id: call._id }, { $set: { error: error.slice(0, 500) } });
}

export async function saveCallRecording(call: ICall, params: Record<string, string>) {
  const set: Record<string, unknown> = {};
  if (params.RecordUrl) set.recordingUrl = params.RecordUrl;
  const secs = Number(params.RecordingDuration);
  if (Number.isFinite(secs) && secs > 0) set.recordingDurationSec = Math.round(secs);
  if (Object.keys(set).length) {
    await Call.updateOne({ _id: call._id }, { $set: set });
    emitLeadUpdate(call.leadId);
  }
}

function terminalStatusFromPlivo(params: Record<string, string>, answered: boolean): CallStatus {
  const status = (params.CallStatus || "").toLowerCase();
  const cause = `${params.HangupCauseName || ""} ${params.HangupCause || ""}`;
  const duration = Number(params.Duration) || 0;
  if (/machine/i.test(cause)) return "voicemail";
  if (status === "busy") return "busy";
  if (status === "no-answer" || status === "timeout") return "no_answer";
  if (status === "cancel") return "canceled";
  if (status === "failed") return answered ? "completed" : "failed";
  if (status === "completed") return answered || duration > 0 ? "completed" : "no_answer";
  return answered ? "completed" : "failed";
}

/** Plivo hangup callback: the call is over (answered or not). */
export async function markCallEnded(call: ICall, params: Record<string, string>) {
  const answered = !!call.answeredAt;
  const status = terminalStatusFromPlivo(params, answered);
  const duration = Number(params.Duration);
  const bill = Number(params.BillDuration);
  await Call.updateOne({ _id: call._id }, {
    $set: {
      status,
      active: false,
      endedAt: new Date(),
      ...(params.CallUUID ? { callUuid: params.CallUUID } : {}),
      ...(Number.isFinite(duration) ? { durationSec: duration } : {}),
      ...(Number.isFinite(bill) ? { billDurationSec: bill } : {}),
      hangupCause: params.HangupCauseName || params.HangupCause || undefined,
    },
  });
  emitLeadUpdate(call.leadId);

  if (status === "completed" && !call.bridgeEndedAt) {
    // The bridge normally finalizes once it has flushed the transcript; this is the safety net.
    setTimeout(() => { finalizeCall(String(call._id)).catch((e) => console.error("[Call] finalize failed:", e)); }, 8000);
  } else {
    await finalizeCall(String(call._id));
  }
}

/**
 * Called by the bridge after the media stream closes. If Plivo's hangup callback
 * never arrives, close the call out ourselves after a grace period.
 */
export async function onBridgeEnded(call: ICall) {
  const fresh = await Call.findById(call._id);
  if (!fresh) return;
  if (!fresh.active) {
    await finalizeCall(String(call._id));
    return;
  }
  setTimeout(async () => {
    try {
      const late = await Call.findById(call._id);
      if (late?.active) {
        const end = late.bridgeEndedAt ?? new Date();
        const durationSec = late.answeredAt ? Math.round((end.getTime() - late.answeredAt.getTime()) / 1000) : 0;
        await Call.updateOne({ _id: call._id, active: true }, {
          $set: { status: late.answeredAt ? "completed" : "failed", active: false, endedAt: end, durationSec },
        });
      }
      await finalizeCall(String(call._id));
    } catch (e) {
      console.error("[Call] bridge-end fallback failed:", e);
    }
  }, 30000);
}

const STATUS_EVENT: Partial<Record<CallStatus, string>> = {
  completed: "AI Call Completed",
  no_answer: "Call Not Answered",
  busy: "Call Busy",
  failed: "AI Call Failed",
  canceled: "Call Canceled",
  voicemail: "Call Reached Voicemail",
};

export function formatCallDuration(sec?: number): string {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Close out a finished call exactly once: analyze the transcript, then update
 * the lead, activity feed and the call conversation thread.
 */
export async function finalizeCall(callId: string) {
  const call = await Call.findOneAndUpdate(
    { _id: callId, finalizedAt: null, status: { $nin: ACTIVE_CALL_STATUSES } },
    { $set: { finalizedAt: new Date() } },
    { new: true }
  );
  if (!call) return;

  const agentId = String(call.agentId);
  const leadSpoke = call.transcript.some((t) => t.role === "lead" && t.content.trim().length > 0);

  let whatsappTopic: string | null = null;
  if (call.status === "completed" && leadSpoke) {
    try {
      const analysis = await analyzeCallTranscript(agentId, call.transcript);
      if (call.leadId && !call.isTest) {
        await applyAiFieldValues(agentId, call.leadId, analysis.fields, "AI call").catch((e) => console.error("[Call] field update failed:", e));
      }
      call.summary = analysis.summary;
      call.sentiment = analysis.sentiment;
      call.outcome = analysis.outcome;
      if (analysis.whatsappFollowUp) whatsappTopic = analysis.followUpTopic || analysis.summary;
    } catch (err) {
      console.error("[Call] transcript analysis failed:", err instanceof Error ? err.message : err);
    }
  } else if (call.status === "completed") {
    call.outcome = "no_decision";
    call.summary = call.transcript.length ? "The lead didn't respond to the agent." : "No conversation was captured.";
  }
  await Call.updateOne({ _id: call._id }, { $set: { summary: call.summary, sentiment: call.sentiment, outcome: call.outcome } });

  if (call.isTest || !call.leadId) return;
  const lead = await Lead.findById(call.leadId);
  if (!lead) return;

  const duration = formatCallDuration(call.durationSec);
  const eventName = STATUS_EVENT[call.status] ?? "Call Ended";
  const detailParts = [
    call.status === "completed" ? `Duration ${duration}` : call.hangupCause,
    call.outcome && call.status === "completed" ? `Outcome: ${call.outcome.replace(/_/g, " ")}` : null,
    call.summary,
    call.error ? `Note: ${call.error}` : null,
  ].filter(Boolean);

  await Activity.create({
    agentId, leadId: lead._id, leadName: lead.fullName || "Lead", channel: "call",
    event: eventName, detail: detailParts.join(" · ").slice(0, 2000),
  });

  const set: Record<string, unknown> = {};
  if (call.status === "completed" && leadSpoke) {
    if (call.outcome === "not_interested" && lead.status !== "meeting_booked") {
      set.status = "closed";
      set.pipelineStage = "closed";
    } else {
      if (lead.status === "new" || lead.status === "in_outreach") set.status = "replied";
      if (lead.pipelineStage === "new" || lead.pipelineStage === "contacted") set.pipelineStage = "replied";
    }
  }
  await Lead.updateOne({ _id: lead._id }, {
    ...(Object.keys(set).length ? { $set: set } : {}),
    $push: {
      history: {
        field: "call", from: "in_call", to: call.status, by: "AI Voice Agent", at: new Date(),
        note: (call.status === "completed" ? `${duration}${call.summary ? ` — ${call.summary}` : ""}` : call.hangupCause || "").slice(0, 500),
      },
    },
  });

  const content = call.status === "completed"
    ? `📞 AI call · ${duration}${call.sentiment ? ` · ${call.sentiment}` : ""}${call.summary ? `\n${call.summary}` : ""}`
    : `📞 AI call — ${eventName.toLowerCase()}${call.hangupCause ? ` (${call.hangupCause})` : ""}`;
  await Conversation.findOneAndUpdate(
    { leadId: lead._id, channel: "call" },
    {
      $setOnInsert: { agentId: call.agentId },
      $push: { messages: { role: "agent", content, timestamp: new Date(), meta: { type: "call_summary", callId: String(call._id) } } },
    },
    { upsert: true }
  );
  emitLeadUpdate(lead._id);

  // The lead asked for details / a meeting was agreed, and the agent didn't send them mid-call.
  if (whatsappTopic && !call.whatsappSentAt) {
    await sendCallWhatsAppDetails(String(call._id), whatsappTopic, "after_call")
      .catch((err) => console.error("[Call] after-call WhatsApp failed:", err));
  }
}
