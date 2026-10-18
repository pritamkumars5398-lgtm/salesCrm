import { Agent } from "@/lib/models/Agent";
import { resolveGroqModel, groqModelParams } from "@/lib/llm";
import { getLLMConfig } from "../settings.service";
import { ASSISTANT_TOOLS, TOOLS_BY_NAME, type ToolContext } from "./tools";

/**
 * The AI assistant panel's brain: an LLM with the CRM's tools. The client keeps
 * the conversation (OpenAI message format) and sends it back each turn; tools
 * that need consent stop the loop and come back as a `pending` action until the
 * user confirms or declines it.
 */

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  /** the model's reasoning for this step — shown in the panel, never sent back to the model */
  reasoning?: string;
}

/** Live progress for the panel while a turn runs. */
export type AssistantEvent =
  | { type: "status"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool_start"; id: string; name: string }
  | { type: "tool_end"; id: string; name: string; ok: boolean; note?: string };

type Emit = (event: AssistantEvent) => void;

export interface PendingAction {
  toolCallId: string;
  name: string;
  summary: string;
}

export interface AssistantResult {
  messages: ChatMessage[];
  pending?: PendingAction;
  /** app areas whose data changed this turn (UI refreshes them) */
  changes: string[];
}

const MAX_ROUNDS = 6;
const MAX_HISTORY = 30;
const LLM_TIMEOUT_MS = 45000;
/** Older tool results are cut to this size before being sent back to the model (token budget). */
const OLD_TOOL_RESULT_CHARS = 600;
/** Groq gives each model its own rate limit — fall back to the smaller one when the big one is throttled. */
const GROQ_FALLBACK_MODEL = "openai/gpt-oss-20b";
const MAX_RATE_LIMIT_WAIT_MS = 15000;

const TOOL_SPECS = ASSISTANT_TOOLS.map((t) => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

function systemPrompt(agentName: string, page: string) {
  return `You are the built-in AI assistant of a sales CRM (like ClickUp Brain). You set things up and answer questions for the user's workspace "${agentName}" by calling tools — never guess at configuration; read it with tools.

What the CRM does: finds leads (Google Maps/LinkedIn scrapers), contacts them by email, WhatsApp, SMS or AI phone calls (Plivo telephony + ElevenLabs voice agent, often in Hindi), follows up with AI replies, books meetings via Calendly. The "sequence" decides the channel of the first outreach step. Schedules run outreach automatically while the agent is published.

Rules:
- You can manage leads directly: add_lead (e.g. "add 9876543210 as Ramesh Gupta"), update_lead, add_lead_note, delete_lead. Never tell the user something can't be done without checking your tools.
- Use tools to read and change things. Start with get_setup_status when the user asks what's set up, what's missing or why something fails.
- For settings, call get_settings to learn exact keys/options before update_settings if unsure.
- When a needed value is missing (an API key, phone number, link), ask the user for it in one short question.
- Actions that contact leads, cost money or change automation (calls, campaigns, publishing, schedules) — call the tool directly; the app shows the user a Confirm button. Don't ask "shall I?" in text first.
- Before acting on one specific lead, make sure it's the right one: use find_leads without guessing filters. If exactly one lead's name matches (ignoring case), use it; if several match, list the top few (name, city, phone) and ask which one.
- If a tool returns an error, explain it plainly and say exactly how to fix it.
- If the user declines an action, just say it was cancelled — don't imply you tried and failed.
- Never repeat API keys or secrets back; they're masked.
- Be brief: short sentences or bullets, confirm what changed.
- Always reply in the same language as the user's latest message (English → English; Hindi/Hinglish → Hindi/Hinglish), regardless of the call language setting.

The user is currently on the "${page}" page. Today is ${new Date().toDateString()}.`;
}

/** Keep the recent history without orphaning tool results from their tool call. */
function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  let recent = messages.slice(-MAX_HISTORY);
  while (recent.length && recent[0].role === "tool") recent = recent.slice(1);
  return recent;
}

/**
 * Every tool call needs a result right after its assistant message. If the user
 * moved on (typed a new message instead of answering a Confirm card), close the
 * dangling calls as skipped so the model sees a valid conversation.
 */
function closeDanglingToolCalls(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    out.push(m);
    if (m.role !== "assistant" || !m.tool_calls?.length) continue;
    let j = i + 1;
    const answered = new Set<string>();
    while (j < messages.length && messages[j].role === "tool") answered.add(messages[j++].tool_call_id!);
    const isLatest = j >= messages.length; // nothing after its results — may still be pending
    for (; i + 1 < j; i++) out.push(messages[i + 1]);
    if (isLatest) continue;
    for (const call of m.tool_calls) {
      if (!answered.has(call.id)) {
        out.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ skipped: true, note: "The user moved on without confirming." }) });
      }
    }
  }
  return out;
}

