import { NextResponse } from "next/server";
import { Types, PipelineStage } from "mongoose";
import { connectDB } from "@/lib/db";
import { Call } from "@/lib/models/Call";

const STATUS_FILTERS: Record<string, string[]> = {
  live: ["queued", "ringing", "in_progress"],
  answered: ["completed"],
  missed: ["no_answer", "busy", "canceled", "voicemail"],
  failed: ["failed"],
};

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Voice inbox: one row per lead that has been called (latest call first), with
 * per-lead totals, plus agent-wide call stats. Test calls are excluded.
 * GET ?agentId=&q=&status=all|live|answered|missed|failed
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agentId");
  if (!agentId || !Types.ObjectId.isValid(agentId)) {
    return NextResponse.json({ error: "agentId required" }, { status: 400 });
  }
  const q = (searchParams.get("q") || "").trim();
  const status = searchParams.get("status") || "all";

  await connectDB();
  const match = { agentId: new Types.ObjectId(agentId), isTest: { $ne: true }, leadId: { $type: "objectId" } };

  const pipeline: PipelineStage[] = [
    { $match: match },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$leadId",
        last: { $first: "$$ROOT" },
        total: { $sum: 1 },
        answered: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
        talkSec: { $sum: { $ifNull: ["$durationSec", 0] } },
      },
    },
  ];
  if (STATUS_FILTERS[status]) pipeline.push({ $match: { "last.status": { $in: STATUS_FILTERS[status] } } });
  pipeline.push(
    { $sort: { "last.createdAt": -1 } },
    { $lookup: { from: "leads", localField: "_id", foreignField: "_id", as: "lead" } },
    { $unwind: "$lead" },
    { $match: { "lead.deletedAt": null } },
  );
  if (q) {
    const re = new RegExp(escapeRegex(q), "i");
    pipeline.push({ $match: { $or: [{ "lead.fullName": re }, { "lead.company": re }, { "lead.phone": re }] } });
  }
  pipeline.push(
    { $limit: 500 },
    {
      $project: {
        _id: 0,
        total: 1,
        answered: 1,
        talkSec: 1,
        lead: {
          _id: "$lead._id", agentId: "$lead.agentId", firstName: "$lead.firstName", lastName: "$lead.lastName",
          fullName: "$lead.fullName", company: "$lead.company", jobTitle: "$lead.jobTitle", phone: "$lead.phone",
          email: "$lead.email", location: "$lead.location", status: "$lead.status", pipelineStage: "$lead.pipelineStage",
          agentEnabled: "$lead.agentEnabled", channels: "$lead.channels", source: "$lead.source", createdAt: "$lead.createdAt",
        },
        lastCall: {
          _id: "$last._id", status: "$last.status", createdAt: "$last.createdAt", answeredAt: "$last.answeredAt",
          durationSec: "$last.durationSec", summary: "$last.summary", sentiment: "$last.sentiment",
          outcome: "$last.outcome", mode: "$last.mode", error: "$last.error",
        },
      },
    },
  );

  const [rows, statsAgg] = await Promise.all([
    Call.aggregate(pipeline),
    Call.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          calls: { $sum: 1 },
          answered: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          live: { $sum: { $cond: [{ $in: ["$status", STATUS_FILTERS.live] }, 1, 0] } },
          talkSec: { $sum: { $ifNull: ["$durationSec", 0] } },
        },
      },
    ]),
  ]);

  const stats = statsAgg[0] ?? { calls: 0, answered: 0, live: 0, talkSec: 0 };
  delete (stats as { _id?: unknown })._id;
  return NextResponse.json({ rows, stats });
}
