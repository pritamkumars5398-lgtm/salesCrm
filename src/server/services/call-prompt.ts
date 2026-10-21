import type { ILead } from "@/lib/models/Lead";
import type { VoiceConfig } from "./settings.service";
import { getPlaybook, businessBrief, leadAiContext } from "./playbook.service";
import { findKnowledge } from "./knowledge.service";
import { getLeadHistory, LeadHistory } from "./lead-history.service";

/**
 * Instructions for the voice agent, built when the call is placed so a call
 * for one business line only ever talks about that line's offer. Stored on the
 * Call and handed to ElevenLabs by the telephony bridge.
 */

const LANGUAGE_RULES: Record<string, string> = {
  Hindi: "Speak in natural, conversational Hindi as spoken in India, written in Devanagari script. Keep everyday English business words in English (website, app, software, demo, WhatsApp). If the person replies in English, switch to simple English.",
  Hinglish: "Speak natural Hinglish — mostly Hindi with common English words, the way Indian business owners talk on the phone. Write Hindi words in Devanagari. Mirror the language the person uses.",
  English: "Speak clear, simple Indian English. If the person prefers Hindi or a regional language, switch naturally.",
  Tamil: "Speak in natural, polite Tanglish (conversational Tamil mixed with common English business words like appointment, booking, WhatsApp, demo, software). If the person speaks English, switch to English.",
  Telugu: "Speak in natural, polite Telugu-English (conversational Telugu mixed with common English business words like appointment, booking, WhatsApp, demo). If the person speaks English, switch to English.",
  Kannada: "Speak in natural, polite Kanglish (conversational Kannada mixed with common English business words). If the person speaks English, switch to English.",
};

function defaultGreeting(language: string, persona: string, brand: string, returning: boolean, location?: string): string {
  const loc = (location || "").toLowerCase();
  if (language === "Tamil" || loc.includes("tamil") || loc.includes("chennai") || loc.includes("coimbatore")) {
    return "Vanakkam! Good afternoon. Am I speaking with the manager or owner of {{company}}?";
  }
  if (language === "Telugu" || loc.includes("hyderabad") || loc.includes("telangana") || loc.includes("andhra")) {
    return "Namaskaram andi! Good afternoon. Am I speaking with the manager or owner of {{company}}?";
  }
  if (language === "Kannada" || loc.includes("bangalore") || loc.includes("bengaluru") || loc.includes("mysore") || loc.includes("karnataka")) {
    return "Namaskara! Good afternoon. Am I speaking with the manager or owner of {{company}}?";
  }
  if (language === "Hindi" || language === "Hinglish") {
    return returning
      ? `नमस्ते! मैं ${persona} बोल रही हूँ, हमारी पहले बात हुई थी। क्या मेरी बात {{company}} के ओनर या मैनेजर से हो रही है?`
      : `हेलो, नमस्ते! क्या मेरी बात {{company}} के ओनर या मैनेजर से हो रही है?`;
  }
  return `Hello! Good afternoon. Am I speaking with the manager or owner of {{company}}?`;
}

export interface LeadVars {
  lead_name: string;
  company_name: string;
  business_type: string;
  location: string;
  website: string;
  phone: string;
}

/** Per-lead dynamic variables. Google Maps leads store the business name as the person's name. */
export function buildLeadVars(lead: Pick<ILead, "fullName" | "firstName" | "lastName" | "company" | "website" | "jobTitle" | "location" | "phone"> | null | undefined, to: string): LeadVars {
  const person = (lead && (lead.fullName || [lead.firstName, lead.lastName].filter(Boolean).join(" "))) || "";
  const company = lead?.company || person || "aapka business";
  const website = lead?.website || "";
  const ownWebsite = website && !/google\.[a-z.]+\/maps|maps\.google|goo\.gl\/maps/i.test(website) ? website : "";
  return {
    lead_name: person && person !== company ? person : company,
    company_name: company,
    business_type: lead?.jobTitle || "business",
    location: lead?.location || "",
    website: ownWebsite,
    phone: lead?.phone || to || "",
  };
}

export function fillTemplate(text: string, vars: LeadVars): string {
  return text
    .replace(/\{\{\s*leadName\s*\}\}/gi, vars.lead_name)
    .replace(/\{\{\s*company(Name)?\s*\}\}/gi, vars.company_name)
    .replace(/\{\{\s*businessType\s*\}\}/gi, vars.business_type)
    .replace(/\{\{\s*location\s*\}\}/gi, vars.location);
}

