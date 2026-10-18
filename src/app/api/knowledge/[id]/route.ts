import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { KnowledgeItem } from "@/lib/models/KnowledgeItem";
import { authorizeRecord } from "@/server/auth/access";
import { MAX_KNOWLEDGE_CHARS } from "@/server/services/knowledge.service";

async function load(req: Request, id: string) {
  const item = Types.ObjectId.isValid(id) ? await KnowledgeItem.findById(id).lean() : null;
  return authorizeRecord(req, item, "Document not found", { minRole: "admin" });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const access = await load(req, id);
  if (!access.ok) return access.response;
  const body = await req.json().catch(() => ({}));
  const update: Record<string, string> = {};
  if (body.title !== undefined) {
    const title = String(body.title).trim().slice(0, 120);
    if (!title) return NextResponse.json({ error: "Give the document a title." }, { status: 400 });
    update.title = title;
  }
  if (body.content !== undefined) {
    const content = String(body.content).replace(/\r\n/g, "\n").trim();
    if (!content) return NextResponse.json({ error: "The document is empty." }, { status: 400 });
    if (content.length > MAX_KNOWLEDGE_CHARS) {
      return NextResponse.json({ error: `Keep each document under ${MAX_KNOWLEDGE_CHARS.toLocaleString()} characters.` }, { status: 400 });
    }
    update.content = content;
  }
  const item = await KnowledgeItem.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
  return NextResponse.json(item);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const access = await load(req, id);
  if (!access.ok) return access.response;
  await KnowledgeItem.deleteOne({ _id: id });
  return NextResponse.json({ success: true });
}
