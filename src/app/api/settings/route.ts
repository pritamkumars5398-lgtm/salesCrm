import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Setting } from "@/lib/models/Setting";

export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agentId");
  if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 });
  const settings = await Setting.find({ agentId }).lean();
  const map: Record<string, string> = {};
  settings.forEach((s) => { map[s.key] = s.value; });
  return NextResponse.json(map);
}

export async function POST(req: Request) {
  await connectDB();
  const body = await req.json() as { agentId: string; settings: Record<string, string> };
  const ops = Object.entries(body.settings).map(([key, value]) => ({
    updateOne: {
      filter: { agentId: body.agentId, key },
      update: { $set: { value } },
      upsert: true,
    },
  }));
  await Setting.bulkWrite(ops);
  return NextResponse.json({ success: true });
}
