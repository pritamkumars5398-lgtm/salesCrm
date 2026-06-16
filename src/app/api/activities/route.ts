import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Activity } from "@/lib/models/Activity";

export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agentId");
  const channel = searchParams.get("channel");
  const range = searchParams.get("range"); // "today" | "week" | "all"

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

  const activities = await Activity.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  return NextResponse.json(activities);
}
