import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Sequence } from "@/lib/models/Sequence";

export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agentId");
  const filter = agentId ? { agentId } : {};
  const sequences = await Sequence.find(filter).lean();
  return NextResponse.json(sequences);
}

export async function POST(req: Request) {
  await connectDB();
  const body = await req.json();
  const sequence = await Sequence.create(body);
  return NextResponse.json(sequence, { status: 201 });
}
