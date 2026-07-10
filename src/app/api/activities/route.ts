import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Activity } from "@/lib/models/Activity";

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 25;

/** GET /api/activities — returns `{ activities, total, page, limit, totalPages }`. */
export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agentId");
  const channel = searchParams.get("channel");
  const range = searchParams.get("range"); // "today" | "week" | "all"

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(searchParams.get("limit")) || DEFAULT_PAGE_SIZE));

  const filter: Record<string, unknown> = {};
  if (agentId) filter.agentId = agentId;
  if (channel && channel !== "all") filter.channel = channel;

  if (range === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    filter.createdAt = { $gte: start };
  } else if (range === "week") {
    const start = new Date();
    start.setDate(start.getDate() - 7);
    filter.createdAt = { $gte: start };
  }

  const [activities, total] = await Promise.all([
    Activity.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Activity.countDocuments(filter),
  ]);

  return NextResponse.json({
    activities,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
}
