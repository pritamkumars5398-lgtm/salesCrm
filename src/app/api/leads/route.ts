import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { Agent } from "@/lib/models/Agent";
import { Conversation } from "@/lib/models/Conversation";
import { Activity } from "@/lib/models/Activity";
import { Usage } from "@/lib/models/Usage";
import { currentMonth } from "@/lib/utils/date";
import { checkUsageLimit } from "@/lib/usage-check";
import { countEligibleLeads } from "@/server/services/campaign.service";
import { authorizeWorkspace } from "@/server/auth/access";
import { groupFilterById, getFieldDefs } from "@/server/services/lead-groups.service";
import { prepareNewLeadAttributes } from "@/server/services/lead-attributes.service";
import { normalizeTag } from "@/lib/lead-fields";

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 25;

/**
 * The UTC instants bounding calendar day `YYYY-MM-DD` as it falls in `tz`.
 * Keeps the `addedDate` filter aligned with the tz-grouped `dateOptions`,
 * which a server-local `new Date(day)` would not be (servers run in UTC).
 */
function zonedDayRange(day: string, tz: string): { start: Date; end: Date } | null {
  const utcMidnight = new Date(`${day}T00:00:00Z`);
  if (isNaN(utcMidnight.getTime())) return null;
  const shifted = new Date(utcMidnight.toLocaleString("en-US", { timeZone: tz }));
  const offset = shifted.getTime() - utcMidnight.getTime();
  const start = new Date(utcMidnight.getTime() - offset);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * GET /api/leads — always returns `{ leads, total, page, limit, totalPages }`.
 *
 * Pass `?page=n` to fetch one page; the response then also carries the counters
 * the Leads table needs but cannot derive from a single page (`statusCounts`,
 * `dateOptions`, `remainingEligible`). Without `page`, every match is returned,
 * which is what the CRM kanban and the post-sync refresh want.
 */
export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const access = await authorizeWorkspace(req, searchParams.get("agentId"));
  if (!access.ok) return access.response;
  const agentId = access.agentId;
  const status = searchParams.get("status");
  const search = searchParams.get("q");
  const source = searchParams.get("source");
  const channel = searchParams.get("channel");
  const missingContact = searchParams.get("missingContact");
  const requireContact = searchParams.get("requireContact");
  const location = searchParams.get("location");
  const addedDate = searchParams.get("addedDate");       // YYYY-MM-DD (sync batch day)
  const outreach = searchParams.get("outreachStatus");  // none|pending|sending|sent|failed
  const jobTitle = searchParams.get("jobTitle");
  const pipelineStage = searchParams.get("pipelineStage");
  const website = searchParams.get("website");
  const groupId = searchParams.get("groupId");
  const tag = searchParams.get("tag");
  // Sorting is opt-in so the Leads table and other consumers retain their
  // existing newest-created ordering. The CRM pipeline requests this explicitly.
  const sort = searchParams.get("sort");

  const trashed = searchParams.get("trashed") === "1";
  const recentOnly = searchParams.get("recent") === "1";
  // Sync-batch days are grouped in the viewer's timezone, matching how the UI labels them.
  // A bad IANA name would make Mongo throw, so fall back to UTC.
  let tz = searchParams.get("tz") || "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    tz = "UTC";
  }

  const pageParam = searchParams.get("page");
  const paginated = pageParam !== null;
  const page = Math.max(1, Number(pageParam) || 1);
  const requestedLimit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(searchParams.get("limit")) || DEFAULT_PAGE_SIZE));
  const limit = recentOnly ? Math.min(40, requestedLimit) : requestedLimit;

  // Everything except `status` and the `addedDate` range, so the status tabs and
  // the sync-date dropdown can each count across the axis they filter on.
  const baseFilter: Record<string, unknown> = {};
  // Every condition that needs $or/$and goes here, so filters can't overwrite each other.
  const and: Record<string, unknown>[] = [];
  baseFilter.agentId = new mongoose.Types.ObjectId(agentId);
  // Trash view shows only soft-deleted leads; every other view hides them.
  baseFilter.deletedAt = trashed ? { $ne: null } : null;
  if (recentOnly) {
    baseFilter.deletedAt = null;
    baseFilter.recentAccessedAt = { $ne: null };
  }
  if (source && source !== "all") baseFilter.source = source;
  if (channel && channel !== "all") baseFilter.channels = channel;
  if (location && location !== "all") baseFilter.location = location;
  if (outreach && outreach !== "all") {
    baseFilter.outreachStatus = outreach === "none"
      ? { $in: ["none", null] }
      : outreach;
  }
  if (jobTitle && jobTitle !== "all") {
    baseFilter.jobTitle = { $regex: jobTitle, $options: "i" };
  }
  if (search?.trim()) {
    const q = escapeRegex(search.trim());
    and.push({ $or: [
      { fullName: { $regex: q, $options: "i" } },
      { firstName: { $regex: q, $options: "i" } },
      { lastName: { $regex: q, $options: "i" } },
      { company: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
      { phone: { $regex: q, $options: "i" } },
    ] });
  }
  if (missingContact === "true") {
    and.push(
      { $or: [{ email: { $in: [null, ""] } }, { email: { $exists: false } }] },
      { $or: [{ phone: { $in: [null, ""] } }, { phone: { $exists: false } }] },
    );
  }
  if (requireContact === "email") {
    baseFilter.email = { $nin: [null, ""] };
  } else if (requireContact === "phone") {
    baseFilter.phone = { $nin: [null, ""] };
  }
  if (pipelineStage && pipelineStage !== "all") {
    baseFilter.pipelineStage = pipelineStage;
  }
  if (website && website !== "all") {
    const nonWebsiteRegex = /facebook\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com|google\.com/i;
    if (website === "yes") {
      baseFilter.website = { $nin: [null, ""], $not: nonWebsiteRegex };
    } else if (website === "no") {
      and.push({ $or: [
        { website: { $in: [null, ""] } },
        { website: { $exists: false } },
        { website: nonWebsiteRegex },
      ] });
    }
  }
  if (tag && tag !== "all") {
    baseFilter.tags = normalizeTag(tag);
  }
  if (groupId && groupId !== "all") {
    const group = await groupFilterById(agentId, groupId);
    if (!group) return NextResponse.json({ error: "Group not found in this workspace." }, { status: 404 });
    and.push(group);
  }
  if (and.length) baseFilter.$and = and;

  const statusFilter = status && status !== "all" ? { status } : {};

  let dateFilter: Record<string, unknown> = {};
  if (addedDate && addedDate !== "all") {
    const range = zonedDayRange(addedDate, tz);
    if (range) dateFilter = { createdAt: { $gte: range.start, $lt: range.end } };
  }

  const filter = { ...baseFilter, ...statusFilter, ...dateFilter };
  const sortOrder: Record<string, 1 | -1> = sort === "updatedAt"
    ? { updatedAt: -1 as const, _id: -1 as const }
    : sort === "recentAccessedAt"
      ? { recentAccessedAt: -1 as const, _id: -1 as const }
    : sort === "deletedAt"
      ? { deletedAt: -1 as const, _id: -1 as const }
      : { createdAt: -1 as const, _id: -1 as const };

  if (!paginated) {
    const leads = await Lead.find(filter).sort(sortOrder).lean();
    return NextResponse.json({ leads, total: leads.length, page: 1, limit: leads.length, totalPages: 1 });
  }

  const [leads, total] = await Promise.all([
    Lead.find(filter).sort(sortOrder).skip((page - 1) * limit).limit(limit).lean(),
    Lead.countDocuments(filter),
  ]);

  const [statusGroups, dateGroups, remainingEligible, jobTitles] = await Promise.all([
    // Tab counts ignore the active status tab, so switching tabs doesn't zero the others.
    Lead.aggregate<{ _id: string; count: number }>([
      { $match: { ...baseFilter, ...dateFilter } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    // Sync-batch days ignore the active date filter, for the same reason.
    Lead.aggregate<{ _id: string; count: number }>([
      { $match: { ...baseFilter, ...statusFilter } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: tz } }, count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
      { $limit: 60 },
    ]),
    // Matches the predicate the outreach run itself uses, so "Run (n left)" is truthful.
    !trashed ? countEligibleLeads(agentId, groupId && groupId !== "all" ? groupId : null) : Promise.resolve(0),
    Lead.distinct("jobTitle", { agentId, deletedAt: trashed ? { $ne: null } : null }),
  ]);

  const statusCounts: Record<string, number> = { all: 0 };
  for (const g of statusGroups) {
    if (!g._id) continue;
    statusCounts[g._id] = g.count;
    statusCounts.all += g.count;
  }

  const dateOptions = dateGroups
    .filter((g) => g._id)
    .map((g) => ({ value: g._id, count: g.count }));

  return NextResponse.json({
    leads,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    statusCounts,
    dateOptions,
    remainingEligible,
    jobTitles: jobTitles.filter(Boolean).sort((a, b) => a.localeCompare(b)),
  });
}

/** Fields a client may never set on create — they are server-managed. */
const SERVER_MANAGED = ["_id", "agentId", "deletedAt", "history", "notes", "outreachStatus", "outreachAttempts", "lastContactedAt", "lastOutreachError", "recentAccessedAt", "createdAt", "updatedAt"];

function stripServerManaged(l: Record<string, unknown>) {
  const copy = { ...l };
  for (const k of SERVER_MANAGED) delete copy[k];
  return copy;
}

export async function POST(req: Request) {
  await connectDB();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  const requestedAgentId = Array.isArray(body) ? body[0]?.agentId : body.agentId;
  if (Array.isArray(body) && body.some((l) => l?.agentId && String(l.agentId) !== String(requestedAgentId))) {
    return NextResponse.json({ error: "All imported leads must belong to the same workspace." }, { status: 400 });
  }
  if (Array.isArray(body) && body.length === 0) {
    return NextResponse.json([], { status: 201 });
  }
  const access = await authorizeWorkspace(req, requestedAgentId);
  if (!access.ok) return access.response;
  const agentId = access.agentId;
  const defs = await getFieldDefs(agentId);

  if (Array.isArray(body)) {
    if (body.length > 5000) {
      return NextResponse.json({ error: "Import at most 5,000 leads at a time." }, { status: 400 });
    }
    const leadsToInsert = [];
    for (let i = 0; i < body.length; i++) {
      const l = stripServerManaged(body[i] ?? {}) as Record<string, any>;
      const attrs = await prepareNewLeadAttributes(agentId, l, defs);
      if (!attrs.ok) return NextResponse.json({ error: `Row ${i + 1}: ${attrs.error}` }, { status: 400 });
      const firstName = String(l.firstName ?? "").trim() || "Unknown";
      const lastName = String(l.lastName ?? "").trim();
      leadsToInsert.push({
        ...l,
        ...attrs.value,
        agentId,
        firstName,
        lastName,
        fullName: l.fullName || `${firstName} ${lastName}`.trim(),
        pipelineStage: l.pipelineStage || "new",
        status: l.status || "new",
        channels: l.channels || [],
      });
    }
    const canScrape = await checkUsageLimit(agentId, "leadsScraped", body.length);
    if (!canScrape) {
      return NextResponse.json({ error: "Plan limit exceeded for scraping/importing leads." }, { status: 403 });
    }

    const leads = await Lead.insertMany(leadsToInsert);
    await Agent.findByIdAndUpdate(agentId, { $inc: { leadCount: leads.length } });
    await Usage.findOneAndUpdate(
      { agentId, month: currentMonth() },
      { $inc: { leadsScraped: leads.length } },
      { upsert: true }
    );
    return NextResponse.json(leads, { status: 201 });
  }

  const input = stripServerManaged(body);
  const attrs = await prepareNewLeadAttributes(agentId, input, defs);
  if (!attrs.ok) return NextResponse.json({ error: attrs.error }, { status: 400 });
  try {
    const lead = await Lead.create({ ...input, ...attrs.value, agentId });
    await Agent.findByIdAndUpdate(agentId, { $inc: { leadCount: 1 } });
    // Note: Manual lead addition does NOT consume 'leadsScraped' usage limit.
    return NextResponse.json(lead, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not create the lead." }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const access = await authorizeWorkspace(req, searchParams.get("agentId"));
  if (!access.ok) return access.response;
  const agentId = access.agentId;

  const idsParam = searchParams.get("ids");
  const permanent = searchParams.get("permanent") === "1";

  const match: Record<string, unknown> = { agentId };
  if (idsParam) {
    const ids = idsParam.split(",").map((s) => s.trim()).filter((s) => mongoose.Types.ObjectId.isValid(s));
    if (ids.length === 0) return NextResponse.json({ deleted: 0 });
    match._id = { $in: ids };
  } else {
    match.$and = [
      { $or: [{ email: { $in: [null, ""] } }, { email: { $exists: false } }] },
      { $or: [{ phone: { $in: [null, ""] } }, { phone: { $exists: false } }] },
    ];
  }

  const targets = await Lead.find(match, "_id deletedAt").lean();
  const leadIds = targets.map((l) => l._id);
  if (leadIds.length === 0) return NextResponse.json({ deleted: 0 });

  if (permanent) {
    const result = await Lead.deleteMany({ _id: { $in: leadIds } });
    await Promise.all([
      Conversation.deleteMany({ leadId: { $in: leadIds } }),
      Activity.deleteMany({ leadId: { $in: leadIds } }),
    ]);
    // Only leads that were still active (not already trashed) count against leadCount.
    const wasActive = targets.filter((l) => !l.deletedAt).length;
    if (wasActive > 0) await Agent.findByIdAndUpdate(agentId, { $inc: { leadCount: -wasActive } });
    return NextResponse.json({ deleted: result.deletedCount, permanent: true });
  }

  // Soft delete: only those not already in Trash.
  const activeIds = targets.filter((l) => !l.deletedAt).map((l) => l._id);
  if (activeIds.length === 0) return NextResponse.json({ deleted: 0 });
  await Lead.updateMany({ _id: { $in: activeIds } }, { deletedAt: new Date() });
  await Agent.findByIdAndUpdate(agentId, { $inc: { leadCount: -activeIds.length } });
  return NextResponse.json({ deleted: activeIds.length });
}

/**
 * PATCH /api/leads — restore soft-deleted leads from Trash.
 * Body: { agentId, ids: string[] }
 */
export async function PATCH(req: Request) {
  await connectDB();
  const { agentId: requestedAgentId, ids } = await req.json().catch(() => ({}));
  const access = await authorizeWorkspace(req, requestedAgentId);
  if (!access.ok) return access.response;
  const agentId = access.agentId;
  if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => !mongoose.Types.ObjectId.isValid(String(id)))) {
    return NextResponse.json({ error: "ids[] of valid lead ids are required" }, { status: 400 });
  }

  // Only restore leads currently in Trash so the count delta stays correct.
  const targets = await Lead.find({ agentId, _id: { $in: ids }, deletedAt: { $ne: null } }, "_id").lean();
  const restoreIds = targets.map((l) => l._id);
  if (restoreIds.length === 0) return NextResponse.json({ restored: 0 });

  await Lead.updateMany({ _id: { $in: restoreIds } }, { deletedAt: null });
  await Agent.findByIdAndUpdate(agentId, { $inc: { leadCount: restoreIds.length } });
  return NextResponse.json({ restored: restoreIds.length });
}
