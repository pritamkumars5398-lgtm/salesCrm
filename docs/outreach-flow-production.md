# Outreach Flow — Current State, Production Readiness & Architecture Plan

_Last reviewed: 2026-07-04 (branch `dev`)_

> **Implementation status (2026-07-04):** Sections 3 and 4 are now largely implemented:
> campaign pipeline (`server/services/`), publish pre-flight + progress/results UI
> (`CampaignProgress`), honest failure semantics (`outreachStatus` on Lead), API auth
> middleware + `CRON_SECRET`, client API layer (`lib/api/`), and store slices
> (`store/slices/`). Still open: breaking up the giant page components (§4.4 step 4),
> JWT/session auth upgrade, and secret encryption at rest (§2 P2-11).
>
> **Revision (2026-07-04, later):** Publish semantics changed by product decision —
> **publishing arms the schedules but sends nothing by itself.** Outreach fires when
> a schedule runs (a `sync_apify` cron now does scrape → import → outreach in one
> action via `apify.service.runFullSync`), or when the user presses **Run** on the
> Leads page (`POST /api/campaigns` with `{agentId, limit}` — works in Draft,
> `ignoreAgentStatus`). Publish also re-enables schedules that unpublish disabled
> (the "schedules don't persist" bug; Crons.tsx also now checks `res.ok`). Outreach
> is sequence-aware: a sequence whose earliest steps share the same day+time sends
> ALL those channels (email + WhatsApp both). Leads UI: sync-date + outreach-status
> filters, live "Sending…" row highlight during a run, per-lead outreach badges
> (✓ Outreached / ✗ Failed with reason / Queued), and an already-outreached confirm
> guard. Sidebar shows "✓ Outreach completed" at 100%.

This doc explains how the publish → outreach flow works **today**, where it breaks
(especially failure handling and user experience), and what must change to run this
in production. The target UX: **when the agent is published, outreach goes out to all
eligible leads, and any per-lead failure is visible and retryable — never silent.**

---

## 1. How the flow works today

### 1.1 Publish / Unpublish (Topbar)

- `Topbar.tsx` → `PUT /api/agents/[id]` with `{ status: "active" | "inactive" }`.
- **Publishing only flips a flag.** It does NOT send anything and does not start any job.
- Unpublishing disables all of the agent's cron jobs (`CronJob.updateMany({agentId}, {enabled:false})`)
  and the UI mirrors that locally.

- Outreach and auto-replies check `agent.status === "inactive"` and refuse/skip.

### 1.2 Ways outreach is actually triggered

| Trigger | Path | Behavior |
|---|---|---|
| Per-lead "Start outreach" button | `Leads.tsx startOutreach()` → `POST /api/leads/[id]/outreach` | One lead, toast on result |
| Bulk selection | `Leads.tsx bulkStartOutreach()` | Fires ALL selected leads in parallel (`Promise.all`, no concurrency cap) |
| Cron `start_outreach` | `POST /api/crons/execute` → loops all leads with `status: "new"` sequentially, calling the outreach route over internal HTTP | One HTTP request does everything |

> ⚠️ **Nothing in the repo calls `/api/crons/execute`.** There is no `vercel.json` cron,
> no in-app scheduler, no instrumentation hook. In production, scheduled outreach
> simply never runs unless an external scheduler (Vercel Cron / GitHub Actions / cURL)
> hits this endpoint every minute.

### 1.3 What the outreach route does (`/api/leads/[id]/outreach`)

1. Loads lead → rejects if agent unpublished.
2. Channel choice: **email if the lead has an email; WhatsApp only as fallback** when
   there is no email but there is a phone/`whatsappLid`. (It never does both.)

3. Generates the message with Groq (settings key `llmApiKey` or `GROQ_API_KEY`).
   AI failure → HTTP 502, nothing sent, lead untouched.

4. Sends via SMTP / Resend / SendGrid (email) or Twilio / Meta Cloud API / WireWeb (WhatsApp).
5. **Always** sets the lead to `status: "in_outreach"`, `pipelineStage: "contacted"` —
   even when the send failed.

6. Logs an Activity (`AI Email Sent` / `AI Email Failed/Skipped`) and appends to the
   Conversation thread (also on failure).

7. Returns **HTTP 200 `ok: true` even on send failure**, with `emailSent/emailError`
   or `whatsappSent/whatsappError` fields the client must inspect.

### 1.4 Reply loop

- Inbound email (`conversations/sync`, IMAP) and WhatsApp webhook call
  `handleAgentReply()` in `lib/agent-reply.ts`, which drafts and sends an AI reply
  (skipped when agent is unpublished). Config problems are only `console.warn`ed —
  the reply is silently dropped.

---

## 2. Problems that block production

### P0 — Correctness / data loss

1. **Failed sends are permanently lost.** The route flips the lead to `in_outreach`
   even when the email/WhatsApp send failed. The cron only picks `status: "new"`
   leads, so a failed lead is never retried and looks "contacted" in the UI.

