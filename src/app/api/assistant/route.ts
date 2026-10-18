import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { runAssistant, type AssistantEvent } from "@/server/services/assistant/assistant.service";
import { authorizeWorkspace } from "@/server/auth/access";

/**
 * AI assistant panel.
 * POST { agentId, messages, page?, confirm?: { toolCallId, approved }, stream? }
 *  → { messages, pending?: { toolCallId, name, summary }, changes: string[] }
 * With stream: true the response is NDJSON — progress events ({type:"status"|
 * "reasoning"|"tool_start"|"tool_end"}) as they happen, then {type:"done", ...result}
 * or {type:"error", error}.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  await connectDB();
  const access = await authorizeWorkspace(req, body.agentId);
  if (!access.ok) return access.response;

  const opts = {
    agentId: access.agentId,
    req,
    canManage: access.canManage,
    messages: body.messages,
    page: typeof body.page === "string" ? body.page : undefined,
    confirm: body.confirm && typeof body.confirm.toolCallId === "string"
      ? { toolCallId: body.confirm.toolCallId as string, approved: !!body.confirm.approved }
      : undefined,
  };

  if (!body.stream) {
    try {
      return NextResponse.json(await runAssistant(opts));
    } catch (err) {
      console.error("[Assistant] error:", err);
      return NextResponse.json({ error: err instanceof Error ? err.message : "Assistant failed" }, { status: 500 });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n")); } catch { /* client went away */ }
      };
      try {
        const result = await runAssistant({ ...opts, onEvent: (e: AssistantEvent) => send(e) });
        send({ type: "done", ...result });
      } catch (err) {
        console.error("[Assistant] error:", err);
        send({ type: "error", error: err instanceof Error ? err.message : "Assistant failed" });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
