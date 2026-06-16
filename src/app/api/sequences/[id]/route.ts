import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Sequence } from "@/lib/models/Sequence";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const body = await req.json();
  const seq = await Sequence.findByIdAndUpdate(id, body, { new: true }).lean();
  if (!seq) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(seq);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  await Sequence.findByIdAndDelete(id);
  return NextResponse.json({ success: true });
}
