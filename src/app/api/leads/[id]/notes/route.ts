import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Lead } from "@/lib/models/Lead";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const { text, author } = await req.json();

  if (!text || !text.trim()) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  const lead = await Lead.findById(id);
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  lead.notes.push({
    text: text.trim(),
    author: author || "User",
    createdAt: new Date(),
  });

  // Record note addition in history
  lead.history.push({
    field: "note",
    from: "—",
    to: "Added new note/comment",
    by: author || "User",
    at: new Date(),
  });

  await lead.save();
  return NextResponse.json(lead);
}
