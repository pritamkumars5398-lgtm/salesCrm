# Agent Architecture — SalesAgent

How agents work, what they own, and how to extend them.

---

## What is an Agent?

An **Agent** is the core unit of SalesAgent. Each agent represents an independent sales campaign with its own:

- Lead pool
- Outreach settings (channels, messaging, sequences)
- Scraper configuration (Google Maps, LinkedIn, JustDial)
- AI model + API keys (BYOK)
- Usage tracking (leads scraped, messages sent, calls made)
- Plan tier (free / starter / growth / pro)

One user can have multiple agents — e.g. one for B2B SaaS, one for local services.

---

## Data Model

```
Agent
 ├── _id          ObjectId
 ├── name         string
 ├── status       "active" | "inactive"
 └── leadCount    number (denormalized count)

Setting           (key-value store per agent)
 ├── agentId      ObjectId → Agent
 ├── key          string   (e.g. "smtpFrom", "apifyToken")
 └── value        string

Lead
 ├── agentId      ObjectId → Agent
 ├── fullName     string
 ├── email        string
 ├── phone        string
 ├── company      string
 ├── source       "Google Maps" | "LinkedIn" | "Manual" | ...
 ├── status       "new" | "in_outreach" | "replied" | "meeting_booked" | "closed"
 ├── channels     Channel[]
 └── createdAt    Date (auto via timestamps)

Usage
 ├── agentId      ObjectId → Agent
 ├── month        "YYYY-MM"  (unique per agent per month)
 ├── leadsScraped number
 ├── messagesSent number
 ├── callsMade    number
 └── emailsSent   number
```

---

## Settings Keys Reference

| Key | Description |
|-----|-------------|
| `businessType` | B2B SaaS, E-commerce, Real Estate, etc. |
| `industry` | Free text — tailors AI tone |
| `leadLocation` | City/country for lead targeting |
| `apifyToken` | User's own Apify API token (BYOK) |
| `google-mapsEnabled` | `"true"` / `"false"` |
| `gmKeyword` | Search term for Google Maps scraper |
| `gmLocation` | City for Google Maps |
| `gmActorId` | Apify actor ID (`nwua9Gu5YrADL7ZDj`) |
| `linkedinEnabled` | `"true"` / `"false"` |
| `linkedinQuery` | Search query for LinkedIn scraper |
| `linkedinActorId` | Apify actor ID (`M2FMdjRVeF1HPGFcc`) |
| `emailEnabled` | `"true"` / `"false"` |
| `emailProvider` | SMTP / Resend / SendGrid / Mailgun |
| `smtpHost` | e.g. `smtp.gmail.com` |
| `smtpPort` | `587` (TLS) or `465` (SSL) |
| `smtpUser` | SMTP username |
| `smtpPass` | App password |
| `smtpFrom` | Sender email address |
| `smtpFromName` | Sender display name |
| `whatsappEnabled` | `"true"` / `"false"` |
| `waProvider` | Twilio / 360dialog / Meta |
| `waApiKey` | WhatsApp API key |
| `smsEnabled` | `"true"` / `"false"` |
| `smsProvider` | Twilio SMS / MSG91 / Plivo |
| `smsFrom` | Registered sender number |
| `voiceEnabled` | `"true"` / `"false"` |
| `callProvider` | Vapi.ai / Twilio Voice / Bland.ai |
| `voiceProvider` | ElevenLabs / Deepgram / PlayHT |
| `llmProvider` | Claude / GPT-4o / Gemini |
| `llmApiKey` | AI model API key (BYOK) |
| `plan` | `free` / `starter` / `growth` / `pro` |

---

## Plan Limits

Defined in `src/lib/plans.ts`. Checked in `src/app/api/apify/route.ts` before importing leads.

| Plan | Leads/mo | Messages/mo | Calls/mo | Emails/mo | Agents |
|------|----------|-------------|----------|-----------|--------|
| Free | 25 | 50 | 5 | 100 | 1 |
| Starter | 200 | 500 | 30 | ∞ | 1 |
| Growth | 1,000 | 2,000 | 100 | ∞ | 3 |
| Pro | 5,000 | ∞ | 500 | ∞ | 10 |

`-1` in code means unlimited.

---

## Outreach Flow

```
1. Sync Apify
   POST /api/apify        → starts scraper runs in parallel
   GET  /api/apify        → polls run status
   PATCH /api/apify       → imports dataset into Lead collection
                           checks plan limit → caps import → increments Usage

2. Start Outreach (per lead)
   POST /api/leads/[id]/outreach
   → reads agent settings (LLM key, email config)
   → generates AI message via LLM
   → sends via configured channel (SMTP / Twilio / etc.)
   → updates lead.status = "in_outreach"
   → logs to Activity

3. Replies / Follow-ups
   Inbound webhooks (Twilio, email) → /api/webhook/*
   → match lead by phone/email
   → update lead.status = "replied"
   → log conversation message
```

---

## Adding a New Scraper

1. Add actor config in `src/app/api/apify/route.ts` inside `getAllConfigs(agentId)`
2. Add enable/disable setting key in `Settings.tsx` under the Sources section
3. Add field mapping in the `PATCH` handler's scraper type switch
4. Add source badge color in `src/components/pages/Leads.tsx` → `SOURCE_META`
5. Add filter option in the Leads source dropdown

---

## Adding a New Outreach Channel

1. Add toggle + fields in `Settings.tsx` → `CARDS` array
2. Add send logic in `src/app/api/leads/[id]/outreach/route.ts`
3. Add channel icon in `Leads.tsx` → `CHANNEL_ICONS`
4. Add outreach row in `Sidebar.tsx` → `OUTREACH_CHANNELS`
5. Add usage tracking: increment `messagesSent` / `callsMade` via `POST /api/usage`

---

## File Map

```
src/
├── app/
│   ├── page.tsx                        Root — auth check, redirect
│   ├── [page]/[agentId]/page.tsx       Main app shell (all pages)
│   └── api/
│       ├── agents/                     CRUD for agents
│       ├── apify/                      Scraper start / poll / import
│       ├── leads/                      Lead CRUD + outreach
│       ├── settings/                   Key-value settings store
│       ├── usage/                      Plan limits + usage tracking
│       ├── conversations/              Message history
│       ├── activities/                 Event log
│       ├── meetings/                   Calendar entries
│       ├── crons/                      Scheduled jobs
│       └── seed/                       Demo data seeder
├── components/
│   ├── layout/                         Sidebar, Topbar
│   ├── pages/                          One file per page
│   ├── drawer/                         Conversation drawer
│   └── ui/                             Reusable UI primitives
├── store/
│   ├── useAppStore.ts                  Zustand store
│   └── types.ts                        All shared TypeScript types
└── lib/
    ├── db.ts                           MongoDB connection
    ├── plans.ts                        Plan definitions + limits
    └── models/                         Mongoose schemas
```
