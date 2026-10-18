import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { authorizeWorkspace } from "@/server/auth/access";
import { generateOutreachEmail } from "@/server/services/ai.service";

/**
 * POST { agentId, firstName, lastName?, fullName, jobTitle?, company?, source?, senderName? }
 * Drafts a cold email with the workspace's own playbook and AI key.
 */
export async function POST(req: Request) {
  await connectDB();
  const data = await req.json().catch(() => ({}));
  const access = await authorizeWorkspace(req, data.agentId);
  if (!access.ok) return access.response;

  if (!data.fullName) {
    return NextResponse.json({ error: "fullName is required" }, { status: 400 });
  }
  try {
    const email = await generateOutreachEmail(access.agentId, {
      fullName: String(data.fullName),
      firstName: String(data.firstName || data.fullName).split(" ")[0],
      lastName: data.lastName,
      jobTitle: data.jobTitle,
      company: data.company,
      source: data.source,
      senderName: data.senderName,
    });
    return NextResponse.json(email);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "AI generation failed" }, { status: 502 });
  }
}
