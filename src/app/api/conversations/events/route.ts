import { eventEmitter } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const leadId = searchParams.get("leadId");

  if (!leadId) {
    return new Response("leadId is required", { status: 400 });
  }

  let intervalId: NodeJS.Timeout | undefined;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // 1. Listen for local message events
      const onMessage = (data: any) => {
        if (data.leadId === leadId) {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "message", leadId })}\n\n`)
            );
          } catch {
            // Stream might already be closed
          }
        }
      };

      eventEmitter.on("message", onMessage);

      // Send initial connection heartbeat
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`));
      } catch {
        // Stream might already be closed
      }

      // 2. Start background silent IMAP sync check every 25 seconds while drawer is open
      const syncUrl = `${origin}/api/conversations/sync?leadId=${leadId}`;
      intervalId = setInterval(async () => {
        try {
          await fetch(syncUrl);
        } catch (err) {
          console.error("SSE background sync error:", err);
        }
      }, 25000);

      // Handle abort / client disconnect
      req.signal.addEventListener("abort", () => {
        eventEmitter.off("message", onMessage);
        if (intervalId) {
          clearInterval(intervalId);
        }
        try {
          controller.close();
        } catch {
          // Stream might already be closed
        }
      });
    },
    cancel() {
      if (intervalId) {
        clearInterval(intervalId);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
