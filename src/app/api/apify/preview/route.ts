import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { authorizeWorkspace } from "@/server/auth/access";
import { getSyncPreview } from "@/server/services/sync-preview.service";

// ─── GET — what "Sync Sources" would do; starts nothing ──────────────────────
export async function GET(req: Request) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const access = await authorizeWorkspace(req, searchParams.get("agentId"));
  if (!access.ok) return access.response;
  return NextResponse.json(await getSyncPreview(access.agentId));
}
