import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Call } from "@/lib/models/Call";

/** Call history for a lead, newest first. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json([]);
  const calls = await Call.find({ leadId: id }).sort({ createdAt: -1 }).limit(50).lean();
  return NextResponse.json(calls);
}
