import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Agent } from "@/lib/models/Agent";

export async function GET(req: NextRequest) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");
  const query = email ? { userEmail: email } : {};
  const agents = await Agent.find(query).sort({ createdAt: 1 }).lean();
  return NextResponse.json(agents);
}

export async function POST(req: Request) {
  await connectDB();
  const body = await req.json();
  const existing = await Agent.findOne({ name: body.name, userEmail: body.userEmail });
  if (existing) {
    return NextResponse.json(existing, { status: 200 });
  }
  const agent = await Agent.create({ name: body.name, userEmail: body.userEmail });
  return NextResponse.json(agent, { status: 201 });
}
