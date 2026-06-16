import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Meeting } from "@/lib/models/Meeting";

export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agentId");
  const filter = agentId ? { agentId } : {};
  const meetings = await Meeting.find(filter).sort({ scheduledAt: 1 }).lean();
  return NextResponse.json(meetings);
}

export async function POST(req: Request) {
  await connectDB();
  const body = await req.json();
  const meeting = await Meeting.create(body);
  return NextResponse.json(meeting, { status: 201 });
}
