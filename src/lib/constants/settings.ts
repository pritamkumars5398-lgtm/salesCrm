import {
  IconBrain, IconBrandWhatsapp, IconPhone, IconMail, IconMessage, IconBuilding, IconCalendar,
} from "@tabler/icons-react";

export interface SettingsField {
  label: string;
  key: string;
  type?: string;
  placeholder?: string;
  hint?: string;
  options?: string[];
}

export interface SettingsCard {
  key: string;
  title: string;
  description: string;
  Icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  togglable?: boolean;
  fields: SettingsField[];
}

export const GENERAL_CARDS: SettingsCard[] = [
  {
    key: "profile",
    title: "Business Profile",
    description: "Your business type & lead targeting",
    Icon: IconBuilding,
    iconBg: "rgba(16,185,129,0.1)",
    iconColor: "#10b981",
    fields: [
      { label: "Business Type", key: "businessType", placeholder: "", options: ["B2B SaaS", "E-commerce", "Real Estate", "Consulting / Agency", "Finance", "Healthcare", "Recruitment", "Other"] },
      { label: "Industry", key: "industry", placeholder: "e.g. Technology, Retail, Education...", hint: "Helps AI tailor messaging tone" },
      { label: "Target Location of Leads", key: "leadLocation", placeholder: "e.g. India, USA, Global, Mumbai...", hint: "City, country or region" },
      { label: "Target Company Size", key: "targetCompanySize", placeholder: "", options: ["Any", "1–10 (Micro)", "11–50 (Small)", "51–200 (Mid-market)", "201–1000 (Growth)", "1000+ (Enterprise)"] },
      { label: "Business Website", key: "businessWebsite", placeholder: "https://yourwebsite.com", hint: "Used by AI in responses" },
      { label: "Business Phone", key: "businessPhone", placeholder: "+91 xxxxx xxxxx", hint: "Used by AI in responses" },
      { label: "Services Offered", key: "businessServices", type: "textarea", placeholder: "Explain your products, services or business offerings in detail...", hint: "Used as context for generating replies" },
      { label: "Resource Doc Link", key: "docLink", placeholder: "https://yourwebsite.com/brochure.pdf", hint: "Shared with interested leads" },
      { label: "Custom AI Instructions", key: "customPrompt", type: "textarea", placeholder: "e.g. Talk with pirate slang! Be extremely concise. Highlight our Bogo offer.", hint: "Additional rules the AI will follow when drafting replies" },
      { label: "Follow-up Limit (Days/Messages)", key: "followUpDays", options: ["3", "Disabled", "1", "2", "4", "5", "6", "7"], hint: "Automatically follow up daily if lead doesn't reply" },
    ],
  },
];