2. **200 OK on failure.** `ok: true` with an `emailError` field forces every caller to
   re-implement failure parsing; `bulkStartOutreach` counts only `emailError` and
   misses `whatsappError`, so bulk WhatsApp failures show a success toast.

3. **No API authentication.** `middleware.ts` only guards page routes
   (`/dashboard|/leads|...`). Every `/api/*` route — outreach, settings (contains SMTP
   passwords / API keys), crons/execute, lead deletion — is callable by anyone.

4. **No idempotency / duplicate protection.** Double-clicking "Start outreach", or two
   overlapping `crons/execute` runs, sends duplicate emails to the same lead. Nothing
   records "last contacted at" or locks a lead during send.

### P1 — Scale / reliability

5. **Cron execution is one long HTTP request.** For N new leads it does N Groq calls +
   N SMTP sends sequentially in a single request — this will hit serverless/proxy
   timeouts at even ~20 leads. No batching, no queue, no resume.

6. **Unbounded parallelism in bulk send** → SMTP and Groq rate-limit bans.
7. **No retry/backoff** anywhere; single transient SMTP error = lost outreach.
8. **Base URL from `Host` header** in outreach (response buttons) and crons/execute —
   spoofable and wrong behind proxies; should come from an `APP_URL` env.

### P2 — UX / operability

9. **Failure feedback is toast-only.** Bulk send reports "Completed with 3 errors" with
   no way to see *which* leads failed or *why*, and no retry button. Activities record
   it, but the user must dig.

10. **Publish gives no feedback about readiness.** You can publish with no SMTP/LLM
    configured; everything fails later, one toast at a time.

11. Secrets (SMTP pass, API keys) stored in plaintext in the `settings` collection;
    raw AI responses `console.log`ged.

12. Silent drops in `handleAgentReply` (missing key = customer message ignored).

---

## 3. Target production design

### 3.1 Desired UX (agreed direction)

On **Publish**:

1. **Pre-flight check** — validate config (LLM key, email/WhatsApp channel, at least
   one eligible lead). Show a checklist modal; block or warn before going live.

2. Flip status to `active`, then **enqueue an outreach campaign** for all eligible
   leads (`status: "new"`, has email or phone).

3. Show a **progress UI**: "Sending 14/50… 3 failed" (poll a campaign-status endpoint
   or use SSE — `lib/events.ts` already has an emitter).

4. On completion, show a **results panel**: per-lead ✓ sent / ✗ failed with reason,
   with a "Retry failed" button.

### 3.2 Data model changes

- `Lead`: add `outreachStatus: "pending" | "sending" | "sent" | "failed"`,
  `lastOutreachError`, `lastContactedAt`, `outreachAttempts`.
  Only set `in_outreach` when a send actually succeeded; failed sends go to `failed`
  (retryable), never fake-contacted.

- New `Campaign` (or `OutreachRun`) collection: `{ agentId, total, sent, failed,
  status, startedAt, finishedAt, errors: [{leadId, reason}] }` — this is what the
  progress UI polls.

### 3.3 API changes

- Outreach route: return **non-2xx when the send fails** (keep the generated content
  in the body); one canonical shape `{ sent, channel, error? }`.

- New `POST /api/agents/[id]/publish`: pre-flight + create campaign + kick off worker.
- New `GET /api/campaigns/[id]`: progress/results.
- Worker processes leads in **batches with a concurrency cap (3–5) and per-batch
  time budget**; `crons/execute` claims only a slice per invocation
  (`findOneAndUpdate` a `sending` lock, process ≤10 leads, exit) so it fits
  serverless limits and overlapping runs can't double-send.

- Retry with backoff (max 3 attempts) for transient send errors; mark `failed` after.
- Auth: protect all `/api/*` via middleware (session cookie/JWT) + a shared secret
  header (`CRON_SECRET`) for `/api/crons/execute` and webhooks.

- Replace Host-header base URLs with `process.env.APP_URL`.

### 3.4 Ordered rollout