function sanitize(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && ["user", "assistant", "tool"].includes(m.role))
    .map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content.slice(0, 20000) : null,
      ...(m.role === "assistant" && typeof m.reasoning === "string" && m.reasoning ? { reasoning: m.reasoning.slice(0, 2000) } : {}),
      ...(Array.isArray(m.tool_calls) && m.tool_calls.length ? {
        tool_calls: m.tool_calls.map((c: ToolCall) => ({
          id: String(c.id), type: "function" as const,
          function: { name: String(c.function?.name), arguments: String(c.function?.arguments ?? "{}") },
        })),
      } : {}),
      ...(m.role === "tool" ? { tool_call_id: String(m.tool_call_id) } : {}),
    }));
}

/** What the model sees: full recent turns, but older tool results trimmed to save tokens. */
function forModel(messages: ChatMessage[]): ChatMessage[] {
  const lastUser = messages.map((m) => m.role).lastIndexOf("user");
  return messages.map(({ reasoning: _reasoning, ...m }, i) =>
    m.role === "tool" && i < lastUser && (m.content?.length ?? 0) > OLD_TOOL_RESULT_CHARS
      ? { ...m, content: `${m.content!.slice(0, OLD_TOOL_RESULT_CHARS)}… [trimmed]` }
      : m
  );
}

async function callLLM(agentId: string, messages: ChatMessage[], system: string): Promise<ChatMessage> {
  const llm = await getLLMConfig(agentId);
  if (!llm) throw new Error("No AI key configured — add one in Settings → AI Brain.");
  const isOpenAi = (llm.provider.includes("OpenAI") || llm.provider.includes("GPT")) && !llm.apiKey.startsWith("gsk_");
  const primary = isOpenAi ? (llm.model || "gpt-4o-mini") : resolveGroqModel(llm.model);
  const models = isOpenAi || primary === GROQ_FALLBACK_MODEL ? [primary] : [primary, GROQ_FALLBACK_MODEL];

  const request = (model: string) => fetch(isOpenAi ? "https://api.openai.com/v1/chat/completions" : "https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${llm.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      ...(isOpenAi ? {} : groqModelParams(model)),
      messages: [{ role: "system", content: system }, ...forModel(messages)],
      tools: TOOL_SPECS,
      tool_choice: "auto",
      temperature: 0.3,
      max_tokens: 1500,
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  let res!: Response;
  let data: any = {};
  const attempt = async (model: string) => {
    res = await request(model);
    data = await res.json().catch(() => ({}));
  };

  // Rate limited (429): try the fallback model, then wait as long as the provider asks (bounded) and retry once.
  for (const model of models) {
    await attempt(model);
    if (res.status !== 429) break;
  }
  if (res.status === 429) {
    const waitMs = Number(/try again in ([\d.]+)s/i.exec(data.error?.message || "")?.[1]) * 1000;
    if (waitMs > 0 && waitMs <= MAX_RATE_LIMIT_WAIT_MS) {
      await new Promise((r) => setTimeout(r, waitMs + 250));
      await attempt(models[models.length - 1]);
    }
  }
  if (!res.ok) {
    if (res.status === 429) throw new Error("The AI provider's rate limit was hit (Groq free tier allows ~8,000 tokens/minute). Wait a few seconds and try again, or upgrade the Groq plan.");
    throw new Error(`AI error: ${data.error?.message || `HTTP ${res.status}`}`);
  }
  const msg = data.choices?.[0]?.message ?? {};
  const reasoning = typeof msg.reasoning === "string" ? msg.reasoning.trim().slice(0, 2000) : "";
  return {
    role: "assistant",
    content: msg.content ?? null,
    ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}),
    ...(reasoning ? { reasoning } : {}),
  };
}

function parseArgs(call: ToolCall): Record<string, unknown> {
  try { return JSON.parse(call.function.arguments || "{}"); } catch { return {}; }
}

/**
 * Run tool calls of the last assistant message that have no result yet. Stops
 * at the first one that needs confirmation (unless this request confirms it).
 */
