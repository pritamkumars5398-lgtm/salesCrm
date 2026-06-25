import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Setting } from "@/lib/models/Setting";
import { Lead } from "@/lib/models/Lead";
import { Agent } from "@/lib/models/Agent";
import { Usage } from "@/lib/models/Usage";
import { PLANS, type PlanId } from "@/lib/plans";
import { currentMonth } from "@/lib/utils/date";

const DEFAULT_GM_ACTOR = "nwua9Gu5YrADL7ZDj";
const DEFAULT_LI_ACTOR = "M2FMdjRVeF1HPGFcc";
const BASE_URL          = "https://api.apify.com/v2";

type ScraperType = "google-maps" | "linkedin" | "justdial" | "custom";

interface ScraperConfig {
  token: string;
  actorId: string;
  input: Record<string, unknown>;
  scraperType: ScraperType;
  searchLabel: string;
}

// ─── read all settings once, build configs for every enabled scraper ─────────

async function getAllConfigs(agentId: string): Promise<ScraperConfig[]> {
  const keys = [
    "apifyToken",
    "google-mapsEnabled", "linkedinEnabled", "justdialEnabled", "customEnabled",
    "gmActorId", "gmKeyword", "gmLocation", "gmMaxResults",
    "liActorId", "liKeywords", "liMaxResults",
    "jdActorId", "jdCategory", "jdCity", "jdMaxResults",
    "customActorId", "customActorInput",
    "leadLocation", "industry", "apifyActorId",
  ];
  const rows = await Setting.find({ agentId, key: { $in: keys } }).lean();
  const m: Record<string, string> = {};
  rows.forEach((r) => { m[r.key] = r.value; });

  if (!m.apifyToken) return [];
  const configs: ScraperConfig[] = [];

  // Google Maps
  if (m["google-mapsEnabled"] !== "false") {
    const keyword  = m.gmKeyword  || m.industry    || "Carpenter";
    const location = m.gmLocation || m.leadLocation || "Lucknow";
    const max      = parseInt(m.gmMaxResults ?? "25", 10) || 25;
    const actorId  = m.gmActorId  || m.apifyActorId || DEFAULT_GM_ACTOR;
    configs.push({
      token: m.apifyToken, actorId, scraperType: "google-maps",
      searchLabel: `${keyword} in ${location}`,
      input: {
        searchStringsArray: [`${keyword} in ${location}`],
        maxCrawledPlacesPerSearch: max,
        language: "en",
        countryCode: "in",
        includeReviews: false,
        includeImages: false,
      },
    });
  }

  // LinkedIn — harvestapi/linkedin-profile-search, no cookie needed
  if (m.linkedinEnabled !== "false") {
    const actorId  = m.liActorId || DEFAULT_LI_ACTOR;
    const keywords = m.liKeywords || "carpenter Lucknow";
    const max      = parseInt(m.liMaxResults ?? "20", 10) || 20;
    configs.push({
      token: m.apifyToken, actorId, scraperType: "linkedin",
      searchLabel: `LinkedIn: "${keywords}"`,
      input: { searchQuery: keywords, maxItems: max },
    });
  }

  // JustDial
  if (m.justdialEnabled !== "false" && m.jdActorId) {
    const category = m.jdCategory || "Carpenter";
    const city     = m.jdCity     || "Lucknow";
    const max      = Math.max(parseInt(m.jdMaxResults ?? "30", 10) || 30, 10);
    configs.push({
      token: m.apifyToken, actorId: m.jdActorId, scraperType: "justdial",
      searchLabel: `JustDial: ${category} in ${city}`,
      input: { search: `${category} ${city}`, maxItems: max },
    });
  }

  // Custom
  if (m.customEnabled !== "false" && m.customActorId) {
    let input: Record<string, unknown> = {};
    try { input = JSON.parse(m.customActorInput ?? "{}"); } catch { input = {}; }
    configs.push({
      token: m.apifyToken, actorId: m.customActorId, scraperType: "custom",
      searchLabel: `Custom actor: ${m.customActorId}`,
      input,
    });
  }

  return configs;
}

// getToken — used by GET (just needs auth header)
async function getToken(agentId: string): Promise<string | null> {
  const row = await Setting.findOne({ agentId, key: "apifyToken" }).lean();
  return row?.value ?? null;
}

function apifyHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// ─── POST — start all enabled scraper runs in parallel ───────────────────────
export async function POST(req: Request) {
  await connectDB();
  const { agentId } = (await req.json()) as { agentId: string };
  if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 });

  const configs = await getAllConfigs(agentId);
  if (!configs.length) {
    return NextResponse.json(
      { error: "No enabled scrapers configured. Go to Settings → Apify Scrapers." },
      { status: 400 }
    );
  }

  const results = await Promise.all(configs.map(async (cfg) => {
    const runRes = await fetch(`${BASE_URL}/acts/${cfg.actorId}/runs`, {
      method: "POST",
      headers: apifyHeaders(cfg.token),
      body: JSON.stringify(cfg.input),
    });
    if (!runRes.ok) {
      const body = await runRes.text();
      return { error: `${cfg.searchLabel}: ${body}`, scraperType: cfg.scraperType };
    }
    const { data: run } = await runRes.json() as { data: { id: string; defaultDatasetId: string; status: string } };
    return {
      runId: run.id,
      datasetId: run.defaultDatasetId,
      status: run.status,
      search: cfg.searchLabel,
      scraperType: cfg.scraperType,
    };
  }));

  const failed  = results.filter((r) => "error" in r) as { error: string; scraperType: string }[];
  const started = results.filter((r) => !("error" in r)) as { runId: string; datasetId: string; status: string; search: string; scraperType: string }[];

  if (!started.length) {
    return NextResponse.json({ error: failed.map((f) => f.error).join(" | ") }, { status: 502 });
  }

  return NextResponse.json({
    runs: started,
    ...(failed.length ? { warnings: failed.map((f) => f.error) } : {}),
  });
}

