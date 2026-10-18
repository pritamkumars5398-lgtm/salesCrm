import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { authorizeLead } from "@/server/auth/access";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const { text } = await req.json().catch(() => ({}));

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  const access = await authorizeLead(req, id);
  if (!access.ok) return access.response;
  const lead = access.lead;
  // The author is whoever is signed in — never a name sent by the browser.
  const author = access.user.name;

  lead.notes.push({
    text: text.trim().slice(0, 5000),
    author,
    createdAt: new Date(),
  });

  // Record note addition in history
  lead.history.push({
    field: "note",
    from: "—",
    to: "Added new note/comment",
    by: author,
    at: new Date(),
  });

  await lead.save();
  return NextResponse.json(lead);
}
