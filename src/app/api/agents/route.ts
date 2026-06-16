import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Agent } from "@/lib/models/Agent";

export async function GET() {
  await connectDB();
  const agents = await Agent.find().sort({ createdAt: 1 }).lean();
  return NextResponse.json(agents);
}

export async function POST(req: Request) {
  await connectDB();
  const body = await req.json();
  const agent = await Agent.create({ name: body.name });
  return NextResponse.json(agent, { status: 201 });
}
