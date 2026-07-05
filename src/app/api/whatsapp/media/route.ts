import { NextResponse } from "next/server";
import { Setting } from "@/lib/models/Setting";
import { connectDB } from "@/lib/db";

export async function GET(req: Request) {
  await connectDB();
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");
    const agentId = searchParams.get("agentId");

    if (!url) {
      return new Response("Missing url", { status: 400 });
    }

    // If it's a Twilio secure URL, fetch with Basic Auth
    if (url.includes("api.twilio.com") && agentId) {
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
              "Cache-Control": "public, max-age=86400",
            },
          });
        }
      }
    }

    // Fallback direct fetch for other public URLs
    const res = await fetch(url);
    if (res.ok) {
      const contentType = res.headers.get("content-type") || "image/jpeg";
      const buffer = await res.arrayBuffer();
      return new Response(buffer, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    return new Response("Not found", { status: 404 });
  } catch (err: any) {
    return new Response(err.message, { status: 500 });
  }
}
