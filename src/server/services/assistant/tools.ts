import { Types } from "mongoose";
import { Setting } from "@/lib/models/Setting";
import { Lead } from "@/lib/models/Lead";
import { Agent } from "@/lib/models/Agent";
import { Sequence } from "@/lib/models/Sequence";
import { CronJob } from "@/lib/models/CronJob";
import { Call } from "@/lib/models/Call";
import { Usage } from "@/lib/models/Usage";
import { GENERAL_CARDS, INTEGRATION_CARDS, type SettingsField } from "@/lib/constants/settings";
import { computeNextRun } from "@/lib/utils/cron";
import { resolveGroqModel } from "@/lib/llm";
import { currentMonth } from "@/lib/utils/date";
import { getEmailConfig } from "@/lib/email-service";
import { getLLMConfig, getSettingsMap, getVoiceConfig, getWhatsAppConfig, getAppBaseUrl } from "../settings.service";
import { checkElevenLabs, createElevenLabsAgent, fixElevenLabsAgent } from "../elevenlabs.service";
import { placeAiCall, getVoiceSetupError } from "../call.service";
import { normalizeDialableNumber } from "@/lib/plivo-service";
import { countEligibleLeads, createCampaign, preflightCheck, processCampaign } from "../campaign.service";
import { armSchedules } from "../cron.service";

/**
 * Tools the AI assistant panel can use. Each wraps an existing service so the
 * assistant does exactly what the UI would do. Tools marked `confirm` contact
 * leads, spend money or change what runs automatically — the panel shows a
 * Confirm card before they execute.
 */

export interface ToolContext {
  agentId: string;
  req: Request;
}

export interface AssistantTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** needs an explicit user Confirm click before running */
  confirm?: boolean;
  /** one-line description shown on the Confirm card */
  summarize?: (args: any, ctx: ToolContext) => Promise<string> | string;
  /** areas of the app whose data this tool can change (UI refreshes them) */
  changes?: string[];
  run: (args: any, ctx: ToolContext) => Promise<unknown>;
}

// ── settings catalog ─────────────────────────────────────────────────────────

const CARDS = [...GENERAL_CARDS, ...INTEGRATION_CARDS];
const FIELDS = new Map<string, SettingsField & { section: string }>();
for (const card of CARDS) {
  for (const f of card.fields) if (f.type !== "webhook-url") FIELDS.set(f.key, { ...f, section: card.key });
}
const TOGGLE_KEYS = new Set(CARDS.filter((c) => c.togglable).map((c) => `${c.key}Enabled`));

const isSecret = (key: string) => FIELDS.get(key)?.type === "password" || /token|secret|pass|apikey/i.test(key);

export function maskSecret(value?: string | null): string {
  if (!value) return "not set";
  return value.length > 10 ? `set (${value.slice(0, 4)}…${value.slice(-4)})` : "set";
}

function displayValue(key: string, value?: string) {
  return isSecret(key) ? maskSecret(value) : value || "";
}

function sectionCatalog() {
  return CARDS.map((c) => ({
    section: c.key,
    title: c.title,
    keys: c.fields.filter((f) => f.type !== "webhook-url").map((f) => f.key),
    togglable: !!c.togglable,
  }));
}

// ── helpers ──────────────────────────────────────────────────────────────────

const oid = (id: string) => new Types.ObjectId(id);

async function activeSequence(agentId: string) {
  return Sequence.findOne({ agentId }).sort({ updatedAt: -1 });
}

function describeSteps(steps: { channel: string; dayOffset: number; sendTime: string }[]) {
  return [...steps]
    .sort((a, b) => a.dayOffset - b.dayOffset || a.sendTime.localeCompare(b.sendTime))
    .map((s) => `Day ${s.dayOffset} ${s.sendTime} — ${s.channel === "call" ? "AI voice call" : s.channel}`);
}

async function leadCounts(agentId: string) {
  const rows = await Lead.aggregate([
    { $match: { agentId: oid(agentId), deletedAt: null } },
    { $group: { _id: "$status", n: { $sum: 1 } } },
  ]);
  const counts: Record<string, number> = {};
  rows.forEach((r) => { counts[r._id ?? "unknown"] = r.n; });
  counts.total = Object.values(counts).reduce((a, b) => a + b, 0);
  return counts;
}

