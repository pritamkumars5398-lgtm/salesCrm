import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { Agent } from "@/lib/models/Agent";
import { Conversation } from "@/lib/models/Conversation";
import { Activity } from "@/lib/models/Activity";
import { countEligibleLeads } from "@/server/services/campaign.service";

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
  const agentId = searchParams.get("agentId");
  const status = searchParams.get("status");
  const search = searchParams.get("q");
  const source = searchParams.get("source");
  const channel = searchParams.get("channel");
  const missingContact = searchParams.get("missingContact");
  const location = searchParams.get("location");
  const addedDate = searchParams.get("addedDate");       // YYYY-MM-DD (sync batch day)
  const outreach = searchParams.get("outreachStatus");  // none|pending|sending|sent|failed
  const jobTitle = searchParams.get("jobTitle");
  const pipelineStage = searchParams.get("pipelineStage");
  const website = searchParams.get("website");

  const trashed = searchParams.get("trashed") === "1";
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
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(searchParams.get("limit")) || DEFAULT_PAGE_SIZE));

  // Everything except `status` and the `addedDate` range, so the status tabs and
  // the sync-date dropdown can each count across the axis they filter on.
  const baseFilter: Record<string, unknown> = {};
  if (agentId) baseFilter.agentId = new mongoose.Types.ObjectId(agentId);
  // Trash view shows only soft-deleted leads; every other view hides them.
  baseFilter.deletedAt = trashed ? { $ne: null } : null;
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
  if (search) baseFilter.$text = { $search: search };
  if (missingContact === "true") {
    baseFilter.$and = [
      { $or: [{ email: { $in: [null, ""] } }, { email: { $exists: false } }] },
      { $or: [{ phone: { $in: [null, ""] } }, { phone: { $exists: false } }] },
    ];
  }
  if (pipelineStage && pipelineStage !== "all") {
    baseFilter.pipelineStage = pipelineStage;
  }
  if (website && website !== "all") {
    const nonWebsiteRegex = /facebook\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com|google\.com/i;
    if (website === "yes") {
      baseFilter.website = { $nin: [null, ""], $not: nonWebsiteRegex };
    } else if (website === "no") {
      baseFilter.$or = [
        { website: { $in: [null, ""] } }, 
        { website: { $exists: false } },
        { website: nonWebsiteRegex }
      ];
    }
  }

  const statusFilter = status && status !== "all" ? { status } : {};

  let dateFilter: Record<string, unknown> = {};
  if (addedDate && addedDate !== "all") {
    const range = zonedDayRange(addedDate, tz);
    if (range) dateFilter = { createdAt: { $gte: range.start, $lt: range.end } };
  }

  const filter = { ...baseFilter, ...statusFilter, ...dateFilter };

  if (!paginated) {
    const leads = await Lead.find(filter).sort({ createdAt: -1, _id: -1 }).lean();
    return NextResponse.json({ leads, total: leads.length, page: 1, limit: leads.length, totalPages: 1 });
  }

  const [leads, total] = await Promise.all([
    Lead.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
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
    agentId && !trashed ? countEligibleLeads(agentId) : Promise.resolve(0),
    agentId ? Lead.distinct("jobTitle", { agentId, deletedAt: trashed ? { $ne: null } : null }) : Promise.resolve([]),
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

export async function POST(req: Request) {
  await connectDB();
  const body = await req.json();

  if (Array.isArray(body)) {
    if (body.length === 0) {
      return NextResponse.json([], { status: 201 });
    }
    const leadsToInsert = body.map((l: any) => {
      const firstName = l.firstName?.trim() || "Unknown";
      const lastName = l.lastName?.trim() || "";
      return {
        ...l,
        firstName,
        lastName,
        fullName: l.fullName || `${firstName} ${lastName}`.trim(),
        pipelineStage: l.pipelineStage || "new",
        status: l.status || "new",
        channels: l.channels || [],
      };
    });
    const leads = await Lead.insertMany(leadsToInsert);
    const agentId = body[0]?.agentId;
    if (agentId) {
      await Agent.findByIdAndUpdate(agentId, { $inc: { leadCount: leads.length } });
    }
    return NextResponse.json(leads, { status: 201 });
  } else {
    const lead = await Lead.create(body);
    await Agent.findByIdAndUpdate(body.agentId, { $inc: { leadCount: 1 } });
    return NextResponse.json(lead, { status: 201 });
  }
}


export async function DELETE(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agentId");
  if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 });

  const idsParam = searchParams.get("ids");
  const permanent = searchParams.get("permanent") === "1";

  const match: Record<string, unknown> = { agentId };
  if (idsParam) {
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
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
  const { agentId, ids } = await req.json().catch(() => ({}));
  if (!agentId || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "agentId and ids[] are required" }, { status: 400 });
  }

  // Only restore leads currently in Trash so the count delta stays correct.
  const targets = await Lead.find({ agentId, _id: { $in: ids }, deletedAt: { $ne: null } }, "_id").lean();
  const restoreIds = targets.map((l) => l._id);
  if (restoreIds.length === 0) return NextResponse.json({ restored: 0 });

  await Lead.updateMany({ _id: { $in: restoreIds } }, { deletedAt: null });
  await Agent.findByIdAndUpdate(agentId, { $inc: { leadCount: restoreIds.length } });
  return NextResponse.json({ restored: restoreIds.length });
}
