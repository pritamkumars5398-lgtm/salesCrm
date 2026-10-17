import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Setting } from "@/lib/models/Setting";
import { Lead } from "@/lib/models/Lead";
import { buildPlivoStreamXml } from "@/lib/plivo-service";

export async function GET(req: Request) {
  return handleXml(req);
}

export async function POST(req: Request) {
  return handleXml(req);
}

async function handleXml(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  
  // Custom WebSocket bridge URL if specified in query, or default to current host ws endpoint
  const customWs = url.searchParams.get("ws");
  const agentId = url.searchParams.get("agentId");
  const leadId = url.searchParams.get("leadId");

  let greetingText: string | undefined;

  if (agentId) {
    try {
      await connectDB();
      const setting = await Setting.findOne({
        agentId: new Types.ObjectId(agentId),
        key: "callGreeting"
      }).lean();
      
      if (setting && setting.value && setting.value.trim()) {
        greetingText = setting.value.trim();
      }

      if (leadId) {
        const lead = await Lead.findById(leadId).lean();
        if (lead) {
          const leadName = lead.fullName || lead.firstName || "there";
          if (greetingText) {
            greetingText = greetingText.replace(/\{\{leadName\}\}/gi, leadName);
          }
        }
      }
    } catch (e: any) {
      console.error("[PlivoXml] Error fetching agent greeting from DB:", e.message);
    }
  }

  // Smart fallback greeting if agent has none configured
  if (!greetingText) {
    greetingText = "Hello! This is calling from DIFMO AI Solutions. We noticed your venture NextZeni and would love to help you build an incredible, high-performing blog and website to scale your brand and reach. We will connect with you soon. Thank you!";
  }

  let wssUrl: string;
  if (customWs) {
    wssUrl = customWs;
  } else {
    const protocol = host.includes("localhost") ? "ws" : "wss";
    let wsPath = `${protocol}://${host}/ws/plivo`;
    const params = new URLSearchParams();
    if (agentId) params.set("agentId", agentId);
    if (leadId) params.set("leadId", leadId);
    if (params.toString()) {
      wsPath += `?${params.toString()}`;
    }
    wssUrl = wsPath;
  }

  const xml = buildPlivoStreamXml(wssUrl, greetingText);

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}