export async function buildCallInstructions(
  agentId: string,
  cfg: VoiceConfig,
  lead: ILead | null | undefined,
  to: string,
): Promise<{ prompt: string; firstMessage: string }> {
  const vars = buildLeadVars(lead, to);
  const playbook = await getPlaybook(agentId);
  const persona = playbook.aiPersonaName || "Priya";
  const noHistory: LeadHistory = { hasHistory: false, overview: "", timeline: "", channels: [] };
  const [leadCtx, knowledge, history] = await Promise.all([
    lead ? leadAiContext(agentId, lead).catch(() => ({ facts: "", groupGuidance: "" })) : Promise.resolve({ facts: "", groupGuidance: "" }),
    // A call has no question yet: pick passages about this kind of business and our goal.
    findKnowledge(agentId, `${vars.business_type} ${playbook.callGoal} pricing price features`, 1500).catch(() => ""),
    // Calls are short and the prompt is read before every reply, so keep the history tighter than for text.
    lead ? getLeadHistory(lead._id, { maxChars: 2500 }).catch(() => noHistory) : Promise.resolve(noHistory),
  ]);

  const base = cfg.callScript
    ? fillTemplate(cfg.callScript, vars)
    : `You are ${persona}, a friendly and professional sales representative from ${playbook.brandName}, calling ${playbook.targetCustomer || "a business owner"}.`;

  // Notes are part of the history timeline when there is one.
  const notes = history.hasHistory ? [] : (lead?.notes ?? []).slice(-3).map((n) => n?.text).filter(Boolean);
  const parts: (string | null)[] = [
    base,
    "## The business you are calling",
    `- Business name: ${vars.company_name}`,
    `- Business type: ${vars.business_type}`,
    vars.location ? `- City / area: ${vars.location}` : null,
    `- Website: ${vars.website || "none found (only a Google Maps listing)"}`,
    vars.lead_name !== vars.company_name ? `- Contact person: ${vars.lead_name}` : null,
    leadCtx.facts || null,
    notes.length ? `- Notes from our CRM: ${notes.join(" | ")}` : null,
    "## Who we are",
    businessBrief(playbook, { detailChars: 1200 }),
  ];
  if (history.hasHistory) {
    parts.push(
      "## What already happened with this lead (every channel, oldest first)",
      history.overview,
      history.timeline,
      "- You have been in touch before: do NOT pitch as if this were the first contact. Open by referring to the last interaction (e.g. the WhatsApp chat or the previous call), continue from where it left off, keep any promise we made, and never ask for something they already told us.",
    );
  }
  if (leadCtx.groupGuidance) parts.push("## How to approach this lead", leadCtx.groupGuidance);
  if (knowledge) parts.push("## Reference — product facts and FAQs (answer questions only from this; if it isn't here, say the team will confirm)", knowledge);
  parts.push(
    "## How to run this call",
    "- This is a live phone call. Keep every reply to 1–2 short sentences, ask one question at a time, and let them speak.",
    `- Talk only about THIS business: ${vars.company_name}, a ${vars.business_type}${vars.location ? ` in ${vars.location}` : ""}. Pick the 2–3 parts of what ${playbook.brandName} offers that matter most to a ${vars.business_type} and explain the benefit for them in plain words. Never read out a list.`,
    "- Never mention any other company or client by name, never offer anything we don't sell, and never invent facts about their business or about our product.",
    `- Goal: understand their situation, then ${playbook.callGoal ? playbook.callGoal.charAt(0).toLowerCase() + playbook.callGoal.slice(1) : "offer a short call with our team"}. If they agree, confirm a convenient day and time.`,
    "- When the lead asks for details/information on WhatsApp, or agrees to a meeting or callback, use the send_whatsapp_details tool with a short topic (what they need and any agreed day/time), then tell them you've sent it. If the tool reports a problem, say our team will share the details shortly. Never say you sent something unless the tool succeeded.",
    "- If they are busy, ask for a better time to call back. If they are not interested, thank them politely and end the call. If it is a wrong number, apologise and end the call.",
    "- If you hear an automated phone menu, hold music or a recorded greeting (\"Press 1…\", \"Welcome to…\", \"Press 0 for operator\"), do not talk to it — end the call immediately.",
    "- Whenever the conversation is over (goodbye, not interested, wrong number, meeting or callback confirmed), say one short goodbye and then use the end_call tool. Never keep the line open in silence.",
  );
  const loc = (vars.location || "").toLowerCase();
  let langToUse = cfg.callLanguage || "English";
  if (loc.includes("tamil") || loc.includes("chennai") || loc.includes("coimbatore")) langToUse = "Tamil";
  else if (loc.includes("hyderabad") || loc.includes("telangana") || loc.includes("andhra")) langToUse = "Telugu";
  else if (loc.includes("bangalore") || loc.includes("bengaluru") || loc.includes("mysore") || loc.includes("karnataka")) langToUse = "Kannada";

  if (LANGUAGE_RULES[langToUse]) parts.push("## Language & Code-Switching", LANGUAGE_RULES[langToUse]);

  const greeting = cfg.callGreeting || defaultGreeting(langToUse, persona, playbook.brandName, history.hasHistory, vars.location);
  return {
    prompt: parts.filter(Boolean).join("\n"),
    firstMessage: fillTemplate(greeting, vars),
  };
}