async function runPendingToolCalls(
  messages: ChatMessage[],
  ctx: ToolContext,
  confirm: { toolCallId: string; approved: boolean } | undefined,
  changes: Set<string>,
  emit: Emit,
): Promise<PendingAction | undefined> {
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (!lastAssistant?.tool_calls?.length) return undefined;
  const answered = new Set(messages.filter((m) => m.role === "tool").map((m) => m.tool_call_id));

  for (const call of lastAssistant.tool_calls) {
    if (answered.has(call.id)) continue;
    const tool = TOOLS_BY_NAME.get(call.function.name);
    const args = parseArgs(call);
    let result: unknown;

    if (!tool) {
      result = { error: `Unknown tool ${call.function.name}` };
    } else if (tool.adminOnly && !ctx.canManage) {
      result = { error: "Only workspace admins can change this. Ask an admin of this organization." };
    } else if (tool.confirm && confirm?.toolCallId !== call.id) {
      const summary = tool.summarize ? await tool.summarize(args, ctx) : `Run ${tool.name}`;
      return { toolCallId: call.id, name: tool.name, summary };
    } else if (tool.confirm && confirm && !confirm.approved) {
      result = { declined: true, note: "The user declined this action. Don't retry unless they ask." };
    } else {
      emit({ type: "tool_start", id: call.id, name: tool.name });
      try {
        result = await tool.run(args, ctx);
        tool.changes?.forEach((c) => changes.add(c));
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) };
      }
      const error = result && typeof result === "object" && "error" in result ? String((result as { error: unknown }).error) : undefined;
      emit({ type: "tool_end", id: call.id, name: tool.name, ok: !error, note: error });
    }
    messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result ?? null).slice(0, 8000) });
  }
  return undefined;
}

/** Mask pasted secrets (API keys, tokens) everywhere in the returned history. */
function redact(messages: ChatMessage[]): ChatMessage[] {
  const secrets = new Set<string>();
  for (const m of messages) {
    for (const call of m.tool_calls ?? []) {
      if (call.function.name !== "update_settings") continue;
      const settings = (parseArgs(call).settings ?? {}) as Record<string, unknown>;
      for (const [k, v] of Object.entries(settings)) {
        if (/key|token|secret|pass/i.test(k) && typeof v === "string" && v.length >= 8) secrets.add(v);
      }
    }
  }
  const short = (v: string) => `${v.slice(0, 4)}…${v.slice(-4)}`;
  const scrub = (text: string) => {
    let out = text.replace(/\b(sk_|gsk_|sk-)[A-Za-z0-9_-]{16,}/g, short);
    for (const s of secrets) out = out.split(s).join(short(s));
    return out;
  };
  return messages.map((m) => ({
    ...m,
    content: m.content ? scrub(m.content) : m.content,
    ...(m.tool_calls ? {
      tool_calls: m.tool_calls.map((c) => ({ ...c, function: { ...c.function, arguments: scrub(c.function.arguments) } })),
    } : {}),
  }));
}

export async function runAssistant(opts: {
  agentId: string;
  req: Request;
  canManage: boolean;
  messages: unknown;
  page?: string;
  confirm?: { toolCallId: string; approved: boolean };
  onEvent?: Emit;
}): Promise<AssistantResult> {
  const emit: Emit = opts.onEvent ?? (() => {});
  const ctx: ToolContext = { agentId: opts.agentId, req: opts.req, canManage: opts.canManage };
  const messages = trimHistory(closeDanglingToolCalls(sanitize(opts.messages)));
  const changes = new Set<string>();
  const agent = await Agent.findById(opts.agentId).select("name").lean();
  const system = systemPrompt(agent?.name || "this workspace", opts.page || "dashboard");

  const done = (pending?: PendingAction): AssistantResult => ({ messages: redact(messages), pending, changes: [...changes] });

  // Resume a turn that was waiting for (or partly through) tool calls.
  let pending = await runPendingToolCalls(messages, ctx, opts.confirm, changes, emit);
  if (pending) return done(pending);

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && !last.tool_calls?.length) break; // answered
    emit({ type: "status", text: messages[messages.length - 1]?.role === "tool" ? "Reviewing the results…" : "Thinking…" });
    const reply = await callLLM(opts.agentId, messages, system);
    if (reply.reasoning) emit({ type: "reasoning", text: reply.reasoning });
    messages.push(reply);
    if (!reply.tool_calls?.length) break;
    pending = await runPendingToolCalls(messages, ctx, undefined, changes, emit);
    if (pending) return done(pending);
  }
  return done();
}
