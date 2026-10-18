import { Setting } from "@/lib/models/Setting";
import { connectDB } from "@/lib/db";
import { authorizeWorkspace } from "@/server/auth/access";

/**
 * Only public https media hosts — this route fetches server-side, so an open
 * URL would let anyone signed in probe localhost or the cloud metadata service.
 */
function isSafeMediaUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return false; // raw IPs
  return true;
}

export async function GET(req: Request) {
  await connectDB();
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");
    const access = await authorizeWorkspace(req, searchParams.get("agentId"));
    if (!access.ok) return access.response;
    const agentId = access.agentId;

    if (!url || !isSafeMediaUrl(url)) {
      return new Response("Invalid media url", { status: 400 });
    }

    // If it's a Twilio secure URL, fetch with Basic Auth
    if (new URL(url).hostname.endsWith("twilio.com")) {
      const keys = ["waApiKey", "waSessionId"];
      const rows = await Setting.find({ agentId, key: { $in: keys } }).lean();
      const m: Record<string, string> = {};
      rows.forEach((r) => { m[r.key] = r.value; });

      const accountSid = m.waSessionId;
      const authToken = m.waApiKey;

      if (accountSid && authToken) {
        const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
        const res = await fetch(url, {
          headers: {
            Authorization: `Basic ${auth}`,
          },
        });

        if (res.ok) {
          const contentType = res.headers.get("content-type") || "image/jpeg";
          const buffer = await res.arrayBuffer();
          return new Response(buffer, {
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "private, max-age=86400",
            },
          });
        }
      }
    }

    // Fallback direct fetch for other public URLs (redirects could lead anywhere — don't follow them)
    const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const contentType = res.headers.get("content-type") || "image/jpeg";
      if (!/^(image|video|audio)\//.test(contentType) && contentType !== "application/pdf") {
        return new Response("Unsupported media type", { status: 415 });
      }
      const buffer = await res.arrayBuffer();
      return new Response(buffer, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "private, max-age=86400",
        },
      });
    }

    return new Response("Not found", { status: 404 });
  } catch (err: unknown) {
    return new Response(err instanceof Error ? err.message : "Media fetch failed", { status: 500 });
  }
}