// ─── GET — poll a single run status ─────────────────────────────────────────
export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const runId   = searchParams.get("runId");
  const agentId = searchParams.get("agentId");
  if (!runId || !agentId) return NextResponse.json({ error: "runId and agentId required" }, { status: 400 });

  const token = await getToken(agentId);
  if (!token) return NextResponse.json({ error: "Apify token not set" }, { status: 400 });

  const statusRes = await fetch(`${BASE_URL}/actor-runs/${runId}`, {
    headers: apifyHeaders(token),
  });
  if (!statusRes.ok) return NextResponse.json({ error: "Could not fetch run status" }, { status: 502 });

  const { data: run } = await statusRes.json() as {
    data: {
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

// ─── PATCH — import one dataset into leads ───────────────────────────────────
export async function PATCH(req: Request) {
  await connectDB();
  const { agentId, datasetId, scraperType } = (await req.json()) as {
    agentId: string;
    datasetId: string;
    scraperType: ScraperType;
  };
  if (!agentId || !datasetId) return NextResponse.json({ error: "agentId and datasetId required" }, { status: 400 });

  // ── plan limit check ──────────────────────────────────────────────────────
  const month = currentMonth();
  const [planRow, usageDoc] = await Promise.all([
    Setting.findOne({ agentId, key: "plan" }).lean(),
    Usage.findOne({ agentId, month }).lean(),
  ]);
  const planId = (planRow?.value ?? "free") as PlanId;
  const limit  = PLANS[planId].limits.leadsPerMonth;
  const used   = usageDoc?.leadsScraped ?? 0;
  if (limit !== -1 && used >= limit) {
    return NextResponse.json(
      { error: `Lead limit reached (${used}/${limit} this month). Upgrade your plan.`, limitReached: true },
      { status: 403 }
    );
  }

  const token = await getToken(agentId);
  if (!token) return NextResponse.json({ error: "Apify token not set" }, { status: 400 });

  const itemsRes = await fetch(
    `${BASE_URL}/datasets/${datasetId}/items?clean=true&format=json&limit=100`,
    { headers: apifyHeaders(token) }
  );
  if (!itemsRes.ok) return NextResponse.json({ error: "Could not fetch dataset" }, { status: 502 });

  const places = (await itemsRes.json()) as Record<string, unknown>[];
  console.log(`[Apify PATCH] dataset=${datasetId} items=${places.length} scraperType=${scraperType}`);
  if (places.length > 0) console.log("[Apify PATCH] First item keys:", Object.keys(places[0]));
  if (!places.length) return NextResponse.json({ imported: 0, message: "No places found in dataset" });

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
      let firstName: string, lastName: string, fullName: string, jobTitle: string, company: string, email: string, phone: string, website: string;

      if (scraperType === "linkedin") {
        firstName = ((p.firstName ?? "") as string).trim() || "Unknown";
        lastName  = ((p.lastName  ?? "") as string).trim();
        fullName  = `${firstName} ${lastName}`.trim();
        jobTitle  = ((p.headline ?? "") as string).trim() || "Professional";
        const pos = Array.isArray(p.currentPosition) && p.currentPosition.length > 0
          ? (p.currentPosition[0] as Record<string, unknown>)
          : null;
        company   = ((pos?.companyName ?? pos?.company ?? "") as string).trim() || "—";
        const emails = Array.isArray(p.emails) ? (p.emails as string[]) : [];
        email     = (emails[0] ?? "").toLowerCase().trim();
        phone     = normalizePhone(p.phone as string);
        website   = (p.url ?? (p.publicIdentifier ? `https://www.linkedin.com/in/${p.publicIdentifier}` : "")) as string;
      } else {
        // Google Maps / JustDial / Custom
        fullName  = ((p.title ?? p.name ?? "Unknown") as string).trim();
        const [first, ...rest] = fullName.split(" ");
        firstName = first ?? fullName;
        lastName  = rest.join(" ") || "—";
        jobTitle  = ((p.categoryName ?? p.category ?? "Business Owner") as string);
        company   = fullName;
        phone     = normalizePhone(p.phone as string);
        email     = ((p.email ?? p.website ?? "") as string).toLowerCase().trim();
        website   = (p.website ?? p.url ?? "") as string;
      }

      return {
        agentId,
        firstName,
        lastName,
        fullName,
        jobTitle,
        company,
        email:         email.includes("http") ? "" : email,
        phone,
        source:        scraperTypeToSource(scraperType),
        channels:      phone ? (["whatsapp", "call"] as const) : (["email"] as const),
        status:        "new" as const,
        pipelineStage: "new" as const,
        agentEnabled:  true,
        website:       website.trim(),
      };
    });

  if (!toInsert.length) return NextResponse.json({ imported: 0, message: "All leads already in DB" });

  // cap at remaining quota
  const remaining = limit === -1 ? toInsert.length : Math.min(toInsert.length, limit - used);
  const capped = toInsert.slice(0, remaining);

  await Lead.insertMany(capped, { ordered: false });
  await Promise.all([
    Agent.findByIdAndUpdate(agentId, { $inc: { leadCount: capped.length } }),
    Usage.findOneAndUpdate(
      { agentId, month },
      { $inc: { leadsScraped: capped.length } },
      { upsert: true }
    ),
  ]);

  return NextResponse.json({
    imported: capped.length,
    ...(capped.length < toInsert.length ? { warning: `Capped at plan limit (${limit}/month). Upgrade for more.` } : {}),
  });
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