1. **Fix failure semantics** (P0 #1, #2): status only on success, `failed` status,
   correct bulk error counting. Small diff, biggest correctness win.

2. **Auth on API routes + CRON_SECRET** (P0 #3).
3. **Idempotency**: `lastContactedAt` guard + send-lock (P0 #4).
4. **Campaign model + publish pre-flight + progress/results UI** (the UX goal).
5. **Batched cron worker + concurrency cap + retries** (P1).
6. Hardening: APP_URL, secret encryption at rest, remove debug logs, alerting on
   `handleAgentReply` drops.

---

## 4. Code architecture & folder structure (maintainability)

### 4.1 Problems today (measured)

- **64 raw `fetch("/api/…")` calls inside components/store.** Every component
  hand-rolls its own request, JSON parsing, and error handling — this is why failure
  handling is inconsistent (e.g. bulk send checking only `emailError`).

- **Monolithic page components**: `Settings.tsx` ~1000 lines, `LeadDetailPanel.tsx`
  ~890, `Superadmin.tsx` ~820, `AddLeadModal.tsx` ~730, `Leads.tsx` ~610 — UI, data
  fetching, and business logic mixed in one file.

- **Single flat Zustand store** (`useAppStore.ts`): auth + agents + leads +
  conversations + drawer + dashboard + activities + meetings + crons + toasts + UI
  flags in one `AppState`. Any change touches the same file; components subscribe to
  the whole store shape.

- **Server logic duplicated per route**: the outreach route (~510 lines) re-implements
  `getEmailConfig`/`sendEmail` that already exist in `lib/email-service.ts`, plus
  inline Groq prompt/response code that `agent-reply.ts` duplicates again. WhatsApp
  send logic exists in at least 3 places (outreach route, whatsapp route, webhook).

- Inline `style={{}}` + Tailwind mixed; magic strings for statuses repeated.

### 4.2 Target structure

```
src/
  app/                    # Next.js routes ONLY — thin: parse → call service → respond
    api/.../route.ts
  server/                 # ALL server-side business logic (never imported by client)
    services/
      outreach.service.ts   # channel choice, orchestration, status transitions
      campaign.service.ts   # batch runs, progress, retries
      email.service.ts      # SMTP/Resend/SendGrid (single implementation)
      whatsapp.service.ts   # Twilio/Meta/WireWeb (single implementation)
      ai.service.ts         # Groq client + prompt builders (email, WA, reply)
      settings.service.ts   # typed settings loader (getEmailConfig, getLLMConfig…)
    repos/                  # Mongoose access if it grows beyond models
  lib/
    api/                    # CLIENT api layer — the ONLY place fetch() is allowed
      client.ts             # apiFetch wrapper: base URL, JSON, typed ApiError
      leads.api.ts          # startOutreach(id), bulkOutreach(ids), …
      agents.api.ts         # publishAgent(id), …
      campaigns.api.ts
    models/                 # (unchanged) Mongoose schemas
    constants/  utils/      # (unchanged)
  store/
    index.ts                # combines slices → useAppStore (API unchanged for callers)
    slices/
      auth.slice.ts
      agents.slice.ts
      leads.slice.ts        # + outreach/campaign progress state
      conversations.slice.ts
      crons.slice.ts
      ui.slice.ts           # toasts, drawer, sidebar, loading map
  components/
    pages/<Page>/           # folder per page: index.tsx + subcomponents + hooks
      Leads/
        index.tsx           # layout only
        LeadsTable.tsx  LeadsFilters.tsx  BulkActionsBar.tsx
        useLeads.ts         # data fetching + actions hook (calls lib/api, writes store)
    ui/                     # reusable presentational components
```

### 4.3 Rules to enforce

1. **Components never call `fetch` directly** — they call `lib/api/*` functions via a
   `useX` hook; the hook updates the store. One place to fix error handling, auth
   headers, and response shapes.

2. **API routes never contain business logic** — parse/validate input, call a
   `server/services/*` function, map result to HTTP. Cron execute and the leads
   outreach route then share the *same* `outreach.service.sendToLead()` — no more
   internal HTTP self-calls (removes the Host-header problem too).

3. **One sender per channel**: `email.service.ts` and `whatsapp.service.ts` are the
   only files that talk to nodemailer/Twilio/Meta/WireWeb.

4. **Zustand slices** with the [slices pattern](https://zustand.docs.pmnd.rs/guides/slices-pattern);
   keep the combined `useAppStore` export so existing components keep working, then
   migrate components to **selector subscriptions** (`useAppStore(s => s.leads)`) to
   avoid whole-store re-renders. Async actions live in the slice (e.g.
   `leads.slice.startOutreach(id)` → calls `leads.api` → sets per-lead
   `outreachStatus` optimistically → reconciles on response).

5. **Server/client boundary**: nothing in `server/` is imported from a `"use client"`
   file (enforceable with an ESLint `no-restricted-imports` rule).

6. Shared status/type unions live in one place (`lib/constants` + `store/types.ts`),
   no string literals sprinkled in components.

### 4.4 Migration order (safe, incremental)

1. Create `lib/api/client.ts` + per-domain api modules; sweep components replacing the
   64 fetch calls (behavior-neutral).

2. Split the store into slices behind the same `useAppStore` export; move outreach/
   campaign progress state into `leads.slice`.

3. Extract `server/services/` from the outreach route + agent-reply + whatsapp routes
   (dedupe the 3 senders); make routes thin. Cron execute calls the service directly.

4. Break up the giant pages (Settings, Leads, LeadDetailPanel, AddLeadModal) into
   folders with hooks — do this per page, opportunistically when touching each page
   for the campaign UI work.

---

## 5. Env vars required in production

| Var | Purpose |
|---|---|
| `MONGODB_URI` | database |
| `GROQ_API_KEY`, `GROQ_MODEL` | AI generation fallback (can also live in Settings) |
| `SMTP_HOST/PORT/USER/PASS/FROM/FROM_NAME` | email fallback config |
| `APP_URL` | canonical base URL for links/buttons (replaces Host header) |
| `CRON_SECRET` | shared secret for `/api/crons/execute` (to add) |

Plus an external scheduler hitting `POST /api/crons/execute` every minute
(Vercel Cron `vercel.json`, or GitHub Actions / cron + cURL when self-hosted).
