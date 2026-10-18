import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { KnowledgeItem } from "@/lib/models/KnowledgeItem";
import { authorizeWorkspace } from "@/server/auth/access";
import { MAX_KNOWLEDGE_CHARS, MAX_KNOWLEDGE_ITEMS } from "@/server/services/knowledge.service";

const TEXT_FILE = /\.(txt|md|markdown|csv)$/i;
const MAX_FILE_BYTES = 200 * 1024;

/** GET ?agentId — knowledge-base documents (content included; they're small). */
export async function GET(req: Request) {
  await connectDB();
  const access = await authorizeWorkspace(req, new URL(req.url).searchParams.get("agentId"));
  if (!access.ok) return access.response;
  const items = await KnowledgeItem.find({ agentId: access.agentId }).sort({ updatedAt: -1 }).lean();
  return NextResponse.json(items);
}

/**
 * POST JSON { agentId, title, content } or multipart { agentId, file } (.txt/.md/.csv).
 * PDFs and Word files aren't parsed — paste their text instead.
 */
export async function POST(req: Request) {
  await connectDB();
  let agentId: string | null = null;
  let title = "";
  let content = "";
  let source: "text" | "file" = "text";

  if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
    const form = await req.formData();
    agentId = String(form.get("agentId") ?? "");
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
    if (!TEXT_FILE.test(file.name)) {
      return NextResponse.json({ error: "Upload a .txt, .md or .csv file. For PDFs or Word files, copy the text and paste it instead." }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "That file is larger than 200 KB." }, { status: 400 });
    title = file.name.replace(TEXT_FILE, "");
    content = await file.text();
    source = "file";
  } else {
    const body = await req.json().catch(() => ({}));
    agentId = body.agentId;
    title = String(body.title ?? "");
    content = String(body.content ?? "");
  }

  const access = await authorizeWorkspace(req, agentId, { minRole: "admin" });
  if (!access.ok) return access.response;

  title = title.trim().slice(0, 120);
  content = content.replace(/\r\n/g, "\n").trim();
  if (!title) return NextResponse.json({ error: "Give the document a title." }, { status: 400 });
  if (!content) return NextResponse.json({ error: "The document is empty." }, { status: 400 });
  if (content.length > MAX_KNOWLEDGE_CHARS) {
    return NextResponse.json({ error: `Keep each document under ${MAX_KNOWLEDGE_CHARS.toLocaleString()} characters — split it into a few documents.` }, { status: 400 });
  }
  if ((await KnowledgeItem.countDocuments({ agentId: access.agentId })) >= MAX_KNOWLEDGE_ITEMS) {
    return NextResponse.json({ error: `A workspace can have at most ${MAX_KNOWLEDGE_ITEMS} documents.` }, { status: 400 });
  }

  const item = await KnowledgeItem.create({ agentId: access.agentId, title, content, source });
  return NextResponse.json(item, { status: 201 });
}
