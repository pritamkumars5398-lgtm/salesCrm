/**
 * Apify Google Maps scraper integration.
 *
 * POST /api/apify        → start a scraper run, return { runId, datasetId }
 * GET  /api/apify?runId  → poll run status, return { status, itemCount }
 * POST /api/apify/import → fetch dataset + upsert leads into DB
 *
 * Actor used: compass/google-maps-scraper (most reliable Google Maps actor on Apify)
 * Docs: https://apify.com/compass/google-maps-scraper
 */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Setting } from "@/lib/models/Setting";
import { Lead } from "@/lib/models/Lead";
import { Agent } from "@/lib/models/Agent";

// Actor: Apify Google Maps Scraper (stable actor ID — does not change with renames)
const DEFAULT_ACTOR = "nwua9Gu5YrADL7ZD";
const BASE_URL      = "https://api.apify.com/v2";

type ScraperType = "google-maps" | "linkedin" | "justdial" | "custom";

interface ScraperConfig {
  token: string;
  actorId: string;
  input: Record<string, unknown>;
  scraperType: ScraperType;
  searchLabel: string;
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function getConfig(agentId: string): Promise<ScraperConfig | null> {
  const keys = [
    "apifyToken", "activeScraperType",
    "gmActorId", "gmKeyword", "gmLocation", "gmMaxResults",
    "liActorId", "liKeywords", "liCountry", "liTarget", "liMaxResults",
    "jdActorId", "jdCategory", "jdCity", "jdMaxResults",
    "customActorId", "customActorInput",
    // legacy fallbacks
    "leadLocation", "industry", "apifyActorId",
  ];
  const rows = await Setting.find({ agentId, key: { $in: keys } }).lean();
  const m: Record<string, string> = {};
  rows.forEach((r) => { m[r.key] = r.value; });

  if (!m.apifyToken) return null;

  const scraperType = (m.activeScraperType ?? "google-maps") as ScraperType;

  if (scraperType === "google-maps") {
    const keyword  = m.gmKeyword  || m.industry   || "Carpenter";
    const location = m.gmLocation || m.leadLocation || "Lucknow";
    const max      = parseInt(m.gmMaxResults ?? "25", 10) || 25;
    const actorId  = m.gmActorId  || m.apifyActorId || DEFAULT_ACTOR;
    return {
      token: m.apifyToken, actorId, scraperType,
      searchLabel: `${keyword} in ${location}`,
      input: {
        searchStringsArray: [`${keyword} in ${location}`],
        maxCrawledPlacesPerSearch: max,
        language: "en",
        countryCode: "in",
        includeReviews: false,
        includeImages: false,
      },
    };
  }

  if (scraperType === "linkedin") {
    const actorId = m.liActorId;
    if (!actorId) return null;
    const keywords = m.liKeywords || "Business Owner";
    const country  = m.liCountry  || "India";
    const max      = parseInt(m.liMaxResults ?? "20", 10) || 20;
    const target   = m.liTarget   || "Companies";
    return {
      token: m.apifyToken, actorId, scraperType,
      searchLabel: `LinkedIn ${target}: "${keywords}"`,
      input: {
        searchTerms: [keywords],
        country,
        type: target === "People" ? "PEOPLE" : "COMPANIES",
        maxResults: max,
      },
    };
  }

  if (scraperType === "justdial") {
    const actorId = m.jdActorId;
    if (!actorId) return null;
    const category = m.jdCategory || "Carpenter";
    const city     = m.jdCity     || "Lucknow";
    const max      = parseInt(m.jdMaxResults ?? "30", 10) || 30;
    return {
      token: m.apifyToken, actorId, scraperType,
      searchLabel: `JustDial: ${category} in ${city}`,
      input: { category, city, maxResults: max },
    };
  }

  if (scraperType === "custom") {
    const actorId = m.customActorId;
    if (!actorId) return null;
    let input: Record<string, unknown> = {};
    try { input = JSON.parse(m.customActorInput ?? "{}"); } catch { input = {}; }
    return {
      token: m.apifyToken, actorId, scraperType,
      searchLabel: `Custom actor: ${actorId}`,
      input,
    };
  }

  return null;
}

function apifyHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// ─── POST — start a run ──────────────────────────────────────────────────────
export async function POST(req: Request) {
  await connectDB();
  const { agentId } = (await req.json()) as { agentId: string };
  if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 });

  const cfg = await getConfig(agentId);
  if (!cfg) return NextResponse.json({ error: "Apify token not set in Settings → Apify Scraper" }, { status: 400 });

  const { token, actorId, input, searchLabel } = cfg;

  const runRes = await fetch(`${BASE_URL}/acts/${actorId}/runs`, {
    method: "POST",
    headers: apifyHeaders(token),
    body: JSON.stringify(input),
  });

  if (!runRes.ok) {
    const body = await runRes.text();
    return NextResponse.json({ error: `Apify start failed: ${body}` }, { status: 502 });
  }

  const { data: run } = await runRes.json() as { data: { id: string; defaultDatasetId: string; status: string } };

  return NextResponse.json({ runId: run.id, datasetId: run.defaultDatasetId, status: run.status, search: searchLabel });
}

