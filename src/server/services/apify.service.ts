/**
 * Apify scraping service — single implementation used by the /api/apify routes
 * (interactive Sync panel) and the cron executor (scheduled "scrape → outreach").
 */
import { Setting } from "@/lib/models/Setting";
import { Lead } from "@/lib/models/Lead";
import { Agent } from "@/lib/models/Agent";
import { Usage } from "@/lib/models/Usage";
import { PLANS, type PlanId } from "@/lib/plans";
import { currentMonth } from "@/lib/utils/date";

const DEFAULT_GM_ACTOR = "nwua9Gu5YrADL7ZDj";
const DEFAULT_LI_ACTOR = "M2FMdjRVeF1HPGFcc";
const BASE_URL = "https://api.apify.com/v2";

export type ScraperType = "google-maps" | "linkedin" | "justdial" | "custom";

export interface ScraperConfig {
  token: string;
  actorId: string;
  input: Record<string, unknown>;
  scraperType: ScraperType;
  searchLabel: string;
}

export interface StartedRun {
  runId: string;
  datasetId: string;
  status: string;
  search: string;
  scraperType: ScraperType;
}

// ─── config loading ───────────────────────────────────────────────────────────

export async function getAllConfigs(agentId: string): Promise<ScraperConfig[]> {
  const keys = [
    "apifyToken",
    "google-mapsEnabled", "linkedinEnabled", "justdialEnabled", "customEnabled",
    "gmActorId", "gmKeyword", "gmLocation", "gmMaxResults",
    "liActorId", "liKeywords", "liMaxResults",
    "justdialEnabled", "jdActorId", "jdCategory", "jdCity", "jdMaxResults",
    "customActorId", "customActorInput",
    "leadLocation", "leadLocations", "industry", "apifyActorId",
  ];
  const rows = await Setting.find({ agentId, key: { $in: keys } }).lean();
  const m: Record<string, string> = {};
  rows.forEach((r) => { m[r.key] = r.value; });

  if (!m.apifyToken) return [];
  const configs: ScraperConfig[] = [];

  let activeLocations: string[] = [];
  if (m.leadLocations) {
    try {
      const parsed = JSON.parse(m.leadLocations);
      if (Array.isArray(parsed)) {
        activeLocations = parsed.filter((l: { active?: boolean; name?: string }) => l.active).map((l: { name: string }) => l.name);
      }
    } catch (e) {
      console.error("Failed to parse leadLocations setting", e);
    }
  }
  if (activeLocations.length === 0) {
    activeLocations = [m.gmLocation || m.leadLocation || "Lucknow"];
  }

  // Google Maps
  if (m["google-mapsEnabled"] !== "false") {
    const keyword  = m.gmKeyword  || m.industry    || "Carpenter";
    const max      = parseInt(m.gmMaxResults ?? "25", 10) || 25;
    const actorId  = m.gmActorId  || m.apifyActorId || DEFAULT_GM_ACTOR;
    activeLocations.forEach((location) => {
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
    });
  }

  // LinkedIn — harvestapi/linkedin-profile-search, no cookie needed
  if (m.linkedinEnabled !== "false") {
    const actorId  = m.liActorId || DEFAULT_LI_ACTOR;
    const keywords = m.liKeywords || `carpenter ${activeLocations[0] || "Lucknow"}`;
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
    const max      = Math.max(parseInt(m.jdMaxResults ?? "30", 10) || 30, 10);
    activeLocations.forEach((location) => {
      configs.push({
        token: m.apifyToken, actorId: m.jdActorId, scraperType: "justdial",
        searchLabel: `JustDial: ${category} in ${location}`,
        input: { search: `${category} ${location}`, maxItems: max },
      });
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

export async function getToken(agentId: string): Promise<string | null> {
  const row = await Setting.findOne({ agentId, key: "apifyToken" }).lean();
  return row?.value ?? null;
}

function apifyHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// ─── run lifecycle ────────────────────────────────────────────────────────────

/** Start all enabled scraper runs in parallel. */
export async function startApifyRuns(agentId: string): Promise<{
  started: StartedRun[];
  warnings: string[];
}> {
  const configs = await getAllConfigs(agentId);
  if (!configs.length) {
    throw new Error("No enabled scrapers configured. Go to Settings → Apify Scrapers.");
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

  const warnings = (results.filter((r) => "error" in r) as { error: string }[]).map((f) => f.error);
  const started  = results.filter((r) => !("error" in r)) as StartedRun[];

  if (!started.length) throw new Error(warnings.join(" | ") || "All scraper runs failed to start");
  return { started, warnings };
}

export interface RunStatus {
  status: "READY" | "RUNNING" | "SUCCEEDED" | "FAILED" | "ABORTED" | "TIMED-OUT";
  datasetId: string;
  itemCount: number;
}

/** Poll one run's status. `waitSeconds` uses Apify's blocking waitForFinish. */
export async function getRunStatus(agentId: string, runId: string, waitSeconds = 0): Promise<RunStatus> {
  const token = await getToken(agentId);
  if (!token) throw new Error("Apify token not set");

  const wait = waitSeconds > 0 ? `?waitForFinish=${Math.min(waitSeconds, 60)}` : "";
  const statusRes = await fetch(`${BASE_URL}/actor-runs/${runId}${wait}`, {
    headers: apifyHeaders(token),
  });
  if (!statusRes.ok) throw new Error("Could not fetch run status");

  const { data: run } = await statusRes.json() as {
    data: { status: RunStatus["status"]; defaultDatasetId: string; stats: { itemCount?: number } };
  };
  return { status: run.status, datasetId: run.defaultDatasetId, itemCount: run.stats?.itemCount ?? 0 };
}

/** Abort a running actor run. */
export async function abortApifyRun(agentId: string, runId: string): Promise<void> {
  const token = await getToken(agentId);
  if (!token) throw new Error("Apify token not set");

  const res = await fetch(`${BASE_URL}/actor-runs/${runId}/abort`, {
    method: "POST",
    headers: apifyHeaders(token),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Apify abort failed: ${body}`);
  }
}

// ─── dataset import ───────────────────────────────────────────────────────────

export interface ImportResult {
  imported: number;
  message?: string;
  warning?: string;
  limitReached?: boolean;
}

/** Import one finished dataset into leads (dedup + plan-limit aware). */
export async function importDataset(
  agentId: string,
  datasetId: string,
  scraperType: ScraperType
): Promise<ImportResult> {
  const month = currentMonth();
  const [planRow, usageDoc, locationsRow] = await Promise.all([
    Setting.findOne({ agentId, key: "plan" }).lean(),
    Usage.findOne({ agentId, month }).lean(),
    Setting.findOne({ agentId, key: "leadLocations" }).lean(),
  ]);
  const planId = (planRow?.value ?? "free") as PlanId;
  const limit  = PLANS[planId].limits.leadsPerMonth;
  const used   = usageDoc?.leadsScraped ?? 0;

  let activeLocations: string[] = [];
  if (locationsRow?.value) {
    try {
      const parsed = JSON.parse(locationsRow.value);
      if (Array.isArray(parsed)) {
        activeLocations = parsed.filter((l: { active?: boolean }) => l.active).map((l: { name: string }) => l.name);
      }
    } catch {}
  }
  if (activeLocations.length === 0) {
    const backupLocationRow = await Setting.findOne({ agentId, key: "leadLocation" }).lean();
    activeLocations = [backupLocationRow?.value || "Lucknow"];
  }

  if (limit !== -1 && used >= limit) {
    return {
      imported: 0,
      message: `Lead limit reached (${used}/${limit} this month). Upgrade your plan.`,
      limitReached: true,
    };
  }

  const token = await getToken(agentId);
  if (!token) throw new Error("Apify token not set");

  const itemsRes = await fetch(
    `${BASE_URL}/datasets/${datasetId}/items?clean=true&format=json&limit=100`,
    { headers: apifyHeaders(token) }
  );
  if (!itemsRes.ok) throw new Error("Could not fetch dataset");

  const places = (await itemsRes.json()) as Record<string, unknown>[];
  if (!places.length) return { imported: 0, message: "No places found in dataset" };

  const existing = await Lead.find({ agentId }, "email phone").lean();
  const existingPhones = new Set(existing.map((l) => l.phone).filter(Boolean));
  const existingEmails = new Set(existing.map((l) => l.email).filter(Boolean));

  const toInsert = places
    .filter((p) => {
      const phone = normalizePhone(p.phone as string);
      const email = ((p.email as string) ?? "").toLowerCase().trim();
      if (!phone && !email) return false;
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

      let leadLocation = "";
      if (scraperType === "google-maps") {
        leadLocation = (p.city || p.state || "") as string;
      } else if (scraperType === "justdial") {
        leadLocation = (p.city || "") as string;
      }
      if (!leadLocation) {
        const address = String(p.address || "").toLowerCase();
        const found = activeLocations.find((loc) => address.includes(loc.toLowerCase()));
        leadLocation = found || activeLocations[0] || "";
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
        location:      leadLocation,
      };
    });

  if (!toInsert.length) return { imported: 0, message: "All leads already in DB" };

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

  return {
    imported: capped.length,
    ...(capped.length < toInsert.length ? { warning: `Capped at plan limit (${limit}/month). Upgrade for more.` } : {}),
  };
}

/**
 * Full scheduled sync: start runs, wait for them (bounded), import finished
 * datasets. Used by the cron "Sync Apify" action so a 9pm schedule can scrape
 * and hand fresh leads straight to outreach.
 */
export async function runFullSync(
  agentId: string,
  opts: { maxWaitMs?: number } = {}
): Promise<{ imported: number; notes: string[] }> {
  const maxWaitMs = opts.maxWaitMs ?? 4 * 60 * 1000;
  const deadline = Date.now() + maxWaitMs;
  const notes: string[] = [];

  const { started, warnings } = await startApifyRuns(agentId);
  notes.push(...warnings);

  let imported = 0;
  for (const run of started) {
    let status: RunStatus | null = null;
    while (Date.now() < deadline) {
      status = await getRunStatus(agentId, run.runId, 60);
      if (status.status !== "READY" && status.status !== "RUNNING") break;
    }
    if (!status || status.status === "READY" || status.status === "RUNNING") {
      notes.push(`${run.search}: still running after wait budget — leads will import on a later sync.`);
      continue;
    }
    if (status.status !== "SUCCEEDED") {
      notes.push(`${run.search}: run ${status.status}`);
      continue;
    }
    try {
      const res = await importDataset(agentId, status.datasetId, run.scraperType);
      imported += res.imported;
      if (res.message) notes.push(`${run.search}: ${res.message}`);
      if (res.warning) notes.push(res.warning);
    } catch (err) {
      notes.push(`${run.search}: import failed — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { imported, notes };
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
