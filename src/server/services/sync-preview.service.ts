import { Lead } from "@/lib/models/Lead";
import { Setting } from "@/lib/models/Setting";
import { getSettingsMap } from "./settings.service";
import { getAllConfigs, leadQuota, IMPORT_PER_RUN, type ScraperType } from "./apify.service";
import { parseLeadFilter, describeLeadFilter, LEAD_FILTER_KEY } from "@/lib/lead-filter";

export interface SyncPreviewScraper {
  scraperType: ScraperType;
  search: string;
  actorId: string;
  /** results asked from Apify; null when the actor input doesn't say */
  maxResults: number | null;
}

export interface SyncPreviewLlm {
  type: "openai" | "anthropic" | "gemini";
  label: string;
  model: string;
  ready: boolean;
  problem?: string;
}

export interface SyncPreview {
  apify: {
    enabled: boolean;
    tokenSet: boolean;
    scrapers: SyncPreviewScraper[];
    /** scrapers that are switched off or not set up, with why */
    skipped: { scraperType: ScraperType; reason: string }[];
  };
  llms: SyncPreviewLlm[];
  quota: { limit: number; used: number; remaining: number | null };
  existingLeads: number;
  /** the most new leads this sync can add before dedup and the plan cap */
  maxNewLeads: number;
  filterSummary?: string;
  /** a sync can't usefully start while any of these is true */
  blockers: string[];
  warnings: string[];
}

const LLM_PROVIDERS = [
  { type: "openai", label: "OpenAI ChatGPT" },
  { type: "anthropic", label: "Anthropic Claude" },
  { type: "gemini", label: "Google Gemini" },
] as const;

const SCRAPER_LABEL: Record<ScraperType, string> = {
  "google-maps": "Google Maps",
  linkedin: "LinkedIn",
  justdial: "JustDial",
  custom: "Custom actor",
};

function maxResultsOf(input: Record<string, unknown>): number | null {
  const n = Number(input.maxCrawledPlacesPerSearch ?? input.maxItems ?? input.maxResults);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * What clicking "Sync Sources" would do for this workspace, without starting
 * anything: the Apify runs (same configs the real sync uses), the AI lead
 * sources, the lead quota and anything that would make the sync fail.
 */
export async function getSyncPreview(agentId: string): Promise<SyncPreview> {
  const [m, configs, quota, existingLeads, filterRow] = await Promise.all([
    getSettingsMap(agentId, [
      "apifyScraperEnabled", "apifyToken", "google-mapsEnabled", "linkedinEnabled", "justdialEnabled", "customEnabled",
      "jdActorId", "customActorId", "llmPrompt",
      ...LLM_PROVIDERS.flatMap((p) => [`${p.type}Enabled`, `${p.type}ApiKey`, `${p.type}Model`]),
    ]),
    getAllConfigs(agentId, { withoutToken: true }),
    leadQuota(agentId),
    Lead.countDocuments({ agentId }),
    Setting.findOne({ agentId, key: LEAD_FILTER_KEY }).lean(),
  ]);

  const leadFilter = parseLeadFilter(filterRow?.value);
  const filterSummary = describeLeadFilter(leadFilter);

  const apifyEnabled = m.apifyScraperEnabled !== "false";
  const tokenSet = !!m.apifyToken?.trim();
  const scrapers: SyncPreviewScraper[] = apifyEnabled
    ? configs.map((c) => ({ scraperType: c.scraperType, search: c.searchLabel, actorId: c.actorId, maxResults: maxResultsOf(c.input) }))
    : [];

  const skipped: SyncPreview["apify"]["skipped"] = [];
  if (apifyEnabled) {
    for (const type of ["google-maps", "linkedin", "justdial", "custom"] as const) {
      if (configs.some((c) => c.scraperType === type)) continue;
      const off = m[`${type}Enabled`] === "false";
      const reason = off ? "switched off"
        : type === "justdial" && !m.jdActorId ? "no actor ID set"
          : type === "custom" && !m.customActorId ? "no actor ID set"
            : "not set up";
      skipped.push({ scraperType: type, reason: `${SCRAPER_LABEL[type]}: ${reason}` });
    }
  }

  const llms: SyncPreviewLlm[] = LLM_PROVIDERS
    .filter((p) => m[`${p.type}Enabled`] === "true")
    .map((p) => {
      const model = m[`${p.type}Model`] || "";
      const problem = !m[`${p.type}ApiKey`] ? "API key missing"
        : !model ? "model not chosen"
          : !m.llmPrompt?.trim() ? "lead prompt is empty"
            : undefined;
      return { type: p.type, label: p.label, model, ready: !problem, ...(problem ? { problem } : {}) };
    });

  const remaining = quota.limit === -1 ? null : Math.max(0, quota.limit - quota.used);
  // Each run's dataset is read up to IMPORT_PER_RUN items.
  const maxNewLeads = scrapers.reduce((sum, s) => sum + Math.min(s.maxResults ?? IMPORT_PER_RUN, IMPORT_PER_RUN), 0);

  const blockers: string[] = [];
  const warnings: string[] = [];
  // An Apify problem only blocks the sync when no AI source would run instead.
  const apifyIssues: string[] = [];
  if (apifyEnabled && !tokenSet) apifyIssues.push("The Apify API token isn't set, so no scraper can run.");
  else if (apifyEnabled && scrapers.length === 0) apifyIssues.push("Every Apify scraper is switched off or not set up.");
  const anyLlmReady = llms.some((l) => l.ready);
  if (!apifyEnabled && llms.length === 0) blockers.push("No lead source is turned on. Turn on Apify scrapers or an AI source in Settings.");
  (anyLlmReady ? warnings : blockers).push(...apifyIssues);
  if (!apifyEnabled && llms.length > 0 && !anyLlmReady) blockers.push("None of the AI sources can run — see the problems below.");
  if (remaining === 0) blockers.push(`This month's lead limit is used up (${quota.used}/${quota.limit}). Upgrade to sync more.`);

  for (const l of llms) if (l.problem) warnings.push(`${l.label} will fail: ${l.problem}.`);
  if (anyLlmReady) warnings.push("AI sources write leads from the model's own knowledge — check them before outreach.");
  if (remaining !== null && remaining > 0 && maxNewLeads > remaining) {
    warnings.push(`Only ${remaining} more lead${remaining === 1 ? "" : "s"} fit this month's plan — the rest will be skipped.`);
  }
  for (const s of scrapers) {
    if (s.maxResults && s.maxResults > IMPORT_PER_RUN) {
      warnings.push(`${s.search}: asks for ${s.maxResults} results but only the first ${IMPORT_PER_RUN} are imported.`);
    }
  }

  return {
    apify: { enabled: apifyEnabled, tokenSet, scrapers, skipped },
    llms,
    quota: { ...quota, remaining },
    existingLeads,
    maxNewLeads,
    filterSummary,
    blockers,
    warnings,
  };
}
