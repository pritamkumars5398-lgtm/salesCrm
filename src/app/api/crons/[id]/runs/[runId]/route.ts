import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { CronRun } from "@/lib/models/CronRun";
import { Campaign } from "@/lib/models/Campaign";
import { Lead } from "@/lib/models/Lead";
import { Activity } from "@/lib/models/Activity";
import { authorizeRecord } from "@/server/auth/access";

type LeadState = "queued" | "working" | "contacted" | "failed" | "skipped";

/** GET — one run: every lead it picked and what happened to each (refresh while it's running). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  await connectDB();
  const { id, runId } = await params;
  const found = Types.ObjectId.isValid(runId) ? await CronRun.findOne({ _id: runId, jobId: id }).lean() : null;
  const access = await authorizeRecord(req, found, "Run not found");
  if (!access.ok) return access.response;
  const run = access.record;

  const campaign = run.campaignId ? await Campaign.findById(run.campaignId).lean() : null;
  if (!campaign) return NextResponse.json({ run, campaign: null, leads: [] });

  const [leads, activities] = await Promise.all([
    Lead.find({ _id: { $in: campaign.leadIds } })
      .select("fullName firstName lastName company phone email outreachStatus lastOutreachError lastContactedAt status")
      .lean(),
    Activity.find({ leadId: { $in: campaign.leadIds }, createdAt: { $gte: run.startedAt } })
      .sort({ createdAt: -1 }).select("leadId channel event createdAt").lean(),
  ]);
  const failureByLead = new Map(campaign.failures.map((f) => [String(f.leadId), f.reason]));
  const latestActivity = new Map<string, { channel: string; event: string; at: Date }>();
  for (const a of activities) {
    const key = String(a.leadId);
    if (!latestActivity.has(key)) latestActivity.set(key, { channel: a.channel, event: a.event, at: a.createdAt });
  }

  const rows = leads.map((l) => {
    const key = String(l._id);
    const contactedThisRun = !!l.lastContactedAt && l.lastContactedAt >= run.startedAt;
    let state: LeadState = "queued";
    if (l.outreachStatus === "sending") state = "working";
    else if (failureByLead.has(key) || (l.outreachStatus === "failed" && !contactedThisRun)) state = "failed";
    else if (contactedThisRun || (l.outreachStatus === "sent" && latestActivity.has(key))) state = "contacted";
    else if (l.outreachStatus !== "pending") state = "skipped";
    const act = latestActivity.get(key);
    return {
      _id: key,
      name: l.fullName || `${l.firstName ?? ""} ${l.lastName ?? ""}`.trim(),
      company: l.company ?? "",
      contact: l.phone || l.email || "",
      state,
      what: act ? `${act.event}` : state === "queued" ? "Waiting for its turn" : state === "skipped" ? "Skipped (contacted in the last 24h, or already in progress)" : "",
      channel: act?.channel ?? null,
      at: act?.at ?? null,
      error: state === "failed" ? failureByLead.get(key) || l.lastOutreachError || "" : "",
    };
  });
  const order: Record<LeadState, number> = { working: 0, queued: 1, failed: 2, contacted: 3, skipped: 4 };
  rows.sort((a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name));

  return NextResponse.json({
    run: { _id: String(run._id), status: run.status, detail: run.detail, startedAt: run.startedAt, finishedAt: run.finishedAt },
    campaign: { status: campaign.status, total: campaign.total, sent: campaign.sent, failed: campaign.failed, skipped: campaign.skipped },
    leads: rows,
  });
}
