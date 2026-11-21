import type { ILead } from "@/lib/models/Lead";
import type { VoiceConfig } from "./settings.service";
import { getPlaybook, businessBrief, leadAiContext } from "./playbook.service";
import { findKnowledge } from "./knowledge.service";
import { getLeadHistory, LeadHistory } from "./lead-history.service";
import { getEffectiveVoice } from "./voice-options.service";

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

type TimeOfDay = "morning" | "afternoon" | "evening";

function timeOfDay(now = new Date()): TimeOfDay {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: process.env.CALL_TIMEZONE || "Asia/Kolkata" }).format(now));
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

/**
 * A saved opening may say "Good afternoon" — make it match the real time of the call
 * (English and the common Hindi/Devanagari spellings).
 */
export function matchTimeOfDay(text: string, now = new Date()): string {
  const tod = timeOfDay(now);
  const hi = { morning: "मॉर्निंग", afternoon: "आफ्टरनून", evening: "इवनिंग" }[tod];
  return text
    .replace(/\bgood\s+(morning|afternoon|evening)\b/gi, (m) => (/^G/.test(m) ? "Good " : "good ") + tod)
    .replace(/गुड\s*(मॉर्निंग|मोर्निंग|आफ्टरनून|आफ़्टरनून|इवनिंग|ईवनिंग)/g, `गुड ${hi}`);
}

export interface GreetingInput {
  language: string;
  persona: string;
  brand: string;
  /** the voice's gender, for Hindi verbs (bol rahi / bol raha) */
  gender?: "female" | "male";
  /** we've talked to this lead before */
  returning?: boolean;
  /** the lead's business name is known (otherwise don't ask "is this {{company}}?") */
  hasCompany?: boolean;
  location?: string;
  /** fixed variant (for showing a suggestion); calls pick one at random so they don't all sound the same */
  variant?: number;
  now?: Date;
}

/**
 * A short, human-sounding first line: greets for the time of day, says who is
 * calling and from where, then checks it's the right business — the way a real
 * sales caller opens. Uses {{company}} for the lead's business name.
 */
export function naturalGreeting(g: GreetingInput): string {
  const tod = timeOfDay(g.now);
  const me = g.persona;
  const brand = g.brand && g.brand !== "our company" ? g.brand : "";
  const male = g.gender === "male";
  const speaking = male ? "बोल रहा हूँ" : "बोल रही हूँ";
  const talking = male ? "बात कर रहा हूँ" : "बात कर रही हूँ";
  const pick = (list: string[]) => list[(g.variant ?? Math.floor(Math.random() * list.length)) % list.length];
  const loc = (g.location || "").toLowerCase();
  const regional =
    g.language === "Tamil" || /tamil|chennai|coimbatore/.test(loc) ? "Vanakkam" :
    g.language === "Telugu" || /hyderabad|telangana|andhra/.test(loc) ? "Namaskaram andi" :
    g.language === "Kannada" || /bangalore|bengaluru|mysore|karnataka/.test(loc) ? "Namaskara" : "";

  if (g.language === "Hindi" || g.language === "Hinglish") {
    const from = brand ? `${brand} से ` : "";
    const hello = g.language === "Hinglish" ? `Hello, good ${tod}!` : "नमस्ते जी!";
    if (g.returning) {
      return `${hello} मैं ${me}${brand ? `, ${brand} से` : ""} ${speaking} — हमारी पहले भी बात हुई थी। अभी दो मिनट बात हो सकती है?`;
    }
    // Open like a person, not a script: no name, no company, no pitch. Built from small parts
    // (hello + how are you + sometimes a little more) so calls rarely sound the same.
    // First line is ONLY a hello for the time of day — then wait. "How are you", their
    // business and who we are come next, one at a time (see "How to open the call").
    const goodTime = { morning: "गुड मॉर्निंग जी!", afternoon: "गुड आफ्टरनून जी!", evening: "गुड इवनिंग जी!" }[tod];
    return pick([`नमस्ते जी! ${goodTime}`, `हेलो जी, ${goodTime}`, goodTime, `हेलो, नमस्ते! ${goodTime}`]);
  }

  const hi = regional ? `${regional}! Good ${tod}.` : pick([`Hi, good ${tod}!`, `Hello, good ${tod}!`]);
  const from = brand ? ` from ${brand}` : "";
  if (g.returning) return `${hi} It's ${me}${from} — we spoke earlier. Is now a good time for a quick minute?`;
  // Open like a person: just hello and good morning/afternoon/evening — then wait for them.
  return hi;
}

