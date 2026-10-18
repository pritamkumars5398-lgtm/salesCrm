import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";
import { authorizeLead } from "@/server/auth/access";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const access = await authorizeLead(req, id);
  if (!access.ok) return access.response;

  const lead = await Lead.findOneAndUpdate(
    { _id: access.lead._id, deletedAt: null },
    { $set: { recentAccessedAt: new Date() } },
    { new: true, timestamps: false }
  ).lean();

  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(lead);
}