// ── tools ────────────────────────────────────────────────────────────────────

export const ASSISTANT_TOOLS: AssistantTool[] = [
  {
    name: "get_setup_status",
    description: "Overview of how this CRM agent is set up: published status, which channels (AI, email, WhatsApp, SMS, voice calls, Calendly) are configured and working, the active sequence, schedules and lead counts. Call this first when the user asks what's set up, what's missing, or why something doesn't work.",
    parameters: { type: "object", properties: {} },
    run: async (_args, { agentId }) => {
      const [agent, llm, email, wa, voiceError, voiceCfg, m, seq, schedules, counts] = await Promise.all([
        Agent.findById(agentId).lean(),
        getLLMConfig(agentId),
        getEmailConfig(agentId),
        getWhatsAppConfig(agentId),
        getVoiceSetupError(agentId),
        getVoiceConfig(agentId),
        getSettingsMap(agentId, ["smsProvider", "smsFrom", "smsApiKey", "calendlyLink", "callLanguage", "voiceEnabled", "emailEnabled", "whatsappEnabled", "smsEnabled"]),
        activeSequence(agentId),
        CronJob.find({ agentId }).lean(),
        leadCounts(agentId),
      ]);
      let voice: Record<string, unknown> = { configured: !voiceError, problem: voiceError ?? undefined };
      if (!voiceError) {
        const el = await checkElevenLabs(voiceCfg.elevenLabsApiKey, voiceCfg.elevenLabsAgentId, voiceCfg.callLanguage);
        voice = {
          configured: true,
          readyForCalls: el.ready,
          callerNumber: voiceCfg.callerPhone,
          language: voiceCfg.callLanguage || "agent default",
          elevenLabs: {
            keyValid: el.keyValid,
            missingPermissions: Object.entries(el.permissions).filter(([, v]) => v === false).map(([k]) => k),
            agentFound: el.agent?.found ?? false,
            agentIssues: el.agent?.issues ?? [],
          },
        };
      }
      return {
        agent: { name: agent?.name, published: agent?.status === "active" },
        ai: llm ? { configured: true, provider: llm.provider, model: llm.apiKey.startsWith("gsk_") ? resolveGroqModel(llm.model) : llm.model || "gpt-4o-mini" } : { configured: false },
        email: email ? { configured: true, provider: email.provider, from: email.fromAddress, enabled: m.emailEnabled !== "false" } : { configured: false },
        whatsapp: wa ? { configured: true, provider: wa.provider, enabled: m.whatsappEnabled !== "false" } : { configured: false },
        sms: m.smsApiKey || process.env.PLIVO_AUTH_TOKEN ? { configured: true, provider: m.smsProvider || "Plivo", from: m.smsFrom || process.env.PLIVO_FROM_NUMBER, enabled: m.smsEnabled !== "false" } : { configured: false },
        voice: { ...voice, enabled: m.voiceEnabled !== "false" },
        calendly: { link: m.calendlyLink || null },
        sequence: seq ? { name: seq.name, steps: describeSteps(seq.steps), note: "Only the first step currently runs automatically." } : null,
        schedules: schedules.map((s) => ({ id: String(s._id), name: s.name, action: s.action, cron: s.cronExpression, enabled: s.enabled })),
        leads: counts,
      };
    },
  },
  {
    name: "get_settings",
    description: "Read settings. With no arguments, lists all settings sections and their keys. Pass `section` (e.g. voice, email, whatsapp, sms, llm, profile, calendly) or `keys` to get current values, labels, allowed options and hints. Secret values are masked.",
    parameters: {
      type: "object",
      properties: {
        section: { type: "string", description: "settings section key" },
        keys: { type: "array", items: { type: "string" } },
      },
    },
    run: async (args: { section?: string; keys?: string[] }, { agentId }) => {
      const keys = args.keys?.length
        ? args.keys
        : args.section ? [...FIELDS.values()].filter((f) => f.section === args.section).map((f) => f.key) : [];
      if (keys.length === 0) return { sections: sectionCatalog() };
      const m = await getSettingsMap(agentId, keys);
      return keys.map((key) => {
        const f = FIELDS.get(key);
        return {
          key,
          label: f?.label,
          value: displayValue(key, m[key]),
          ...(f?.options ? { options: f.options } : {}),
          ...(f?.hint ? { hint: f.hint } : {}),
          ...(f ? {} : { note: "unknown key" }),
        };
      });
    },
  },
  {
    name: "update_settings",
    description: "Change one or more settings, e.g. {\"callLanguage\":\"Hindi\",\"voiceApiKey\":\"sk_…\"}. Use exact keys from get_settings. Values with fixed options must be one of the options. Section on/off switches use keys like voiceEnabled / emailEnabled = \"true\"|\"false\". Pasted API keys are saved securely and never repeated back.",
    parameters: {
      type: "object",
      properties: { settings: { type: "object", additionalProperties: { type: "string" } } },
      required: ["settings"],
    },
    changes: ["settings"],
    run: async (args: { settings: Record<string, unknown> }, { agentId }) => {
      const saved: Record<string, string> = {};
      const rejected: Record<string, string> = {};
      for (const [key, raw] of Object.entries(args.settings || {})) {
        const value = String(raw ?? "").trim();
        if (TOGGLE_KEYS.has(key)) {
          if (value !== "true" && value !== "false") { rejected[key] = 'must be "true" or "false"'; continue; }
          saved[key] = value;
          continue;
        }
        const f = FIELDS.get(key);
        if (!f) { rejected[key] = "unknown setting key"; continue; }
        if (f.options && value) {
          const match = f.options.find((o) => o.toLowerCase() === value.toLowerCase());
          if (!match) { rejected[key] = `must be one of: ${f.options.join(", ")}`; continue; }
          saved[key] = match;
        } else {
          saved[key] = value;
        }
      }
      if (saved.agentName) {
        await Agent.findByIdAndUpdate(agentId, { name: saved.agentName });
      }
      // Keep scraper keywords in step with the industry, like the Settings page does.
      if (saved.industry !== undefined) {
        saved.gmKeyword = saved.linkedinKeyword = saved.jdKeyword = saved.industry;
      }
      await Promise.all(Object.entries(saved).map(([key, value]) =>
        Setting.updateOne({ agentId, key }, { $set: { value } }, { upsert: true })
      ));
      const shown = Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, displayValue(k, v)]));
      return { saved: shown, ...(Object.keys(rejected).length ? { rejected } : {}) };
    },
  },
  {
    name: "voice_setup",
    description: "Check or repair the ElevenLabs side of AI phone calls using the saved Voice API Key. action: \"check\" (permissions, agent, call settings), \"create_agent\" (make a phone-ready agent on the key's account and save its ID), \"fix_agent\" (turn on phone audio, overrides, hang-up tools, language on the current agent), \"use_agent\" (save an existing agent ID from the check's agent list). To change the key, call update_settings with voiceApiKey first.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["check", "create_agent", "fix_agent", "use_agent"] },
        elevenAgentId: { type: "string", description: "for use_agent" },
      },
      required: ["action"],
    },
    changes: ["settings"],
    run: async (args: { action: string; elevenAgentId?: string }, { agentId }) => {
      const cfg = await getVoiceConfig(agentId);
      const m = await getSettingsMap(agentId, ["agentName"]);
      let elevenAgentId = cfg.elevenLabsAgentId;
      if (args.action === "create_agent") {
        const agent = await Agent.findById(agentId).lean();
        const r = await createElevenLabsAgent(cfg.elevenLabsApiKey, `${m.agentName || agent?.name || "CRM"} — phone agent`, cfg.callLanguage);
        if (!r.ok || !r.agentId) return { error: `ElevenLabs: ${r.error}` };
        elevenAgentId = r.agentId;
        await Setting.updateOne({ agentId, key: "elevenLabsAgentId" }, { $set: { value: elevenAgentId } }, { upsert: true });
      } else if (args.action === "fix_agent") {
        const r = await fixElevenLabsAgent(cfg.elevenLabsApiKey, elevenAgentId, cfg.callLanguage);
        if (!r.ok) return { error: `ElevenLabs: ${r.error}` };
      } else if (args.action === "use_agent") {
        if (!args.elevenAgentId) return { error: "elevenAgentId is required" };
        elevenAgentId = args.elevenAgentId;
        await Setting.updateOne({ agentId, key: "elevenLabsAgentId" }, { $set: { value: elevenAgentId } }, { upsert: true });
      }
      const check = await checkElevenLabs(cfg.elevenLabsApiKey, elevenAgentId, cfg.callLanguage);
      return {
        ...check,
        howToFixPermissions: Object.values(check.permissions).includes(false)
          ? "In ElevenLabs → Developers → API Keys, give the key ElevenAgents: Write (plus Text to Speech: Access and Voices: Read for previews), or turn off Restrict Key, then save the new key."
          : undefined,
      };
    },
  },
  {
    name: "get_sequence",
    description: "Show the active outreach sequence (the steps leads go through).",
    parameters: { type: "object", properties: {} },
    run: async (_args, { agentId }) => {
      const seq = await activeSequence(agentId);
      return seq ? { name: seq.name, steps: describeSteps(seq.steps), note: "Only the first step currently runs automatically; later steps are not scheduled yet." } : { sequence: null };
    },
  },
  {
    name: "set_sequence",
    description: "Replace the steps of the active outreach sequence. channel: email | whatsapp | sms | call (AI voice call). dayOffset ≥ 1, sendTime \"HH:MM\" 24h. Steps on the same day+time fire together. Only the first step currently runs automatically.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              channel: { type: "string", enum: ["email", "whatsapp", "sms", "call"] },
              dayOffset: { type: "integer", minimum: 1 },
              sendTime: { type: "string" },
            },
            required: ["channel"],
          },
        },
      },
      required: ["steps"],
    },
    changes: ["sequence"],
    run: async (args: { name?: string; steps: { channel: string; dayOffset?: number; sendTime?: string }[] }, { agentId }) => {
      if (!Array.isArray(args.steps) || args.steps.length === 0) return { error: "At least one step is required." };
      const steps = args.steps.map((s, i) => ({
        order: i + 1,
        channel: s.channel,
        dayOffset: Math.max(1, Math.round(Number(s.dayOffset) || 1)),
        sendTime: /^\d{1,2}:\d{2}$/.test(s.sendTime || "") ? s.sendTime!.padStart(5, "0") : "09:00",
      }));
      const bad = steps.find((s) => !["email", "whatsapp", "sms", "call"].includes(s.channel));
      if (bad) return { error: `Unknown channel "${bad.channel}".` };
      const existing = await activeSequence(agentId);
      if (existing) {
        existing.steps = steps as never;
        if (args.name) existing.name = args.name;
        await existing.save();
      } else {
        await Sequence.create({ agentId, name: args.name || "Outreach", steps });
      }
      return { saved: true, name: args.name || existing?.name || "Outreach", steps: describeSteps(steps) };
    },
  },
  {
    name: "find_leads",
    description: "Search leads by name/company/phone and/or status (new, in_outreach, replied, meeting_booked, closed). Only pass `status` when the user asked for leads in that status. Exact name matches come first. Returns up to `limit` leads (default 10) with ids, plus total counts by status.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        status: { type: "string", enum: ["new", "in_outreach", "replied", "meeting_booked", "closed"] },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
    },
    run: async (args: { query?: string; status?: string; limit?: number }, { agentId }) => {
      const filter: Record<string, unknown> = { agentId, deletedAt: null };
      if (args.status) filter.status = args.status;
      if (args.query) {
        const re = new RegExp(args.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        filter.$or = [{ fullName: re }, { company: re }, { phone: re }, { email: re }];
      }
      const [leads, matching, counts] = await Promise.all([
        Lead.find(filter).sort({ updatedAt: -1 }).limit(Math.min(args.limit ?? 10, 50))
          .select("fullName company phone email status location jobTitle lastContactedAt").lean(),
        Lead.countDocuments(filter),
        leadCounts(agentId),
      ]);
      // Exact (case-insensitive) name matches first, so "Dental CLINIC" finds that lead, not "K D Dental Clinic".
      if (args.query) {
        const exactRe = new RegExp(`^\\s*${args.query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
        const { $or: _textMatch, ...base } = filter;
        const exact = await Lead.find({ ...base, fullName: exactRe }).limit(5)
          .select("fullName company phone email status location jobTitle lastContactedAt").lean();
        const seen = new Set(exact.map((l) => String(l._id)));
        leads.splice(0, leads.length, ...exact, ...leads.filter((l) => !seen.has(String(l._id))));
      }
      return {
        matching,
        leads: leads.map((l) => ({ id: String(l._id), name: l.fullName, company: l.company, phone: l.phone, email: l.email, status: l.status, type: l.jobTitle, city: l.location })),
        countsByStatus: counts,
      };
    },
  },
  {
    name: "get_activity_summary",
    description: "Results so far: lead counts by status, AI call stats (total, answered, talk time, today), this month's usage (messages, emails, SMS, calls) and recent calls with outcomes.",
    parameters: { type: "object", properties: {} },
    run: async (_args, { agentId }) => {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const [counts, callStats, today, usage, recent] = await Promise.all([
        leadCounts(agentId),
        Call.aggregate([
          { $match: { agentId: oid(agentId), isTest: { $ne: true }, mode: "ai" } },
          { $group: { _id: null, calls: { $sum: 1 }, answered: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } }, talkSec: { $sum: { $ifNull: ["$durationSec", 0] } } } },
        ]),
        Call.countDocuments({ agentId, isTest: { $ne: true }, createdAt: { $gte: since } }),
        Usage.findOne({ agentId, month: currentMonth() }).lean(),
        Call.find({ agentId, isTest: { $ne: true }, leadId: { $ne: null } }).sort({ createdAt: -1 }).limit(8)
          .populate("leadId", "fullName").select("status outcome summary durationSec createdAt leadId").lean(),
      ]);
      const c = callStats[0] ?? { calls: 0, answered: 0, talkSec: 0 };
      return {
        leads: counts,
        calls: { total: c.calls, answered: c.answered, talkMinutes: Math.round(c.talkSec / 60), today },
        usageThisMonth: usage ? { messages: usage.messagesSent, emails: usage.emailsSent, sms: usage.smsSent, calls: usage.callsMade, leadsScraped: usage.leadsScraped } : {},
        recentCalls: recent.map((r) => ({
          lead: (r.leadId as unknown as { fullName?: string } | null)?.fullName,
          status: r.status, outcome: r.outcome, summary: r.summary, seconds: r.durationSec, at: r.createdAt,
        })),
      };
    },
  },
  {
    name: "list_schedules",
    description: "List automation schedules (cron jobs) with their action, timing and on/off state.",
    parameters: { type: "object", properties: {} },
    run: async (_args, { agentId }) => {
      const jobs = await CronJob.find({ agentId }).sort({ createdAt: -1 }).lean();
      return jobs.map((j) => ({ id: String(j._id), name: j.name, action: j.action, cron: j.cronExpression, enabled: j.enabled, nextRunAt: j.nextRunAt }));
    },
  },
  {
    name: "create_schedule",
    description: "Create an automation schedule. action: start_outreach (contact new leads via the sequence), sync_apify (scrape new leads then contact them), pause_agent, resume_agent. cronExpression is standard 5-field cron in server time, e.g. \"0 10 * * 1-5\" = weekdays 10:00.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        action: { type: "string", enum: ["start_outreach", "sync_apify", "pause_agent", "resume_agent"] },
        cronExpression: { type: "string" },
      },
      required: ["name", "action", "cronExpression"],
    },
    confirm: true,
    changes: ["schedules"],
    summarize: (a) => `Create schedule “${a.name}”: ${a.action.replace(/_/g, " ")} at cron \`${a.cronExpression}\``,
    run: async (args: { name: string; action: string; cronExpression: string }, { agentId }) => {
      let nextRunAt: Date;
      try { nextRunAt = computeNextRun(args.cronExpression); } catch { return { error: `Invalid cron expression "${args.cronExpression}".` }; }
      const job = await CronJob.create({ agentId, name: args.name, action: args.action, cronExpression: args.cronExpression, enabled: true, nextRunAt });
      return { created: true, id: String(job._id), nextRunAt };
    },
  },
  {
    name: "toggle_schedule",
    description: "Turn a schedule on or off by id (from list_schedules).",
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, enabled: { type: "boolean" } },
      required: ["id", "enabled"],
    },
    confirm: true,
    changes: ["schedules"],
    summarize: async (a, { agentId }) => {
      const j = Types.ObjectId.isValid(a.id) ? await CronJob.findOne({ _id: a.id, agentId }).lean() : null;
      return `${a.enabled ? "Turn on" : "Turn off"} schedule “${j?.name ?? a.id}”`;
    },
    run: async (args: { id: string; enabled: boolean }, { agentId }) => {
      if (!Types.ObjectId.isValid(args.id)) return { error: "Invalid schedule id" };
      const job = await CronJob.findOneAndUpdate(
        { _id: args.id, agentId },
        { enabled: args.enabled },
        { new: true }
      );
      if (!job) return { error: "Schedule not found" };
      if (args.enabled) await CronJob.updateOne({ _id: job._id }, { nextRunAt: computeNextRun(job.cronExpression) });
      return { id: args.id, enabled: job.enabled };
    },
  },
  {
    name: "set_agent_status",
    description: "Publish (active) or unpublish (inactive) this agent. Publishing runs a pre-flight check and arms its schedules so automated outreach can run; unpublishing stops automation.",
    parameters: {
      type: "object",
      properties: { status: { type: "string", enum: ["active", "inactive"] } },
      required: ["status"],
    },
    confirm: true,
    changes: ["agent"],
    summarize: (a) => (a.status === "active" ? "Publish the agent — schedules start running automated outreach" : "Unpublish the agent — automated outreach stops"),
    run: async (args: { status: "active" | "inactive" }, { agentId }) => {
      if (args.status === "inactive") {
        await Agent.findByIdAndUpdate(agentId, { status: "inactive" });
        return { published: false };
      }
      const preflight = await preflightCheck(agentId);
      if (!preflight.ok) return { published: false, issues: preflight.issues, warnings: preflight.warnings };
      await Agent.findByIdAndUpdate(agentId, { status: "active" });
      const schedules = await armSchedules(agentId);
      return { published: true, schedulesArmed: schedules, warnings: preflight.warnings };
    },
  },
  {
    name: "call_lead",
    description: "Place an AI voice call to one lead now (by lead id from find_leads).",
    parameters: { type: "object", properties: { leadId: { type: "string" } }, required: ["leadId"] },
    confirm: true,
    changes: ["calls", "leads"],
    summarize: async (a, { agentId }) => {
      const l = Types.ObjectId.isValid(a.leadId) ? await Lead.findOne({ _id: a.leadId, agentId }).lean() : null;
      return l ? `Call ${l.fullName} (${l.phone || "no phone"}) with the AI voice agent` : `Call lead ${a.leadId}`;
    },
    run: async (args: { leadId: string }, { agentId, req }) => {
      if (!Types.ObjectId.isValid(args.leadId)) return { error: "Invalid lead id" };
      const lead = await Lead.findOne({ _id: args.leadId, agentId, deletedAt: null });
      if (!lead) return { error: "Lead not found" };
      const r = await placeAiCall({ agentId, lead, req });
      return r.ok ? { calling: true, lead: lead.fullName, callId: String(r.call?._id) } : { error: r.error };
    },
  },
  {
    name: "test_call",
    description: "Place a short AI test call to any phone number (e.g. the user's own) to hear how the agent sounds. Not linked to a lead.",
    parameters: { type: "object", properties: { phone: { type: "string" } }, required: ["phone"] },
    confirm: true,
    summarize: (a) => `Place an AI test call to ${a.phone}`,
    run: async (args: { phone: string }, { agentId, req }) => {
      const r = await placeAiCall({ agentId, toNumber: args.phone, isTest: true, req });
      return r.ok ? { calling: true, callId: String(r.call?._id) } : { error: r.error };
    },
  },
  {
    name: "start_campaign",
    description: "Start outreach now to new (never-contacted) leads using the active sequence's first step — sends messages and/or places AI calls. Optional limit = how many leads.",
    parameters: { type: "object", properties: { limit: { type: "integer", minimum: 1 } } },
    confirm: true,
    changes: ["leads", "calls"],
    summarize: async (a, { agentId }) => {
      const [eligible, seq] = await Promise.all([countEligibleLeads(agentId), activeSequence(agentId)]);
      const n = a.limit ? Math.min(a.limit, eligible) : eligible;
      const first = seq?.steps?.length ? describeSteps(seq.steps)[0] : "email / WhatsApp / SMS";
      return `Start outreach to ${n} new lead${n === 1 ? "" : "s"} — first step: ${first}`;
    },
    run: async (args: { limit?: number }, { agentId, req }) => {
      const agent = await Agent.findById(agentId).lean();
      const eligible = await countEligibleLeads(agentId);
      if (eligible === 0) return { error: "No new leads left to contact." };
      const campaign = await createCampaign(agentId, "manual", { limit: args.limit });
      if (!campaign) return { error: "Could not start — no eligible leads." };
      void processCampaign(String(campaign._id), { senderName: agent?.name, baseUrl: getAppBaseUrl(req), ignoreAgentStatus: true })
        .catch((err) => console.error(`[assistant] campaign ${campaign._id} error:`, err));
      return { started: true, leads: campaign.total, campaignId: String(campaign._id) };
    },
  },
  {
    name: "add_lead",
    description: "Add a new lead by hand. Needs a name and at least a phone or email. Phone numbers without a country code are treated as Indian (+91). Refuses duplicates (same phone or email already in this workspace) unless allowDuplicate is true — tell the user about the existing lead instead.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "person or business name" },
        phone: { type: "string" },
        email: { type: "string" },
        company: { type: "string" },
        jobTitle: { type: "string", description: "role or business type, e.g. Dental clinic" },
        location: { type: "string", description: "city / area" },
        website: { type: "string" },
        note: { type: "string", description: "optional first note" },
        allowDuplicate: { type: "boolean" },
      },
      required: ["name"],
    },
    changes: ["leads"],
    run: async (args: { name: string; phone?: string; email?: string; company?: string; jobTitle?: string; location?: string; website?: string; note?: string; allowDuplicate?: boolean }, { agentId }) => {
      const rawName = String(args.name || "").trim().replace(/\s+/g, " ");
      if (!rawName) return { error: "A name is required." };
      // "jitendra shahu" → "Jitendra Shahu"; leave intentional casing ("NeoSOFT", "iCare") alone.
      const name = rawName === rawName.toLowerCase() ? rawName.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : rawName;
      const email = String(args.email || "").trim().toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: `"${args.email}" is not a valid email address.` };
      let phone = "";
      if (args.phone) {
        const digits = normalizeDialableNumber(args.phone);
        if (!digits) return { error: `"${args.phone}" is not a valid phone number.` };
        phone = `+${digits}`;
      }
      if (!phone && !email) return { error: "Give a phone number or an email so the lead can be contacted." };

      if (!args.allowDuplicate) {
        const or: Record<string, unknown>[] = [];
        if (phone) or.push({ phone: new RegExp(`${phone.slice(-10)}$`) });
        if (email) or.push({ email });
        const existing = await Lead.findOne({ agentId, deletedAt: null, $or: or }).select("fullName phone email status").lean();
        if (existing) {
          return { duplicate: true, existing: { id: String(existing._id), name: existing.fullName, phone: existing.phone, email: existing.email, status: existing.status } };
        }
      }

      const [firstName, ...rest] = name.split(/\s+/);
      const lead = new Lead({
        agentId, firstName, lastName: rest.join(" "), phone, email,
        company: args.company?.trim() || (rest.length ? "" : name),
        jobTitle: args.jobTitle?.trim() || "", location: args.location?.trim() || "", website: args.website?.trim() || "",
        source: "Manual", status: "new", pipelineStage: "new",
        notes: args.note ? [{ text: args.note, author: "AI Assistant", createdAt: new Date() }] : [],
        history: [{ field: "created", from: "—", to: "lead added", by: "AI Assistant", at: new Date() }],
      });
      // Single-word names have no surname; the schema requires one, so skip that check only.
      const err = lead.validateSync();
      const blocking = err ? Object.keys(err.errors).filter((k) => !(k === "lastName" && !lead.lastName)) : [];
      if (blocking.length) return { error: `Invalid lead: ${blocking.join(", ")}` };
      await lead.save({ validateBeforeSave: false });
      await Agent.findByIdAndUpdate(agentId, { $inc: { leadCount: 1 } });
      return { added: true, id: String(lead._id), name: lead.fullName, phone, email };
    },
  },
  {
    name: "update_lead",
    description: "Edit a lead (id from find_leads): name, company, jobTitle, phone, email, location, website, status (new | in_outreach | replied | meeting_booked | closed) or agentEnabled (AI auto-replies on/off). Changes are recorded in the lead's history.",
    parameters: {
      type: "object",
      properties: {
        leadId: { type: "string" },
        changes: {
          type: "object",
          properties: {
            firstName: { type: "string" }, lastName: { type: "string" }, company: { type: "string" }, jobTitle: { type: "string" },
            phone: { type: "string" }, email: { type: "string" }, location: { type: "string" }, website: { type: "string" },
            status: { type: "string", enum: ["new", "in_outreach", "replied", "meeting_booked", "closed"] },
            agentEnabled: { type: "boolean" },
          },
        },
      },
      required: ["leadId", "changes"],
    },
    changes: ["leads"],
    run: async (args: { leadId: string; changes: Record<string, unknown> }, { agentId }) => {
      if (!Types.ObjectId.isValid(args.leadId)) return { error: "Invalid lead id" };
      const lead = await Lead.findOne({ _id: args.leadId, agentId, deletedAt: null });
      if (!lead) return { error: "Lead not found" };
      const STAGE: Record<string, string> = { new: "new", in_outreach: "contacted", replied: "replied", meeting_booked: "qualified", closed: "closed" };
      const allowed = ["firstName", "lastName", "company", "jobTitle", "phone", "email", "location", "website", "status", "agentEnabled"];
      const applied: Record<string, unknown> = {};
      for (const [key, raw] of Object.entries(args.changes || {})) {
        if (!allowed.includes(key)) continue;
        let value: unknown = raw;
        if (key === "phone" && raw) {
          const digits = normalizeDialableNumber(String(raw));
          if (!digits) return { error: `"${raw}" is not a valid phone number.` };
          value = `+${digits}`;
        }
        if (key === "email" && raw) value = String(raw).trim().toLowerCase();
        if (key === "status" && !STAGE[String(raw)]) return { error: `Unknown status "${raw}"` };
        const before = (lead as unknown as Record<string, unknown>)[key];
        if (String(before ?? "") === String(value ?? "")) continue;
        lead.history.push({ field: key, from: String(before ?? "—"), to: String(value), by: "AI Assistant", at: new Date() });
        (lead as unknown as Record<string, unknown>)[key] = value;
        applied[key] = value;
        if (key === "status") lead.pipelineStage = STAGE[String(value)] as typeof lead.pipelineStage;
      }
      if (Object.keys(applied).length === 0) return { updated: false, note: "Nothing changed." };
      await lead.save();
      return { updated: true, lead: lead.fullName, changes: applied };
    },
  },
  {
    name: "add_lead_note",
    description: "Add a note to a lead (id from find_leads).",
    parameters: { type: "object", properties: { leadId: { type: "string" }, text: { type: "string" } }, required: ["leadId", "text"] },
    changes: ["leads"],
    run: async (args: { leadId: string; text: string }, { agentId }) => {
      if (!Types.ObjectId.isValid(args.leadId) || !args.text?.trim()) return { error: "leadId and text are required" };
      const r = await Lead.updateOne(
        { _id: args.leadId, agentId, deletedAt: null },
        { $push: { notes: { text: args.text.trim(), author: "AI Assistant", createdAt: new Date() } } }
      );
      return r.matchedCount ? { added: true } : { error: "Lead not found" };
    },
  },
  {
    name: "delete_lead",
    description: "Move a lead to Trash (id from find_leads). It can be restored from Trash on the Leads page.",
    parameters: { type: "object", properties: { leadId: { type: "string" } }, required: ["leadId"] },
    confirm: true,
    changes: ["leads"],
    summarize: async (a, { agentId }) => {
      const l = Types.ObjectId.isValid(a.leadId) ? await Lead.findOne({ _id: a.leadId, agentId }).lean() : null;
      return `Move lead ${l ? `“${l.fullName}”${l.phone ? ` (${l.phone})` : ""}` : a.leadId} to Trash`;
    },
    run: async (args: { leadId: string }, { agentId }) => {
      if (!Types.ObjectId.isValid(args.leadId)) return { error: "Invalid lead id" };
      const lead = await Lead.findOneAndUpdate({ _id: args.leadId, agentId, deletedAt: null }, { deletedAt: new Date() });
      if (!lead) return { error: "Lead not found (or already in Trash)" };
      await Agent.findByIdAndUpdate(agentId, { $inc: { leadCount: -1 } });
      return { trashed: true, lead: lead.fullName };
    },
  },
];

export const TOOLS_BY_NAME = new Map(ASSISTANT_TOOLS.map((t) => [t.name, t]));