/** One of the customer's own openings (one per line) — a different one on each call. */
export function pickCustomGreeting(text: string, opts: { hasCompany?: boolean } = {}): string {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
    // Without a business name, "{{company}}" would turn into an awkward placeholder.
    .filter((l) => opts.hasCompany !== false || !/\{\{\s*(company(Name)?|leadName)\s*\}\}/i.test(l));
  return lines.length ? lines[Math.floor(Math.random() * lines.length)] : "";
}

/** The persona name to use when the playbook has none — matches the voice's gender. */
export function defaultPersona(gender?: "female" | "male"): string {
  return gender === "male" ? "Rahul" : "Priya";
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
  // A test or practice call has no lead: don't pretend to know a business name.
  const knownCompany = !!(lead?.company || lead?.fullName || lead?.firstName);
  const them = knownCompany ? vars.company_name : "the business";
  const [playbook, voice] = await Promise.all([
    getPlaybook(agentId),
    getEffectiveVoice(agentId).catch(() => null),
  ]);
  const persona = playbook.aiPersonaName || defaultPersona(voice?.gender);
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
    knownCompany
      ? `- Business name: ${vars.company_name}`
      : "- Business name: not known yet. After the greeting, ask for it naturally (\"आपका business किस नाम से है?\" / \"What's the name of your business?\") and what kind of business it is, then use it.",
    knownCompany ? `- Business type: ${vars.business_type}` : null,
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
  if (!history.hasHistory) parts.push(
    "## How to open the call — like a good human salesperson",
    "- Go step by step, ONE short line per turn, and wait for their answer after each step. Never put two steps in one reply.",
    "- Step 1 — greeting: your first line was only a hello and good morning/afternoon/evening. Wait. If they only say \"Hello?\" / \"Haan ji?\", answer naturally (\"जी, आवाज़ आ रही है?\" / \"Yes, can you hear me?\").",
    "- Step 2 — how are they: ask how they are (\"आप कैसे हैं?\" / \"How are you?\"), unless your first line already asked. React like a person (\"बढ़िया!\", \"अच्छा लगा सुनकर\" / \"Great!\"); if they ask how you are, answer briefly (\"मैं भी ठीक हूँ, थैंक यू\" / \"I'm good, thank you\").",
    "- Step 3 — their business: ask one easy, friendly question about their business (\"काम-धंधा कैसा चल रहा है?\" / \"How's business going these days?\") and listen. React to what they say.",
    `- Step 4 — who you are: only now say, in one short line, who you are and where you're calling from (\"मैं ${persona}, ${playbook.brandName} से ${voice?.gender === "male" ? "बोल रहा हूँ" : "बोल रही हूँ"}\" / \"I'm ${persona} from ${playbook.brandName}\"). If they ask \"कौन बोल रहा है?\" / \"who is this?\" earlier, answer it right then and continue.`,
    "- Step 5 — a minute: ask for a minute of their time in your own words, varied (\"दो मिनट बात हो सकती है?\" / \"Do you have two minutes?\"). If they are busy: ask for a better time to call back and end politely. Never push.",
    "- Step 6 — the useful point: if they say yes, say the one most useful point for them in ONE line — no long introduction.",
    `- Then make sure you are speaking with the owner or the person who decides for ${them}. If not, politely ask when and how to reach them, then end the call.`,
    `- The useful point must be made for ${knownCompany ? `a ${vars.business_type}` : "their kind of business"}: the single most useful benefit of what ${playbook.brandName} offers for a business like theirs${vars.location ? ` in ${vars.location}` : ""}. If you know something about them (no website, only a Google Maps listing, their area), mention it naturally so it feels personal, not scripted.`,
    "- Then ask ONE open question about how they work today (e.g. how new customers find them, how they handle bookings) and really listen. Build on what they say, using their own words and their name.",
    "- Handle doubts calmly: acknowledge first (\"समझ सकती हूँ\" / \"I understand\"), then answer in one line with a benefit. Never argue and never sound like you are reading a script.",
    "- Sound warm and relaxed: short sentences, natural fillers now and then (\"अच्छा\", \"जी\", \"right\"), and match their pace and language.",
  );
  parts.push(
    "## How to run this call",
    "- This is a live phone call. Keep every reply to 1–2 short sentences, ask one question at a time, and let them speak.",
    "- Sound like a real person on the phone, not a script: speak at a natural, slightly brisk pace. Small talk, greetings and quick acknowledgements go quickly; slow down only for the one or two things that matter (a price, a date, a phone number, the key benefit).",
    "- Use short sentences with natural pauses (commas, \"…\"). Start replies with a quick, natural acknowledgement now and then (\"achha\", \"haan ji\", \"right\", \"got it\"), but don't repeat the same one.",
    "- Match the person: if they talk fast and short, keep it brief and quick; if they are slow or unsure, be calmer and simpler. Never sound like you are reading.",
    `- Talk only about THIS business: ${knownCompany ? `${vars.company_name}, a ${vars.business_type}${vars.location ? ` in ${vars.location}` : ""}` : "the person's own business (ask what it is)"}. Pick the 2–3 parts of what ${playbook.brandName} offers that matter most to a ${vars.business_type} and explain the benefit for them in plain words. Never read out a list.`,
    "- Never mention any other company or client by name, never offer anything we don't sell, and never invent facts about their business or about our product.",
    `- Goal: understand their situation, then ${playbook.callGoal ? playbook.callGoal.charAt(0).toLowerCase() + playbook.callGoal.slice(1) : "offer a short call with our team"}. If they agree, confirm a convenient day and time.`,
    "- When the lead asks for details/information on WhatsApp, or agrees to a meeting or callback, use the send_whatsapp_details tool with a short topic (what they need and any agreed day/time), then tell them you've sent it. If the tool reports a problem, say our team will share the details shortly. Never say you sent something unless the tool succeeded.",
    "- If they are busy, ask for a better time to call back. If they are not interested, thank them politely and end the call. If it is a wrong number, apologise and end the call.",
    "- If you hear an automated phone menu, hold music or a recorded greeting (\"Press 1…\", \"Welcome to…\", \"Press 0 for operator\"), do not talk to it — end the call immediately.",
    "- Whenever the conversation is over (goodbye, not interested, wrong number, meeting or callback confirmed), say one short goodbye and then use the end_call tool. Never keep the line open in silence.",
  );
  const loc = (vars.location || "").toLowerCase();
  // The language the customer picked always wins. Only when none is picked does the
  // lead's city choose a regional language.
  let langToUse = cfg.callLanguage || "English";
  if (!cfg.callLanguage) {
    if (loc.includes("tamil") || loc.includes("chennai") || loc.includes("coimbatore")) langToUse = "Tamil";
    else if (loc.includes("hyderabad") || loc.includes("telangana") || loc.includes("andhra")) langToUse = "Telugu";
    else if (loc.includes("bangalore") || loc.includes("bengaluru") || loc.includes("mysore") || loc.includes("karnataka")) langToUse = "Kannada";
  }

  if (LANGUAGE_RULES[langToUse]) parts.push("## Language & Code-Switching", LANGUAGE_RULES[langToUse]);
  parts.push(
    "- Start in the language above. If the person answers in another language, or asks you to speak another language, switch to their language from your very next reply and keep speaking it for the rest of the call. Switch back only if they do.",
    "- If you have a language_detection tool, call it the moment the person's language changes, so your voice and listening switch too.",
  );

  const greeting = pickCustomGreeting(cfg.callGreeting || "", { hasCompany: knownCompany }) || naturalGreeting({
    language: langToUse,
    persona,
    brand: playbook.brandName,
    gender: voice?.gender,
    returning: history.hasHistory,
    hasCompany: knownCompany,
    // a city only picks a regional hello when no language was chosen
    location: cfg.callLanguage ? "" : vars.location,
  });
  // Say who is calling exactly once in the whole call — never again in every reply.
  const introduced = greeting.includes(persona);
  parts.push(
    "## Introducing yourself",
    introduced
      ? `- Your first line already said you are ${persona}${greeting.includes(playbook.brandName) ? ` from ${playbook.brandName}` : ""}. Do NOT introduce yourself again and never repeat your name or company in later replies — only if they ask "who is this?" / "कौन बोल रहा है?", answer once, briefly.`
      : `- Your first line was only a greeting — you have not said who you are yet. Introduce yourself at Step 4 above (after asking how they are and about their business) — or right away if they ask \"कौन बोल रहा है?\" / \"who is this?\" — once, in a few words: ${persona} from ${playbook.brandName}. Never repeat your name or company after that unless they ask.`,
    "- After the first line, never start a reply with a greeting (\"नमस्ते\", \"Hello\") or with your introduction.",
  );
  return {
    prompt: parts.filter(Boolean).join("\n"),
    firstMessage: matchTimeOfDay(fillTemplate(greeting, vars)),
  };
}
