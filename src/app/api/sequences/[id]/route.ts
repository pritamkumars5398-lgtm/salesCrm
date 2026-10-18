import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Sequence } from "@/lib/models/Sequence";
import { authorizeRecord } from "@/server/auth/access";

async function load(req: Request, id: string) {
  const seq = Types.ObjectId.isValid(id) ? await Sequence.findById(id).select("agentId").lean() : null;
  return authorizeRecord(req, seq, "Not found", { minRole: "admin" });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const access = await load(req, id);
  if (!access.ok) return access.response;
  const { _id, agentId, ...fields } = await req.json().catch(() => ({}));
  void _id; void agentId;
  const seq = await Sequence.findByIdAndUpdate(id, fields, { new: true }).lean();
  if (!seq) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(seq);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const access = await load(req, id);
  if (!access.ok) return access.response;
  await Sequence.findByIdAndDelete(id);
  return NextResponse.json({ success: true });
}