export const INTEGRATION_CARDS: SettingsCard[] = [
  {
    key: "llm",
    title: "AI Brain",
    description: "Language model & API credentials",
    Icon: IconBrain,
    iconBg: "rgba(99,102,241,0.1)",
    iconColor: "#6366f1",
    fields: [
      { label: "Provider", key: "llmProvider", placeholder: "", options: ["Groq (Llama 3)", "Claude (Anthropic)", "GPT-4o (OpenAI)", "Gemini 1.5 Pro"], hint: "Model used for all AI responses" },
      { label: "API Key", key: "llmApiKey", type: "password", placeholder: "gsk_...", hint: "Stored encrypted, never exposed" },
    ],
  },
  {
    key: "whatsapp",
    title: "WhatsApp",
    description: "Send & receive WhatsApp messages",
    Icon: IconBrandWhatsapp,
    iconBg: "rgba(34,201,122,0.1)",
    iconColor: "#22c97a",
    togglable: true,
    fields: [
      { label: "Provider", key: "waProvider", placeholder: "", options: ["WireWeb"] },
      { label: "API Key", key: "waApiKey", type: "password", placeholder: "wire_..." },
      { label: "Session ID", key: "waSessionId", placeholder: "ws_..." },
      { label: "Webhook URL", key: "waWebhookUrl", type: "webhook-url", hint: "Copy this and paste in your WireWeb dashboard" },
    ],
  },
  {
    key: "voice",
    title: "Voice Calls",
    description: "Outbound & inbound AI voice calls",
    Icon: IconPhone,
    iconBg: "rgba(245,166,35,0.1)",
    iconColor: "#f5a623",
    togglable: true,
    fields: [
      { label: "Call Provider", key: "callProvider", placeholder: "", options: ["Vapi.ai", "Twilio Voice", "Bland.ai"], hint: "Handles call routing" },
      { label: "Call API Key", key: "callApiKey", type: "password", placeholder: "Enter API key" },
      { label: "Voice Provider", key: "voiceProvider", placeholder: "", options: ["ElevenLabs", "Deepgram", "PlayHT"], hint: "Text-to-speech engine" },
      { label: "Voice API Key", key: "voiceApiKey", type: "password", placeholder: "Enter API key" },
    ],
  },
  {
    key: "email",
    title: "Email",
    description: "Outreach emails via SMTP or API providers",
    Icon: IconMail,
    iconBg: "rgba(77,171,247,0.1)",
    iconColor: "#4dabf7",
    togglable: true,
    fields: [
      { label: "Provider", key: "emailProvider", placeholder: "", options: ["SMTP", "Resend", "SendGrid", "Mailgun"], hint: "Choose how emails are sent" },
      { label: "API Key", key: "emailApiKey", type: "password", placeholder: "API key (Resend / SendGrid / Mailgun)", hint: "Not needed for SMTP" },
      { label: "SMTP Host", key: "smtpHost", placeholder: "smtp.gmail.com", hint: "SMTP only — e.g. smtp.gmail.com, smtp.zoho.com" },
      { label: "SMTP Port", key: "smtpPort", placeholder: "587", hint: "SMTP only — 587 (TLS) · 465 (SSL)" },
      { label: "SMTP Username", key: "smtpUser", placeholder: "you@gmail.com", hint: "SMTP only — usually your email address" },
      { label: "SMTP Password", key: "smtpPass", type: "password", placeholder: "App password", hint: "Gmail: use App Password (not login password)" },
      { label: "From Name", key: "smtpFromName", placeholder: "Carpenter Agent", hint: "Display name shown to recipients" },
      { label: "From Address", key: "smtpFrom", placeholder: "you@gmail.com", hint: "Sender email address" },
      { label: "IMAP Host", key: "imapHost", placeholder: "imap.gmail.com", hint: "IMAP only — e.g. imap.gmail.com, imap.zoho.com" },
      { label: "IMAP Port", key: "imapPort", placeholder: "993", hint: "IMAP only — default 993 (SSL)" },
      { label: "IMAP Username", key: "imapUser", placeholder: "you@gmail.com", hint: "IMAP only — usually your email address" },
      { label: "IMAP Password", key: "imapPass", type: "password", placeholder: "App password", hint: "Gmail: use App Password (same as SMTP Password)" },
    ],
  },
  {
    key: "sms",
    title: "SMS",
    description: "Text message outreach & alerts",
    Icon: IconMessage,
    iconBg: "rgba(204,153,255,0.1)",
    iconColor: "#cc99ff",
    togglable: true,
    fields: [
      { label: "Provider", key: "smsProvider", placeholder: "", options: ["Twilio SMS", "MSG91", "Plivo"] },
      { label: "API Key", key: "smsApiKey", type: "password", placeholder: "Enter API key" },
      { label: "From Number", key: "smsFrom", placeholder: "+91xxxxxxxxxx", hint: "Must be registered with provider" },
    ],
  },
  {
    key: "calendly",
    title: "Calendly",
    description: "Booking links & auto webhook sync",
    Icon: IconCalendar,
    iconBg: "rgba(0,111,243,0.1)",
    iconColor: "#006ff3",
    fields: [
      { label: "Calendly Event Link", key: "calendlyLink", placeholder: "https://calendly.com/your-name/30min", hint: "Paste your public booking page URL" },
      { label: "Personal Access Token", key: "calendlyApiToken", type: "password", placeholder: "eyJhbGci...", hint: "From calendly.com/integrations/api_webhooks" },
      { label: "Webhook Signing Secret", key: "calendlyWebhookSecret", type: "password", placeholder: "Signing secret from webhook creation", hint: "Used to verify incoming webhook payloads" },
    ],
  },
];