// ─── GET — poll run status ───────────────────────────────────────────────────
export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const runId   = searchParams.get("runId");
  const agentId = searchParams.get("agentId");
  if (!runId || !agentId) return NextResponse.json({ error: "runId and agentId required" }, { status: 400 });

  const cfg = await getConfig(agentId);
  if (!cfg) return NextResponse.json({ error: "Apify token not set" }, { status: 400 });

  const statusRes = await fetch(`${BASE_URL}/actor-runs/${runId}`, {
    headers: apifyHeaders(cfg.token),
  });
  if (!statusRes.ok) return NextResponse.json({ error: "Could not fetch run status" }, { status: 502 });

  const { data: run } = await statusRes.json() as {
    data: {
      id: string;
      status: "READY" | "RUNNING" | "SUCCEEDED" | "FAILED" | "ABORTED" | "TIMED-OUT";
      defaultDatasetId: string;
      stats: { itemCount?: number };
    };
  };

  return NextResponse.json({
    status: run.status,
    datasetId: run.defaultDatasetId,
    itemCount: run.stats?.itemCount ?? 0,
  });
}

// ─── PATCH — import dataset items as leads ───────────────────────────────────
export async function PATCH(req: Request) {
  await connectDB();
  const { agentId, datasetId } = (await req.json()) as { agentId: string; datasetId: string };
  if (!agentId || !datasetId) return NextResponse.json({ error: "agentId and datasetId required" }, { status: 400 });

  const cfg = await getConfig(agentId);
  if (!cfg) return NextResponse.json({ error: "Apify token not set" }, { status: 400 });

  const itemsRes = await fetch(
    `${BASE_URL}/datasets/${datasetId}/items?clean=true&format=json&limit=100`,
    { headers: apifyHeaders(cfg.token) }
  );
  if (!itemsRes.ok) return NextResponse.json({ error: "Could not fetch dataset" }, { status: 502 });

  const places = (await itemsRes.json()) as Record<string, unknown>[];
  if (!places.length) return NextResponse.json({ imported: 0, message: "No places found in dataset" });

  // Deduplicate against existing leads (by phone and email)
  const existing = await Lead.find({ agentId }, "email phone").lean();
  const existingPhones = new Set(existing.map((l) => l.phone).filter(Boolean));
  const existingEmails = new Set(existing.map((l) => l.email).filter(Boolean));

  const toInsert = places
    .filter((p) => {
      const phone = normalizePhone(p.phone as string);
      const email = ((p.email as string) ?? "").toLowerCase().trim();
      if (phone && existingPhones.has(phone)) return false;
      if (email && existingEmails.has(email)) return false;
      return true;
    })
    .map((p) => {
      const title = ((p.title as string) ?? "Unknown").trim();
      const phone = normalizePhone(p.phone as string);
      const email = ((p.email as string) ?? "").toLowerCase().trim();
      const [firstName, ...rest] = title.split(" ");
      return {
        agentId,
        firstName:     firstName ?? title,
        lastName:      rest.join(" ") || "—",
        fullName:      title,
        jobTitle:      (p.categoryName as string) ?? "Business Owner",
        company:       title,
        email,
        phone,
        source:        scraperTypeToSource(cfg.scraperType),
        channels:      phone ? (["whatsapp", "call"] as const) : (["email"] as const),
        status:        "new" as const,
        pipelineStage: "new" as const,
        agentEnabled:  true,
      };
    });

  if (!toInsert.length) return NextResponse.json({ imported: 0, message: "All leads already in DB" });

  await Lead.insertMany(toInsert, { ordered: false });
  await Agent.findByIdAndUpdate(agentId, { $inc: { leadCount: toInsert.length } });

  return NextResponse.json({ imported: toInsert.length });
}

function scraperTypeToSource(t: ScraperType): "Google Maps" | "LinkedIn" | "JustDial" | "Apify" {
  if (t === "google-maps") return "Google Maps";
  if (t === "linkedin")    return "LinkedIn";
  if (t === "justdial")    return "JustDial";
  return "Apify";
}

function normalizePhone(raw: string | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return raw.trim();
}
